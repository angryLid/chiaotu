/**
 * Rule-set contract tests: payload normalization, paste parsing, and the
 * frontend/backend mirror.
 *
 * Two things are pinned here:
 * 1. normalization behaviour, because a payload that renders as an invalid line
 *    makes a mihomo client reject the config it is referenced from;
 * 2. that src/persistence/rule-sets.ts and api/_lib/rule-sets.ts agree — they are
 *    duplicated on purpose (separate tsconfig projects, no shared alias), so
 *    drift between them would silently desync the import preview from what the
 *    server stores.
 *
 * Run with: node --test --import ./src/test/register.mjs "src/**\/*.test.ts"
 */

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
	normalizePayload,
	parseRuleSetInput,
	RULE_SET_TYPES,
	type RuleSetType,
} from "~/persistence/rule-sets";
import {
	normalizePayload as apiNormalizePayload,
	payloadETag,
	renderPayload,
	resolveImport,
	resolveRuleSet,
	ruleSetKey,
} from "../../api/_lib/rule-sets";

describe("normalizePayload", () => {
	test("lower-cases domains and strips the trailing dot", () => {
		assert.equal(normalizePayload("DOMAIN", "Example.COM."), "example.com");
		assert.equal(
			normalizePayload("DOMAIN-SUFFIX", "  Sub.Example.com  "),
			"sub.example.com",
		);
	});

	test("rejects a bare IP where a domain is required", () => {
		assert.equal(normalizePayload("DOMAIN", "1.2.3.4"), null);
		assert.equal(normalizePayload("DOMAIN-SUFFIX", "10.0.0.1"), null);
	});

	test("rejects payloads that would break the line format", () => {
		// A comma or whitespace would split into the wrong fields when the payload
		// is served one matcher per line.
		assert.equal(normalizePayload("DOMAIN", "a.com,DIRECT"), null);
		assert.equal(normalizePayload("DOMAIN", "a b.com"), null);
		assert.equal(normalizePayload("DOMAIN-KEYWORD", "one two"), null);
		assert.equal(normalizePayload("DOMAIN", ""), null);
	});

	test("rejects malformed domain labels", () => {
		assert.equal(normalizePayload("DOMAIN", "-leading.com"), null);
		assert.equal(normalizePayload("DOMAIN", "trailing-.com"), null);
		assert.equal(normalizePayload("DOMAIN", "under_score.com"), null);
		assert.equal(normalizePayload("DOMAIN", `${"a".repeat(64)}.com`), null);
		assert.equal(
			normalizePayload("DOMAIN", `${"a".repeat(63)}.com`) !== null,
			true,
		);
	});

	test("DOMAIN-WILDCARD requires an actual wildcard", () => {
		assert.equal(
			normalizePayload("DOMAIN-WILDCARD", "cdn*.example.com"),
			"cdn*.example.com",
		);
		assert.equal(
			normalizePayload("DOMAIN-WILDCARD", "node?.example.com"),
			"node?.example.com",
		);
		// Without a wildcard it is just a DOMAIN; refuse instead of storing a
		// degenerate pattern.
		assert.equal(normalizePayload("DOMAIN-WILDCARD", "example.com"), null);
	});

	test("DOMAIN-KEYWORD keeps a plain fragment, lower-cased", () => {
		assert.equal(normalizePayload("DOMAIN-KEYWORD", "Tracker"), "tracker");
		assert.equal(
			normalizePayload("DOMAIN-KEYWORD", "ad-serve_1"),
			"ad-serve_1",
		);
		assert.equal(normalizePayload("DOMAIN-KEYWORD", "bad/slash"), null);
	});

	test("IP-CIDR completes a bare address to a single-host prefix", () => {
		assert.equal(normalizePayload("IP-CIDR", "1.2.3.4"), "1.2.3.4/32");
		assert.equal(normalizePayload("IP-CIDR", "10.0.0.0/8"), "10.0.0.0/8");
		assert.equal(normalizePayload("IP-CIDR", "2001:db8::1"), "2001:db8::1/128");
		assert.equal(normalizePayload("IP-CIDR", "2001:db8::/32"), "2001:db8::/32");
		assert.equal(
			normalizePayload("IP-CIDR", "::ffff:1.2.3.4"),
			"::ffff:1.2.3.4/128",
		);
	});

	test("IP-CIDR rejects out-of-range octets and prefixes", () => {
		assert.equal(normalizePayload("IP-CIDR", "256.0.0.1"), null);
		assert.equal(normalizePayload("IP-CIDR", "1.2.3.4/33"), null);
		assert.equal(normalizePayload("IP-CIDR", "2001:db8::1/129"), null);
		assert.equal(normalizePayload("IP-CIDR", "1.2.3"), null);
		assert.equal(normalizePayload("IP-CIDR", "2001:db8:::1"), null);
	});
});

