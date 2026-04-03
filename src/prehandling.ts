import type { ClashProfile } from "./persistence/clash-profile";

const prehandling = [
	(profile: ClashProfile) => {
		if (profile.properties?.name !== "魔戒.net") {
			return;
		}
		// Only Kee
		const filteredEndpoints = profile.proxies.filter((p) => {
			return /台湾|香港||||/.test(p.name);
		});
	},
];
