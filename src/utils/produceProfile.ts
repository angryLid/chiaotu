/**
 * Browser-safe produce pipeline: matched subscription nodes → clash YAML config.
 *
 * Ported from the CLI's `utils/produce.ts` (the core asset kept when the CLI was
 * rebuilt as an SPA): load the base template, merge the nodes of each upstream,
 * group them into vendor groups (✈️<name>) plus service / country groups, and
 * dump the result as YAML. Unlike the CLI version it has no Node dependencies —
 * the base template is imported at build time (Vite `?raw`) and the nodes come
 * from the browser-side rule engine, not from disk.
 */

import yaml from "js-yaml";
import { euRegExp, flagRegExp } from "~/constants";
import {
	ClashProfileSchema,
	type ProxyGroup,
} from "~/persistence/clash-profile";
import type { NodeProxy } from "~/utils/nodes";
import { getFlagByNodeName } from "./string";

/** One vendor source: the nodes matched by a rule, grouped by their subscription. */
export interface VendorSource {
	/** Subscription display name (becomes the ✈️<name> vendor group). */
	name: string;
	/** The matched nodes of this subscription. */
	nodes: NodeProxy[];
}

/**
 * Build a full clash YAML config from the base template and the matched nodes.
 *
 * Pipeline (mirrors `produce()` in the CLI):
 * 1. parse the base template (validates its shape; all extra keys are kept);
 * 2. per vendor: drop expired nodes (name contains 剩余 / 到期), prefix a flag
 *    emoji when the node name has none;
 * 3. merge the remaining nodes into `proxies`, create one ✈️<vendor> select
 *    group per subscription;
 * 4. append the service / country groups (🌐 手动选择, 🤖 AI, 🟦 Microsoft,
 *    🍎 Apple, 🇪🇺 Europe);
 * 5. dump the assembled profile as YAML.
 */
export function buildProfile(baseTemplate: string, sources: VendorSource[]): string {
	const rawYaml: unknown = yaml.load(baseTemplate);
	const baseProfile = ClashProfileSchema.parse(rawYaml);

	const proxies: NodeProxy[] = [];
	const groupsByVendors: ProxyGroup[] = [];
	for (const source of sources) {
		// Copy the nodes before mutating names (the store's parse results are shared).
		const nodes = source.nodes
			.filter(({ name }) => !name.includes("剩余") && !name.includes("到期"))
			.map((node) => ({ ...node }));

		for (const proxy of nodes) {
			if (!flagRegExp.test(proxy.name)) {
				proxy.name = `${getFlagByNodeName(proxy.name)} ${proxy.name}`;
			}
		}

		proxies.push(...nodes);
		groupsByVendors.push({
			name: `✈️${source.name}`,
			type: "select",
			proxies: nodes.map(({ name }) => name),
		});
	}

	// Reassigning the existing keys keeps their position in the dumped YAML
	// (the template already declares `proxies` / `proxy-groups`).
	const assembled: Record<string, unknown> = { ...baseProfile };
	assembled.proxies = proxies;
	assembled["proxy-groups"] = [
		...groupsByVendors,
		...createGroupsByCountry(
			proxies,
			groupsByVendors.map(({ name }) => name),
		),
	];

	return yaml.dump(assembled, {
		flowLevel: 2,
		indent: 2,
		lineWidth: 80,
	});
}

function createGroupsByCountry(
	proxies: NodeProxy[],
	proxyGroupName: string[],
): ProxyGroup[] {
	function createUrlTestGroup(name: string): ProxyGroup {
		return {
			name,
			type: "select",
			proxies: [],
			timeout: undefined,
			interval: 3600, // 60 * 60 seconds
			url: "https://www.gstatic.com/generate_204",
		};
	}

	function createSelectGroup(name: string, members: string[]): ProxyGroup {
		return {
			name,
			type: "select",
			proxies: members,
			timeout: undefined,
			interval: undefined,
			url: undefined,
		};
	}

	const eu = createUrlTestGroup("🇪🇺 Europe");

	for (const proxy of proxies) {
		if (euRegExp.test(proxy.name)) {
			eu.proxies.push(proxy.name);
		}
	}

	const baseProxies = ["🇪🇺 Europe", ...proxyGroupName];

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
	const google = createSelectGroup("🤖 AI", ["🌐 手动选择", ...baseProxies.slice()]);
	// Return groups in the preferred order
	eu.proxies.sort();
	return [select, google, ms, apple, eu];
}
