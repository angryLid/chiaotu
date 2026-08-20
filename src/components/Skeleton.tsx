/**
 * Skeleton - loading-placeholder primitives.
 *
 * While a query is in flight, pages render these pulsing gray blocks instead
 * of text-only "loading" markers. Every composite piece mirrors the DOM shape
 * of the real content it replaces (Collapsible list rows, node tables, form
 * fields, checkbox pickers), so the page keeps its final layout while data is
 * loading and the content fades in in place when the response arrives -
 * nothing pops in.
 *
 * Conventions:
 * - Tailwind-only styling on the app's slate tokens; the pulse is disabled
 *   under prefers-reduced-motion (motion-reduce:animate-none);
 * - every shape block is aria-hidden; wrap a skeleton layout in SkeletonArea,
 *   which announces the loading state to screen readers via a polite live
 *   region plus a visually hidden "loading" text);
 * - row / field counts default to the typical size of the real lists and can
 *   be tuned per call site.
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** One shimmering placeholder block; size it with h-* / w-* utilities. */
export function Skeleton({ className = "" }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={`animate-pulse rounded bg-slate-200 motion-reduce:animate-none ${className}`}
		/>
	);
}

/** Accessible live region for any skeleton layout: announces "loading" to screen readers. */
export function SkeletonArea({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const { t } = useTranslation();
	return (
		<div aria-live="polite" className={className}>
			<span className="sr-only">{t("common.loading")}</span>
			{children}
		</div>
	);
}

/**
 * One list-row placeholder mirroring the Collapsible item layout: chevron
 * square, text lines at the real type sizes (name / url / date) and the
 * trailing action-button blocks. Render it inside a <ul> carrying the same
 * container classes as the real list, so the swap causes no layout shift.
 * `lines` selects how many of the stacked text lines to show (3 = name + url +
 * date, 2 = name + meta).
 */
export function SkeletonListItem({ lines = 3 }: { lines?: number }) {
	return (
		<li className="border-b border-slate-100 last:border-b-0">
			<div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
				<Skeleton className="mt-0.5 h-4 w-4 shrink-0" />
				<div className="min-w-0 flex-1 space-y-1.5">
					<Skeleton className="h-4 w-1/3" />
					{lines >= 2 ? <Skeleton className="h-3 w-2/3" /> : null}
					{lines >= 3 ? <Skeleton className="h-3 w-1/4" /> : null}
				</div>
				<div className="flex w-full shrink-0 gap-2 pl-7 md:w-auto md:pl-0">
					<Skeleton className="h-6 w-12 rounded-md" />
					<Skeleton className="h-6 w-12 rounded-md" />
				</div>
			</div>
		</li>
	);
}

/** Line widths cycled across checkbox rows so repeated rows do not look stamped. */
const CHECKBOX_LINE_WIDTHS = ["w-32", "w-24", "w-40", "w-28"];

/**
 * Checkbox-picker placeholder rows (rule / subscription selection boxes):
 * one square + one text line per row, matching the picker row padding. Wrap
 * them in the same bordered box the real picker sits in.
 */
export function SkeletonCheckboxRows({
	rows = 4,
	className = "",
}: {
	rows?: number;
	className?: string;
}) {
	const rowItems: ReactNode[] = [];
	for (let index = 0; index < rows; index += 1) {
		const lineWidth = CHECKBOX_LINE_WIDTHS[index % CHECKBOX_LINE_WIDTHS.length];
		rowItems.push(
			<div key={index} className="flex items-center gap-2 rounded px-2 py-1">
				<Skeleton className="h-4 w-4 shrink-0" />
				<Skeleton className={`h-4 ${lineWidth}`} />
			</div>,
		);
	}
	return <div className={`space-y-1 ${className}`}>{rowItems}</div>;
}

/** Static grid-template class per column count (Tailwind classes cannot be dynamic). */
const GRID_CLASS: Record<number, string> = {
	3: "grid-cols-3",
	4: "grid-cols-4",
};

/**
 * Table placeholder: a header band plus rows of cell blocks. Borderless by
 * itself - wrap it in the same container the real table sits in. Column widths
 * are equal-ish approximations of the real table-fixed layouts.
 */
export function SkeletonTable({
	rows = 6,
	cols = 4,
	className = "",
}: {
	rows?: number;
	cols?: number;
	className?: string;
}) {
	const gridClass = GRID_CLASS[cols] ?? GRID_CLASS[4];
	const headerCells: ReactNode[] = [];
	for (let col = 0; col < cols; col += 1) {
		headerCells.push(<Skeleton key={col} className="h-3 w-10" />);
	}
	const bodyRows: ReactNode[] = [];
	for (let row = 0; row < rows; row += 1) {
		const cells: ReactNode[] = [];
		for (let col = 0; col < cols; col += 1) {
			cells.push(
				<Skeleton
					key={col}
					className={col === 0 ? "h-4 w-full" : "h-4 w-3/4"}
				/>,
			);
		}
		bodyRows.push(
			<div
				key={row}
				className={`grid gap-4 border-b border-slate-100 px-4 py-2 last:border-b-0 ${gridClass}`}
			>
				{cells}
			</div>,
		);
	}
	return (
		<div className={className}>
			<div
				className={`grid gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2 ${gridClass}`}
			>
				{headerCells}
			</div>
			{bodyRows}
		</div>
	);
}

/**
 * One form-field placeholder: label bar + control block. `multiline` renders a
 * textarea-height block instead of a single-line input; `labelWidth` tunes the
 * label bar to the real label text length.
 */
export function SkeletonField({
	multiline = false,
	labelWidth = "w-16",
}: {
	multiline?: boolean;
	labelWidth?: string;
}) {
	return (
		<div>
			<Skeleton className={`h-4 ${labelWidth}`} />
			<Skeleton
				className={`mt-2 w-full rounded-md ${multiline ? "h-44" : "h-10"}`}
			/>
		</div>
	);
}
