/**
 * 规则集 (Rule Sets) page.
 *
 * A rule set is a bundle of domain / IP matchers published at a public URL that
 * generated configs reference as a mihomo `rule-provider`. This page owns the
 * whole lifecycle:
 * - create / rename a set and choose the single policy its matchers resolve to
 *   (DIRECT / REJECT / proxy / one specific node);
 * - paste matchers in bulk (first 50 lines, previewed before import) and toggle
 *   or delete them individually;
 * - copy the distribution link, or rotate it when it leaks.
 *
 * The policy is stored symbolically rather than as a literal group name: the
 * proxy groups of a config depend on which projection rules were selected when
 * it was generated, so the resolution happens in buildProfile.
 */

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateRuleSet,
	useDeleteRuleSet,
	useDeleteRuleSetItem,
	useImportRuleSetItems,
	useInitialDump,
	useRotateRuleSetSlug,
	useUpdateRuleSet,
	useUpdateRuleSetItem,
} from "~/api/hooks";
import { type RuleSetImportItem, ruleSetPayloadUrl } from "~/api/rule-sets";
import { Button } from "~/components/Button";
import { Collapsible } from "~/components/Collapsible";
import { LinkButton } from "~/components/LinkButton";
import { SkeletonArea, SkeletonListItem } from "~/components/Skeleton";
import { Switch } from "~/components/Switch";
import { errorMessage } from "~/i18n";
import {
	MAX_RULE_SETS,
	parseRuleSetInput,
	RULE_SET_POLICIES,
	type RuleSet,
	type RuleSetItem,
	type RuleSetPolicy,
} from "~/persistence/rule-sets";
import { useAppStore } from "~/store/app-store";
import { displayNodeName, isExpiredNodeName } from "~/utils/produceProfile";

/** Sentinel for the "type the node name myself" option of the node picker. */
const CUSTOM_NODE = "\u0000custom";

/** Copy text to the clipboard, falling back to a hidden textarea off secure contexts. */
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

function ErrorBox({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
			{children}
		</div>
	);
}

function Modal({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a mouse-only click-to-close convenience
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users close via the dialog's ✕ button
		<div
			className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
				<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
					<h2 className="text-base font-semibold">{title}</h2>
					<Button
						type="button"
						onClick={onClose}
						aria-label={t("common.close")}
						variant="close"
						size="xs"
					>
						✕
					</Button>
				</div>
				<div className="overflow-y-auto p-4">{children}</div>
			</div>
		</div>
	);
}

/**
 * Name + policy form, shared by create and edit. The node picker lists the node
 * names as they will appear in a generated config (flag prefix included), with a
 * manual-entry escape hatch for a node that is not in the currently loaded
 * subscriptions.
 */
