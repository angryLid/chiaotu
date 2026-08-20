import type { UseMutationResult } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateRule,
	useDeleteRule,
	useInitialDump,
	useRule,
	useUpdateRule,
} from "~/api/hooks";
import type { RuleInput } from "~/api/rules";
import { Button } from "~/components/Button";
import { LinkButton } from "~/components/LinkButton";
import {
	Skeleton,
	SkeletonArea,
	SkeletonCheckboxRows,
	SkeletonField,
	SkeletonListItem,
	SkeletonTable,
} from "~/components/Skeleton";
import { errorMessage, formatDateTime } from "~/i18n";
import type { Rule, RuleFilter } from "~/persistence/rules";
import { navigate } from "~/router";
import { useAppStore } from "~/store/app-store";
import type { NodeProxy } from "~/utils/nodes";
import { applyRule, type NodeSource } from "~/utils/ruleEngine";
import { RULE_PRESETS, type RulePreset } from "~/utils/rulePresets";

// ---- shared UI ----

const inputClass =
	"mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/** String value of a node field (the node is a passthrough proxy object; field types are unknown). */
function stringOf(node: NodeProxy, key: string): string {
	const value = node[key];
	if (value === undefined || value === null) return "";
	return typeof value === "string" ? value : String(value);
}

function FieldLabel({
	children,
	optional,
}: {
	children: ReactNode;
	optional?: boolean;
}) {
	const { t } = useTranslation();
	return (
		<span className="text-sm font-medium text-slate-700">
			{children}
			{optional ? (
				<span className="ml-1 font-normal text-slate-400">
					{t("rules.field.optional")}
				</span>
			) : null}
		</span>
	);
}

function ErrorBox({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
			{children}
		</div>
	);
}

function goToList() {
	navigate("/rules");
}

// ---- filter summary (list rows) ----

function FilterSummary({ filter }: { filter: RuleFilter }) {
	const { t } = useTranslation();
	const parts: string[] = [];
	if (filter.subIds !== undefined && filter.subIds.length > 0) {
		parts.push(
			`${t("rules.summary.subscriptions")}: ${filter.subIds.join(", ")}`,
		);
	}
	if (filter.nameKeywords !== undefined && filter.nameKeywords.length > 0) {
		parts.push(
			`${t("rules.summary.name")}: ${filter.nameKeywords.join(" / ")}`,
		);
	}
	if (filter.typeMatch !== undefined && filter.typeMatch.length > 0) {
		parts.push(`${t("rules.summary.type")}: ${filter.typeMatch.join(" / ")}`);
	}
	if (parts.length === 0) {
		return (
			<span className="text-xs text-slate-400">
				{t("rules.summary.matchAll")}
			</span>
		);
	}
	return (
		<span className="block truncate text-xs text-slate-400">
			{parts.join(" · ")}
		</span>
	);
}

// ---- form values ----

interface FormValues {
	name: string;
	subIds: string[];
	nameKeywordsText: string;
	typeMatchText: string;
}

function emptyForm(): FormValues {
	return { name: "", subIds: [], nameKeywordsText: "", typeMatchText: "" };
}

/** A stored rule with an empty subIds list means "match all subscriptions" (legacy
 * RuleFilter semantics); materialize it to every subscription id so the editor
 * reflects the new "select at least one" requirement and stays saveable.
 *
 * There is no DB-level constraint, so a stored rule can reference a subscription
 * that has since been removed. Silently prune dangling ids here — they would
 * otherwise break saving (the backend rejects unknown subscription references).
 * The pruned set is what gets persisted on save. */
function formFromRule(rule: Rule, allSubIds: string[]): FormValues {
	const existing = new Set(allSubIds);
	const stored = (rule.filter.subIds ?? []).filter((id) => existing.has(id));
	return {
		name: rule.name,
		subIds: stored.length > 0 ? stored : allSubIds,
		nameKeywordsText: (rule.filter.nameKeywords ?? []).join(", "),
		typeMatchText: (rule.filter.typeMatch ?? []).join(", "),
	};
}

