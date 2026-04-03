import minimist from "minimist";
import { commandAdd } from "./commands/add";
import { commandGenerate } from "./commands/generate";
import { addSubscription, list } from "./commands/subscribe";
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
			const skipDownload = argv["s"] || argv["skip-download"];
			commandGenerate(true);
			break;
		}

		case "s":
		case "subscribe": {
			if (argv["l"] || argv["list"]) {
				list();
			} else {
				await addSubscription(argv._[1]);
			}
			break;
		}
	}
});
