/**
 * Switch — an iOS-style on/off toggle.
 *
 * Rendered as a button with `role="switch"` so it stays keyboard- and
 * screen-reader-accessible while looking like a native iOS toggle: a rounded
 * track that fills green when on and a white knob that slides between the two
 * positions.
 */

interface SwitchProps {
	/** Whether the switch is on. */
	checked: boolean;
	/** Fired when the user toggles the switch. */
	onChange: (checked: boolean) => void;
	/** Accessible label (read by screen readers). */
	ariaLabel?: string;
	/** Disables the switch. */
	disabled?: boolean;
}

export function Switch({
	checked,
	onChange,
	ariaLabel,
	disabled = false,
}: SwitchProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			disabled={disabled}
			onClick={() => onChange(!checked)}
			className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
				checked ? "bg-green-500" : "bg-slate-300"
			}`}
		>
			<span
				className={`absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow transition-transform duration-200 ${
					checked ? "translate-x-5" : "translate-x-0"
				}`}
			/>
		</button>
	);
}
