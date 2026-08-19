import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateHostsProfile,
	useDeleteHostsProfile,
	useImportHostsEntries,
	useUpdateHostsEntry,
} from "~/api/hooks";
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

export default function HostsPage() {
	const { t } = useTranslation();
	const profiles = useAppStore((s) => s.hostsProfiles);
	const [profileId, setProfileId] = useState<number | null>(null);
	const [name, setName] = useState("");
	const [text, setText] = useState("");
	const [override, setOverride] = useState(() => {
		try {
			return localStorage.getItem(LOOPBACK_KEY) ?? "";
		} catch {
			return "";
		}
	});
	const [report, setReport] = useState<ReturnType<
		typeof parseHostsInput
	> | null>(null);
	const create = useCreateHostsProfile();
	const remove = useDeleteHostsProfile();
	const importer = useImportHostsEntries();
	const update = useUpdateHostsEntry();
	const selected = profiles.find((p) => p.id === profileId) ?? profiles[0];
	const parsed = useMemo(() => parseHostsInput(text), [text]);
	function saveOverride() {
		localStorage.setItem(LOOPBACK_KEY, override.trim());
	}
	function createProfile() {
		if (name.trim()) {
			create.mutate({ name: name.trim() });
			setName("");
		}
	}
	function preview() {
		setReport(parsed);
	}
	function confirmImport() {
		if (!selected || !report) return;
		const last = new Map<string, { domain: string; ip: string }>();
		for (const entry of report.entries)
			last.set(entry.domain, { domain: entry.domain, ip: entry.ip });
		importer.mutate(
			{ id: selected.id, entries: [...last.values()] },
			{ onSuccess: () => setReport(null) },
		);
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
			<section className="rounded-lg border border-slate-200 bg-white p-4">
				<div className="flex flex-wrap items-center justify-between gap-2">
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
				<div className="mt-3 space-y-2">
					{profiles.map((profile) => (
						<button
							type="button"
							key={profile.id}
							onClick={() => setProfileId(profile.id)}
							className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 text-left ${selected?.id === profile.id ? "border-slate-900 bg-slate-50" : "border-slate-200"}`}
						>
							<span>{profile.name}</span>
							<span className="text-xs text-slate-500">
								{t("hosts.entryCount", { count: profile.entries.length })}
							</span>
						</button>
					))}
					{profiles.length === 0 && (
						<p className="text-sm text-slate-500">{t("hosts.noProfiles")}</p>
					)}
				</div>
			</section>
			{selected && (
				<section className="rounded-lg border border-slate-200 bg-white p-4">
					<h2 className="font-semibold">{selected.name}</h2>
					<textarea
						value={text}
						onChange={(e) => setText(e.target.value)}
						className="mt-3 min-h-32 w-full rounded-md border border-slate-300 p-3 font-mono text-sm"
						placeholder={t("hosts.importPlaceholder")}
					/>
					<button
						type="button"
						onClick={preview}
						className="mt-2 min-h-11 rounded-md bg-slate-900 px-4 text-white"
					>
						{t("hosts.previewImport")}
					</button>
					<div className="mt-4 space-y-2">
						{selected.entries.map((entry) => (
							<div
								key={entry.id}
								className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-center"
							>
								<input
									type="checkbox"
									checked={entry.enabled}
									onChange={(e) =>
										update.mutate({
											profileId: selected.id,
											entryId: entry.id,
											domain: entry.domain,
											ip: entry.ip,
											enabled: e.target.checked,
										})
									}
									className="size-5 accent-slate-900"
								/>
								<input
									value={entry.ip}
									onChange={(e) =>
										update.mutate({
											profileId: selected.id,
											entryId: entry.id,
											domain: entry.domain,
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
						onClick={() => {
							if (
								window.confirm(
									t("hosts.deleteProfileConfirm", { name: selected.name }),
								)
							)
								remove.mutate(selected.id);
						}}
						className="mt-4 min-h-11 rounded-md border border-rose-300 px-4 text-rose-700"
					>
						{t("hosts.deleteProfile")}
					</button>
				</section>
			)}
			{report && (
				<div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
					<div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4">
						<h2 className="text-lg font-semibold">{t("hosts.importReport")}</h2>
						<p className="mt-2 text-sm">
							{t("hosts.accepted", { count: report.entries.length })};{" "}
							{t("hosts.skipped", { count: report.skipped.length })};{" "}
							{t("hosts.ignoredAfterLimit", {
								count: report.ignoredAfterLimit,
							})}
						</p>
						<pre className="mt-3 max-h-80 overflow-auto rounded bg-slate-50 p-3 text-xs">
							{report.entries
								.map((e) => `${e.line}: ${e.ip || "(empty)"} ${e.domain}`)
								.join("\n")}
						</pre>
						<div className="mt-4 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setReport(null)}
								className="min-h-11 rounded border px-4"
							>
								{t("hosts.cancelImport")}
							</button>
							<button
								type="button"
								onClick={confirmImport}
								className="min-h-11 rounded bg-slate-900 px-4 text-white"
							>
								{t("hosts.confirmImport")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
