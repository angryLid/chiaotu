/**
 * REST client for the friend-cats "generated" resource (the run-status panel).
 *
 * Contract points (see friend-cats README and openapi.yaml):
 * - HTTP is always 200; success is decided by the envelope { status, result };
 * - GET /generated returns the generated result with the most recent generation
 *   time (Err:NOT_FOUND when none exists yet);
 * - GET /generated/recent returns the most recent generated results, newest
 *   first, up to a `limit` (default 5, clamped 1–20) — returns [] when none yet;
 * - POST /generated stores a new generated result; the content is computed by
 *   the frontend in the browser (apply a rule → produce pipeline → YAML dump)
 *   and the name is a frontend-chosen nanoid.
 */

import { request } from "./subscriptions";

/** A generated result file as returned by the backend. */
export interface Generated {
	id: number;
	name: string;
	display_name: string | null;
	content: string;
	created_at: string;
	updated_at: string;
}

/** Body for storing a new generated result. */
export interface GeneratedInput {
	name: string;
	display_name?: string | null;
	content: string;
}

export interface GeneratedUpdate {
	display_name?: string | null;
	content?: string;
}

/** Get the generated result with the most recent generation time. */
export function getLatestGenerated(): Promise<Generated> {
	return request<Generated>("/generated");
}

/**
 * Get the most recently generated results, newest first, up to `limit`
 * (default 5, clamped to 1–20 by the backend). Returns [] when none yet.
 */
export function getRecentGenerated(limit = 5): Promise<Generated[]> {
	return request<Generated[]>(`/generated/recent?limit=${limit}`);
}

/** Store a new generated result (content computed by the frontend). */
export function createGenerated(input: GeneratedInput): Promise<Generated> {
	return request<Generated>("/generated", {
		method: "POST",
		body: JSON.stringify(input),
	});
}

/** Update generated content and/or its optional display name. */
export function updateGenerated(
	name: string,
	input: GeneratedUpdate,
): Promise<Generated> {
	return request<Generated>(`/generated/${encodeURIComponent(name)}`, {
		method: "PUT",
		body: JSON.stringify(input),
	});
}
