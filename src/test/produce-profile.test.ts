/**
 * buildProfile tests focused on how rule sets enter the generated config:
 * the `rule-providers` declarations, the `RULE-SET` line ordering, and the
 * policy resolution that guards against a config a client would refuse to load.
 *
 * The base template used here is a trimmed stand-in for public/templates/base.yaml
 * that keeps the parts the ordering depends on (the DIRECT block that ends with
 * `DOMAIN-SUFFIX,cn,DIRECT`, and a pre-existing rule-provider).
 */

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import yaml from "js-yaml";
import type { ProxyGroup } from "~/persistence/clash-profile";
import {
	buildProfile,
	type RuleSetSource,
	type RuleSource,
} from "~/utils/produceProfile";

const BASE_TEMPLATE = `
mixed-port: 7890
proxies: []
proxy-groups: []
rules:
  - RULE-SET,lan_ip,DIRECT
  - DOMAIN-SUFFIX,cn,DIRECT
  - GEOIP,CN,DIRECT,no-resolve
  - MATCH,🌐 手动选择
rule-providers:
  lan_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/lan.txt
`;

const RULES: RuleSource[] = [
	{
		name: "vendor-a",
		nodes: [
			{ name: "🇭🇰 HK-1", type: "ss" },
			{ name: "🇺🇸 US-1", type: "vless" },
		],
	},
];

function ruleSet(overrides: Partial<RuleSetSource> = {}): RuleSetSource {
	return {
		key: "chiaotu_rs_1",
		url: "https://example.com/api/rulesets/payload/abc123",
		policy: "GROUP",
		name: "work",
		...overrides,
	};
}

function build(
	ruleSets: RuleSetSource[],
	hosts: Parameters<typeof buildProfile>[2] = [],
	extraRules: RuleSource[] = [],
): Record<string, unknown> {
	const dumped = buildProfile(
		BASE_TEMPLATE,
		[...RULES, ...extraRules],
		hosts,
		null,
		ruleSets,
	);
	return yaml.load(dumped) as Record<string, unknown>;
}

describe("buildProfile / rule-providers", () => {
	test("declares the set as an http classical text provider", () => {
		const providers = build([ruleSet()])["rule-providers"] as Record<
			string,
			Record<string, unknown>
		>;
		assert.deepEqual(providers.chiaotu_rs_1, {
			type: "http",
			behavior: "classical",
			format: "text",
			interval: 43200,
			url: "https://example.com/api/rulesets/payload/abc123",
			path: "./chiaotu_ruleset/chiaotu_rs_1.txt",
		});
	});

	test("keeps the base template's own providers", () => {
		const providers = build([ruleSet()])["rule-providers"] as Record<
			string,
			unknown
		>;
		// Dropping lan_ip would break `RULE-SET,lan_ip,DIRECT`, which the base
		// template's own rules reference.
		assert.equal(Object.keys(providers).includes("lan_ip"), true);
	});

	test("omits the rule-providers rewrite when nothing is selected", () => {
		const config = build([]);
		const providers = config["rule-providers"] as Record<string, unknown>;
		assert.deepEqual(Object.keys(providers), ["lan_ip"]);
	});
});

