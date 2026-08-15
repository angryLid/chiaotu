/**
 * 运行状态 (Run Status) panel.
 *
 * What it does:
 * - shows a live summary of the app data (subscriptions / rules / nodes / sync time);
 * - lets the user pick one or more rules (multi-select; the union of the matched
 *   nodes, deduped by subId+name, feeds the produce pipeline) and generate a
 *   clash YAML config in the browser: apply each selected rule to the nodes
 *   parsed from the initial dump, run the produce pipeline (buildProfile) over
 *   the matched nodes, then upload the result (name = nanoid) to the backend
 *   via POST /api/generated;
 * - shows the most recently generated result (GET /api/generated) with a
 *   content preview and a download button.
 */

import { nanoid } from "nanoid";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "~/api/errors";
import {
	useCreateGenerated,
	useInitialDump,
	useLatestGenerated,
} from "~/api/hooks";
import { errorMessage, formatDateTime } from "~/i18n";
import type { Rule } from "~/persistence/rules";
import { useAppStore } from "~/store/app-store";
import type { NodeProxy } from "~/utils/nodes";
import { buildProfile, type VendorSource } from "~/utils/produceProfile";
import {
	applyRule,
	type MatchedNode,
	type NodeSource,
} from "~/utils/ruleEngine";
// The base clash template is imported at build time (Vite ?raw); this is the
// browser-side replacement for the CLI's `address.template` file read.
import baseTemplate from "../../resources/templates/base.yaml?raw";

/** Length of the auto-generated result name (nanoid). */
const GENERATED_NAME_LENGTH = 10;

function ErrorBox({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
			{children}
		</div>
	);
}

/** One summary stat of the panel header. */
function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
			<p className="text-xs text-slate-400">{label}</p>
			<p className="mt-0.5 truncate text-lg font-semibold text-slate-800">
				{value}
			</p>
		</div>
	);
}

