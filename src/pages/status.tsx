/**
 * 运行状态 (Run Status) panel.
 *
 * What it does:
 * - shows a live summary of the app data (subscriptions / rules / nodes / sync time);
 * - lets the user pick one or more rules (multi-select) and generate a
 *   clash YAML config in the browser: each selected rule is applied to the
 *   nodes parsed from the initial dump and becomes its own proxy group named
 *   after the rule (run through the produce pipeline, buildProfile), then the
 *   result is uploaded (name = nanoid) to the backend via POST /api/generated;
 * - shows the most recently generated result (GET /api/generated) with a
 *   content preview and a download button.
 */

import { nanoid } from "nanoid";
import { QRCodeSVG } from "qrcode.react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Generated } from "~/api/generated";
import {
	useCreateGenerated,
	useInitialDump,
	useRecentGenerated,
	useUpdateGenerated,
} from "~/api/hooks";
import { Button } from "~/components/Button";
import { Collapsible } from "~/components/Collapsible";
import {
	Skeleton,
	SkeletonArea,
	SkeletonCheckboxRows,
	SkeletonListItem,
} from "~/components/Skeleton";
import { errorMessage, formatDateTime } from "~/i18n";
import type { Rule } from "~/persistence/rules";
import { useAppStore } from "~/store/app-store";
import {
	buildProfile,
	type HostsSource,
	type RuleSource,
} from "~/utils/produceProfile";
import {
	applyRule,
	type MatchedNode,
	type NodeSource,
} from "~/utils/ruleEngine";

/** Length of the auto-generated result name (nanoid). */
const GENERATED_NAME_LENGTH = 10;

/**
 * Load the base clash template. It ships as a static asset under `public/`
 * (`/templates/base.yaml`), so we fetch it once and cache the promise.
 */
let baseTemplatePromise: Promise<string> | undefined;
function loadBaseTemplate(): Promise<string> {
	baseTemplatePromise ??= fetch("/templates/base.yaml").then((response) => {
		if (!response.ok) {
			throw new Error(
				`Failed to load base template: ${response.status} ${response.statusText}`,
			);
		}
		return response.text();
	});
	return baseTemplatePromise;
}

function ErrorBox({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
			{children}
		</div>
	);
}

/** One summary stat of the panel header; `loading` swaps the value for a placeholder block. */
function StatCard({
	label,
	value,
	loading = false,
}: {
	label: string;
	value: string;
	loading?: boolean;
}) {
	return (
		<div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
			<p className="text-xs text-slate-400">{label}</p>
			{loading ? (
				<Skeleton className="mt-1.5 h-7 w-16" />
			) : (
				<p className="mt-0.5 truncate text-lg font-semibold text-slate-800">
					{value}
				</p>
			)}
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

/**
 * Copy text to the clipboard; falls back to a hidden textarea + execCommand on
 * non-secure contexts (where navigator.clipboard is unavailable).
 */
async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		document.body.appendChild(textarea);
		textarea.select();
		let ok = false;
		try {
			ok = document.execCommand("copy");
		} catch {
			ok = false;
		}
		document.body.removeChild(textarea);
		return ok;
	}
}

/**
 * One collapsible generated result in the run-status history. Collapsed: name
 * + generation time + line count. Expanded: download, shareable link (copy +
 * QR) and the YAML content preview.
 */
