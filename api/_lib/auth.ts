/**
 * Bearer token authentication, mirrored from the Go backend
 * (internal/controller/middleware.go). Every request must carry
 * "Authorization: Bearer <API_TOKEN>"; a missing/mismatched token is rendered as
 * the envelope Err:UNAUTHORIZED (HTTP stays 200). The token comes from the
 * API_TOKEN environment variable (same as the old Go server).
 *
 * The token is also written to the Supabase client as the anon key mapping is
 * NOT used here — the Edge Functions authenticate the incoming request with this
 * token, then talk to Supabase with the service_role key (see _lib/supabase.ts).
 */

import { unauthorized } from "./envelope";

/** Extract the bearer token from the Authorization header, or null. */
function bearerToken(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (!header) return null;
	const prefix = "Bearer ";
	if (!header.startsWith(prefix)) return null;
	return header.slice(prefix.length).trim();
}

/**
 * Wrap a handler with bearer-token auth. Returns the envelope Err:UNAUTHORIZED
 * when the token is missing or does not match API_TOKEN; otherwise defers to
 * `next`, which must return a Response.
 */
export function withAuth(
	next: (request: Request) => Promise<Response> | Response,
) {
	return async (request: Request): Promise<Response> => {
		const expected = process.env.API_TOKEN;
		// Fail closed: if API_TOKEN is unset, refuse every request.
		if (!expected) return unauthorized();
		const got = bearerToken(request);
		if (!got) return unauthorized();
		// Constant-time-ish comparison to avoid timing side channels (mirrors Go).
		if (!timingSafeEqual(got, expected)) return unauthorized();
		return next(request);
	};
}

/** Compare two strings without early-exit on length mismatch. */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