describe("buildProfile / rule ordering", () => {
	test("puts RULE-SET lines before the template's DIRECT block", () => {
		const rules = build([ruleSet()]).rules as string[];
		const ruleSetIndex = rules.indexOf(
			"RULE-SET,chiaotu_rs_1,📦 work,no-resolve",
		);
		const cnIndex = rules.indexOf("DOMAIN-SUFFIX,cn,DIRECT");
		// mihomo matches top-down: after DOMAIN-SUFFIX,cn a .cn domain would never
		// reach a user rule set.
		assert.equal(ruleSetIndex >= 0, true);
		assert.equal(ruleSetIndex < cnIndex, true);
	});

	test("hosts overrides come before rule sets, both before the base rules", () => {
		const rules = build(
			[ruleSet()],
			[
				{
					name: "lan",
					entries: [{ domain: "router.local", ip: "10.0.0.1", enabled: true }],
				},
			],
		).rules as string[];
		assert.deepEqual(rules.slice(0, 3), [
			"DOMAIN,router.local,DIRECT",
			"RULE-SET,chiaotu_rs_1,📦 work,no-resolve",
			"RULE-SET,lan_ip,DIRECT",
		]);
	});

	test("preserves the user's rule-set order", () => {
		const rules = build([
			ruleSet({ key: "chiaotu_rs_2", name: "second" }),
			ruleSet({ key: "chiaotu_rs_1", name: "first", policy: "DIRECT" }),
		]).rules as string[];
		assert.deepEqual(rules.slice(0, 2), [
			"RULE-SET,chiaotu_rs_2,📦 second,no-resolve",
			"RULE-SET,chiaotu_rs_1,DIRECT,no-resolve",
		]);
	});

	test("leaves the base rules untouched when no rule set is selected", () => {
		const rules = build([]).rules as string[];
		assert.deepEqual(rules, [
			"RULE-SET,lan_ip,DIRECT",
			"DOMAIN-SUFFIX,cn,DIRECT",
			"GEOIP,CN,DIRECT,no-resolve",
			"MATCH,🌐 手动选择",
		]);
	});

	test("always attaches no-resolve", () => {
		// A classical set may carry IP rules; without no-resolve a domain request
		// reaching the line triggers a DNS lookup and defeats fake-ip.
		const rules = build([ruleSet({ policy: "REJECT" })]).rules as string[];
		assert.equal(rules[0], "RULE-SET,chiaotu_rs_1,REJECT,no-resolve");
	});
});

describe("buildProfile / policy resolution", () => {
	test("DIRECT / REJECT pass through as built-ins", () => {
		assert.equal(
			(build([ruleSet({ policy: "DIRECT" })]).rules as string[])[0],
			"RULE-SET,chiaotu_rs_1,DIRECT,no-resolve",
		);
		assert.equal(
			(build([ruleSet({ policy: "REJECT" })]).rules as string[])[0],
			"RULE-SET,chiaotu_rs_1,REJECT,no-resolve",
		);
	});

	test("GROUP points the RULE-SET line at the set's own group", () => {
		const rules = build([ruleSet({ policy: "GROUP" })]).rules as string[];
		assert.equal(rules[0], "RULE-SET,chiaotu_rs_1,📦 work,no-resolve");
	});

	test("GROUP declares a select group of DIRECT, manual-select and every node", () => {
		const groups = build([ruleSet({ policy: "GROUP" })])[
			"proxy-groups"
		] as ProxyGroup[];
		const group = groups.find(({ name }) => name === "📦 work");
		assert.deepEqual(group, {
			name: "📦 work",
			type: "select",
			// DIRECT leads so an untouched group behaves as if the set were absent;
			// 🌐 手动选择 and the nodes cover the old PROXY / NODE policies.
			proxies: ["DIRECT", "🌐 手动选择", "🇭🇰 HK-1", "🇺🇸 US-1"],
		});
	});

	test("declares one group per GROUP set and none for DIRECT / REJECT", () => {
		const groups = build([
			ruleSet({ key: "chiaotu_rs_1", name: "work" }),
			ruleSet({ key: "chiaotu_rs_2", name: "ads", policy: "REJECT" }),
			ruleSet({ key: "chiaotu_rs_3", name: "intranet" }),
		])["proxy-groups"] as ProxyGroup[];
		const ruleSetGroups = groups
			.map(({ name }) => name)
			.filter((name) => name.startsWith("📦 "));
		assert.deepEqual(ruleSetGroups, ["📦 work", "📦 intranet"]);
	});

	test("fails generation when the group name collides with a projection rule", () => {
		// mihomo rejects the whole file when two policies share a name, so a loud
		// failure here beats a config the client refuses to load.
		assert.throws(
			() =>
				build(
					[ruleSet({ policy: "GROUP", name: "vendor-a" })],
					[],
					[{ name: "📦 vendor-a", nodes: [{ name: "🇯🇵 JP-1", type: "ss" }] }],
				),
			/declared twice in this configuration/,
		);
	});

	test("fails generation when two rule sets resolve to the same group", () => {
		assert.throws(
			() =>
				build([
					ruleSet({ key: "chiaotu_rs_1", name: "work" }),
					ruleSet({ key: "chiaotu_rs_2", name: "work" }),
				]),
			/declared twice in this configuration/,
		);
	});
});
