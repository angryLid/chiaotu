export class UserOperationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UserOperationError";

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, UserOperationError);
		}
	}
}
