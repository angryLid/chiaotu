import { useState, type FormEvent, type ReactNode } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
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
import { useAppStore } from "~/store/app-store";

// ---- form ----

interface FormValues {
	name: string;
	url: string;
	content: string;
}

/** Client-side validation message keys (translated at the call site). */
type ValidationKey = "subs.validation.urlOrContent" | "subs.validation.urlScheme";

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

function buildInput(values: FormValues): SubscriptionInput {
	const input: SubscriptionInput = {};
	const name = values.name.trim();
	if (name !== "") input.name = name;
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
}: { children: ReactNode; optional?: boolean }) {
	const { t } = useTranslation();
	return (
		<span className="text-sm font-medium text-slate-700">
			{children}
			{optional ? (
				<span className="ml-1 font-normal text-slate-400">{t("subs.field.optional")}</span>
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
		<div
			className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
			onClick={onClose}
		>
			<div
				className={`flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl ${
					wide ? "max-w-2xl" : "max-w-lg"
				}`}
				onClick={(event) => event.stopPropagation()}
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
}: {
	title: string;
	submitLabel: string;
	initial: FormValues;
	mutation: UseMutationResult<Subscription, Error, SubscriptionInput>;
	onClose: () => void;
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
			await mutation.mutateAsync(buildInput(values));
			onClose();
		} catch {
			// Failure message is rendered from mutation.error
		}
	}

	const error =
		validationError ??
		(mutation.isError && !mutation.isPending ? errorMessage(mutation.error) : null);

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

				<p className="text-xs text-slate-400">{t("subs.field.hintUrlContent")}</p>

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

// ---- detail ----

function DetailModal({
	summary,
	onEdit,
	onClose,
}: {
	summary: SubscriptionSummary;
	onEdit: () => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const query = useSubscription(summary.id);

	return (
		<Modal title={t("subs.detailTitle", { id: summary.id })} onClose={onClose} wide>
			{query.isError ? (
				<ErrorBox>{errorMessage(query.error)}</ErrorBox>
			) : !query.data ? (
				<p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>
			) : (
				<div className="space-y-3">
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						<dt className="text-slate-400">{t("subs.field.name")}</dt>
						<dd className="break-all">{query.data.name}</dd>
						<dt className="text-slate-400">{t("subs.detail.url")}</dt>
						<dd className="break-all">
							{query.data.url === "" ? (
								<span className="text-slate-400">{t("subs.detail.noUrl")}</span>
							) : (
								<a
									href={query.data.url}
									target="_blank"
									rel="noreferrer"
									className="text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
								>
									{query.data.url}
								</a>
							)}
						</dd>
						<dt className="text-slate-400">{t("subs.detail.createdAt")}</dt>
						<dd>{formatDateTime(query.data.created_at)}</dd>
						<dt className="text-slate-400">{t("subs.detail.updatedAt")}</dt>
						<dd>{formatDateTime(query.data.updated_at)}</dd>
						<dt className="text-slate-400">{t("subs.detail.content")}</dt>
						<dd className="col-span-2 min-w-0">
							<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
								{query.data.content === ""
									? t("subs.detail.emptyContent")
									: query.data.content}
							</pre>
						</dd>
					</dl>

					<div className="flex justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
						>
							{t("common.close")}
						</button>
						<button
							type="button"
							onClick={onEdit}
							className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
						>
							{t("subs.edit")}
						</button>
					</div>
				</div>
			)}
		</Modal>
	);
}

// ---- edit ----
// Detail and edit share the useSubscription(id) cache: opening "edit" from the detail view needs no extra request.

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
			<Modal title={t("subs.editTitle", { id })} onClose={onClose}>
				<ErrorBox>{errorMessage(detail.error)}</ErrorBox>
			</Modal>
		);
	}
	if (!detail.data) {
		return (
			<Modal title={t("subs.editTitle", { id })} onClose={onClose}>
				<p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>
			</Modal>
		);
	}
	return (
		<SubscriptionFormModal
			title={t("subs.editTitle", { id })}
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

// ---- page ----

export default function SubscriptionsPage() {
	const { t } = useTranslation();
	const query = useInitialDump();
	const subscriptions = useAppStore((s) => s.subscriptions);
	const deleteMutation = useDeleteSubscription();
	const createMutation = useCreateSubscription();

	const [createOpen, setCreateOpen] = useState(false);
	const [viewing, setViewing] = useState<SubscriptionSummary | null>(null);
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
						<li
							key={sub.id}
							className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<span className="truncate text-sm font-medium">
										{sub.name}
									</span>
									<span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
										#{sub.id}
									</span>
								</div>
								{sub.url === "" ? (
									<span className="block truncate text-xs text-slate-400">
										{t("subs.detail.noUrlList")}
									</span>
								) : (
									<a
										href={sub.url}
										target="_blank"
										rel="noreferrer"
										className="block truncate text-xs text-slate-400 transition-colors hover:text-slate-600 hover:underline"
									>
										{sub.url}
									</a>
								)}
								<span className="mt-0.5 block text-xs text-slate-400">
									{t("subs.updatedSuffix", {
										date: formatDateTime(sub.updated_at),
									})}
								</span>
							</div>
							<div className="flex shrink-0 gap-1">
								<button
									type="button"
									onClick={() => setViewing(sub)}
									className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
								>
									{t("subs.view")}
								</button>
								<button
									type="button"
									onClick={() => setEditingId(sub.id)}
									className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
								>
									{t("subs.edit")}
								</button>
								<button
									type="button"
									onClick={() => void handleDelete(sub)}
									disabled={deletingId === sub.id}
									className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{deletingId === sub.id ? t("subs.deleting") : t("subs.delete")}
								</button>
							</div>
						</li>
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
				/>
			) : null}

			{viewing !== null ? (
				<DetailModal
					summary={viewing}
					onClose={() => setViewing(null)}
					onEdit={() => {
						setViewing(null);
						setEditingId(viewing.id);
					}}
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
