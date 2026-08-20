/**
 * LinkButton — a button styled to look like a link (no solid fill / border).
 *
 * Thin alias over the shared `Button` primitive (see `Button.tsx`): the
 * `default` variant maps to the neutral slate edit tone and `danger` to the
 * rose delete tone, both at the compact `link` size. Used for inline "edit" /
 * "delete" actions in list rows (subscriptions, rules).
 */

import type { MouseEventHandler, ReactNode } from "react";
import { Button } from "./Button";

type LinkButtonVariant = "default" | "danger";

interface LinkButtonProps {
	/** Button content (label). */
	children: ReactNode;
	onClick?: MouseEventHandler<HTMLButtonElement>;
	/** Native `type`; defaults to `"button"` (must be `"submit"` inside a form). */
	type?: "button" | "submit";
	disabled?: boolean;
	/** Visual tone. `default` = slate (edit), `danger` = rose (delete). */
	variant?: LinkButtonVariant;
}

export function LinkButton({
	children,
	onClick,
	type = "button",
	disabled = false,
	variant = "default",
}: LinkButtonProps) {
	return (
		<Button
			type={type}
			onClick={onClick}
			disabled={disabled}
			variant={variant === "danger" ? "delete" : "edit"}
			size="xs"
		>
			{children}
		</Button>
	);
}
