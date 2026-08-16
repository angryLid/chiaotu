import yaml from "js-yaml";
import { flagRegExp } from "~/constants";
import { address } from "~/persistence/address";
import {
	type ClashProfile,
	ClashProfileSchema,
	ClashProfileSegmentSchema,
	type ProxyGroup,
} from "~/persistence/clash-profile";
import { readFile } from "~/persistence/file-utils";
import { store } from "~/persistence/store";
import { getFlagByNodeName } from "./string";

export async function produce() {
	const baseTmpl = await readFile(address.template);
	const rawYaml = yaml.load(baseTmpl);
	const baseProfile = ClashProfileSchema.parse(rawYaml);

	const proxies: ClashProfile["proxies"] = [];
	const groupsByVendors: ClashProfile["proxy-groups"] = [];
	for (const fileContent of store.state.configuration.subscriptions) {
		const rawProfile = yaml.load(fileContent.content);
		const profile = ClashProfileSegmentSchema.parse(rawProfile);

		const filteredProxies =
			profile.proxies?.filter(
				({ name }) => !name.includes("剩余") && !name.includes("到期"),
			) || [];

		for (const p of filteredProxies) {
			if (!flagRegExp.test(p.name)) {
				p.name = `${getFlagByNodeName(p.name)} ${p.name}`;
			}
		}

		proxies.push(...filteredProxies);
		groupsByVendors.push({
			name: `✈️${fileContent.name}`,
			type: "select",
			proxies: filteredProxies.map(({ name }) => name),
		});
	}

	baseProfile.proxies = proxies;
	baseProfile["proxy-groups"] = [
		...groupsByVendors,
		...createGroupsByCountry(
			groupsByVendors.map(({ name }) => name),
		),
	];

	const dump = yaml.dump(baseProfile, {
		flowLevel: 2,
		indent: 2,
		lineWidth: 80,
	});

	return dump;
}

function createGroupsByCountry(
	proxyGroupName: Array<string>,
): ProxyGroup[] {
	function createSelectGroup(name: string, proxies: string[]): ProxyGroup {
		return {
			name,
			type: "select",
			proxies,
			timeout: undefined,
			interval: undefined,
			url: undefined,
		};
	}

	const baseProxies = [...proxyGroupName];

	// Special service groups
	const select = createSelectGroup("🌐 手动选择", baseProxies);
	const ms = createSelectGroup("🟦 Microsoft", [
		"DIRECT",
		"🌐 手动选择",
		...baseProxies,
	]);
	const apple = createSelectGroup("🍎 Apple", [
		"DIRECT",
		"🌐 手动选择",
		...baseProxies,
	]);
	const google = createSelectGroup("🤖 AI", [
		"🌐 手动选择",
		...baseProxies.slice(),
	]);
	// Return groups in the preferred order
	return [select, google, ms, apple];
}
