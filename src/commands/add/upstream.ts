import { store } from "~/persistence/store";

export function addUpstream(url: string) {
	store.set((conf) => {
		conf.upstreams.push(url);
	});
}