function GeneratedItem({
	item,
	defaultExpanded,
}: {
	item: Generated;
	defaultExpanded: boolean;
}) {
	const { t } = useTranslation();
	const [linkCopied, setLinkCopied] = useState(false);
	const [editedDisplayName, setEditedDisplayName] = useState(
		item.display_name ?? "",
	);
	const renameMutation = useUpdateGenerated();

	/**
	 * Shareable download link for this result. GET /api/generated/{name} is
	 * intentionally unauthenticated — the name is the capability itself — so
	 * this link can be opened in a plain browser or pasted into a clash client
	 * as a subscription URL with no token in the URL.
	 */
	const downloadUrl = `${window.location.origin}/api/generated/${encodeURIComponent(
		item.name,
	)}`;

	async function handleCopyLink() {
		if (await copyText(downloadUrl)) {
			setLinkCopied(true);
			window.setTimeout(() => setLinkCopied(false), 2000);
		}
	}

	const lineCount = item.content.split("\n").length;

	return (
		<Collapsible
			id={`generated-${item.id}`}
			defaultExpanded={defaultExpanded}
			ariaLabel={t("status.latest.toggle", { name: item.name })}
			header={
				<>
					<span className="block truncate font-mono text-sm font-medium text-slate-800">
						{item.display_name || item.name}
					</span>
					<span className="mt-0.5 block text-xs text-slate-400">
						{t("status.latest.generatedAt")}：{formatDateTime(item.created_at)}
					</span>
				</>
			}
			actions={
				<span className="mt-0.5 shrink-0 text-xs text-slate-400">
					{t("status.latest.size", { lines: lineCount })}
				</span>
			}
		>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<input
					value={editedDisplayName}
					onChange={(event) => setEditedDisplayName(event.target.value)}
					placeholder={t("status.generate.displayName")}
					className="min-h-11 min-w-0 flex-1 rounded border border-slate-300 px-2 text-xs"
				/>
				<Button
					type="button"
					disabled={renameMutation.isPending}
					onClick={() =>
						void renameMutation.mutateAsync({
							name: item.name,
							input: { display_name: editedDisplayName },
						})
					}
					variant="outlineDisabled"
					size="xs"
					minH
				>
					{t("status.generate.rename")}
				</Button>
				<Button
					type="button"
					onClick={() => downloadResult(item.name, item.content)}
					variant="outline"
					size="xs"
				>
					{t("status.latest.download")}
				</Button>
			</div>
			{/* Shareable download link: /api/generated/{name}, unauthenticated (name is the capability) */}
			<div className="mt-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center sm:gap-3">
				<span className="shrink-0 text-xs font-medium text-slate-500">
					{t("status.latest.link")}
				</span>
				<span
					className="min-w-0 flex-1 break-all font-mono text-xs text-slate-600 sm:truncate"
					title={downloadUrl}
				>
					{downloadUrl}
				</span>
				<Button
					type="button"
					onClick={() => void handleCopyLink()}
					variant="outlineLight"
					size="xs"
					className="shrink-0"
				>
					{linkCopied ? t("status.latest.copied") : t("status.latest.copy")}
				</Button>
			</div>
			{/* QR code for the shareable link — scan with a phone to subscribe */}
			<div className="mt-2 flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-2 sm:flex-row sm:items-center">
				<div className="flex justify-center rounded bg-white p-2 sm:shrink-0">
					<QRCodeSVG
						value={downloadUrl}
						size={160}
						marginSize={1}
						className="h-40 w-40"
					/>
				</div>
				<div className="min-w-0 text-xs text-slate-500">
					<p className="font-medium text-slate-600">
						{t("status.latest.qrTitle")}
					</p>
					<p className="mt-0.5">{t("status.latest.qrHint")}</p>
				</div>
			</div>
			<pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
				{item.content}
			</pre>
		</Collapsible>
	);
}