function RuleSetForm({
	initial,
	pending,
	error,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	initial?: RuleSet;
	pending: boolean;
	error: unknown;
	submitLabel: string;
	onSubmit: (input: {
		name: string;
		policy: RuleSetPolicy;
		policy_node: string | null;
	}) => Promise<void>;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const nodeNames = useNodeNames();

	const [name, setName] = useState(initial?.name ?? "");
	const [policy, setPolicy] = useState<RuleSetPolicy>(
		initial?.policy ?? "PROXY",
	);
	// The initial node may no longer be in the loaded subscriptions; keep it
	// selectable by falling back to the manual input pre-filled with it.
	const initialNode = initial?.policy_node ?? "";
	const [nodeChoice, setNodeChoice] = useState(
		initialNode !== "" && !nodeNames.includes(initialNode)
			? CUSTOM_NODE
			: initialNode,
	);
	const [customNode, setCustomNode] = useState(
		initialNode !== "" && !nodeNames.includes(initialNode) ? initialNode : "",
	);
	const [validation, setValidation] = useState<string | null>(null);

	const resolvedNode =
		nodeChoice === CUSTOM_NODE ? customNode.trim() : nodeChoice;

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (name.trim() === "") {
			setValidation(t("ruleSets.validation.nameRequired"));
			return;
		}
		if (policy === "NODE" && resolvedNode === "") {
			setValidation(t("ruleSets.validation.nodeRequired"));
			return;
		}
		setValidation(null);
		await onSubmit({
			name: name.trim(),
			policy,
			policy_node: policy === "NODE" ? resolvedNode : null,
		});
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<label className="block">
				<span className="text-sm font-medium text-slate-700">
					{t("ruleSets.field.name")}
				</span>
				<input
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder={t("ruleSets.field.namePlaceholder")}
					className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
				/>
				<span className="mt-1 block text-xs text-slate-400">
					{t("ruleSets.field.nameHint")}
				</span>
			</label>

			<label className="block">
				<span className="text-sm font-medium text-slate-700">
					{t("ruleSets.field.policy")}
				</span>
				<select
					value={policy}
					onChange={(event) => setPolicy(event.target.value as RuleSetPolicy)}
					className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
				>
					{RULE_SET_POLICIES.map((value) => (
						<option key={value} value={value}>
							{t(`ruleSets.policy.${value}`)}
						</option>
					))}
				</select>
				<span className="mt-1 block text-xs text-slate-400">
					{t("ruleSets.field.policyHint")}
				</span>
			</label>

			{policy === "NODE" ? (
				<div className="space-y-2">
					<label className="block">
						<span className="text-sm font-medium text-slate-700">
							{t("ruleSets.field.policyNode")}
						</span>
						<select
							value={nodeChoice}
							onChange={(event) => setNodeChoice(event.target.value)}
							className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
						>
							<option value="">
								{t("ruleSets.field.policyNodePlaceholder")}
							</option>
							{nodeNames.map((node) => (
								<option key={node} value={node}>
									{node}
								</option>
							))}
							<option value={CUSTOM_NODE}>
								{t("ruleSets.field.policyNodeCustom")}
							</option>
						</select>
					</label>
					{nodeChoice === CUSTOM_NODE ? (
						<input
							value={customNode}
							onChange={(event) => setCustomNode(event.target.value)}
							placeholder={t("ruleSets.field.policyNodeCustomPlaceholder")}
							className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
						/>
					) : null}
					<p className="text-xs text-slate-400">
						{t("ruleSets.field.policyNodeHint")}
					</p>
				</div>
			) : null}

			{validation !== null ? <ErrorBox>{validation}</ErrorBox> : null}
			{error !== null && error !== undefined && !pending ? (
				<ErrorBox>{errorMessage(error)}</ErrorBox>
			) : null}

			<div className="flex justify-end gap-2 pt-1">
				<Button
					type="button"
					onClick={onCancel}
					disabled={pending}
					variant="outline"
					size="md"
					minH
				>
					{t("common.cancel")}
				</Button>
				<Button type="submit" disabled={pending} size="md" minH>
					{pending ? t("ruleSets.submitting") : submitLabel}
				</Button>
			</div>
		</form>
	);
}

/**
 * Paste-import modal: parse locally, show exactly what would be stored (the
 * parser mirrors the backend's normalization), then confirm.
 */
