import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCreateNodeBuild,
	useNodeSnapshot,
	useSubscriptions,
} from "~/api/hooks";
import type { NodeBuildItem, NodeProxy } from "~/api/nodes";
import { errorMessage, formatDateTime } from "~/i18n";

// ---- helpers ----

/** String value of a node field (the node is a passthrough proxy object; field types are unknown). */
function stringOf(node: NodeProxy, key: string): string {
	const value = node[key];
	if (value === undefined || value === null) return "";
	return typeof value === "string" ? value : String(value);
}

// ---- per-upstream node card ----

function NodeGroupCard({
	subName,
	item,
}: {
	subName: string;
	item: NodeBuildItem;
}) {
	const { t } = useTranslation();
	return (
		<div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
			<div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
				<span className="truncate text-sm font-medium text-slate-700">
					{subName}
				</span>
				<span className="shrink-0 text-xs text-slate-400">
					{t("nodes.nodeCount", {
						subId: item.subId,
						total: item.content.length,
					})}
				</span>
			</div>
			{item.content.length === 0 ? (
				<p className="px-4 py-4 text-center text-sm text-slate-400">
					{t("nodes.noNodes")}
				</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full table-fixed text-left text-sm">
						<thead>
							<tr className="border-b border-slate-100 text-xs text-slate-400">
								<th className="w-[45%] px-4 py-2 font-medium">{t("nodes.col.name")}</th>
								<th className="w-[15%] px-4 py-2 font-medium">{t("nodes.col.type")}</th>
								<th className="w-[25%] px-4 py-2 font-medium">{t("nodes.col.server")}</th>
								<th className="w-[15%] px-4 py-2 font-medium">{t("nodes.col.port")}</th>
							</tr>
						</thead>
						<tbody>
							{item.content.map((node) => (
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
									<td title={stringOf(node, "type")} className="truncate px-4 py-2 text-slate-600">
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
			)}
		</div>
	);
}

// ---- page ----

export default function NodesPage() {
	const { t } = useTranslation();
	const [selected, setSelected] = useState<Set<number>>(new Set());

	const subsQuery = useSubscriptions();
	const snapshotQuery = useNodeSnapshot();
	const buildMutation = useCreateNodeBuild();

	const subs = subsQuery.data ?? null;
	const snapshot = snapshotQuery.data ?? null;
	const listError = subsQuery.error ?? snapshotQuery.error ?? null;

	const nameOf = useMemo(() => {
		const map = new Map<number, string>();
		for (const sub of subs ?? []) map.set(sub.id, sub.name);
		return (subId: string) => map.get(Number(subId)) ?? `#${subId}`;
	}, [subs]);

	const totalNodes = useMemo(
		() => snapshot?.data.reduce((sum, item) => sum + item.content.length, 0) ?? 0,
		[snapshot],
	);

	function toggle(id: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function selectAll() {
		setSelected(new Set((subs ?? []).map((sub) => sub.id)));
	}

	function clearAll() {
		setSelected(new Set());
	}

	async function handleBuild() {
		const ids = [...selected];
		if (ids.length === 0 || buildMutation.isPending) return;
		try {
			await buildMutation.mutateAsync(ids);
		} catch {
			// Failure message is rendered from buildMutation.error
		}
	}

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("nodes.title")}</h1>
				<button
					type="button"
					onClick={() => {
						void subsQuery.refetch();
						void snapshotQuery.refetch();
					}}
					className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
				>
					{t("nodes.refresh")}
				</button>
			</div>

			{listError !== null ? (
				<div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(listError)}
				</div>
			) : null}

			{/* Build section */}
			<div className="rounded-lg border border-slate-200 bg-white p-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-base font-semibold">{t("nodes.buildTitle")}</h2>
						<p className="mt-1 text-xs text-slate-400">{t("nodes.buildHint")}</p>
					</div>
					<button
						type="button"
						onClick={() => void handleBuild()}
						disabled={buildMutation.isPending || selected.size === 0}
						className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{buildMutation.isPending ? t("nodes.building") : t("nodes.build")}
					</button>
				</div>

				<div className="mt-4">
					<div className="flex items-center justify-between">
						<p className="text-xs font-medium text-slate-500">
							{t("nodes.chooseUpstream", { selected: selected.size })}
						</p>
						{subs !== null && subs.length > 0 ? (
							<div className="flex gap-3 text-xs text-slate-500">
								<button
									type="button"
									onClick={selectAll}
									className="hover:text-slate-900"
								>
									{t("nodes.selectAll")}
								</button>
								<button
									type="button"
									onClick={clearAll}
									className="hover:text-slate-900"
								>
									{t("nodes.clearAll")}
								</button>
							</div>
						) : null}
					</div>

					{subs === null ? (
						<p className="mt-2 text-sm text-slate-400">{t("common.loading")}</p>
					) : subs.length === 0 ? (
						<p className="mt-2 text-sm text-slate-400">
							{t("nodes.noSubscriptions")}
						</p>
					) : (
						<div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{subs.map((sub) => {
								const checked = selected.has(sub.id);
								return (
									<label
										key={sub.id}
										className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors ${
											checked
												? "border-slate-900 bg-slate-50"
												: "border-slate-200 hover:bg-slate-50"
										}`}
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggle(sub.id)}
											className="mt-0.5 accent-slate-900"
										/>
										<span className="min-w-0">
											<span className="block truncate font-medium text-slate-700">
												{sub.name === "" ? t("nodes.unnamed") : sub.name}
											</span>
											<span className="block text-xs text-slate-400">
												#{sub.id}
											</span>
										</span>
									</label>
								);
							})}
						</div>
					)}
				</div>
			</div>

			{/* Status bar */}
			{buildMutation.isError && !buildMutation.isPending ? (
				<div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(buildMutation.error)}
				</div>
			) : null}
			{buildMutation.isSuccess && !buildMutation.isPending ? (
				<div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
					{t("nodes.buildSuccess", {
						version: buildMutation.data.id,
						date: formatDateTime(buildMutation.data.created_at),
					})}
				</div>
			) : null}

			{/* Latest build */}
			<div className="mt-4 space-y-3">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<h2 className="text-base font-semibold">{t("nodes.latestBuild")}</h2>
					{snapshot !== null ? (
						<span className="text-xs text-slate-400">
							{t("nodes.latestMeta", {
								version: snapshot.id,
								date: formatDateTime(snapshot.created_at),
								total: totalNodes,
							})}
						</span>
					) : null}
				</div>

				{snapshotQuery.isLoading ? (
					<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
						{t("common.loading")}
					</div>
				) : snapshot === null ? (
					<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
						{t("nodes.emptySnapshot")}
					</div>
				) : snapshot.data.length === 0 ? (
					<div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
						{t("nodes.emptyBuild")}
					</div>
				) : (
					snapshot.data.map((item) => (
						<NodeGroupCard
							key={item.subId}
							subName={nameOf(item.subId)}
							item={item}
						/>
					))
				)}
			</div>
		</div>
	);
}
