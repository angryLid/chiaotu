/**
 * Browser-safe produce pipeline: rule-matched nodes → clash YAML config.
 *
 * Ported from the CLI's `utils/produce.ts` (the core asset kept when the CLI was
 * rebuilt as an SPA): load the base template, merge the nodes matched by each
 * rule into one select group named after the rule, add the service / country
 * groups on top, and dump the result as YAML. Unlike the CLI version it has no
 * Node dependencies — the base template is fetched from the static asset served
 * at `/templates/base.yaml` (see `public/templates/base.yaml`) and the nodes
 * come from the browser-side rule engine, not from disk.
 */

import yaml from "js-yaml";
import { flagRegExp } from "~/constants";
import {
	ClashProfileSchema,
	type ProxyGroup,
} from "~/persistence/clash-profile";
import type { NodeProxy } from "~/utils/nodes";
import { getFlagByNodeName } from "./string";

/** One rule source: the nodes matched by a rule, named after the rule. */
export interface HostsSource {
	name: string;
	entries: Array<{ domain: string; ip: string; enabled: boolean }>;
}

export interface RuleSource {
	/** Rule name — becomes the proxy-group name. */
	name: string;
	/** The nodes matched by this rule. */
	nodes: NodeProxy[];
}

/**
 * One rule set to wire into the config: a `rule-providers` entry pointing at the
 * set's public payload URL plus the `RULE-SET` line that references it.
 *
 * `policy` is symbolic because the literal group names depend on which projection
 * rules were selected for this very config. It is resolved here (see
 * resolvePolicy) so an unresolvable target fails generation loudly instead of
 * producing a config the client refuses to load — mihomo's config parser aborts
 * the whole file with "proxy [X] not found".
 */
export interface RuleSetSource {
	/** YAML key under `rule-providers`. */
	key: string;
	/** Public payload URL (unauthenticated; the slug is the capability). */
	url: string;
	policy: "DIRECT" | "REJECT" | "PROXY" | "NODE";
	/** Node name; only meaningful when policy is NODE. */
	policyNode: string | null;
	/** Display name, used in error messages. */
	name: string;
}

/**
 * The manual-select group. Always present in a generated config (it is created
 * unconditionally by createGroupsByCountry and is what the base template's
 * `MATCH` targets), which is why a rule set's PROXY policy can safely resolve to
 * it without checking anything else.
 */
const MANUAL_SELECT_GROUP = "🌐 手动选择";

/** Rule-set payload refresh interval (seconds), matching the base template's own providers. */
const RULE_PROVIDER_INTERVAL = 43200;

/**
 * Whether a node is one of the pseudo-entries machines put in their node list to
 * advertise quota / expiry ("剩余流量", "到期时间"). They are dropped from every
 * generated config.
 */
export function isExpiredNodeName(name: string): boolean {
	return name.includes("剩余") || name.includes("到期");
}

/**
 * The name a node carries inside a generated config: a flag emoji is prefixed
 * when the raw name has none. Exported so a UI that has to name a node (picking
 * a rule set's NODE target) offers exactly the strings the generator will emit.
 */
export function displayNodeName(name: string): string {
	return flagRegExp.test(name) ? name : `${getFlagByNodeName(name)} ${name}`;
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
 *    🍎 Apple) referencing the rule groups;
 * 5. declare each selected rule set under `rule-providers` and prepend its
 *    `RULE-SET` line to `rules` (see assembleRules for the ordering rationale);
 * 6. dump the assembled profile as YAML.
 */
