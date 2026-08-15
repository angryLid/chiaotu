/**
 * Unified response envelope and subscriptions REST client for the friend-cats backend.
 *
 * Contract points (see friend-cats README and openapi.yaml):
 * - HTTP is always 200; success is decided by the envelope { status, result };
 * - status "Ok" carries business data, otherwise "Err:<CODE>" with a description;
 * - Subscription fields use snake_case (created_at / updated_at).
 */

// Errors are raised as code + params (never final sentences) and resolved to
// localised copy by ~/i18n; ApiError lives in ./errors so non-API modules
// (parse pipeline, i18n) can share it without importing this REST client.

import { ApiError } from "./errors";
export { ApiError, type ApiErrorCode } from "./errors";
import type { Rule } from "~/persistence/rules";
import { useAuthStore } from "~/store/auth-store";

// ---- response envelope ----

export type Envelope<T> =
	| { status: "Ok"; result: T }
	| { status: `Err:${string}`; result: string };

// ---- types ----

/**
 * Cap on the total number of subscriptions, mirrored from the backend
 * (friend-cats model.MaxSubscriptions). The backend enforces the limit; this
 * constant powers the client-side UX (disabling “new” at the cap).
 */
export const MAX_SUBSCRIPTIONS = 10;

/** Subscription summary (for lists; no content). */
export interface SubscriptionSummary {
	id: number;
	name: string;
	url: string;
	created_at: string;
	updated_at: string;
}

/** Full subscription (with raw content). */
export interface Subscription extends SubscriptionSummary {
	content: string;
}

/**
 * Body for creating / updating a subscription.
 * Validation: url and content must provide at least one non-empty value; url wins when both are given.
 */
export interface SubscriptionInput {
	name?: string;
	url?: string;
	content?: string;
}

// ---- request ----

/** Unified request entry: prefixes /api and unwraps the envelope. Reused by other API modules. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
	let response: Response;
	try {
		const token = useAuthStore.getState().token;
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (token !== "") headers.Authorization = `Bearer ${token}`;
		response = await fetch(`/api${path}`, { ...init, headers });
	} catch {
		throw new ApiError("", "TRANSPORT_FAILED");
	}

	let envelope: Envelope<T>;
	try {
		envelope = (await response.json()) as Envelope<T>;
	} catch {
		throw new ApiError("", "INVALID_RESPONSE");
	}

	if (envelope.status !== "Ok") {
		const code = envelope.status.startsWith("Err:")
			? envelope.status.slice("Err:".length)
			: envelope.status;

		// Authentication failed: the token is no longer valid (or was never set).
		// Drop it so the App unmounts the query tree and shows the auth page.
		// This is idempotent and stops further requests, so there is no redirect loop.
		if (code === "UNAUTHORIZED") {
			useAuthStore.getState().clearToken();
		}

		throw new ApiError(
			envelope.result,
			code,
			code === "LIMIT_EXCEEDED" ? { max: MAX_SUBSCRIPTIONS } : undefined,
		);
	}
	return envelope.result;
}

// ---- subscription API ----

/** Complete application state: all active subscriptions (full content) + all rules (newest first). */
export interface InitialDump {
	subscriptions: Subscription[];
	rules: Rule[];
}

/** List all subscriptions (summaries, without content). */
export function listSubscriptions(): Promise<SubscriptionSummary[]> {
	return request<SubscriptionSummary[]>("/subscriptions");
}

/**
 * The single entry-point call of the SPA: fetch the complete application state
 * (all active subscriptions with content + all rules) so the store can be
 * hydrated with one round trip. Node parsing stays in the browser.
 */
export function getInitialDump(): Promise<InitialDump> {
	return request<InitialDump>("/initial-dump");
}

/** Create a subscription: with a url the backend fetches and stores the content (url wins over content). */
export function createSubscription(
	input: SubscriptionInput,
): Promise<Subscription> {
	return request<Subscription>("/subscriptions", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

/** Get a single subscription (with raw content). */
export function getSubscription(id: number): Promise<Subscription> {
	return request<Subscription>(`/subscriptions/${id}`);
}

/** Replace the whole subscription: name / url / content are all overwritten with the new values. */
export function updateSubscription(
	id: number,
	input: SubscriptionInput,
): Promise<Subscription> {
	return request<Subscription>(`/subscriptions/${id}`, {
		method: "PUT",
		body: JSON.stringify(input),
	});
}

/** Delete a subscription. */
export function deleteSubscription(id: number): Promise<null> {
	return request<null>(`/subscriptions/${id}`, { method: "DELETE" });
}
