/**
 * Collapsible — a reusable list item with fold/unfold behavior.
 *
 * Abstracts the common fold interaction shared by list pages (e.g. the
 * subscription list and the run-status generated-result history):
 *   - a clickable header row that toggles the open state;
 *   - a rotating chevron in front of the header;
 *   - the `aria-expanded` / `aria-controls` / `aria-label` accessibility wiring;
 *   - the expanded content container (rendered only when open).
 *
 * The header content, any trailing actions (badges / edit / delete buttons),
 * and the expanded body are all supplied by the caller, so each page keeps
 * only its own content. The component is optionally controlled: pass
 * `expanded` + `onToggle` to drive it externally (e.g. "first item open by
 * default"), otherwise it manages its own state (`defaultExpanded`).
 */

import { type ReactNode, useState } from "react";

interface CollapsibleProps {
	/** Unique id used to wire `aria-controls` to the expanded region. */
	id: string;
	/** Accessible label for the toggle button (read by screen readers). */
	ariaLabel: string;
	/** Controlled open state; when provided, `onToggle` must also be provided. */
	expanded?: boolean;
	/** Callback fired when the header is clicked (controlled mode). */
	onToggle?: () => void;
	/** Initial open state for uncontrolled mode (default false). */
	defaultExpanded?: boolean;
	/** The clickable header content (name, meta, etc.). */
	header: ReactNode;
	/** Optional trailing row of actions (badges / buttons), rendered beside the header. */
	actions?: ReactNode;
	/** The expanded body, rendered only when open. */
	children: ReactNode;
}

export function Collapsible({
	id,
	ariaLabel,
	expanded: controlledExpanded,
	onToggle,
	defaultExpanded = false,
	header,
	actions,
	children,
}: CollapsibleProps) {
	const [open, setOpen] = useState(defaultExpanded);
	// Controlled mode: the caller owns the state.
	const expanded = controlledExpanded ?? open;
	const toggle = () => {
		if (controlledExpanded !== undefined) {
			onToggle?.();
		} else {
			setOpen((o) => !o);
		}
	};

	return (
		<li className="border-b border-slate-100 last:border-b-0">
			<div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
				<button
					type="button"
					aria-expanded={expanded}
					aria-controls={`collapse-${id}`}
					aria-label={ariaLabel}
					onClick={toggle}
					className="flex min-w-0 flex-1 cursor-pointer items-start gap-x-3 text-left transition-colors hover:bg-slate-50"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
						className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${
							expanded ? "rotate-90" : ""
						}`}
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
					<div className="min-w-0 flex-1">{header}</div>
				</button>

				{actions !== undefined ? (
					<div className="flex w-full shrink-0 gap-1 pl-7 md:w-auto md:pl-0">
						{actions}
					</div>
				) : null}
			</div>

			{expanded ? (
				<div
					id={`collapse-${id}`}
					className="border-t border-slate-100 bg-slate-50/60 px-4 py-3"
				>
					{children}
				</div>
			) : null}
		</li>
	);
}