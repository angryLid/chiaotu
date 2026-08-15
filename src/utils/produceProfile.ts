/**
 * Browser-safe produce pipeline: rule-matched nodes → clash YAML config.
 *
 * Ported from the CLI's `utils/produce.ts` (the core asset kept when the CLI was
 * rebuilt as an SPA): load the base template, merge the nodes matched by each
 * rule into one select group named after the rule, add the service / country
 * groups on top, and dump the result as YAML. Unlike the CLI version it has no
 * Node dependencies — the base template is imported at build time (Vite `?raw`)
 * and the nodes come from the browser-side rule engine, not from disk.
 */

import yaml from "js-yaml";
import { euRegExp, flagRegExp } from "~/constants";
import {
	ClashProfileSchema,
	type ProxyGroup,
} from "~/persistence/clash-profile";
import type { NodeProxy } from "~/utils/nodes";
import { getFlagByNodeName } from "./string";

/** One rule source: the nodes matched by a rule, named after the rule. */
export interface RuleSource {
	/** Rule name — becomes the proxy-group name. */
	name: string;
	/** The nodes matched by this rule. */
	nodes: NodeProxy[];
}

/**
 * Build a full clash YAML config from the base template and the matched nodes.
 *
 * Pipeline (mirrors `produce()` in the CLI):
 * 1. parse the base template (validates its shape; all extra keys are kept);
 * 2. per rule: drop expired nodes (name contains 剩余 / 到期), prefix a flag
 *    emoji when the node name has none;
 * 3. merge the surviving nodes into `proxies` (deduped by name — a node matched
 *    by several rules appears once), create one select group per rule named
 *    after the rule (rules left with no nodes are skipped);
 * 4. append the service / country groups (🌐 手动选择, 🤖 AI, 🟦 Microsoft,
 *    🍎 Apple, 🇪🇺 Europe) referencing the rule groups;
 * 5. dump the assembled profile as YAML.
 */
export function buildProfile(
	baseTemplate: string,
	sources: RuleSource[],
): string {
	const rawYaml: unknown = yaml.load(baseTemplate);
	const baseProfile = ClashProfileSchema.parse(rawYaml);

	const proxies: NodeProxy[] = [];
	const ruleGroups: ProxyGroup[] = [];
	const seenNames = new Set<string>();
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

		// A node matched by several rules must appear only once in the top-level
		// proxies list (clash requires unique proxy names); each rule group keeps
		// its own full membership.
		for (const proxy of nodes) {
			if (!seenNames.has(proxy.name)) {
				seenNames.add(proxy.name);
				proxies.push(proxy);
			}
		}

		if (nodes.length > 0) {
			ruleGroups.push({
				name: source.name,
				type: "select",
				proxies: nodes.map(({ name }) => name),
			});
		}
	}

	// Reassigning the existing keys keeps their position in the dumped YAML
	// (the template already declares `proxies` / `proxy-groups`).
	const assembled: Record<string, unknown> = { ...baseProfile };
	assembled.proxies = proxies;
	assembled["proxy-groups"] = [
		...ruleGroups,
		...createGroupsByCountry(
			proxies,
			ruleGroups.map(({ name }) => name),
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
	ruleGroupName: string[],
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

	const baseProxies = ["🇪🇺 Europe", ...ruleGroupName];

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
	eu.proxies.sort();
	return [select, google, ms, apple, eu];
}
