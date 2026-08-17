/**
 * Route wrapper: app-level API_TOKEN bearer auth (mirrored from the Go backend,
 * internal/controller/middleware.go) composed with @supabase/server context
 * creation.
 *
 * Wire contract preserved exactly — HTTP always 200, business outcome only in
 * the envelope { status, result }:
 *   - missing / invalid API_TOKEN     -> Err:UNAUTHORIZED
 *   - Supabase env misconfiguration   -> Err:INTERNAL
 *   - any BizError thrown by a route  -> its own Err:<CODE>
 *
 * Auth model (see the supabase-server skill): the shared API_TOKEN is the
 * app's own auth boundary, so @supabase/server runs with auth: 'none' and the
 * token is verified here, inside the handler. ctx.supabaseAdmin is used for DB
 * access — it authenticates with SUPABASE_SECRET_KEY and bypasses RLS exactly
 * like the old hand-rolled PostgREST client ("ctx.supabaseAdmin is always
 * available regardless of auth mode").
 */

import { createSupabaseContext, type SupabaseContext } from "@supabase/server";
import type { Database } from "./database";
import { err, unauthorized } from "./envelope";

/** Handler receiving the request plus a fully-initialized Supabase context. */
export type ApiHandler = (
	request: Request,
	ctx: SupabaseContext<Database>,
) => Promise<Response> | Response;

/** The Supabase context type used by every route. */
export type ApiCtx = SupabaseContext<Database>;

/** Timeout for a Supabase request (ms). Prevents a stalled upstream from hanging the edge function. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Base64-encode a string as UTF-8 (browser-safe: `btoa` only covers Latin-1,
 * so UTF-8 bytes must be expanded to code points first). Mirrors the SPA's
 * `encodeToken` in `src/store/auth-store.ts` so both sides derive the same
 * canonical credential for a given shared secret.
 */
function encodeToken(secret: string): string {
	const bytes = new TextEncoder().encode(secret);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Expected bearer credential, computed once at module load from the raw
 * `API_TOKEN` env var (Base64-encoded exactly like the frontend stores it).
 * Empty when `API_TOKEN` is unset, which fails closed in `apiTokenFailure`.
 */
const EXPECTED_TOKEN = (() => {
	const raw = process.env.API_TOKEN;
	return raw ? encodeToken(raw) : "";
})();

/**
 * Wrap a handler with the API_TOKEN bearer check and a Supabase context.
 * Fail-closed: an unset API_TOKEN refuses every request (mirrors the Go server).
 */
export function withApi(handler: ApiHandler) {
	return async (request: Request): Promise<Response> => {
		const failure = apiTokenFailure(request);
		if (failure !== null) return failure;
		return withContext(request, handler);
	};
}

/**
 * Wrap a handler with a Supabase context only — no token check. For
 * intentionally public routes (e.g. the generated-config download, where the
 * name itself is the capability).
 */
export function withPublicCtx(handler: ApiHandler) {
	return (request: Request) => withContext(request, handler);
}

/** Create the context; render env misconfiguration as the envelope. */
async function withContext(
	request: Request,
	handler: ApiHandler,
): Promise<Response> {
	const { data: ctx, error } = await createSupabaseContext<Database>(request, {
		auth: "none",
		// Keep the old client's hard timeout: a stalled upstream must not hang
		// the edge function until the platform timeout.
		supabaseOptions: { global: { fetch: fetchWithTimeout } },
	});
	if (error) return err(new Error(error.message));
	try {
		return await handler(request, ctx);
	} catch (e) {
		return err(e);
	}
}

/** fetch with a hard timeout via AbortController so a stale request cannot hang. */
async function fetchWithTimeout(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

/** Err:UNAUTHORIZED when the bearer credential is missing or does not match the Base64-encoded API_TOKEN. */
function apiTokenFailure(request: Request): Response | null {
	const expected = EXPECTED_TOKEN;
	// Fail closed: if API_TOKEN is unset, refuse every request.
	if (!expected) return unauthorized();

	const header = request.headers.get("authorization");
	if (!header) return unauthorized();
	const prefix = "Bearer ";
	if (!header.startsWith(prefix)) return unauthorized();
	const got = header.slice(prefix.length).trim();
	if (got === "") return unauthorized();

	// Constant-time-ish comparison to avoid timing side channels (mirrors Go).
	if (got.length !== expected.length) return unauthorized();
	let diff = 0;
	for (let i = 0; i < got.length; i++) {
		diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
	}
	return diff === 0 ? null : unauthorized();
}
