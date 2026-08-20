import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateHostsProfile,
	useDeleteHostsProfile,
	useImportHostsEntries,
	useUpdateHostsEntry,
} from "~/api/hooks";
import type { HostsImportEntry } from "~/api/hosts";
import { Collapsible } from "~/components/Collapsible";
import type { HostsProfile } from "~/persistence/hosts";
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
function getOverride() {
	try {
		const value = localStorage.getItem(LOOPBACK_KEY) ?? "";
		return validIPv4(value) ? value : null;
	} catch {
		return null;
	}
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
				<button
					type="button"
					onClick={showPreview}
					className="mt-2 min-h-11 rounded-md bg-slate-900 px-4 text-white"
				>
					{t("hosts.previewImport")}
				</button>

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
									{preview.entries.map((entry, index) => (
										<tr
											key={index}
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
					<button
						type="button"
						onClick={onClose}
						className="min-h-11 rounded border px-4"
					>
						{t("hosts.cancelImport")}
					</button>
					<button
						type="button"
						onClick={confirm}
						disabled={!preview}
						className="min-h-11 rounded bg-slate-900 px-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t("hosts.confirmImport")}
					</button>
				</div>
			</div>
		</div>
	);
}

/** One collapsible hosts profile: header shows name + entry count; the body
 * hosts the import entry-point, the entry list, and the delete action. */
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
	onUpdateEntry: (entryId: number, patch: { ip: string; enabled: boolean }) => void;
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
		>
			<div className="space-y-4">
				<button
					type="button"
					onClick={onImport}
					className="min-h-11 rounded-md bg-slate-900 px-4 text-white"
				>
					{t("hosts.import")}
				</button>
				<div className="space-y-2">
					{profile.entries.map((entry) => (
						<div
							key={entry.id}
							className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center"
						>
							<input
								type="checkbox"
								checked={entry.enabled}
								onChange={(e) =>
									onUpdateEntry(entry.id, {
										ip: entry.ip,
										enabled: e.target.checked,
									})
								}
								className="size-5 accent-slate-900"
							/>
							<input
								value={entry.ip}
								onChange={(e) =>
									onUpdateEntry(entry.id, {
										ip: e.target.value,
										enabled: entry.enabled,
									})
								}
								className="min-h-11 rounded border border-slate-300 px-2 sm:w-44"
							/>
							<span className="font-mono text-sm">{entry.domain}</span>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={onDelete}
					className="min-h-11 rounded-md border border-rose-300 px-4 text-rose-700"
				>
					{t("hosts.deleteProfile")}
				</button>
			</div>
		</Collapsible>
	);
}

export default function HostsPage() {
	const { t } = useTranslation();
	const profiles = useAppStore((s) => s.hostsProfiles);
	// Single open collapsible (accordion): expanding one closes the others.
	const [expandedId, setExpandedId] = useState<number | null>(null);
	const [name, setName] = useState("");
	// Which profile's import modal is open (null = none).
	const [importProfileId, setImportProfileId] = useState<number | null>(null);
	const [override, setOverride] = useState(() => {
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
	function saveOverride() {
		localStorage.setItem(LOOPBACK_KEY, override.trim());
	}
	function createProfile() {
		if (name.trim()) {
			create.mutate({ name: name.trim() });
			setName("");
		}
	}
	return (
		<div className="space-y-4">
			<div>
				<h1 className="text-xl font-semibold">{t("hosts.title")}</h1>
				<p className="mt-1 text-sm text-slate-500">{t("hosts.description")}</p>
			</div>
			<section className="rounded-lg border border-slate-200 bg-white p-4">
				<h2 className="font-semibold">{t("hosts.loopback.title")}</h2>
				<div className="mt-2 flex flex-col gap-2 sm:flex-row">
					<input
						value={override}
						onChange={(e) => setOverride(e.target.value)}
						className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3"
						placeholder={t("hosts.loopback.placeholder")}
					/>
					<button
						type="button"
						onClick={saveOverride}
						className="min-h-11 rounded-md bg-slate-900 px-4 text-white"
					>
						{t("hosts.loopback.update")}
					</button>
				</div>
				<p className="mt-2 text-xs text-slate-500">
					{getOverride()
						? t("hosts.loopback.enabled", { ip: getOverride() ?? "" })
						: t("hosts.loopback.disabled")}
				</p>
			</section>
			<section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
				<div className="flex flex-wrap items-center justify-between gap-2 p-4">
					<h2 className="font-semibold">{t("hosts.profiles")}</h2>
					<div className="flex gap-2">
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="min-h-11 rounded-md border border-slate-300 px-3"
							placeholder={t("hosts.profileNamePlaceholder")}
						/>
						<button
							type="button"
							onClick={createProfile}
							className="min-h-11 rounded-md bg-slate-900 px-4 text-white"
						>
							{t("hosts.createProfile")}
						</button>
					</div>
				</div>
				{profiles.length === 0 ? (
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
									onToggle={() =>
										setExpandedId(expanded ? null : profile.id)
									}
									onImport={() => setImportProfileId(profile.id)}
									onUpdateEntry={(entryId, patch) =>
										update.mutate({
											profileId: profile.id,
											entryId,
											domain:
												profile.entries.find((e) => e.id === entryId)
													?.domain ?? "",
											...patch,
										})
									}
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