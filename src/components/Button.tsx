/**
 * Button — the single styled button primitive for the app.
 *
 * Centralises every button appearance behind two axes:
 *   - `variant` — colour / interaction scheme (solid primary, bordered
 *     outlines, rose danger, ghost edit/delete link tones, modal close).
 *   - `size` — padding / type scale: only `xs`, `sm`, `md`. Anything else
 *     (a small reorder chip, a 44px form action) is expressed with these three
 *     plus the orthogonal `minH` touch-target modifier.
 *
 * Classes below are plain Tailwind utilities owned in one place so pages never
 * hand-write button styling.
 *
 * - `minH` (boolean) adds `min-h-11` (44px) — the required mobile touch-target
 *   for primary actions (AGENTS.md rule #1). It is a modifier, not a size.
 * - `className` is appended last for one-off extras (e.g. `w-full`, `mt-2`).
 *
 * `LinkButton` is a thin alias over `Button` (edit/delete + `xs` size) kept for
 * call sites that want the link affordance by name.
 */

import {
	forwardRef,
	type ButtonHTMLAttributes,
	type MouseEventHandler,
	type ReactNode,
} from "react";

export type ButtonVariant =
	| "primary"
	| "outline"
	| "outlineDisabled"
	| "outlineLight"
	| "danger"
	| "edit"
	| "delete"
	| "close"
	| "bare";

export type ButtonSize = "xs" | "sm" | "md";

export interface ButtonProps
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
	children: ReactNode;
	/** Colour / interaction scheme. Defaults to `primary`. */
	variant?: ButtonVariant;
	/** Padding / type scale: `xs`, `sm` (default), `md`. */
	size?: ButtonSize;
	/** Adds the 44px `min-h-11` touch target (mobile acceptance requirement). */
	minH?: boolean;
	/** Native `type`; defaults to `"button"` (use `"submit"` inside a form). */
	type?: "button" | "submit";
	onClick?: MouseEventHandler<HTMLButtonElement>;
}

const variantClass: Record<ButtonVariant, string> = {
	primary:
		"bg-slate-900 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50",
	outline:
		"border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50",
	outlineDisabled:
		"border border-slate-300 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
	outlineLight:
		"border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-100",
	danger: "border border-rose-300 text-rose-700",
	edit: "text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800",
	delete:
		"text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50",
	close: "text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600",
	bare: "border",
};

const sizeClass: Record<ButtonSize, string> = {
	xs: "rounded-md px-2 py-1 text-xs font-medium",
	sm: "rounded-md px-3 py-1.5 text-sm font-medium",
	md: "rounded-md px-4 py-2 text-sm font-medium",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ children, variant = "primary", size = "sm", minH = false, type = "button", className = "", ...rest },
	ref,
) {
	const merged = `${variantClass[variant]} ${sizeClass[size]}${minH ? " min-h-11" : ""}`.trim();
	return (
		<button ref={ref} type={type} className={className ? `${merged} ${className}` : merged} {...rest}>
			{children}
		</button>
	);
});