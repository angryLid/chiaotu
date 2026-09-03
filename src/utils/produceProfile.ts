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
 * rules were selected for this very config, so it is resolved here (see
 * resolvePolicy). DIRECT / REJECT are mihomo built-ins; GROUP gets the rule set
 * its own select group, declared alongside the projection and service groups.
 */
export interface RuleSetSource {
	/** YAML key under `rule-providers`. */
	key: string;
	/** Public payload URL (unauthenticated; the slug is the capability). */
	url: string;
	policy: "DIRECT" | "REJECT" | "GROUP";
	/** Display name; also the basis of the GROUP policy's group name. */
	name: string;
}

/**
 * The manual-select group. Always present in a generated config (it is created
 * unconditionally by createGroupsByCountry and is what the base template's
 * `MATCH` targets), which is why every GROUP rule set can safely offer it as a
 * member without checking anything else.
 */
const MANUAL_SELECT_GROUP = "🌐 手动选择";

/**
 * Prefix of a GROUP rule set's own select group. It keeps the group visually
 * distinct in the client's group list and out of collision range of the
 * projection groups (named after the rules) and the service groups.
 */
const RULE_SET_GROUP_PREFIX = "📦 ";

/**
 * The proxy-group name a GROUP rule set resolves to. Exported so the UI can show
 * the exact name the client will display instead of hard-coding the prefix again.
 */
export function ruleSetGroupName(name: string): string {
	return `${RULE_SET_GROUP_PREFIX}${name}`;
}

/** Rule-set payload refresh interval (seconds), matching the base template's own providers. */
const RULE_PROVIDER_INTERVAL = 43200;

/**
 * Whether a node is one of the pseudo-entries machines put in their node list to
 * advertise quota / expiry ("剩余流量", "到期时间"). They are dropped from every
 * generated config.
 */
function isExpiredNodeName(name: string): boolean {
	return name.includes("剩余") || name.includes("到期");
}

/**
 * The name a node carries inside a generated config: a flag emoji is prefixed
 * when the raw name has none.
 */
function displayNodeName(name: string): string {
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
 * 5. declare each selected rule set under `rule-providers`, give every GROUP rule
 *    set its own select group, and prepend its `RULE-SET` line to `rules` (see
 *    assembleRules for the ordering rationale);
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
	const serviceGroups = createGroupsByCountry(
		ruleGroups.map(({ name }) => name),
	);
	const ruleSetGroups = createRuleSetGroups(ruleSetSources, proxies);
	const allGroups = [...ruleGroups, ...serviceGroups, ...ruleSetGroups];
	assertUniqueNames(allGroups, proxies);
	assembled["proxy-groups"] = allGroups;

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
	);

	return yaml.dump(assembled, {
		flowLevel: 2,
		indent: 2,
		lineWidth: 80,
	});
}

/**
 * One select group per GROUP rule set, so its `RULE-SET` line has a target that
 * is declared by construction (DIRECT / REJECT need no declaration at all). The
 * membership is what makes one policy cover the old PROXY and NODE ones: the user
 * picks the behaviour in the client instead of at creation time.
 */
function createRuleSetGroups(
	sources: RuleSetSource[],
	proxies: NodeProxy[],
): ProxyGroup[] {
	return sources
		.filter((source) => source.policy === "GROUP")
		.map((source) => ({
			name: ruleSetGroupName(source.name),
			type: "select",
			// DIRECT leads, so a client that never touches the group behaves as if the
			// rule set were not there; the manual-select group reproduces the old PROXY
			// policy, and the individual nodes reproduce pinning one node by hand.
			proxies: [
				"DIRECT",
				MANUAL_SELECT_GROUP,
				...proxies.map(({ name }) => name),
			],
		}));
}

/**
 * Fail on a name the config declares twice. mihomo rejects the whole file when a
 * proxy group shares its name with a node or another group, so a rule set whose
 * group name collides with a projection rule (or with a node literally named
 * "📦 …") has to stop generation here instead of shipping a config the client
 * refuses to load.
 */
function assertUniqueNames(groups: ProxyGroup[], proxies: NodeProxy[]): void {
	// The proxies list is already deduplicated by name while it is built.
	const seen = new Set<string>(proxies.map(({ name }) => name));
	for (const { name } of groups) {
		if (seen.has(name)) {
			throw new Error(
				`"${name}" is declared twice in this configuration: a proxy group cannot share its name with a node or with another group. Rename the projection rule or the rule set that produced it.`,
			);
		}
		seen.add(name);
	}
}

/** Resolve a rule set's symbolic policy to the target this config declares for it. */
function resolvePolicy(source: RuleSetSource): string {
	return source.policy === "GROUP"
		? ruleSetGroupName(source.name)
		: source.policy;
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
): string[] {
	return [
		...hostDomains.map((domain) => `DOMAIN,${domain},DIRECT`),
		...ruleSetSources.map(
			(source) => `RULE-SET,${source.key},${resolvePolicy(source)},no-resolve`,
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
