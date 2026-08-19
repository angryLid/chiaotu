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
function writeEnvelope(body: {
	status: string;
	result: unknown;
	stack?: string;
}): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

/** Render business success. */
export function ok(result: unknown): Response {
	return writeEnvelope({ status: STATUS.OK, result });
}

/**
 * Render business failure: map a BizError to its envelope status/result.
 * When the error carried a stack (always true for Errors) or a preserved
 * network cause, its call stack is appended as an optional `stack` field to
 * help debug from the browser. Mirrors view.writeEnvelope for the core fields.
 */
export function err(e: unknown): Response {
	const be =
		e instanceof BizError
			? e
			: new BizError("INTERNAL", "internal server error", toError(e));
	return writeEnvelope({ status: `Err:${be.code}`, result: be.message, stack: errorStack(be) });
}

/** Render "method not allowed". */
export function methodNotAllowed(): Response {
	return writeEnvelope({ status: STATUS.METHOD_NOT_ALLOWED, result: "method not allowed" });
}

/** Render "authentication failed" (missing/invalid bearer token); HTTP stays 200. */
export function unauthorized(): Response {
	return writeEnvelope({ status: STATUS.UNAUTHORIZED, result: "authentication required" });
}

/** Render "endpoint not found" (route fallback). */
export function notFound(): Response {
	return writeEnvelope({ status: STATUS.NOT_FOUND, result: "endpoint not found" });
}

/** Narrow a thrown value to an Error, or undefined. */
function toError(e: unknown): Error | undefined {
	return e instanceof Error ? e : undefined;
}

/**
 * Build a diagnostic stack string: the preserved network cause's stack plus
 * the BizError's own stack. Returns undefined when neither is available.
 */
function errorStack(be: BizError): string | undefined {
	const parts: string[] = [];
	if (be.cause?.stack) {
		parts.push(`[cause: ${be.cause.name}] ${be.cause.message}\n${be.cause.stack}`);
	}
	if (be.stack) parts.push(be.stack);
	return parts.length > 0 ? parts.join("\n\nCaused by:\n") : undefined;
}
