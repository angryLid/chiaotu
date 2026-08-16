import type { UseMutationResult } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateSubscription,
	useDeleteSubscription,
	useInitialDump,
	useSubscription,
	useUpdateSubscription,
} from "~/api/hooks";
import {
	MAX_SUBSCRIPTIONS,
	type Subscription,
	type SubscriptionInput,
	type SubscriptionSummary,
} from "~/api/subscriptions";
import { errorMessage, formatDateTime } from "~/i18n";
import { Collapsible } from "~/components/Collapsible";
import { type ParsedSubscription, useAppStore } from "~/store/app-store";
import type { NodeProxy } from "~/utils/nodes";

// ---- form ----

interface FormValues {
	name: string;
	url: string;
	content: string;
}

/** Client-side validation message keys (translated at the call site). */
type ValidationKey =
	| "subs.validation.urlOrContent"
	| "subs.validation.urlScheme";

function validate(values: FormValues): ValidationKey | null {
	if (values.url.trim() === "" && values.content.trim() === "") {
		return "subs.validation.urlOrContent";
	}
	const url = values.url.trim();
	if (url !== "" && !/^https?:\/\//i.test(url)) {
		return "subs.validation.urlScheme";
	}
	return null;
}

/** Length of the auto-generated name (nanoid) when creating a subscription without one. */
const GENERATED_NAME_LENGTH = 10;

function buildInput(
	values: FormValues,
	generateNameIfMissing: boolean,
): SubscriptionInput {
	const input: SubscriptionInput = {};
	const name = values.name.trim();
	if (name !== "") {
		input.name = name;
	} else if (generateNameIfMissing) {
		input.name = nanoid(GENERATED_NAME_LENGTH);
	}
	const url = values.url.trim();
	if (url !== "") input.url = url;
	const content = values.content.trim();
	if (content !== "") input.content = content;
	return input;
}

const inputClass =
	"mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

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
					{t("subs.field.optional")}
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

// ---- modal shell ----

