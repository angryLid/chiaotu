import minimist from "minimist";
import {
	addSubscription,
	commandAdd,
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
		case "a":
		case "add": {
			commandAdd(argv._[1]);
			break;
		}

		case "g":
		case "generate": {
			commandGenerate(true);
			break;
		}

		case "s":
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
