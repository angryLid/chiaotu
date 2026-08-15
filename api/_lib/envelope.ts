/**
 * Unified response envelope, mirrored from the Go backend (internal/view/view.go).
 * Every response is HTTP 200 with body { status, result }; business success or
 * failure is read only from the envelope. This preserves the frontend contract
 * exactly, so chiaotu/src/api does not need to change.
 */

import { BizError } from "./errors";

/** Envelope status strings (API contract, see friend-cats openapi.yaml). */
export const STATUS = {
	OK: "Ok",
	INVALID_ARGUMENT: "Err:INVALID_ARGUMENT",
	NOT_FOUND: "Err:NOT_FOUND",
	FETCH_FAILED: "Err:FETCH_FAILED",
	LIMIT_EXCEEDED: "Err:LIMIT_EXCEEDED",
	METHOD_NOT_ALLOWED: "Err:METHOD_NOT_ALLOWED",
	UNAUTHORIZED: "Err:UNAUTHORIZED",
	// INTERNAL is not exported as a constant because it is produced by defaultErr
} as const;

/** Render a JSON envelope with HTTP 200 (mirrors view.writeEnvelope). */
function writeEnvelope(status: string, result: unknown): Response {
	return new Response(JSON.stringify({ status, result }), {
		status: 200,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

/** Render business success. */
export function ok(result: unknown): Response {
	return writeEnvelope(STATUS.OK, result);
}

/** Render business failure: map a BizError to its envelope status/result. */
export function err(e: unknown): Response {
	const be =
		e instanceof BizError
			? e
			: new BizError("INTERNAL", "internal server error");
	return writeEnvelope(`Err:${be.code}`, be.message);
}

/** Render "method not allowed". */
export function methodNotAllowed(): Response {
	return writeEnvelope(STATUS.METHOD_NOT_ALLOWED, "method not allowed");
}

/** Render "authentication failed" (missing/invalid bearer token); HTTP stays 200. */
export function unauthorized(): Response {
	return writeEnvelope(STATUS.UNAUTHORIZED, "authentication required");
}

/** Render "endpoint not found" (route fallback). */
export function notFound(): Response {
	return writeEnvelope(STATUS.NOT_FOUND, "endpoint not found");
}
