/**
 * Auth store (zustand): holds the backend bearer credential.
 *
 * The user enters the raw shared secret on the home/auth page; that secret is
 * Base64-encoded as UTF-8 (see `encodeToken`) before being persisted in
 * localStorage (`chiaotu.token`) and attached to the `Authorization: Bearer`
 * header by `~/api/subscriptions#request`. Base64 keeps the header ASCII-safe
 * and lets the secret contain non-ASCII characters; the backend derives the
 * same encoding from `API_TOKEN` at startup and compares that. Reading/writing
 * goes through this store so the UI can react to auth state changes (the App
 * shows the auth page when the credential is absent, and clears its whole query
 * tree when the credential is revoked mid-session by a `Err:UNAUTHORIZED`
 * response).
 */

import { create } from "zustand";

export const TOKEN_STORAGE_KEY = "chiaotu.token";

/**
 * Base64-encode a string as UTF-8. `btoa` only covers Latin-1, so UTF-8 bytes
 * must first be expanded into code points; this yields a canonical form for any
 * secret (including non-ASCII), matching the backend's `encodeToken`.
 */
export function encodeToken(secret: string): string {
	const bytes = new TextEncoder().encode(secret);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/** Read the persisted token; returns "" when absent or storage is unavailable. */
function readStoredToken(): string {
	try {
		return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
	} catch {
		return "";
	}
}

interface AuthStore {
	/** The current bearer credential (Base64-encoded); "" when not authenticated. */
	token: string;
	/** Persist and set a new credential. `setToken` takes the raw shared secret
	 *  and stores its Base64 encoding (called after the user's secret validates). */
	setToken: (secret: string) => void;
	/** Remove the persisted credential and reset the in-memory one (on Err:UNAUTHORIZED). */
	clearToken: () => void;
}

export const useAuthStore = create<AuthStore>()((set) => ({
	token: readStoredToken(),
	setToken: (secret) => {
		const encoded = encodeToken(secret);
		try {
			window.localStorage.setItem(TOKEN_STORAGE_KEY, encoded);
		} catch {
			// persistence is best-effort; the in-memory credential still works for this session
		}
		set({ token: encoded });
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