/** Trigger a browser download of the generated content as <name>.yaml. */
function downloadResult(name: string, content: string) {
	const blob = new Blob([content], { type: "text/yaml" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `${name}.yaml`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export default function StatusPage() {
	const { t } = useTranslation();
	const query = useInitialDump();
	const latestQuery = useLatestGenerated();
	const createMutation = useCreateGenerated();

	const subscriptions = useAppStore((s) => s.subscriptions);
	const rules = useAppStore((s) => s.rules);
	const parsed = useAppStore((s) => s.parsed);
	const hydratedAt = useAppStore((s) => s.hydratedAt);

	const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
	const [generationError, setGenerationError] = useState<string | null>(null);

	const selectedRules: Rule[] = useMemo(
		() => rules.filter((rule) => selectedRuleIds.includes(rule.id)),
		[rules, selectedRuleIds],
	);

	/** Nodes parsed in the browser from the initial dump, as rule-engine input. */
	const nodeSources = useMemo(() => {
		const items: NodeSource[] = [];
		for (const sub of subscriptions) {
			const result = parsed[String(sub.id)];
			if (result?.nodes) {
				items.push({ subId: String(sub.id), content: result.nodes });
			}
		}
		return items;
	}, [subscriptions, parsed]);

	/**
	 * Union of the nodes matched by the selected rules, deduped by subId+name —
	 * a node matched by several rules appears once (buildProfile does not dedupe).
	 */
	const matchedNodes = useMemo(() => {
		const seen = new Set<string>();
		const merged: MatchedNode[] = [];
		for (const rule of selectedRules) {
			for (const node of applyRule(rule.filter, nodeSources)) {
				const key = `${node.subId}:${node.name}`;
				if (seen.has(key)) continue;
				seen.add(key);
				merged.push(node);
			}
		}
		return merged;
	}, [selectedRules, nodeSources]);

	/** How many nodes the selected rules would match in total (union). */
	const matchedCount = matchedNodes.length;

	function toggleRuleId(id: number) {
		setSelectedRuleIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
		setGenerationError(null);
	}

	/** All rules selected (drives the select-all checkbox). */
	const allSelected = rules.length > 0 && selectedRuleIds.length === rules.length;
	/** Some but not all rules selected (drives the indeterminate state). */
	const someSelected = selectedRuleIds.length > 0 && !allSelected;

	function toggleSelectAll() {
		setSelectedRuleIds(allSelected ? [] : rules.map((rule) => rule.id));
		setGenerationError(null);
	}

	const totalNodes = useMemo(
		() => nodeSources.reduce((sum, item) => sum + item.content.length, 0),
		[nodeSources],
	);

	async function handleGenerate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (selectedRules.length === 0) {
			setGenerationError(t("status.generate.noRule"));
			return;
		}
		if (matchedNodes.length === 0) {
			setGenerationError(t("status.generate.noMatch"));
			return;
		}

		// Group the matched nodes by subscription; the vendor group name is the
		// subscription display name (the produce pipeline prefixes ✈️).
		const subName = new Map(
			subscriptions.map((sub) => [
				String(sub.id),
				sub.name === "" ? t("subs.unnamed") : sub.name,
			]),
		);
		const bySub = new Map<string, NodeProxy[]>();
		for (const node of matchedNodes) {
			const list = bySub.get(node.subId) ?? [];
			list.push(node);
			bySub.set(node.subId, list);
		}
		const sources: VendorSource[] = [...bySub.entries()].map(
			([subId, nodes]) => ({
				name: subName.get(subId) ?? `#${subId}`,
				nodes,
			}),
		);

		const content = buildProfile(baseTemplate, sources);

		setGenerationError(null);
		try {
			await createMutation.mutateAsync({
				name: nanoid(GENERATED_NAME_LENGTH),
				content,
			});
		} catch {
			// Failure message is rendered from createMutation.error
		}
	}

	const generationErrorBox =
		generationError ??
		(createMutation.isError && !createMutation.isPending
			? errorMessage(createMutation.error)
			: null);

	// GET /api/generated returns Err:NOT_FOUND until the first upload — show the
	// empty state instead of a scary error box.
	const latestMissing =
		latestQuery.isError &&
		latestQuery.error instanceof ApiError &&
		latestQuery.error.code === "NOT_FOUND";

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("status.title")}</h1>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => {
							void query.refetch();
							void latestQuery.refetch();
						}}
						disabled={query.isRefetching || latestQuery.isRefetching}
						className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{query.isRefetching || latestQuery.isRefetching
							? t("status.refreshing")
							: t("status.refresh")}
					</button>
				</div>
			</div>

			{query.isError ? (
				<div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(query.error)}
				</div>
			) : null}

			{/* App data summary */}
			<div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label={t("status.stats.subscriptions")}
					value={String(subscriptions.length)}
				/>
				<StatCard
					label={t("status.stats.rules")}
					value={String(rules.length)}
				/>
				<StatCard label={t("status.stats.nodes")} value={String(totalNodes)} />
				<StatCard
					label={t("status.stats.syncedAt")}
					value={
						hydratedAt === null
							? "—"
							: formatDateTime(new Date(hydratedAt).toISOString())
					}
				/>
			</div>

			{/* Generate: pick a rule, compute in the browser, upload to the backend */}
			<form
				onSubmit={handleGenerate}
				className="mb-4 rounded-lg border border-slate-200 bg-white p-4"
			>
				<div className="flex flex-wrap items-end justify-between gap-2">
					<h2 className="text-sm font-semibold text-slate-700">
						{t("status.generate.title")}
					</h2>
					<button
						type="submit"
						disabled={
							query.isLoading ||
							selectedRules.length === 0 ||
							createMutation.isPending
						}
						className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{createMutation.isPending
							? t("status.generate.submitting")
							: t("status.generate.submit")}
					</button>
				</div>

				<div className="mt-3">
					<span className="text-sm font-medium text-slate-700">
						{t("status.generate.rule")}
					</span>
					{rules.length === 0 ? (
						<p className="mt-2 text-sm text-slate-400">
							{t("status.generate.noRules")}
						</p>
					) : (
						<>
							<div className="mt-2 rounded-md border border-slate-200 p-2">
								<label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-slate-50">
									<input
										type="checkbox"
										checked={allSelected}
										ref={(el) => {
											if (el) el.indeterminate = someSelected;
										}}
										onChange={toggleSelectAll}
										className="accent-slate-900"
									/>
									<span className="font-medium text-slate-700">
										{t("status.generate.selectAll")}
									</span>
								</label>
								<div className="mx-2 my-1 border-t border-slate-100" />
								<div className="space-y-1">
									{rules.map((rule) => {
										const checked = selectedRuleIds.includes(rule.id);
										return (
											<label
												key={rule.id}
												className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-slate-50"
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleRuleId(rule.id)}
													className="accent-slate-900"
												/>
												<span className="min-w-0">
													<span className="block truncate font-medium text-slate-700">
														{rule.name}
													</span>
													<span className="block text-xs text-slate-400">
														#{rule.id}
													</span>
												</span>
											</label>
										);
									})}
								</div>
							</div>
							<span className="mt-1 block text-xs text-slate-400">
								{selectedRules.length === 0
									? t("status.generate.noRule")
									: t("status.generate.matchCount", {
											count: selectedRules.length,
											nodeCount: matchedCount,
										})}
							</span>
						</>
					)}
				</div>

				<p className="mt-2 text-xs text-slate-400">
					{t("status.generate.hint")}
				</p>

				{generationErrorBox !== null ? (
					<div className="mt-3">
						<ErrorBox>{generationErrorBox}</ErrorBox>
					</div>
				) : null}
			</form>

			{/* Latest generated result */}
			<div className="rounded-lg border border-slate-200 bg-white p-4">
				<h2 className="text-sm font-semibold text-slate-700">
					{t("status.latest.title")}
				</h2>

				{latestQuery.isLoading ? (
					<p className="mt-3 text-sm text-slate-400">{t("common.loading")}</p>
				) : latestMissing ? (
					<p className="mt-3 text-sm text-slate-400">
						{t("status.latest.empty")}
					</p>
				) : latestQuery.isError ? (
					<div className="mt-3">
						<ErrorBox>{errorMessage(latestQuery.error)}</ErrorBox>
					</div>
				) : latestQuery.data !== undefined ? (
					<div className="mt-3">
						<div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
							<span className="truncate">
								<span className="text-slate-400">
									{t("status.latest.name")}：
								</span>
								<span className="font-mono text-slate-800">
									{latestQuery.data.name}
								</span>
							</span>
							<span className="truncate text-slate-400">
								{t("status.latest.generatedAt")}：
								{formatDateTime(latestQuery.data.created_at)}
							</span>
							<button
								type="button"
								onClick={() =>
									downloadResult(
										latestQuery.data.name,
										latestQuery.data.content,
									)
								}
								className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
							>
								{t("status.latest.download")}
							</button>
						</div>
						<pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
							{latestQuery.data.content}
						</pre>
					</div>
				) : null}
			</div>
		</div>
	);
}