export default function StatusPage() {
	const { t } = useTranslation();
	const query = useInitialDump();
	const recentQuery = useRecentGenerated();
	const createMutation = useCreateGenerated();
	const updateMutation = useUpdateGenerated();

	const subscriptions = useAppStore((s) => s.subscriptions);
	const rules = useAppStore((s) => s.rules);
	const hostsProfiles = useAppStore((s) => s.hostsProfiles);
	const parsed = useAppStore((s) => s.parsed);
	const hydratedAt = useAppStore((s) => s.hydratedAt);

	const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
	const [selectedHostsProfileIds, setSelectedHostsProfileIds] = useState<
		number[]
	>([]);
	const [generationError, setGenerationError] = useState<string | null>(null);
	const [pendingContent, setPendingContent] = useState<string | null>(null);
	const [displayName, setDisplayName] = useState("");
	const [targetGeneratedName, setTargetGeneratedName] = useState("");

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
	 * drives the match-count summary. The per-rule groups are built separately
	 * in handleGenerate (a node matched by several rules belongs to each of
	 * them; buildProfile dedupes the top-level proxies list by name).
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
	const allSelected =
		rules.length > 0 && selectedRuleIds.length === rules.length;
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

		// Each selected rule becomes its own proxy group, named after the rule
		// (the produce pipeline groups the nodes by rule source).
		const sources: RuleSource[] = selectedRules.map((rule) => ({
			name: rule.name,
			nodes: applyRule(rule.filter, nodeSources),
		}));

		if (selectedHostsProfileIds.length === 0 && selectedRules.length === 0) {
			setGenerationError(t("status.generate.noRule"));
			return;
		}
		const hostsSources: HostsSource[] = selectedHostsProfileIds
			.map((id) => hostsProfiles.find((profile) => profile.id === id))
			.filter(
				(profile): profile is NonNullable<typeof profile> =>
					profile !== undefined,
			)
			.map((profile) => ({ name: profile.name, entries: profile.entries }));
		setGenerationError(null);
		try {
			const baseTemplate = await loadBaseTemplate();
			const loopbackOverride = (() => {
				const value =
					window.localStorage.getItem("chiaotu.hosts.loopbackOverride") ?? "";
				const parts = value.split(".");
				return parts.length === 4 &&
					parts.every(
						(part) => /^(?:0|[1-9]\\d{0,2})$/.test(part) && Number(part) <= 255,
					)
					? value
					: null;
			})();
			const content = buildProfile(
				baseTemplate,
				sources,
				hostsSources,
				loopbackOverride,
			);
			setPendingContent(content);
			setGenerationError(null);
		} catch (error) {
			setGenerationError(
				error instanceof Error ? error.message : t("status.generate.failed"),
			);
		}
	}

	async function saveGenerated() {
		if (pendingContent === null) return;
		try {
			if (targetGeneratedName !== "") {
				// An empty name means "leave the existing display name unchanged"
				// when updating. Omitting the field is important here: sending an
				// empty string is normalized to NULL by the API and clears the name.
				const input = displayName.trim()
					? { content: pendingContent, display_name: displayName }
					: { content: pendingContent };
				await updateMutation.mutateAsync({
					name: targetGeneratedName,
					input,
				});
			} else {
				// For a new result, an empty display name is intentional and is
				// normalized to NULL by the API.
				await createMutation.mutateAsync({
					name: nanoid(GENERATED_NAME_LENGTH),
					display_name: displayName,
					content: pendingContent,
				});
			}
			setPendingContent(null);
			setDisplayName("");
			setTargetGeneratedName("");
		} catch (error) {
			setGenerationError(
				error instanceof Error ? error.message : t("status.generate.failed"),
			);
		}
	}

	const generationErrorBox =
		generationError ??
		(createMutation.isError && !createMutation.isPending
			? errorMessage(createMutation.error)
			: updateMutation.isError && !updateMutation.isPending
				? errorMessage(updateMutation.error)
				: null);

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("status.title")}</h1>
				<div className="flex gap-2">
					<Button
						type="button"
						onClick={() => {
							void query.refetch();
							void recentQuery.refetch();
						}}
						disabled={query.isRefetching || recentQuery.isRefetching}
						variant="outlineDisabled"
						size="sm"
					>
						{query.isRefetching || recentQuery.isRefetching
							? t("status.refreshing")
							: t("status.refresh")}
					</Button>
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
					loading={query.isLoading}
				/>
				<StatCard
					label={t("status.stats.rules")}
					value={String(rules.length)}
					loading={query.isLoading}
				/>
				<StatCard
					label={t("status.stats.nodes")}
					value={String(totalNodes)}
					loading={query.isLoading}
				/>
				<StatCard
					label={t("status.stats.syncedAt")}
					value={
						hydratedAt === null
							? "—"
							: formatDateTime(new Date(hydratedAt).toISOString())
					}
					loading={query.isLoading}
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
					<Button
						type="submit"
						disabled={
							query.isLoading ||
							selectedRules.length === 0 ||
							createMutation.isPending ||
							updateMutation.isPending
						}
						size="md"
					>
						{createMutation.isPending || updateMutation.isPending
							? t("status.generate.submitting")
							: t("status.generate.submit")}
					</Button>
				</div>

				<div className="mt-3">
					<span className="text-sm font-medium text-slate-700">
						{t("status.generate.rule")}
					</span>
					{query.isLoading ? (
						<SkeletonArea>
							<div className="mt-2 rounded-md border border-slate-200 p-2">
								<div className="flex items-center gap-2 rounded px-2 py-1">
									<Skeleton className="h-4 w-4 shrink-0" />
									<Skeleton className="h-4 w-24" />
								</div>
								<div className="mx-2 my-1 border-t border-slate-100" />
								<SkeletonCheckboxRows rows={4} />
							</div>
						</SkeletonArea>
					) : rules.length === 0 ? (
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

				<div className="mt-4">
					<span className="text-sm font-medium text-slate-700">
						Hosts profiles (ordered)
					</span>
					<div className="mt-2 space-y-1 rounded-md border border-slate-200 p-2">
						{selectedHostsProfileIds.map((id, index) => {
							const profile = hostsProfiles.find((item) => item.id === id);
							if (!profile) return null;
							return (
								<div
									key={id}
									className="flex items-center gap-2 rounded px-2 py-1 text-sm"
								>
									<span className="w-5 text-xs text-slate-400">
										{index + 1}
									</span>
									<span className="min-w-0 flex-1 truncate">
										{profile.name}
									</span>
									<Button
										type="button"
										disabled={index === 0}
										onClick={() =>
											setSelectedHostsProfileIds((current) => {
												const next = [...current];
												[next[index - 1], next[index]] = [
													next[index],
													next[index - 1],
												];
												return next;
											})
										}
										variant="bare"
										size="xs"
										className="disabled:opacity-30"
									>
										↑
									</Button>
									<Button
										type="button"
										disabled={index === selectedHostsProfileIds.length - 1}
										onClick={() =>
											setSelectedHostsProfileIds((current) => {
												const next = [...current];
												[next[index], next[index + 1]] = [
													next[index + 1],
													next[index],
												];
												return next;
											})
										}
										variant="bare"
										size="xs"
										className="disabled:opacity-30"
									>
										↓
									</Button>
									<Button
										type="button"
										onClick={() =>
											setSelectedHostsProfileIds((current) =>
												current.filter((item) => item !== id),
											)
										}
										variant="bare"
										size="xs"
									>
										Remove
									</Button>
								</div>
							);
						})}
						<div className="border-t border-slate-100 pt-2">
							<select
								value=""
								onChange={(event) => {
									const id = Number(event.target.value);
									if (id)
										setSelectedHostsProfileIds((current) =>
											current.includes(id) ? current : [...current, id],
										);
								}}
								className="min-h-11 w-full rounded border border-slate-300 px-2 text-sm"
							>
								<option value="">Add a Hosts profile…</option>
								{hostsProfiles
									.filter(
										(profile) => !selectedHostsProfileIds.includes(profile.id),
									)
									.map((profile) => (
										<option key={profile.id} value={profile.id}>
											{profile.name}
										</option>
									))}
							</select>
						</div>
					</div>
					<p className="mt-1 text-xs text-slate-400">
						Profiles later in the selection override earlier profiles.
					</p>
				</div>

				{pendingContent !== null ? (
					<div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
						<p className="text-sm font-medium text-emerald-800">
							{t("status.generate.ready")}
						</p>
						<label className="mt-2 block text-sm text-slate-700">
							{t("status.generate.displayName")}
							<input
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								className="mt-1 min-h-11 w-full rounded border border-slate-300 bg-white px-3"
							/>
						</label>
						<label className="mt-2 block text-sm text-slate-700">
							{t("status.generate.updateExisting")}
							<select
								value={targetGeneratedName}
								onChange={(event) => setTargetGeneratedName(event.target.value)}
								className="mt-1 min-h-11 w-full rounded border border-slate-300 bg-white px-3"
							>
								<option value="">{t("status.generate.createNew")}</option>
								{(recentQuery.data ?? []).map((item) => (
									<option key={item.id} value={item.name}>
										{item.display_name || item.name}
									</option>
								))}
							</select>
						</label>
						<div className="mt-3 flex flex-wrap gap-2">
							<Button
								type="button"
								onClick={() => downloadResult("generated", pendingContent)}
								variant="outlineLight"
								size="sm"
								minH
							>
								{t("status.latest.download")}
							</Button>
							<Button
								type="button"
								onClick={() => void saveGenerated()}
								disabled={createMutation.isPending || updateMutation.isPending}
								size="sm"
								minH
							>
								{targetGeneratedName === ""
									? t("status.generate.createNew")
									: t("status.generate.update")}
							</Button>
						</div>
					</div>
				) : null}

				<p className="mt-2 text-xs text-slate-400">
					{t("status.generate.hint")}
				</p>

				{generationErrorBox !== null ? (
					<div className="mt-3">
						<ErrorBox>{generationErrorBox}</ErrorBox>
					</div>
				) : null}
			</form>

			{/* Recent generated results (collapsible history, newest first) */}
			<div className="rounded-lg border border-slate-200 bg-white p-4">
				<h2 className="text-sm font-semibold text-slate-700">
					{t("status.latest.title")}
				</h2>

				{recentQuery.isLoading ? (
					<SkeletonArea>
						<ul className="mt-3 overflow-hidden rounded-lg border border-slate-200">
							<SkeletonListItem lines={2} />
							<SkeletonListItem lines={2} />
							<SkeletonListItem lines={2} />
						</ul>
					</SkeletonArea>
				) : recentQuery.isError ? (
					<div className="mt-3">
						<ErrorBox>{errorMessage(recentQuery.error)}</ErrorBox>
					</div>
				) : recentQuery.data !== undefined && recentQuery.data.length === 0 ? (
					<p className="mt-3 text-sm text-slate-400">
						{t("status.latest.empty")}
					</p>
				) : recentQuery.data !== undefined ? (
					<ul className="mt-3 overflow-hidden rounded-lg border border-slate-200">
						{recentQuery.data.map((item, index) => (
							<GeneratedItem
								key={item.id}
								item={item}
								// The most recent result is expanded by default; the rest are collapsed.
								defaultExpanded={index === 0}
							/>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}
