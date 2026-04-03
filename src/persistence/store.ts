import { address } from "./address";
import { type Configuration, validateConfiguration } from "./configuration";
import { readFile, writeFile } from "./file-utils";

let configuration: Configuration = {
	upstreams: [],
	subscriptions: [],
};

export const store = {
	get state() {
		return { configuration };
	},

	set(set: (conf: Configuration) => void) {
		set(configuration);
	},

	async load() {
		const content = await readFile(address.configuration);

		configuration = validateConfiguration(JSON.parse(content));
	},

	dump() {
		writeFile(address.configuration, JSON.stringify(configuration));
	},

	async guard(main: () => Promise<void>) {
		try {
			await this.load();
			await main();
		} catch (err) {
			console.error(err);
		} finally {
			this.dump();
		}
	},
};
