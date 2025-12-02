import minimist from "minimist";
import { commandAdd } from "./commands/add";
import { store } from "./persistence/store";

store.guard(() => {
	const argv = minimist(process.argv.slice(2));

	const subCommand = argv._[0];

	switch (subCommand) {
		case "a":
		case "add": {
			commandAdd(argv._[1]);
		}
	}
});