export function buildProfile(
	baseTemplate: string,
	sources: RuleSource[],
	hostsSources: HostsSource[] = [],
	loopbackOverride: string | null = null,
	ruleSetSources: RuleSetSource[] = [],
): string {
	if (typeof baseTemplate !== "string" || baseTemplate.trim() === "") {
		throw new Error(
			"Missing base template: the fetched `/templates/base.yaml` content is empty.",
		);
	}
	const rawYaml: unknown = yaml.load(baseTemplate);
	if (typeof rawYaml !== "object" || rawYaml === null) {
		throw new Error(
			`Base template did not parse as a YAML object (got ${typeof rawYaml}). Check public/templates/base.yaml.`,
		);
	}
	const baseProfile = ClashProfileSchema.parse(rawYaml);

	const proxies: NodeProxy[] = [];
	const ruleGroups: ProxyGroup[] = [];
	const seenNames = new Set<string>();
	for (const source of sources) {
		// Copy the nodes before mutating names (the store's parse results are shared).
		const nodes = source.nodes
			.filter(({ name }) => !isExpiredNodeName(name))
			.map((node) => ({ ...node }));

		for (const proxy of nodes) {
			proxy.name = displayNodeName(proxy.name);
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
		...createGroupsByCountry(ruleGroups.map(({ name }) => name)),
	];

	const hosts = new Map<string, string>();
	for (const source of hostsSources) {
		for (const entry of source.entries) {
			if (!entry.enabled) continue;
			const ip = entry.ip || loopbackOverride || "127.0.0.1";
			hosts.set(entry.domain, ip);
		}
	}
	if (hosts.size > 0) {
		assembled.hosts = Object.fromEntries(hosts);
	}

	if (ruleSetSources.length > 0) {
		const baseProviders = baseProfile["rule-providers"];
		assembled["rule-providers"] = {
			...(typeof baseProviders === "object" && baseProviders !== null
				? (baseProviders as Record<string, unknown>)
				: {}),
			...buildRuleProviders(ruleSetSources),
		};
	}

	assembled.rules = assembleRules(
		baseProfile.rules ?? [],
		[...hosts.keys()],
		ruleSetSources,
		availableTargets(ruleGroups, proxies),
	);

	return yaml.dump(assembled, {
		flowLevel: 2,
		indent: 2,
		lineWidth: 80,
	});
}

/**
 * Every policy target the assembled config actually declares: the built-ins, the
 * per-rule groups, the service groups, and each individual node. A `RULE-SET`
 * pointing anywhere else makes the client reject the entire config, so this set
 * is what resolvePolicy validates against.
 */
function availableTargets(
	ruleGroups: ProxyGroup[],
	proxies: NodeProxy[],
): Set<string> {
	const ruleGroupNames = ruleGroups.map(({ name }) => name);
	return new Set<string>([
		"DIRECT",
		"REJECT",
		...ruleGroupNames,
		...createGroupsByCountry(ruleGroupNames).map(({ name }) => name),
		...proxies.map(({ name }) => name),
	]);
}

/** Resolve a rule set's symbolic policy to a target that exists in this config. */
function resolvePolicy(source: RuleSetSource, available: Set<string>): string {
	const target =
		source.policy === "PROXY"
			? MANUAL_SELECT_GROUP
			: source.policy === "NODE"
				? (source.policyNode ?? "")
				: source.policy;
	if (target === "" || !available.has(target)) {
		throw new Error(
			`Rule set "${source.name}" targets "${target === "" ? source.policy : target}", which does not exist in this configuration. Choose another target, or include the projection rule that provides that node.`,
		);
	}
	return target;
}

/** Declare each rule set as an http / classical / text rule-provider. */
function buildRuleProviders(sources: RuleSetSource[]): Record<string, unknown> {
	const providers: Record<string, unknown> = {};
	for (const source of sources) {
		providers[source.key] = {
			type: "http",
			behavior: "classical",
			format: "text",
			interval: RULE_PROVIDER_INTERVAL,
			url: source.url,
			path: `./chiaotu_ruleset/${source.key}.txt`,
		};
	}
	return providers;
}

/**
 * Assemble the final `rules` list.
 *
 * Order is the whole point: mihomo matches top-down, and the base template's
 * DIRECT block ends with `DOMAIN-SUFFIX,cn,DIRECT` / `GEOIP,CN,DIRECT`, so a user
 * rule placed after them would never be reached for a .cn domain. Hosts entries
 * come first (they are explicit IP overrides), then the rule sets in the order
 * the user arranged them, then the template's own rules.
 *
 * `no-resolve` is attached to every RULE-SET line because a `classical` set may
 * contain IP rules: without it, a domain request reaching that line triggers a
 * DNS resolution to test the IP, defeating the template's fake-ip setup. mihomo
 * ignores the parameter for domain-only sets, so it is safe unconditionally.
 */
function assembleRules(
	baseRules: string[],
	hostDomains: string[],
	ruleSetSources: RuleSetSource[],
	available: Set<string>,
): string[] {
	return [
		...hostDomains.map((domain) => `DOMAIN,${domain},DIRECT`),
		...ruleSetSources.map(
			(source) =>
				`RULE-SET,${source.key},${resolvePolicy(source, available)},no-resolve`,
		),
		...baseRules,
	];
}

function createGroupsByCountry(ruleGroupName: string[]): ProxyGroup[] {
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

	const baseProxies = [...ruleGroupName];

	// Special service groups
	const select = createSelectGroup(MANUAL_SELECT_GROUP, baseProxies);
	const ms = createSelectGroup("🟦 Microsoft", [
		"DIRECT",
		MANUAL_SELECT_GROUP,
		...baseProxies,
	]);
	const apple = createSelectGroup("🍎 Apple", [
		"DIRECT",
		MANUAL_SELECT_GROUP,
		...baseProxies,
	]);
	const google = createSelectGroup("🤖 AI", [
		MANUAL_SELECT_GROUP,
		...baseProxies.slice(),
	]);
	// Return groups in the preferred order
	return [select, google, ms, apple];
}
