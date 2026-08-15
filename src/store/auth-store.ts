/**
 * Auth store (zustand): holds the backend bearer token.
 *
 * The token is the value the user enters on the home/auth page; it is persisted
 * in localStorage (`chiaotu.token`) and attached to the `Authorization: Bearer`
 * header by `~/api/subscriptions#request`. Reading/writing goes through this
 * store so the UI can react to auth state changes (the App shows the auth page
 * when the token is absent, and clears its whole query tree when the token is
 * revoked mid-session by a `Err:UNAUTHORIZED` response).
 */

import { create } from "zustand";

export const TOKEN_STORAGE_KEY = "chiaotu.token";

/** Read the persisted token; returns "" when absent or storage is unavailable. */
function readStoredToken(): string {
	try {
		return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

interface AuthStore {
	/** The current bearer token; "" when not authenticated. */
	token: string;
	/** Persist and set a new token (called after the user's token validates). */
	setToken: (token: string) => void;
	/** Remove the persisted token and reset the in-memory one (on Err:UNAUTHORIZED). */
	clearToken: () => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
	token: readStoredToken(),
	setToken: (token) => {
		try {
			window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
		} catch {
			// persistence is best-effort; the in-memory token still works for this session
		}
		set({ token });
	},
	clearToken: () => {
		try {
			window.localStorage.removeItem(TOKEN_STORAGE_KEY);
		} catch {
			// ignore
		}
		set({ token: "" });
	},
}));
