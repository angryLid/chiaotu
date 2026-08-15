/**
 * Unified error type for the friend-cats frontend.
 *
 * Errors cross module seams as a stable **code plus structured params**, never as
 * a final sentence: the UI resolves the code to localised copy via `~/i18n`
 * (`errorMessage`), so a Chinese UI never renders an English sentence and vice
 * versa. The backend's raw English description is kept as a last-resort fallback
 * for codes the frontend does not know about.
 *
 * - `code` is a backend business code (the CODE in "Err:<CODE>") or a client-side
 *   code (transport / response / parse / build) for errors we raise ourselves;
 * - `message` carries the backend's raw description for business errors (debug
 *   detail / fallback), and is empty for client-side codes;
 * - `params` are structured interpolation values for the translated copy.
 */

/** Business or client-side error code; unknown backend codes fall back to any string. */
export type ApiErrorCode =
	| "INVALID_ARGUMENT"
	| "NOT_FOUND"
	| "FETCH_FAILED"
	| "LIMIT_EXCEEDED"
	| "METHOD_NOT_ALLOWED"
	| "INTERNAL"
	| "TRANSPORT_FAILED"
	| "INVALID_RESPONSE"
	| "SUBSCRIPTIONS_MISSING"
	| "INVALID_YAML"
	| "PARSE_FAILED"
	| (string & {});

export class ApiError extends Error {
	readonly code: ApiErrorCode | null;
	readonly params: Record<string, unknown> | undefined;

	constructor(
		message: string,
		code: ApiErrorCode | null = null,
		params?: Record<string, unknown>,
	) {
		super(message);
		this.name = "ApiError";
		this.code = code;
		this.params = params;

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, ApiError);
		}
	}
}
