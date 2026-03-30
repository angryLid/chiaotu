import type { ClashProfile } from "./persistence/clash-profile";

const prehandling = {
	黑暗森林云: (profile: ClashProfile) => {
		// Only Keep
		const filteredEndpoints = profile.proxies.filter((p) => {
			return /台湾|香港||||/.test(p.name);
		});
	},
};
