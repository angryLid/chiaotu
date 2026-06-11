import minimist from "minimist";
import {
	addSubscription,
	commandGenerate,
	commandRemove,
	list,
	serve,
} from "./commands";

import { store } from "./persistence/store";

store.guard(async () => {
	const argv = minimist(process.argv.slice(2));

	const subCommand = argv._[0];

	switch (subCommand) {
		case "g":
		case "gen":
		case "generate": {
			commandGenerate(true);
			break;
		}

		case "a":
		case "s":
		case "add":
		case "sub":
		case "subscribe": {
			await addSubscription(argv._[1]);
			break;
		}
		case "serve": {
			serve();
			break;
		}
		case "list":
		case "ls": {
			list();
			break;
		}
		case "rm":
		case "remove": {
			commandRemove(argv._[1]);
			break;
		}
	}
});