describe("frontend / backend normalization mirror", () => {
	const samples = [
		"Example.COM.",
		"sub.example.com",
		"1.2.3.4",
		"10.0.0.0/8",
		"2001:db8::1",
		"2001:db8::1/64",
		"cdn*.example.com",
		"node?.x.com",
		"-bad.com",
		"a.com,DIRECT",
		"tracker",
		"",
		"   ",
		"256.1.1.1",
		"::ffff:1.2.3.4",
	];

	for (const type of RULE_SET_TYPES) {
		test(`agrees for ${type}`, () => {
			for (const sample of samples) {
				assert.equal(
					normalizePayload(type, sample),
					apiNormalizePayload(type, sample),
					`${type} / ${JSON.stringify(sample)}`,
				);
			}
		});
	}
});

describe("parseRuleSetInput", () => {
	test("infers types for bare lines", () => {
		const { items, skipped } = parseRuleSetInput(
			[
				"example.com",
				".suffix.com",
				"+.plus.com",
				"cdn*.wild.com",
				"10.0.0.0/8",
				"1.2.3.4",
				"2001:db8::/32",
			].join("\n"),
		);
		assert.equal(skipped.length, 0);
		assert.deepEqual(
			items.map(({ type, payload }) => `${type},${payload}`),
			[
				// A pasted domain list almost always means "this site and its
				// subdomains", so a bare domain defaults to DOMAIN-SUFFIX.
				"DOMAIN-SUFFIX,example.com",
				"DOMAIN-SUFFIX,suffix.com",
				"DOMAIN-SUFFIX,plus.com",
				"DOMAIN-WILDCARD,cdn*.wild.com",
				"IP-CIDR,10.0.0.0/8",
				"IP-CIDR,1.2.3.4/32",
				"IP-CIDR,2001:db8::/32",
			],
		);
	});

	test("honours an explicit TYPE prefix and ignores a trailing policy", () => {
		const { items, skipped } = parseRuleSetInput(
			[
				"DOMAIN,exact.com",
				"domain-keyword,tracker",
				"DOMAIN-SUFFIX,example.com,DIRECT",
				"IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
			].join("\n"),
		);
		assert.equal(skipped.length, 0);
		assert.deepEqual(
			items.map(({ type, payload }) => `${type},${payload}`),
			[
				"DOMAIN,exact.com",
				"DOMAIN-KEYWORD,tracker",
				"DOMAIN-SUFFIX,example.com",
				"IP-CIDR,10.0.0.0/8",
			],
		);
	});

	test("skips blanks and comments, reports unrecognized lines", () => {
		const { items, skipped } = parseRuleSetInput(
			[
				"",
				"# a comment",
				"// premium comment",
				"  ",
				"good.com",
				"GEOIP,CN",
				"-bad-.com",
			].join("\n"),
		);
		assert.equal(items.length, 1);
		// An unsupported type and a malformed domain are surfaced, not silently dropped.
		assert.deepEqual(
			skipped.map((entry) => entry.text),
			["GEOIP,CN", "-bad-.com"],
		);
	});

	test("considers only the first 50 physical lines", () => {
		const lines = Array.from({ length: 60 }, (_, index) => `d${index}.com`);
		const { items, ignoredAfterLimit } = parseRuleSetInput(lines.join("\n"));
		assert.equal(items.length, 50);
		assert.equal(ignoredAfterLimit, 10);
	});

	test("reports line numbers of the original input", () => {
		const { items, skipped } = parseRuleSetInput("# c\n\ngood.com\n!bad");
		assert.equal(items[0].line, 3);
		assert.equal(skipped[0].line, 4);
	});
});

