import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useInitialDump } from "~/api/hooks";
import { errorMessage, formatDateTime } from "~/i18n";
import { useAppStore, type ParsedSubscription } from "~/store/app-store";
import type { NodeProxy } from "~/utils/nodes";

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
	subId,
	item,
}: {
	subName: string;
	subId: string;
	item: ParsedSubscription | undefined;
}) {
	const { t } = useTranslation();
	return (
		<div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
			<div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
				<span className="truncate text-sm font-medium text-slate-700">
					{subName}
				</span>
				{item?.nodes !== null && item !== undefined ? (
					<span className="shrink-0 text-xs text-slate-400">
						{t("nodes.nodeCount", {
							subId,
							total: item.nodes.length,
						})}
					</span>
				) : null}
			</div>
			{item === undefined ? (
				<p className="px-4 py-4 text-center text-sm text-slate-400">
					{t("common.loading")}
				</p>
			) : item.nodes === null ? (
				<div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(item.error)}
				</div>
			) : item.nodes.length === 0 ? (
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
// Read-only view: every active subscription's nodes, parsed in the browser from
// the initial dump and held in the global store. There is no build step anymore.

export default function NodesPage() {
	const { t } = useTranslation();

	const query = useInitialDump();
	const subscriptions = useAppStore((s) => s.subscriptions);
	const parsed = useAppStore((s) => s.parsed);
	const hydratedAt = useAppStore((s) => s.hydratedAt);

	const totalNodes = useMemo(
		() =>
			subscriptions.reduce(
				(sum, sub) => sum + (parsed[String(sub.id)]?.nodes?.length ?? 0),
				0,
			),
		[subscriptions, parsed],
	);

	return (
		<div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<h1 className="text-xl font-semibold">{t("nodes.title")}</h1>
				<button
					type="button"
					onClick={() => void query.refetch()}
					disabled={query.isRefetching}
					className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{query.isRefetching ? t("nodes.refreshing") : t("nodes.refresh")}
				</button>
			</div>

			{query.isError ? (
				<div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{errorMessage(query.error)}
				</div>
			) : null}

			{query.isLoading ? (
				<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
					{t("common.loading")}
				</div>
			) : subscriptions.length === 0 ? (
				<div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
					{t("nodes.noSubscriptions")}
				</div>
			) : (
				<>
					<div className="mb-3 flex items-baseline justify-between gap-2">
						<h2 className="text-base font-semibold">{t("nodes.all")}</h2>
						{hydratedAt !== null ? (
							<span className="text-xs text-slate-400">
								{t("nodes.meta", {
									total: totalNodes,
									date: formatDateTime(new Date(hydratedAt).toISOString()),
								})}
							</span>
						) : null}
					</div>
					<div className="space-y-3">
						{subscriptions.map((sub) => (
							<NodeGroupCard
								key={sub.id}
								subName={sub.name === "" ? t("nodes.unnamed") : sub.name}
								subId={String(sub.id)}
								item={parsed[String(sub.id)]}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