function ImportRulesModal({
	ruleSet,
	pending,
	error,
	onImport,
	onClose,
}: {
	ruleSet: RuleSet;
	pending: boolean;
	error: unknown;
	onImport: (items: RuleSetImportItem[]) => Promise<void>;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [input, setInput] = useState("");
	const [preview, setPreview] = useState<ReturnType<
		typeof parseRuleSetInput
	> | null>(null);
	const parsed = useMemo(() => parseRuleSetInput(input), [input]);

	async function confirm() {
		if (preview === null || preview.items.length === 0) return;
		await onImport(
			preview.items.map(({ type, payload }) => ({ type, payload })),
		);
	}

	return (
		<Modal
			title={t("ruleSets.import.title", { name: ruleSet.name })}
			onClose={onClose}
		>
			<textarea
				value={input}
				onChange={(event) => {
					setInput(event.target.value);
					setPreview(null);
				}}
				rows={8}
				className="min-h-32 w-full rounded-md border border-slate-300 p-3 font-mono text-sm"
				placeholder={t("ruleSets.import.placeholder")}
			/>
			<p className="mt-1 text-xs text-slate-400">{t("ruleSets.import.hint")}</p>
			<Button
				type="button"
				onClick={() => setPreview(parsed)}
				size="md"
				minH
				className="mt-2"
			>
				{t("ruleSets.import.preview")}
			</Button>

			{preview !== null ? (
				<div className="mt-4">
					<h3 className="text-sm font-semibold">
						{t("ruleSets.import.report")}
					</h3>
					<p className="mt-2 text-sm">
						{t("ruleSets.import.accepted", { count: preview.items.length })};{" "}
						{t("ruleSets.import.skipped", { count: preview.skipped.length })};{" "}
						{t("ruleSets.import.ignoredAfterLimit", {
							count: preview.ignoredAfterLimit,
						})}
					</p>
					{preview.items.length === 0 ? (
						<p className="mt-2 text-sm text-slate-400">
							{t("ruleSets.import.noEffective")}
						</p>
					) : (
						<div className="mt-3 overflow-auto rounded border border-slate-200">
							<table className="w-full table-fixed text-left text-sm">
								<thead>
									<tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
										<th className="w-10 px-2 py-2 font-medium">
											{t("ruleSets.import.col.line")}
										</th>
										<th className="w-36 px-2 py-2 font-medium">
											{t("ruleSets.import.col.type")}
										</th>
										<th className="px-2 py-2 font-medium">
											{t("ruleSets.import.col.payload")}
										</th>
									</tr>
								</thead>
								<tbody>
									{preview.items.map((item) => (
										<tr
											key={`${item.line}-${item.type}-${item.payload}`}
											className="border-b border-slate-50 last:border-0"
										>
											<td className="px-2 py-1.5 text-xs text-slate-400">
												{item.line}
											</td>
											<td className="px-2 py-1.5 font-mono text-xs text-slate-600">
												{item.type}
											</td>
											<td className="break-all px-2 py-1.5 font-mono text-xs text-slate-800">
												{item.payload}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					{preview.skipped.length > 0 ? (
						<div className="mt-3">
							<p className="text-xs font-medium text-slate-500">
								{t("ruleSets.import.skippedTitle")}
							</p>
							<ul className="mt-1 space-y-0.5">
								{preview.skipped.map((entry) => (
									<li
										key={`${entry.line}-${entry.text}`}
										className="truncate font-mono text-xs text-amber-700"
									>
										{entry.line}: {entry.text}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			) : null}

			{error !== null && error !== undefined && !pending ? (
				<div className="mt-3">
					<ErrorBox>{errorMessage(error)}</ErrorBox>
				</div>
			) : null}

			<div className="mt-4 flex justify-end gap-2">
				<Button
					type="button"
					onClick={onClose}
					variant="outline"
					size="md"
					minH
					disabled={pending}
				>
					{t("common.cancel")}
				</Button>
				<Button
					type="button"
					onClick={() => void confirm()}
					disabled={pending || preview === null || preview.items.length === 0}
					size="md"
					minH
				>
					{pending
						? t("ruleSets.import.importing")
						: t("ruleSets.import.confirm")}
				</Button>
			</div>
		</Modal>
	);
}

/** The distribution link block: the URL, its provider key, copy and rotate. */
function DistributionLink({ ruleSet }: { ruleSet: RuleSet }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);
	const rotate = useRotateRuleSetSlug();
	const url = ruleSetPayloadUrl(ruleSet.slug);

	async function handleCopy() {
		if (await copyText(url)) {
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		}
	}

	return (
		<div className="rounded-md border border-slate-200 bg-slate-50 p-2">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
				<span className="shrink-0 text-xs font-medium text-slate-500">
					{t("ruleSets.link.title")}
				</span>
				<span
					className="min-w-0 flex-1 break-all font-mono text-xs text-slate-600 sm:truncate"
					title={url}
				>
					{url}
				</span>
				<LinkButton onClick={() => void handleCopy()}>
					{copied ? t("ruleSets.link.copied") : t("ruleSets.link.copy")}
				</LinkButton>
				<LinkButton
					variant="danger"
					disabled={rotate.isPending}
					onClick={() => {
						if (!window.confirm(t("ruleSets.link.rotateConfirm"))) return;
						rotate.mutate(ruleSet.id);
					}}
				>
					{rotate.isPending
						? t("ruleSets.link.rotating")
						: t("ruleSets.link.rotate")}
				</LinkButton>
			</div>
			<p className="mt-1 text-xs text-slate-400">{t("ruleSets.link.hint")}</p>
			<p className="mt-0.5 font-mono text-xs text-slate-400">
				{t("ruleSets.link.providerKey", { key: ruleSet.key })}
			</p>
			{rotate.isError && !rotate.isPending ? (
				<div className="mt-2">
					<ErrorBox>{errorMessage(rotate.error)}</ErrorBox>
				</div>
			) : null}
		</div>
	);
}

/**
 * One matcher row. The switch is locally controlled so the toggle reflects
 * immediately and reverts on failure — the same pattern as the Hosts entry row,
 * and it keeps one in-flight toggle from disabling every other switch in the set.
 */
function MatcherRow({
	item,
	onToggle,
	onDelete,
	deleting,
}: {
	item: RuleSetItem;
	onToggle: (enabled: boolean) => Promise<void>;
	onDelete: () => void;
	deleting: boolean;
}) {
	const { t } = useTranslation();
	const [enabled, setEnabled] = useState(item.enabled);
	// Re-importing a matcher revives the same row id, which can flip `enabled`
	// from the server while this component stays mounted. Adopt the server value
	// during render (React's documented "adjust state when props change" pattern)
	// instead of keying the row on it, which would remount and steal keyboard
	// focus on every toggle.
	const [serverEnabled, setServerEnabled] = useState(item.enabled);
	if (item.enabled !== serverEnabled) {
		setServerEnabled(item.enabled);
		setEnabled(item.enabled);
	}

	async function handleToggle(next: boolean) {
		setEnabled(next);
		try {
			await onToggle(next);
		} catch {
			setEnabled(item.enabled);
		}
	}

	return (
		<li className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
			<Switch
				checked={enabled}
				onChange={(next) => void handleToggle(next)}
				ariaLabel={t("ruleSets.items.enabled", { payload: item.payload })}
			/>
			<span className="shrink-0 font-mono text-xs text-slate-500 sm:w-36">
				{item.type}
			</span>
			<span className="min-w-0 flex-1 break-all font-mono text-sm">
				{item.payload}
			</span>
			<LinkButton variant="danger" disabled={deleting} onClick={onDelete}>
				{t("ruleSets.items.remove")}
			</LinkButton>
		</li>
	);
}

/** One collapsible rule set: header shows name / policy / count, body the matchers. */
function RuleSetListItem({
	ruleSet,
	expanded,
	onToggle,
	onEdit,
	onImport,
}: {
	ruleSet: RuleSet;
	expanded: boolean;
	onToggle: () => void;
	onEdit: () => void;
	onImport: () => void;
}) {
	const { t } = useTranslation();
	const remove = useDeleteRuleSet();
	const updateItem = useUpdateRuleSetItem();
	const removeItem = useDeleteRuleSetItem();

	const policyLabel =
		ruleSet.policy === "NODE"
			? (ruleSet.policy_node ?? t("ruleSets.policy.NODE"))
			: t(`ruleSets.policy.${ruleSet.policy}`);

	return (
		<Collapsible
			id={`rule-set-${ruleSet.id}`}
			expanded={expanded}
			onToggle={onToggle}
			ariaLabel={t(expanded ? "ruleSets.collapse" : "ruleSets.expand", {
				name: ruleSet.name,
			})}
			header={
				<>
					<span className="block truncate text-sm font-medium">
						{ruleSet.name}
					</span>
					<span className="mt-0.5 block truncate text-xs text-slate-400">
						{policyLabel} ·{" "}
						{t("ruleSets.itemCount", { count: ruleSet.items.length })}
					</span>
				</>
			}
			actions={
				<>
					<LinkButton onClick={onImport}>
						{t("ruleSets.import.open")}
					</LinkButton>
					<LinkButton onClick={onEdit}>{t("ruleSets.edit")}</LinkButton>
					<LinkButton
						variant="danger"
						disabled={remove.isPending}
						onClick={() => {
							if (
								window.confirm(
									t("ruleSets.deleteConfirm", { name: ruleSet.name }),
								)
							) {
								remove.mutate(ruleSet.id);
							}
						}}
					>
						{t("ruleSets.delete")}
					</LinkButton>
				</>
			}
		>
			<DistributionLink ruleSet={ruleSet} />

			<h3 className="mt-3 text-sm font-semibold text-slate-700">
				{t("ruleSets.items.title")}
			</h3>
			{ruleSet.items.length === 0 ? (
				<p className="mt-2 text-sm text-slate-400">
					{t("ruleSets.items.empty")}
				</p>
			) : (
				<ul className="mt-2 space-y-2">
					{ruleSet.items.map((item) => (
						<MatcherRow
							key={item.id}
							item={item}
							deleting={
								removeItem.isPending && removeItem.variables?.itemId === item.id
							}
							onToggle={async (enabled) => {
								await updateItem.mutateAsync({
									id: ruleSet.id,
									itemId: item.id,
									enabled,
								});
							}}
							onDelete={() => {
								if (
									window.confirm(
										t("ruleSets.items.removeConfirm", {
											payload: item.payload,
										}),
									)
								) {
									removeItem.mutate({ id: ruleSet.id, itemId: item.id });
								}
							}}
						/>
					))}
				</ul>
			)}
			<p className="mt-2 text-xs text-slate-400">{t("ruleSets.items.hint")}</p>

			{remove.isError && !remove.isPending ? (
				<div className="mt-2">
					<ErrorBox>{errorMessage(remove.error)}</ErrorBox>
				</div>
			) : null}
			{updateItem.isError && !updateItem.isPending ? (
				<div className="mt-2">
					<ErrorBox>{errorMessage(updateItem.error)}</ErrorBox>
				</div>
			) : null}
			{removeItem.isError && !removeItem.isPending ? (
				<div className="mt-2">
					<ErrorBox>{errorMessage(removeItem.error)}</ErrorBox>
				</div>
			) : null}
		</Collapsible>
	);
}

/**
 * Every node name a generated config could declare, in the form it will carry
 * there (flag-prefixed, quota pseudo-nodes dropped). Used by the NODE policy
 * picker so the stored name matches what buildProfile validates against.
 */
function useNodeNames(): string[] {
	const subscriptions = useAppStore((s) => s.subscriptions);
	const parsed = useAppStore((s) => s.parsed);
	return useMemo(() => {
		const names = new Set<string>();
		for (const sub of subscriptions) {
			for (const node of parsed[String(sub.id)]?.nodes ?? []) {
				if (isExpiredNodeName(node.name)) continue;
				names.add(displayNodeName(node.name));
			}
		}
		return [...names].sort((a, b) => a.localeCompare(b));
	}, [subscriptions, parsed]);
}

export default function RuleSetsPage() {
	const { t } = useTranslation();
	const ruleSets = useAppStore((s) => s.ruleSets);
	// Shares the initial-dump query cache (no extra request); powers the skeleton.
	const query = useInitialDump();

	// Single open collapsible (accordion): expanding one closes the others.
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [importingId, setImportingId] = useState<number | null>(null);

	const create = useCreateRuleSet();
	const update = useUpdateRuleSet();
	const importItems = useImportRuleSetItems();

	const editing = ruleSets.find((item) => item.id === editingId) ?? null;
	const importing = ruleSets.find((item) => item.id === importingId) ?? null;
	const atLimit = ruleSets.length >= MAX_RULE_SETS;

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("ruleSets.title")}</h1>
				<div className="flex gap-2">
					<Button
						type="button"
						onClick={() => void query.refetch()}
						disabled={query.isRefetching}
						variant="outlineDisabled"
						size="sm"
					>
						{query.isRefetching
							? t("ruleSets.refreshing")
							: t("ruleSets.refresh")}
					</Button>
					<Button
						type="button"
						onClick={() => setCreateOpen(true)}
						disabled={atLimit}
						title={
							atLimit
								? t("ruleSets.limitReached", { max: MAX_RULE_SETS })
								: undefined
						}
						size="sm"
					>
						{t("ruleSets.new")}
					</Button>
				</div>
			</div>
			<p className="mb-4 text-sm text-slate-500">{t("ruleSets.description")}</p>

			{atLimit ? (
				<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					{t("ruleSets.limitReached", { max: MAX_RULE_SETS })}
				</div>
			) : null}

			{query.isError ? (
				<div className="mb-4">
					<ErrorBox>{errorMessage(query.error)}</ErrorBox>
				</div>
			) : null}

			<section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
				{/* Skeleton while the initial dump is in flight — the empty state must not flash first. */}
				{query.isLoading ? (
					<SkeletonArea>
						<ul>
							<SkeletonListItem lines={2} />
							<SkeletonListItem lines={2} />
						</ul>
					</SkeletonArea>
				) : ruleSets.length === 0 ? (
					<p className="px-4 py-6 text-center text-sm text-slate-500">
						{t("ruleSets.empty")}
					</p>
				) : (
					<ul>
						{ruleSets.map((ruleSet) => (
							<RuleSetListItem
								key={ruleSet.id}
								ruleSet={ruleSet}
								expanded={expandedId === ruleSet.id}
								onToggle={() =>
									setExpandedId(expandedId === ruleSet.id ? null : ruleSet.id)
								}
								onEdit={() => setEditingId(ruleSet.id)}
								onImport={() => setImportingId(ruleSet.id)}
							/>
						))}
					</ul>
				)}
			</section>

			{createOpen ? (
				<Modal
					title={t("ruleSets.createTitle")}
					onClose={() => setCreateOpen(false)}
				>
					<RuleSetForm
						pending={create.isPending}
						error={create.error}
						submitLabel={t("ruleSets.create")}
						onSubmit={async (input) => {
							try {
								const created = await create.mutateAsync(input);
								setCreateOpen(false);
								// Open the new set so the import action is one click away.
								setExpandedId(created.id);
							} catch {
								// Failure message is rendered from create.error
							}
						}}
						onCancel={() => setCreateOpen(false)}
					/>
				</Modal>
			) : null}

			{editing !== null ? (
				<Modal
					title={t("ruleSets.editTitle", { name: editing.name })}
					onClose={() => setEditingId(null)}
				>
					<RuleSetForm
						initial={editing}
						pending={update.isPending}
						error={update.error}
						submitLabel={t("ruleSets.save")}
						onSubmit={async (input) => {
							try {
								await update.mutateAsync({ id: editing.id, input });
								setEditingId(null);
							} catch {
								// Failure message is rendered from update.error
							}
						}}
						onCancel={() => setEditingId(null)}
					/>
				</Modal>
			) : null}

			{importing !== null ? (
				<ImportRulesModal
					ruleSet={importing}
					pending={importItems.isPending}
					error={importItems.error}
					onImport={async (items) => {
						try {
							await importItems.mutateAsync({ id: importing.id, items });
							setImportingId(null);
						} catch {
							// Failure message is rendered from importItems.error
						}
					}}
					onClose={() => setImportingId(null)}
				/>
			) : null}
		</div>
	);
}