describe("resolveImport", () => {
	test("normalizes and collapses duplicates", () => {
		const items = resolveImport([
			{ type: "DOMAIN", payload: "Example.com." },
			{ type: "DOMAIN", payload: "example.com" },
			{ type: "IP-CIDR", payload: "1.2.3.4" },
		]);
		assert.deepEqual(items, [
			{ type: "DOMAIN", payload: "example.com" },
			{ type: "IP-CIDR", payload: "1.2.3.4/32" },
		]);
	});

	test("rejects junk, unsupported types and oversized batches", () => {
		assert.throws(() => resolveImport("nope"), /must be an array/);
		assert.throws(() => resolveImport([null]), /must be an object/);
		assert.throws(
			() => resolveImport([{ type: "GEOIP", payload: "CN" }]),
			/item type must be one of/,
		);
		// DOMAIN-REGEX is intentionally not in the whitelist (RE2 vs JS semantics).
		assert.throws(
			() => resolveImport([{ type: "DOMAIN-REGEX", payload: "^a.*b$" }]),
			/item type must be one of/,
		);
		assert.throws(
			() => resolveImport([{ type: "DOMAIN", payload: "bad domain" }]),
			/invalid payload for DOMAIN/,
		);
		assert.throws(
			() =>
				resolveImport(
					Array.from({ length: 51 }, (_, i) => ({
						type: "DOMAIN",
						payload: `d${i}.com`,
					})),
				),
			/at most 50 items per call/,
		);
	});
});

describe("resolveRuleSet", () => {
	test("defaults to the PROXY policy and drops policy_node", () => {
		assert.deepEqual(resolveRuleSet({ name: " work " }), {
			name: "work",
			policy: "PROXY",
			policy_node: null,
		});
		// A non-NODE policy must not keep a stale node name (the DB CHECK agrees).
		assert.deepEqual(
			resolveRuleSet({ name: "work", policy: "DIRECT", policy_node: "🇭🇰 HK" }),
			{ name: "work", policy: "DIRECT", policy_node: null },
		);
	});

	test("requires policy_node for the NODE policy", () => {
		assert.deepEqual(
			resolveRuleSet({ name: "w", policy: "NODE", policy_node: " 🇭🇰 HK " }),
			{ name: "w", policy: "NODE", policy_node: "🇭🇰 HK" },
		);
		assert.throws(
			() => resolveRuleSet({ name: "w", policy: "NODE" }),
			/policy_node is required/,
		);
	});

	test("rejects an empty / overlong name and an unknown policy", () => {
		assert.throws(() => resolveRuleSet({ name: "  " }), /name is required/);
		assert.throws(
			() => resolveRuleSet({ name: "a".repeat(101) }),
			/at most 100 characters/,
		);
		assert.throws(
			() => resolveRuleSet({ name: "w", policy: "🌐 手动选择" }),
			/policy must be one of/,
		);
	});
});

describe("renderPayload", () => {
	test("emits one TYPE,PAYLOAD per line and omits disabled items", () => {
		const payload = renderPayload([
			{ type: "DOMAIN-SUFFIX", payload: "example.com", enabled: true },
			{ type: "DOMAIN-KEYWORD", payload: "tracker", enabled: false },
			{ type: "IP-CIDR", payload: "10.0.0.0/8", enabled: true },
		]);
		assert.equal(
			payload,
			"# chiaotu rule set (2 rules)\nDOMAIN-SUFFIX,example.com\nIP-CIDR,10.0.0.0/8\n",
		);
	});

	test("stays non-empty when everything is disabled", () => {
		// mihomo's text parser skips `#` lines, so the comment keeps the body from
		// being zero bytes without contributing a rule.
		const payload = renderPayload([
			{ type: "DOMAIN", payload: "a.com", enabled: false },
		]);
		assert.equal(payload, "# chiaotu rule set (0 rules)\n");
	});
});

describe("payloadETag", () => {
	test("is stable for equal payloads and differs for changed ones", () => {
		assert.equal(payloadETag("a\nb\n"), payloadETag("a\nb\n"));
		assert.notEqual(payloadETag("a\nb\n"), payloadETag("a\nc\n"));
		assert.match(payloadETag("a"), /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
	});
});

describe("ruleSetKey", () => {
	test("cannot collide with the base template's own provider names", () => {
		// public/templates/base.yaml declares ai_non_ip, lan_ip, global_non_ip, …
		assert.equal(ruleSetKey(7), "chiaotu_rs_7");
		assert.match(ruleSetKey(7), /^[a-z0-9_]+$/);
	});
});

// A tiny compile-time guard: the frontend type union is what the tests iterate.
const _typeCheck: RuleSetType = "DOMAIN";
void _typeCheck;
