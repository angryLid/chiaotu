/**
 * 认证 / 首页 (Auth page): the landing page shown when no valid token is stored.
 *
 * It is a single input + button form. On submit the token is validated against
 * the backend's now-authenticated `GET /healthz` (a lightweight probe that sits
 * outside the `/api` prefix used by `request`). On success the token is stored
 * (see `~/store/auth-store`) and the app navigates to the first page
 * (`/subscriptions`). On failure an inline error is shown.
 *
 * The App only mounts its react-query tree when a token is present, so this page
 * is rendered in isolation — no queries fire here.
 */

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "~/store/auth-store";
import { navigate } from "~/router";

type AuthErrorKey = "unauthorized" | "unreachable";

type ValidateState =
	| { kind: "idle" }
	| { kind: "loading" }
	| { kind: "error"; message: AuthErrorKey };

/** Validate the token by calling the authenticated healthz endpoint. */
async function validateToken(token: string): Promise<ValidateState> {
	let response: Response;
	try {
		response = await fetch("/healthz", {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
		});
	} catch {
		return { kind: "error", message: "unreachable" };
	}

	// The backend always returns HTTP 200 with an envelope; check the body.
	try {
		const envelope = (await response.json()) as { status: string; result: unknown };
		if (envelope.status === "Ok") return { kind: "idle" };
		if (envelope.status === "Err:UNAUTHORIZED") {
			return { kind: "error", message: "unauthorized" };
		}
		return { kind: "error", message: "unreachable" };
	} catch {
		return { kind: "error", message: "unreachable" };
	}
}

export default function AuthPage() {
	const { t } = useTranslation();
	const setToken = useAuthStore((s) => s.setToken);
	const [value, setValue] = useState("");
	const [state, setState] = useState<ValidateState>({ kind: "idle" });

	const onSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const token = value.trim();
		if (token === "") return;
		setState({ kind: "loading" });
		const result = await validateToken(token);
		if (result.kind === "idle") {
			setToken(token);
			navigate("/subscriptions");
			return;
		}
		setState(result);
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
			<div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
				<div className="mb-6 flex items-center gap-2">
					<span aria-hidden>🛫</span>
					<h1 className="text-xl font-bold text-slate-900">chiaotu</h1>
				</div>
				<form onSubmit={onSubmit} className="space-y-4">
					<div>
						<label
							htmlFor="auth-token"
							className="mb-1 block text-sm font-medium text-slate-700"
						>
							{t("auth.tokenLabel")}
						</label>
						<input
							id="auth-token"
							type="password"
							autoComplete="off"
							value={value}
							onChange={(event) => {
								setValue(event.target.value);
								if (state.kind === "error") setState({ kind: "idle" });
							}}
							placeholder={t("auth.tokenPlaceholder")}
							className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
						/>
					</div>
					{state.kind === "error" && (
						<p className="text-sm text-rose-600">{t(`auth.error.${state.message}`)}</p>
					)}
					<button
						type="submit"
						disabled={state.kind === "loading" || value.trim() === ""}
						className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t(state.kind === "loading" ? "auth.connecting" : "auth.submit")}
					</button>
				</form>
			</div>
		</div>
	);
}