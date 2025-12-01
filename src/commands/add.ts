import { UserOperationError } from "~/errors/user-operation-error";
import { addPreset } from "./add/preset";
import { addUpstream } from "./add/upstream";

export function commandAdd(arg?: string) {
	if (!arg) {
		throw new UserOperationError(
			"A URL of a file path is needed for the command!",
		);
	}

	if (arg.startsWith("https://")) {
		return addUpstream(arg);
	} else {
		return addPreset(arg);
	}
}