/** A preset only fills the form (name + filter); saving persists a copy as a normal rule. */
function formFromPreset(preset: RulePreset): FormValues {
	return {
		name: preset.name,
		subIds: [],
		nameKeywordsText: (preset.filter.nameKeywords ?? []).join(", "),
		typeMatchText: (preset.filter.typeMatch ?? []).join(", "),
	};
}

function parseKeywordList(text: string): string[] {
	return text
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

function buildFilter(values: FormValues): RuleFilter {
	const filter: RuleFilter = {};
	const subIds = values.subIds.map((id) => id.trim()).filter((id) => id !== "");
	if (subIds.length > 0) filter.subIds = subIds;
	const nameKeywords = parseKeywordList(values.nameKeywordsText);
	if (nameKeywords.length > 0) filter.nameKeywords = nameKeywords;
	const typeMatch = parseKeywordList(values.typeMatchText);
	if (typeMatch.length > 0) filter.typeMatch = typeMatch;
	return filter;
}

function buildInput(values: FormValues): RuleInput {
	return { name: values.name.trim(), filter: buildFilter(values) };
}

/** Preview rows are capped so a huge match set does not freeze the page. */
const PREVIEW_LIMIT = 200;

// ---- rule form (create / edit page) ----
// The live preview evaluates the *current form* against the nodes parsed in the
// browser from the initial dump (see ruleEngine.applyRule); it reflects unsaved
// edits, not the stored rule.

function RuleForm({
	title,
	submitLabel,
	initial,
	mutation,
}: {
	title: string;
	submitLabel: string;
	initial: FormValues;
	mutation: UseMutationResult<Rule, Error, RuleInput>;
}) {
	const { t } = useTranslation();
	const [values, setValues] = useState<FormValues>(initial);
	const [validationError, setValidationError] = useState<string | null>(null);

	const query = useInitialDump();
	const subscriptions = useAppStore((s) => s.subscriptions);
	const parsed = useAppStore((s) => s.parsed);
	const hydratedAt = useAppStore((s) => s.hydratedAt);

	const subNameOf = useMemo(() => {
		const map = new Map<string, string>();
		for (const sub of subscriptions) {
			map.set(String(sub.id), sub.name === "" ? t("subs.unnamed") : sub.name);
		}
		return (subId: string) => map.get(subId) ?? `#${subId}`;
	}, [subscriptions, t]);

	const preview = useMemo(() => {
		// With the "select at least one subscription" requirement for creation, an
		// empty selection is a deliberate "no scope" state — match nothing.
		if (values.subIds.length === 0) return [];
		const items: NodeSource[] = [];
		for (const sub of subscriptions) {
			const result = parsed[String(sub.id)];
			if (result?.nodes) {
				items.push({ subId: String(sub.id), content: result.nodes });
			}
		}
		return applyRule(buildFilter(values), items);
	}, [values, subscriptions, parsed]);
	const previewTruncated = preview.length - PREVIEW_LIMIT;

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (values.name.trim() === "") {
			setValidationError(t("rules.validation.nameRequired"));
			return;
		}
		if (values.subIds.length === 0) {
			setValidationError(t("rules.validation.subscriptionsRequired"));
			return;
		}
		setValidationError(null);
		try {
			await mutation.mutateAsync(buildInput(values));
			goToList();
		} catch {
			// Failure message is rendered from mutation.error
		}
	}

	const error =
		validationError ??
		(mutation.isError && !mutation.isPending
			? errorMessage(mutation.error)
			: null);

	/** Toggle a subscription in/out of the explicit selection. */
	function toggleSubId(id: string) {
		setValues((prev) => {
			const next = new Set(prev.subIds);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return { ...prev, subIds: [...next] };
		});
	}

	return (
		<div>
			<div className="mb-4 flex items-center gap-2">
				<Button type="button" onClick={goToList} variant="outline" size="sm">
					← {t("rules.backToList")}
				</Button>
				<h1 className="text-xl font-semibold">{title}</h1>
			</div>

			<div className="grid items-start gap-4 lg:grid-cols-2">
				{/* Form column */}
				<form
					onSubmit={handleSubmit}
					className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
				>
					<div>
						<p className="text-xs font-medium text-slate-500">
							{t("rules.preset.fill")}
						</p>
						<div className="mt-1 flex flex-wrap gap-2">
							{RULE_PRESETS.map((preset) => (
								<Button
									key={preset.key}
									type="button"
									onClick={() => setValues(formFromPreset(preset))}
									variant="outline"
									size="sm"
									className="hover:text-slate-900"
								>
									{preset.name}
								</Button>
							))}
						</div>
					</div>

					<label className="block">
						<FieldLabel>{t("rules.field.name")}</FieldLabel>
						<input
							value={values.name}
							onChange={(event) =>
								setValues({ ...values, name: event.target.value })
							}
							placeholder={t("rules.field.placeholderName")}
							className={inputClass}
						/>
						<span className="mt-1 block text-xs text-slate-400">
							{t("rules.field.hintName")}
						</span>
					</label>

					<div>
						<FieldLabel optional>{t("rules.field.subscriptions")}</FieldLabel>
						{query.isLoading ? (
							<SkeletonArea>
								<div className="mt-2 rounded-md border border-slate-200 p-2">
									<Skeleton className="mx-2 h-3 w-28" />
									<SkeletonCheckboxRows rows={4} className="mt-1" />
								</div>
							</SkeletonArea>
						) : subscriptions.length === 0 ? (
							<p className="mt-2 text-sm text-slate-400">
								{t("subs.noSubscriptions")}
							</p>
						) : (
							<div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-slate-200 p-2">
								<div className="flex items-center justify-between px-2 pb-1 text-xs text-slate-500">
									<span>
										{values.subIds.length === 0
											? t("rules.field.subscriptionsNone")
											: t("rules.field.subscriptionsCount", {
													count: values.subIds.length,
													total: subscriptions.length,
												})}
									</span>
								</div>
								<div className="space-y-1">
									{subscriptions.map((sub) => {
										const id = String(sub.id);
										const checked = values.subIds.includes(id);
										return (
											<label
												key={sub.id}
												className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-slate-50"
											>
												<input
													type="checkbox"
													checked={checked}
													onChange={() => toggleSubId(id)}
													className="accent-slate-900"
												/>
												<span className="min-w-0">
													<span className="block truncate font-medium text-slate-700">
														{sub.name === "" ? t("subs.unnamed") : sub.name}
													</span>
												</span>
											</label>
										);
									})}
								</div>
							</div>
						)}
						<span className="mt-1 block text-xs text-slate-400">
							{t("rules.field.subscriptionsHint")}
						</span>
					</div>

					<label className="block">
						<FieldLabel optional>{t("rules.field.nameKeywords")}</FieldLabel>
						<input
							value={values.nameKeywordsText}
							onChange={(event) =>
								setValues({ ...values, nameKeywordsText: event.target.value })
							}
							placeholder={t("rules.field.placeholderKeywords")}
							className={inputClass}
						/>
						<span className="mt-1 block text-xs text-slate-400">
							{t("rules.field.hintNameKeywords")}
						</span>
					</label>

					<label className="block">
						<FieldLabel optional>{t("rules.field.typeMatch")}</FieldLabel>
						<input
							value={values.typeMatchText}
							onChange={(event) =>
								setValues({ ...values, typeMatchText: event.target.value })
							}
							placeholder={t("rules.field.placeholderTypes")}
							className={inputClass}
						/>
						<span className="mt-1 block text-xs text-slate-400">
							{t("rules.field.hintTypeMatch")}
						</span>
					</label>

					{error !== null ? <ErrorBox>{error}</ErrorBox> : null}

					<div className="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							onClick={goToList}
							disabled={mutation.isPending}
							variant="outline"
							size="md"
						>
							{t("common.cancel")}
						</Button>
						<Button type="submit" disabled={mutation.isPending} size="md">
							{mutation.isPending ? t("rules.submit") : submitLabel}
						</Button>
					</div>
				</form>

				{/* Live preview: unsaved edits are evaluated against the nodes parsed in the browser from the initial dump */}
				<div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-4">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 className="text-sm font-semibold text-slate-700">
							{t("rules.preview.title")}
						</h2>
						{hydratedAt !== null ? (
							<span className="text-xs text-slate-400">
								{t("rules.preview.count", { count: preview.length })}
							</span>
						) : null}
					</div>

					{query.isLoading ? (
						<SkeletonArea>
							<div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
								<SkeletonTable rows={8} />
							</div>
						</SkeletonArea>
					) : subscriptions.length === 0 ? (
						<p className="mt-2 text-sm text-slate-400">
							{t("rules.preview.noData")}
						</p>
					) : (
						<>
							<p className="mt-1 text-xs text-slate-400">
								{t("rules.preview.syncedAt", {
									date:
										hydratedAt === null
											? ""
											: formatDateTime(new Date(hydratedAt).toISOString()),
								})}
							</p>
							{values.subIds.length === 0 ? (
								<p className="mt-2 text-sm text-slate-400">
									{t("rules.validation.subscriptionsRequired")}
								</p>
							) : preview.length === 0 ? (
								<p className="mt-2 text-sm text-slate-400">
									{t("rules.preview.empty")}
								</p>
							) : (
								<>
									<div className="mt-2 max-h-96 overflow-auto rounded-md border border-slate-200 bg-white">
										<table className="w-full table-fixed text-left text-sm">
											<thead className="sticky top-0 z-10 bg-slate-50">
												<tr className="border-b border-slate-100 text-xs text-slate-400">
													<th className="w-[38%] px-3 py-1.5 font-medium">
														{t("rules.preview.col.name")}
													</th>
													<th className="w-[14%] px-3 py-1.5 font-medium">
														{t("rules.preview.col.type")}
													</th>
													<th className="w-[30%] px-3 py-1.5 font-medium">
														{t("rules.preview.col.server")}
													</th>
													<th className="w-[18%] px-3 py-1.5 font-medium">
														{t("rules.preview.col.sub")}
													</th>
												</tr>
											</thead>
											<tbody>
												{preview.slice(0, PREVIEW_LIMIT).map((node) => (
													<tr
														key={`${node.subId}:${node.name}`}
														className="border-b border-slate-50 last:border-0"
													>
														<td
															title={node.name}
															className="truncate px-3 py-1.5 font-medium text-slate-800"
														>
															{node.name}
														</td>
														<td
															title={stringOf(node, "type")}
															className="truncate px-3 py-1.5 text-slate-600"
														>
															{stringOf(node, "type")}
														</td>
														<td
															title={stringOf(node, "server")}
															className="truncate px-3 py-1.5 font-mono text-xs text-slate-600"
														>
															{stringOf(node, "server")}
														</td>
														<td
															title={subNameOf(node.subId)}
															className="truncate px-3 py-1.5 text-xs text-slate-400"
														>
															{subNameOf(node.subId)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									{previewTruncated > 0 ? (
										<p className="mt-1 text-xs text-slate-400">
											{t("rules.preview.truncated", {
												count: PREVIEW_LIMIT,
												more: previewTruncated,
											})}
										</p>
									) : null}
								</>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}

// ---- create / edit pages ----

function NewRuleForm() {
	const { t } = useTranslation();
	const mutation = useCreateRule();
	return (
		<RuleForm
			title={t("rules.createTitle")}
			submitLabel={t("rules.create")}
			initial={emptyForm()}
			mutation={mutation}
		/>
	);
}

function EditRuleForm({ id }: { id: number }) {
	const { t } = useTranslation();
	const query = useRule(id);
	const mutation = useUpdateRule(id);
	const subscriptions = useAppStore((s) => s.subscriptions);

	if (query.isLoading) {
		// Mirror the RuleForm layout (header + form column + preview column) so the
		// loaded page replaces the skeleton without any layout shift.
		return (
			<SkeletonArea>
				<div className="mb-4 flex items-center gap-2">
					<Skeleton className="h-8 w-24 rounded-md" />
					<Skeleton className="h-7 w-40" />
				</div>
				<div className="grid items-start gap-4 lg:grid-cols-2">
					<div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
						<SkeletonField labelWidth="w-14" />
						<SkeletonField labelWidth="w-24" />
						<SkeletonField labelWidth="w-24" />
						<SkeletonField labelWidth="w-24" />
						<div className="flex justify-end gap-2 pt-1">
							<Skeleton className="h-9 w-20 rounded-md" />
							<Skeleton className="h-9 w-16 rounded-md" />
						</div>
					</div>
					<div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
						<Skeleton className="h-4 w-28" />
						<div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
							<SkeletonTable rows={8} />
						</div>
					</div>
				</div>
			</SkeletonArea>
		);
	}
	if (query.isError) {
		return <ErrorBox>{errorMessage(query.error)}</ErrorBox>;
	}
	const rule = query.data;
	if (rule === undefined) {
		return null;
	}
	return (
		<RuleForm
			key={rule.id}
			title={t("rules.editTitle")}
			submitLabel={t("rules.save")}
			initial={formFromRule(
				rule,
				subscriptions.map((sub) => String(sub.id)),
			)}
			mutation={mutation}
		/>
	);
}

/** Route target of /rules/new and /rules/{id}/edit. */
export function RuleFormPage({
	mode,
	id,
}: {
	mode: "new" | "edit";
	id?: number;
}) {
	if (mode === "new") {
		return <NewRuleForm />;
	}
	return <EditRuleForm id={id ?? -1} />;
}

// ---- list page ----

export default function RulesPage() {
	const { t } = useTranslation();
	const query = useInitialDump();
	const rules = useAppStore((s) => s.rules);
	const deleteMutation = useDeleteRule();

	const items = rules;
	const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;

	async function handleDelete(rule: Rule) {
		if (!window.confirm(t("rules.deleteConfirm", { name: rule.name }))) {
			return;
		}
		try {
			await deleteMutation.mutateAsync(rule.id);
		} catch {
			// Failure message is rendered from deleteMutation.error
		}
	}

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("rules.title")}</h1>
				<div className="flex gap-2">
					<Button
						type="button"
						onClick={() => void query.refetch()}
						disabled={query.isRefetching}
						variant="outlineDisabled"
						size="sm"
					>
						{query.isRefetching ? t("rules.refreshing") : t("rules.refresh")}
					</Button>
					<Button
						type="button"
						onClick={() => {
							navigate("/rules/new");
						}}
						size="sm"
					>
						{t("rules.new")}
					</Button>
				</div>
			</div>

			{query.isError ? (
				<div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(query.error)}
				</div>
			) : null}

			{deleteMutation.isError ? (
				<div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(deleteMutation.error)}
				</div>
			) : null}

			{/* Same list container as the real list, so the skeleton occupies the exact final layout. */}
			{query.isLoading ? (
				<SkeletonArea>
					<ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
						<SkeletonListItem />
						<SkeletonListItem />
						<SkeletonListItem />
					</ul>
				</SkeletonArea>
			) : items.length === 0 ? (
				<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
					{t("rules.empty")}
				</div>
			) : (
				<ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
					{items.map((rule) => (
						<li
							key={rule.id}
							className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate text-sm font-medium">
										{rule.name}
									</span>
								</div>
								<FilterSummary filter={rule.filter} />
								<span className="mt-0.5 block text-xs text-slate-400">
									{t("rules.updatedSuffix", {
										date: formatDateTime(rule.updated_at),
									})}
								</span>
							</div>
							<div className="flex shrink-0 gap-1">
								<LinkButton
									onClick={() => {
										navigate(`/rules/${rule.id}/edit`);
									}}
								>
									{t("rules.edit")}
								</LinkButton>
								<LinkButton
									variant="danger"
									onClick={() => void handleDelete(rule)}
									disabled={deletingId === rule.id}
								>
									{deletingId === rule.id
										? t("rules.deleting")
										: t("rules.delete")}
								</LinkButton>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
