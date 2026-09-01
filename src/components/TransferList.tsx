/**
 * TransferList — a two-panel shuttle control for moving items between an
 * "available" pool and an ordered "selected" pool. Used on the Run Status page
 * for picking projection rules and Hosts profiles.
 *
 * - Click an available item to add it, click the remove glyph on a selected
 *   item to remove it; "Add all" / "Clear" move the whole pool at once.
 * - The selected pool preserves its order; pass `ordered` to expose up/down
 *   controls (used when the order is semantically meaningful, e.g. Hosts
 *   profiles where later entries override earlier ones).
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";

export interface TransferItem {
	id: number;
	label: string;
}

interface TransferListProps {
	/** Full pool of available items. */
	items: TransferItem[];
	/** Currently selected ids, in selection order (ordered = true). */
	selectedIds: number[];
	/** Fired whenever the selected ids change. */
	onChange: (ids: number[]) => void;
	/** Expose move-up / move-down controls on selected items. */
	ordered?: boolean;
}

export function TransferList({
	items,
	selectedIds,
	onChange,
	ordered = false,
}: TransferListProps) {
	const { t } = useTranslation();

	const selectedItems = useMemo(
		() =>
			selectedIds
				.map((id) => items.find((item) => item.id === id))
				.filter((item): item is TransferItem => item !== undefined),
		[items, selectedIds],
	);

	const selectedIdSet = useMemo(
		() => new Set(selectedItems.map((item) => item.id)),
		[selectedItems],
	);

	const availableItems = useMemo(
		() => items.filter((item) => !selectedIdSet.has(item.id)),
		[items, selectedIdSet],
	);

	function add(id: number) {
		if (selectedIdSet.has(id)) return;
		onChange([...selectedIds, id]);
	}

	function remove(id: number) {
		onChange(selectedIds.filter((item) => item !== id));
	}

	function addAll() {
		const selected = new Set(selectedIds);
		const additions = items
			.filter((item) => !selected.has(item.id))
			.map((item) => item.id);
		onChange([...selectedIds, ...additions]);
	}

	function move(id: number, direction: -1 | 1) {
		const index = selectedIds.indexOf(id);
		if (index < 0) return;
		const target = index + direction;
		if (target < 0 || target >= selectedIds.length) return;
		const next = [...selectedIds];
		[next[index], next[target]] = [next[target], next[index]];
		onChange(next);
	}

	return (
		<div className="grid gap-3 sm:grid-cols-2">
			<div className="overflow-hidden rounded-md border border-slate-200">
				<div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
					<span className="text-sm font-medium text-slate-700">
						{t("transfer.available")}
						<span className="ml-1 text-xs font-normal text-slate-400">
							{availableItems.length}
						</span>
					</span>
					<Button type="button" onClick={addAll} variant="outline" size="xs">
						{t("transfer.addAll")}
					</Button>
				</div>
				<ul className="h-[132px] overflow-y-auto p-1">
					{availableItems.length === 0 ? (
						<li className="px-3 py-6 text-center text-sm text-slate-400">
							{t("transfer.empty")}
						</li>
					) : (
						availableItems.map((item) => (
							<li key={item.id}>
								<button
									type="button"
									onClick={() => add(item.id)}
									className="flex min-h-11 w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-slate-50"
								>
									<span className="shrink-0 text-slate-400">+</span>
									<span className="min-w-0 flex-1 truncate text-slate-700">
										{item.label}
									</span>
								</button>
							</li>
						))
					)}
				</ul>
			</div>

			<div className="overflow-hidden rounded-md border border-slate-200">
				<div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
					<span className="text-sm font-medium text-slate-700">
						{t("transfer.selected")}
						<span className="ml-1 text-xs font-normal text-slate-400">
							{selectedItems.length}
						</span>
					</span>
					<Button
						type="button"
						onClick={() => onChange([])}
						variant="outline"
						size="xs"
					>
						{t("transfer.clear")}
					</Button>
				</div>
				<ul className="h-[132px] overflow-y-auto p-1">
					{selectedItems.length === 0 ? (
						<li className="px-3 py-6 text-center text-sm text-slate-400">
							{t("transfer.empty")}
						</li>
					) : (
						selectedItems.map((item, index) => (
							<li
								key={item.id}
								className="flex min-h-11 items-center gap-1 rounded px-2 py-1.5"
							>
								<span className="min-w-0 flex-1 truncate text-sm text-slate-700">
									{item.label}
								</span>
								{ordered ? (
									<button
										type="button"
										onClick={() => move(item.id, -1)}
										disabled={index === 0}
										aria-label={t("transfer.moveUp")}
										className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
									>
										↑
									</button>
								) : null}
								{ordered ? (
									<button
										type="button"
										onClick={() => move(item.id, 1)}
										disabled={index === selectedItems.length - 1}
										aria-label={t("transfer.moveDown")}
										className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
									>
										↓
									</button>
								) : null}
								<button
									type="button"
									onClick={() => remove(item.id)}
									aria-label={t("transfer.remove")}
									className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
								>
									×
								</button>
							</li>
						))
					)}
				</ul>
			</div>
		</div>
	);
}