function Modal({
	title,
	onClose,
	children,
	wide,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	wide?: boolean;
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
			<div
				className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl ${
					wide ? "max-w-2xl" : "max-w-lg"
				}`}
			>
				<div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
					<h2 className="text-base font-semibold">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label={t("common.close")}
						className="rounded-md px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
					>
						✕
					</button>
				</div>
				<div className="overflow-y-auto p-4">{children}</div>
			</div>
		</div>
	);
}

// ---- create / edit form ----
// Pending/error state comes from the mutation; the modal does not keep its own submitting/error flags.

function SubscriptionFormModal({
	title,
	submitLabel,
	initial,
	mutation,
	onClose,
	generateNameIfMissing = false,
}: {
	title: string;
	submitLabel: string;
	initial: FormValues;
	mutation: UseMutationResult<Subscription, Error, SubscriptionInput>;
	onClose: () => void;
	/** On create: an empty name is replaced with a random nanoid instead of being omitted. */
	generateNameIfMissing?: boolean;
}) {
	const { t } = useTranslation();
	const [values, setValues] = useState<FormValues>(initial);
	const [validationError, setValidationError] = useState<string | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const message = validate(values);
		if (message !== null) {
			setValidationError(t(message));
			return;
		}
		setValidationError(null);
		try {
			await mutation.mutateAsync(buildInput(values, generateNameIfMissing));
			onClose();
		} catch {
			// Failure message is rendered from mutation.error
		}
	}

	const error =
		validationError ??
		(mutation.isError && !mutation.isPending
			? errorMessage(mutation.error)
			: null);

	return (
		<Modal title={title} onClose={onClose}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<label className="block">
					<FieldLabel optional>{t("subs.field.name")}</FieldLabel>
					<input
						value={values.name}
						onChange={(event) =>
							setValues({ ...values, name: event.target.value })
						}
						placeholder={t("subs.field.placeholderName")}
						className={inputClass}
					/>
					<span className="mt-1 block text-xs text-slate-400">
						{t("subs.field.hintName")}
					</span>
				</label>

				<label className="block">
					<FieldLabel optional>{t("subs.field.url")}</FieldLabel>
					<input
						value={values.url}
						onChange={(event) =>
							setValues({ ...values, url: event.target.value })
						}
						placeholder={t("subs.field.placeholderUrl")}
						className={inputClass}
					/>
				</label>

				<label className="block">
					<FieldLabel optional>{t("subs.field.content")}</FieldLabel>
					<textarea
						value={values.content}
						onChange={(event) =>
							setValues({ ...values, content: event.target.value })
						}
						rows={8}
						placeholder={t("subs.field.placeholderContent")}
						className={`${inputClass} resize-y font-mono text-xs`}
					/>
				</label>

				<p className="text-xs text-slate-400">
					{t("subs.field.hintUrlContent")}
				</p>

				{error !== null ? <ErrorBox>{error}</ErrorBox> : null}

				<div className="flex justify-end gap-2 pt-1">
					<button
						type="button"
						onClick={onClose}
						disabled={mutation.isPending}
						className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
					>
						{t("common.cancel")}
					</button>
					<button
						type="submit"
						disabled={mutation.isPending}
						className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{mutation.isPending ? t("subs.submit") : submitLabel}
					</button>
				</div>
			</form>
		</Modal>
	);
}

// ---- edit ----
// The edit modal doubles as the detail view: it shows name / url / content and allows changes.

function EditSubscriptionModal({
	id,
	onClose,
}: {
	id: number;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const detail = useSubscription(id);
	const mutation = useUpdateSubscription(id);

	if (detail.isError) {
		return (
			<Modal title={t("subs.editTitle")} onClose={onClose}>
				<ErrorBox>{errorMessage(detail.error)}</ErrorBox>
			</Modal>
		);
	}
	if (!detail.data) {
		return (
			<Modal title={t("subs.editTitle")} onClose={onClose}>
				<p className="py-8 text-center text-sm text-slate-400">
					{t("common.loading")}
				</p>
			</Modal>
		);
	}
	return (
		<SubscriptionFormModal
			title={t("subs.editTitle")}
			submitLabel={t("subs.save")}
			initial={{
				name: detail.data.name,
				url: detail.data.url,
				content: detail.data.content,
			}}
			mutation={mutation}
			onClose={onClose}
		/>
	);
}

// ---- node table (expanded subscription) ----

/** String value of a node field (the node is a passthrough proxy object; field types are unknown). */
function stringOf(node: NodeProxy, key: string): string {
	const value = node[key];
	if (value === undefined || value === null) return "";
	return typeof value === "string" ? value : String(value);
}

/** Node table for one subscription; also renders parse errors / empty states. */
function NodeTable({ item }: { item: ParsedSubscription }) {
	const { t } = useTranslation();

	if (item.nodes === null) {
		return (
			<div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
				{errorMessage(item.error)}
			</div>
		);
	}
	if (item.nodes.length === 0) {
		return (
			<p className="px-4 py-4 text-center text-sm text-slate-400">
				{t("subs.noNodes")}
			</p>
		);
	}
	return (
		<div className="overflow-x-auto">
			<table className="w-full table-fixed text-left text-sm">
				<thead>
					<tr className="border-b border-slate-100 text-xs text-slate-400">
						<th className="w-[45%] px-4 py-2 font-medium">
							{t("subs.col.name")}
						</th>
						<th className="w-[15%] px-4 py-2 font-medium">
							{t("subs.col.type")}
						</th>
						<th className="w-[25%] px-4 py-2 font-medium">
							{t("subs.col.server")}
						</th>
						<th className="w-[15%] px-4 py-2 font-medium">
							{t("subs.col.port")}
						</th>
					</tr>
				</thead>
				<tbody>
					{item.nodes.map((node) => (
						<tr
							key={node.name}
							className="border-b border-slate-50 last:border-0"
						>
							<td
								title={node.name}
								className="truncate px-4 py-2 font-medium text-slate-800"
							>
								{node.name}
							</td>
							<td
								title={stringOf(node, "type")}
								className="truncate px-4 py-2 text-slate-600"
							>
								{stringOf(node, "type")}
							</td>
							<td
								title={stringOf(node, "server")}
								className="truncate px-4 py-2 font-mono text-xs text-slate-600"
							>
								{stringOf(node, "server")}
							</td>
							<td
								title={stringOf(node, "port")}
								className="truncate px-4 py-2 font-mono text-xs text-slate-600"
							>
								{stringOf(node, "port")}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ---- collapsible subscription item ----
// Collapsed: basic info only (name, url, updated-at, node count). Expanded:
// the full node table for this subscription, parsed in the browser from the dump.

function SubscriptionItem({
	sub,
	deleting,
	onEdit,
	onDelete,
}: {
	sub: SubscriptionSummary;
	deleting: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const item = useAppStore((s) => s.parsed[String(sub.id)]);

	return (
		<Collapsible
			id={`subscription-${sub.id}`}
			expanded={expanded}
			onToggle={() => setExpanded((o) => !o)}
			ariaLabel={t(expanded ? "subs.collapse" : "subs.expand", {
				name: sub.name,
			})}
			header={
				<>
					<span className="block truncate text-sm font-medium">
						{sub.name}
					</span>
					{sub.url === "" ? (
						<span className="block truncate text-xs text-slate-400">
							{t("subs.detail.noUrlList")}
						</span>
					) : (
						<span className="block truncate text-xs text-slate-400">
							{sub.url}
						</span>
					)}
					<span className="mt-0.5 block text-xs text-slate-400">
						{t("subs.updatedSuffix", {
							date: formatDateTime(sub.updated_at),
						})}
					</span>
				</>
			}
			actions={
				<>
					{item !== undefined && item.nodes !== null ? (
						<span className="mt-0.5 shrink-0 text-xs text-slate-400">
							{t("subs.nodeCount", { total: item.nodes.length })}
						</span>
					) : null}
					<button
						type="button"
						onClick={onEdit}
						className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
					>
						{t("subs.edit")}
					</button>
					<button
						type="button"
						onClick={onDelete}
						disabled={deleting}
						className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{deleting ? t("subs.deleting") : t("subs.delete")}
					</button>
				</>
			}
		>
			{item === undefined ? (
				<p className="py-4 text-center text-sm text-slate-400">
					{t("common.loading")}
				</p>
			) : (
				<NodeTable item={item} />
			)}
		</Collapsible>
	);
}

// ---- page ----

export default function SubscriptionsPage() {
	const { t } = useTranslation();
	const query = useInitialDump();
	const subscriptions = useAppStore((s) => s.subscriptions);
	const deleteMutation = useDeleteSubscription();
	const createMutation = useCreateSubscription();

	const [createOpen, setCreateOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);

	const items = subscriptions;
	const atLimit = items.length >= MAX_SUBSCRIPTIONS;
	const deletingId = deleteMutation.isPending ? deleteMutation.variables : null;

	async function handleDelete(sub: SubscriptionSummary) {
		if (!window.confirm(t("subs.deleteConfirm", { name: sub.name }))) {
			return;
		}
		try {
			await deleteMutation.mutateAsync(sub.id);
		} catch {
			// Failure message is rendered from deleteMutation.error
		}
	}

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("subs.title")}</h1>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => void query.refetch()}
						disabled={query.isRefetching}
						className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{query.isRefetching ? t("subs.refreshing") : t("subs.refresh")}
					</button>
					<button
						type="button"
						onClick={() => setCreateOpen(true)}
						disabled={atLimit}
						title={
							atLimit
								? t("subs.limitReached", { max: MAX_SUBSCRIPTIONS })
								: undefined
						}
						className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t("subs.new")}
					</button>
				</div>
			</div>

			{atLimit ? (
				<div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					{t("subs.limitReached", { max: MAX_SUBSCRIPTIONS })}
				</div>
			) : null}

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

			{query.isLoading ? (
				<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
					{t("common.loading")}
				</div>
			) : items.length === 0 ? (
				<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
					{t("subs.empty")}
				</div>
			) : (
				<ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
					{items.map((sub) => (
						<SubscriptionItem
							key={sub.id}
							sub={sub}
							deleting={deletingId === sub.id}
							onEdit={() => setEditingId(sub.id)}
							onDelete={() => void handleDelete(sub)}
						/>
					))}
				</ul>
			)}

			{createOpen ? (
				<SubscriptionFormModal
					title={t("subs.createTitle")}
					submitLabel={t("subs.create")}
					initial={{ name: "", url: "", content: "" }}
					mutation={createMutation}
					onClose={() => setCreateOpen(false)}
					generateNameIfMissing
				/>
			) : null}

			{editingId !== null ? (
				<EditSubscriptionModal
					id={editingId}
					onClose={() => setEditingId(null)}
				/>
			) : null}
		</div>
	);
}
