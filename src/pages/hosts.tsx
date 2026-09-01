import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateHostsProfile,
	useDeleteHostsProfile,
	useImportHostsEntries,
	useInitialDump,
	useUpdateHostsEntry,
} from "~/api/hooks";
import type { HostsImportEntry } from "~/api/hosts";
import { Button } from "~/components/Button";
import { Collapsible } from "~/components/Collapsible";
import { LinkButton } from "~/components/LinkButton";
import { SkeletonArea, SkeletonListItem } from "~/components/Skeleton";
import { Switch } from "~/components/Switch";
import { errorMessage } from "~/i18n";
import type { HostsEntry, HostsProfile } from "~/persistence/hosts";
import { parseHostsInput } from "~/persistence/hosts";
import { useAppStore } from "~/store/app-store";

const LOOPBACK_KEY = "chiaotu.hosts.loopbackOverride";
function validIPv4(value: string) {
	const p = value.trim().split(".");
	return (
		p.length === 4 &&
		p.every((x) => /^(?:0|[1-9]\d{0,2})$/.test(x) && Number(x) <= 255)
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
			<div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
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

function CreateHostsProfileModal({
	mutation,
	onClose,
}: {
	mutation: ReturnType<typeof useCreateHostsProfile>;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState("");

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (name.trim() === "") return;
		try {
			await mutation.mutateAsync({ name: name.trim() });
			onClose();
		} catch {
			// Failure message is rendered from mutation.error
		}
	}

	return (
		<Modal title={t("hosts.createTitle")} onClose={onClose}>
			<form onSubmit={handleSubmit} className="space-y-4">
				<label className="block">
					<span className="text-sm font-medium text-slate-700">
						{t("hosts.profileName")}
					</span>
					<input
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder={t("hosts.profileNamePlaceholder")}
						className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
					/>
				</label>

				{mutation.isError && !mutation.isPending ? (
					<div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
						{errorMessage(mutation.error)}
					</div>
				) : null}

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						onClick={onClose}
						disabled={mutation.isPending}
						variant="outline"
						size="md"
					>
						{t("common.cancel")}
					</Button>
					<Button
						type="submit"
						disabled={mutation.isPending || name.trim() === ""}
						size="md"
					>
						{mutation.isPending ? t("hosts.creating") : t("hosts.createProfile")}
					</Button>
				</div>
			</form>
		</Modal>
	);
}

/** Multi-line import modal: type in raw hosts text, preview the parsed lines,
 * then confirm to import into the target profile. */
function ImportHostsModal({
	profile,
	onImport,
	onClose,
}: {
	profile: HostsProfile;
	onImport: (profileId: number, entries: HostsImportEntry[]) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const [input, setInput] = useState("");
	const [preview, setPreview] = useState<ReturnType<
		typeof parseHostsInput
	> | null>(null);
	const parsed = useMemo(() => parseHostsInput(input), [input]);

	function showPreview() {
		setPreview(parsed);
	}
	function confirm() {
		if (!preview) return;
		const last = new Map<string, { domain: string; ip: string }>();
		for (const entry of preview.entries)
			last.set(entry.domain, { domain: entry.domain, ip: entry.ip });
		onImport(profile.id, [...last.values()]);
		onClose();
	}

	return (
		<div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
			<div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4">
				<h2 className="text-lg font-semibold">
					{t("hosts.importTitle", { name: profile.name })}
				</h2>
				<textarea
					value={input}
					onChange={(e) => {
						setInput(e.target.value);
						setPreview(null);
					}}
					rows={8}
					className="mt-3 min-h-32 w-full rounded-md border border-slate-300 p-3 font-mono text-sm"
					placeholder={t("hosts.importPlaceholder")}
				/>
				<Button
					type="button"
					onClick={showPreview}
					size="md"
					minH
					className="mt-2"
				>
					{t("hosts.previewImport")}
				</Button>

				{preview ? (
					<div className="mt-4">
						<h3 className="font-semibold">{t("hosts.importReport")}</h3>
						<p className="mt-2 text-sm">
							{t("hosts.accepted", { count: preview.entries.length })};{" "}
							{t("hosts.skipped", { count: preview.skipped.length })};{" "}
							{t("hosts.ignoredAfterLimit", {
								count: preview.ignoredAfterLimit,
							})}
						</p>
						<div className="mt-3 overflow-auto rounded border border-slate-200">
							<table className="w-full table-fixed text-left text-sm">
								<thead>
									<tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
										<th className="w-16 px-3 py-2 font-medium">
											{t("hosts.col.line")}
										</th>
										<th className="w-40 px-3 py-2 font-medium">
											{t("hosts.col.ip")}
										</th>
										<th className="px-3 py-2 font-medium">
											{t("hosts.col.domain")}
										</th>
									</tr>
								</thead>
								<tbody>
									{preview.entries.map((entry) => (
										<tr
											key={entry.line}
											className="border-b border-slate-50 last:border-0"
										>
											<td className="px-3 py-1.5 text-xs text-slate-400">
												{entry.line}
											</td>
											<td className="truncate px-3 py-1.5 font-mono text-xs text-slate-600">
												{entry.ip || t("hosts.emptyIp")}
											</td>
											<td className="truncate px-3 py-1.5 font-mono text-xs text-slate-800">
												{entry.domain}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				) : null}

				<div className="mt-4 flex justify-end gap-2">
					<Button
						type="button"
						onClick={onClose}
						variant="outline"
						size="md"
						minH
					>
						{t("hosts.cancelImport")}
					</Button>
					<Button
						type="button"
						onClick={confirm}
						disabled={!preview}
						size="md"
						minH
					>
						{t("hosts.confirmImport")}
					</Button>
				</div>
			</div>
		</div>
	);
}

/**
 * One hosts entry row. The IP input and enabled switch are locally controlled so
 * edits reflect immediately without waiting for the network round-trip: the IP
 * commits on a short debounce (only when it is a valid IPv4 or empty), while the
 * switch commits instantly and flushes any pending IP edit.
 */
function HostsEntryRow({
	entry,
	onUpdateEntry,
}: {
	entry: HostsEntry;
	onUpdateEntry: (
		entryId: number,
		patch: { ip: string; enabled: boolean },
	) => Promise<void>;
}) {
	const { t } = useTranslation();
	const [ip, setIp] = useState(entry.ip);
	const [enabled, setEnabled] = useState(entry.enabled);
	const timerRef = useRef<number | null>(null);

	async function commit(nextIp: string, nextEnabled: boolean) {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		try {
			await onUpdateEntry(entry.id, { ip: nextIp, enabled: nextEnabled });
		} catch {
			setIp(entry.ip);
			setEnabled(entry.enabled);
		}
	}

	function handleIpChange(value: string) {
		setIp(value);
		const normalized = value.trim();
		if (normalized !== "" && !validIPv4(normalized)) return;
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			void commit(normalized, enabled);
		}, 400);
	}

	function handleToggle(next: boolean) {
		setEnabled(next);
		void commit(ip.trim(), next);
	}

	// Clear any pending debounce when the row unmounts.
	useEffect(
		() => () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		},
		[],
	);

	return (
		<div className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center">
			<Switch
				checked={enabled}
				onChange={handleToggle}
				ariaLabel={t("hosts.entryEnabled", { domain: entry.domain })}
			/>
			<input
				value={ip}
				onChange={(event) => handleIpChange(event.target.value)}
				className="min-h-11 rounded border border-slate-300 px-2 sm:w-44"
			/>
			<span className="font-mono text-sm">{entry.domain}</span>
		</div>
	);
}

/** One collapsible hosts profile: header shows name + entry count with
 * link-button import / delete actions; the body hosts the entry list. */
function HostsProfileItem({
	profile,
	expanded,
	onToggle,
	onImport,
	onUpdateEntry,
	onDelete,
}: {
	profile: HostsProfile;
	expanded: boolean;
	onToggle: () => void;
	onImport: () => void;
	onUpdateEntry: (
		entryId: number,
		patch: { ip: string; enabled: boolean },
	) => Promise<void>;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Collapsible
			id={`hosts-profile-${profile.id}`}
			expanded={expanded}
			onToggle={onToggle}
			ariaLabel={t(expanded ? "hosts.collapse" : "hosts.expand", {
				name: profile.name,
			})}
			header={
				<>
					<span className="block truncate text-sm font-medium">
						{profile.name}
					</span>
					<span className="mt-0.5 block text-xs text-slate-400">
						{t("hosts.entryCount", { count: profile.entries.length })}
					</span>
				</>
			}
			actions={
				<>
					<LinkButton onClick={onImport}>{t("hosts.import")}</LinkButton>
					<LinkButton variant="danger" onClick={onDelete}>
						{t("hosts.deleteProfile")}
					</LinkButton>
				</>
			}
		>
			<div className="space-y-2">
				{profile.entries.map((entry) => (
					<HostsEntryRow
						key={entry.id}
						entry={entry}
						onUpdateEntry={onUpdateEntry}
					/>
				))}
			</div>
		</Collapsible>
	);
}

export default function HostsPage() {
	const { t } = useTranslation();
	const profiles = useAppStore((s) => s.hostsProfiles);
	// Shares the initial-dump query cache (no extra request); powers the loading skeleton below.
	const query = useInitialDump();
	// Single open collapsible (accordion): expanding one closes the others.
	const [expandedId, setExpandedId] = useState<number | null>(null);
	// Whether the create-profile modal is open.
	const [createOpen, setCreateOpen] = useState(false);
	// Which profile's import modal is open (null = none).
	const [importProfileId, setImportProfileId] = useState<number | null>(null);
	const [override, setOverride] = useState(() => {
		try {
			return localStorage.getItem(LOOPBACK_KEY) ?? "";
		} catch {
			return "";
		}
	});
	const [savedOverride, setSavedOverride] = useState(() => {
		try {
			return localStorage.getItem(LOOPBACK_KEY) ?? "";
		} catch {
			return "";
		}
	});
	const create = useCreateHostsProfile();
	const remove = useDeleteHostsProfile();
	const importer = useImportHostsEntries();
	const update = useUpdateHostsEntry();
	const effectiveOverride = validIPv4(savedOverride)
		? savedOverride.trim()
		: null;
	function saveOverride() {
		const value = override.trim();
		localStorage.setItem(LOOPBACK_KEY, value);
		setSavedOverride(value);
	}
	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("hosts.title")}</h1>
				<Button
					type="button"
					onClick={() => setCreateOpen(true)}
					size="sm"
				>
					{t("hosts.new")}
				</Button>
			</div>
			<p className="mb-4 text-sm text-slate-500">{t("hosts.description")}</p>
			<section className="rounded-lg border border-slate-200 bg-white p-4">
				<h2 className="font-semibold">{t("hosts.loopback.title")}</h2>
				<div className="mt-2 flex flex-col gap-2 sm:flex-row">
					<input
						value={override}
						onChange={(e) => setOverride(e.target.value)}
						className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3"
						placeholder={t("hosts.loopback.placeholder")}
					/>
					<Button type="button" onClick={saveOverride} size="md" minH>
						{t("hosts.loopback.update")}
					</Button>
				</div>
				<p className="mt-2 text-xs text-slate-500">
					{effectiveOverride
						? t("hosts.loopback.enabled", { ip: effectiveOverride })
						: t("hosts.loopback.disabled")}
				</p>
			</section>
			<section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
				{/* Skeleton while the initial dump is in flight - the empty state must not flash before the data arrives. */}
				{query.isLoading ? (
					<SkeletonArea>
						<ul className="border-t border-slate-100">
							<SkeletonListItem lines={2} />
							<SkeletonListItem lines={2} />
						</ul>
					</SkeletonArea>
				) : profiles.length === 0 ? (
					<p className="border-t border-slate-100 px-4 py-6 text-center text-sm text-slate-500">
						{t("hosts.noProfiles")}
					</p>
				) : (
					<ul className="border-t border-slate-100">
						{profiles.map((profile) => {
							const expanded = expandedId === profile.id;
							return (
								<HostsProfileItem
									key={profile.id}
									profile={profile}
									expanded={expanded}
									onToggle={() => setExpandedId(expanded ? null : profile.id)}
									onImport={() => setImportProfileId(profile.id)}
									onUpdateEntry={async (entryId, patch) => {
										await update.mutateAsync({
											profileId: profile.id,
											entryId,
											domain:
												profile.entries.find((e) => e.id === entryId)?.domain ??
												"",
											...patch,
										});
									}}
									onDelete={() => {
										if (
											window.confirm(
												t("hosts.deleteProfileConfirm", {
													name: profile.name,
												}),
											)
										)
											remove.mutate(profile.id);
									}}
								/>
							);
						})}
					</ul>
				)}
			</section>
			{createOpen ? (
				<CreateHostsProfileModal
					mutation={create}
					onClose={() => setCreateOpen(false)}
				/>
			) : null}
			{importProfileId !== null ? (
				<ImportHostsModal
					profile={
						profiles.find((p) => p.id === importProfileId) ?? profiles[0]
					}
					onImport={(profileId, entries) =>
						importer.mutate({ id: profileId, entries })
					}
					onClose={() => setImportProfileId(null)}
				/>
			) : null}
		</div>
	);
}
