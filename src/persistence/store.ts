import { address } from "./address";
import type { Configuration } from "./configuration.types";
import { writeFile } from "./file-utils";

const configuration: Configuration = {
	upstreams: [],
};
export const store = {
	set(set: (conf: Configuration) => void) {
		set(configuration);
	},

	dump() {
		writeFile(address.configuration, JSON.stringify(configuration));
	},
};
