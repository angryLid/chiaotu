/**
 * Business error codes for the friend-cats API, mirrored from the Go backend
 * (internal/model/error.go). The envelope layer renders a BizError as
 * { status: "Err:<CODE>", result: <msg> }.
 */

export type ErrorCode =
	| "INVALID_ARGUMENT"
	| "NOT_FOUND"
	| "FETCH_FAILED"
	| "LIMIT_EXCEEDED"
	| "INTERNAL";

/** A typed business error carrying a code + user-facing description. */
export class BizError extends Error {
	readonly code: ErrorCode;
	constructor(code: ErrorCode, msg: string) {
		super(`${code}: ${msg}`);
		this.code = code;
	}
}

export const InvalidArgument = (msg: string) =>
	new BizError("INVALID_ARGUMENT", msg);
export const NotFound = (msg: string) => new BizError("NOT_FOUND", msg);
export const FetchFailed = (msg: string) => new BizError("FETCH_FAILED", msg);
export const LimitExceeded = (msg: string) =>
	new BizError("LIMIT_EXCEEDED", msg);
export const InternalError = (msg: string) => new BizError("INTERNAL", msg);
