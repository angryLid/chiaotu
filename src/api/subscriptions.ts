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

// ---- response envelope ----

export type Envelope<T> =
	| { status: "Ok"; result: T }
	| { status: `Err:${string}`; result: string };

// ---- types ----

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
		response = await fetch(`/api${path}`, {
			headers: { "Content-Type": "application/json" },
			...init,
		});
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
		throw new ApiError(envelope.result, code);
	}
	return envelope.result;
}

// ---- subscription API ----

/** List all subscriptions (summaries, without content). */
export function listSubscriptions(): Promise<SubscriptionSummary[]> {
	return request<SubscriptionSummary[]>("/subscriptions");
}

/**
 * Fetch full subscriptions (with content) so the frontend can parse nodes.
 * @param ids Only fetch the given ids (defaults to all); missing ids are ignored by the backend.
 */
export function listSubscriptionsFull(ids?: number[]): Promise<Subscription[]> {
	const params = new URLSearchParams();
	params.set("include_content", "1");
	if (ids && ids.length > 0) {
		params.set("ids", ids.join(","));
	}
	return request<Subscription[]>(`/subscriptions?${params.toString()}`);
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
