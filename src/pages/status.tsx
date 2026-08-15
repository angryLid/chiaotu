/**
 * 运行状态 (Run Status) panel.
 *
 * What it does:
 * - shows a live summary of the app data (subscriptions / rules / nodes / sync time);
 * - lets the user pick a rule and generate a clash YAML config in the browser:
 *   apply the rule to the nodes parsed from the initial dump, run the produce
 *   pipeline (buildProfile) over the matched nodes, then upload the result
 *   (name = nanoid) to the backend via POST /api/generated;
 * - shows the most recently generated result (GET /api/generated) with a
 *   content preview and a download button.
 */

import { nanoid } from "nanoid";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
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
import { applyRule, type NodeSource } from "~/utils/ruleEngine";
import type { NodeProxy } from "~/utils/nodes";
import { buildProfile, type VendorSource } from "~/utils/produceProfile";
// The base clash template is imported at build time (Vite ?raw); this is the
// browser-side replacement for the CLI's `address.template` file read.
import baseTemplate from "../../resources/templates/base.yaml?raw";

/** Length of the auto-generated result name (nanoid). */
const GENERATED_NAME_LENGTH = 10;

const selectClass =
	"mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

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
			<p className="mt-0.5 truncate text-lg font-semibold text-slate-800">{value}</p>
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

	const [selectedRuleId, setSelectedRuleId] = useState<number | "">("");
	const [generationError, setGenerationError] = useState<string | null>(null);

	// Auto-select the first rule once rules are loaded (the store hydrates after
	// the initial dump resolves).
	useEffect(() => {
		if (selectedRuleId === "" && rules.length > 0) {
			setSelectedRuleId(rules[0].id);
		}
	}, [selectedRuleId, rules]);

	const selectedRule: Rule | null = useMemo(
		() => rules.find((rule) => rule.id === selectedRuleId) ?? null,
		[rules, selectedRuleId],
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

	/** How many nodes the selected rule would match (live; mirrors the rules page preview). */
	const matchedCount = useMemo(
		() => (selectedRule === null ? 0 : applyRule(selectedRule.filter, nodeSources).length),
		[selectedRule, nodeSources],
	);

	const totalNodes = useMemo(
		() => nodeSources.reduce((sum, item) => sum + item.content.length, 0),
		[nodeSources],
	);

	async function handleGenerate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (selectedRule === null) {
			setGenerationError(t("status.generate.noRule"));
			return;
		}
		const matched = applyRule(selectedRule.filter, nodeSources);
		if (matched.length === 0) {
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
		for (const node of matched) {
			const list = bySub.get(node.subId) ?? [];
			list.push(node);
			bySub.set(node.subId, list);
		}
		const sources: VendorSource[] = [...bySub.entries()].map(([subId, nodes]) => ({
			name: subName.get(subId) ?? `#${subId}`,
			nodes,
		}));

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
				<StatCard label={t("status.stats.subscriptions")} value={String(subscriptions.length)} />
				<StatCard label={t("status.stats.rules")} value={String(rules.length)} />
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
						disabled={query.isLoading || selectedRule === null || createMutation.isPending}
						className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{createMutation.isPending
							? t("status.generate.submitting")
							: t("status.generate.submit")}
					</button>
				</div>

				<label className="mt-3 block">
					<span className="text-sm font-medium text-slate-700">
						{t("status.generate.rule")}
					</span>
					<select
						value={selectedRuleId}
						onChange={(event) => {
							const value = event.target.value;
							setSelectedRuleId(value === "" ? "" : Number(value));
							setGenerationError(null);
						}}
						className={selectClass}
					>
						<option value="">{t("status.generate.rulePlaceholder")}</option>
						{rules.map((rule) => (
							<option key={rule.id} value={rule.id}>
								{rule.name}
							</option>
						))}
					</select>
					<span className="mt-1 block text-xs text-slate-400">
						{t("status.generate.matchCount", { count: matchedCount })}
					</span>
				</label>

				<p className="mt-2 text-xs text-slate-400">{t("status.generate.hint")}</p>

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
					<p className="mt-3 text-sm text-slate-400">{t("status.latest.empty")}</p>
				) : latestQuery.isError ? (
					<div className="mt-3">
						<ErrorBox>{errorMessage(latestQuery.error)}</ErrorBox>
					</div>
				) : latestQuery.data !== undefined ? (
					<div className="mt-3">
						<div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
							<span className="truncate">
								<span className="text-slate-400">{t("status.latest.name")}：</span>
								<span className="font-mono text-slate-800">{latestQuery.data.name}</span>
							</span>
							<span className="truncate text-slate-400">
								{t("status.latest.generatedAt")}：
								{formatDateTime(latestQuery.data.created_at)}
							</span>
							<button
								type="button"
								onClick={() => downloadResult(latestQuery.data.name, latestQuery.data.content)}
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
