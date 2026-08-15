/**
 * Request body helpers, mirrored from the Go backend (internal/controller/helpers.go).
 * The Go backend used DisallowUnknownFields + a size cap; here we read the body,
 * cap its size, strict-JSON-parse it, and reject unknown fields.
 */

import { InvalidArgument } from "./errors";

/** Read and strict-parse the JSON request body, capped at `limit` bytes. */
export async function readJson(
	request: Request,
	limit: number,
): Promise<Record<string, unknown>> {
	const text = await request.text();
	if (text.length > limit) {
		throw InvalidArgument(
			`request body exceeds the size limit of ${limit} bytes`,
		);
	}
	if (text === "") {
		throw InvalidArgument("request body is not valid JSON: empty body");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		throw InvalidArgument(`request body is not valid JSON: ${String(e)}`);
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw InvalidArgument("request body is not valid JSON: expected an object");
	}
	return parsed as Record<string, unknown>;
}

/** Extract the numeric id from a pathname like /api/subscriptions/123. Returns null if absent/invalid. */
export function idFromPath(pathname: string, prefix: string): number | null {
	if (!pathname.startsWith(prefix)) return null;
	const rest = pathname.slice(prefix.length).replace(/^\/+|\/+$/g, "");
	if (rest === "" || !/^\d+$/.test(rest)) return null;
	return Number(rest);
}
