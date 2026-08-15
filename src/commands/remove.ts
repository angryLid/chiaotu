import { UserOperationError } from "~/errors/user-operation-error";
import { store } from "~/persistence/store";

export function commandRemove(name: string) {
	if (!name) {
		throw new UserOperationError(
			"Please provide a subscription name to remove",
		);
	}

	let removed = false;
	store.set((conf) => {
		const index = conf.subscriptions.findIndex((s) => s.name === name);
		if (index !== -1) {
			conf.subscriptions.splice(index, 1);
			removed = true;
		}
	});

	if (removed) {
		console.log(`Removed subscription: ${name}`);
	} else {
		console.warn(`No subscription found with name: ${name}`);
	}
}
