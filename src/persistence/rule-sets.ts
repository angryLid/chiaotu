/**
 * Rule-set domain contract: the zod schemas the frontend trusts, plus the paste
 * parser and payload normalization.
 *
 * Normalization is deliberately duplicated from `api/_lib/rule-sets.ts` rather
 * than shared: the api/ tree is a separate tsconfig project with no `~/` alias
 * and no access to src/. Keeping the two in sync matters because the import
 * preview must show exactly what the server will store — the tests in
 * src/test/rule-sets.test.ts pin the shared behaviour.
 */

import { z } from "zod";

/**
 * Accepted matcher types (a subset of mihomo's routing rules). DOMAIN-REGEX is
 * excluded on purpose: mihomo evaluates RE2, so a pattern that looks valid to a
 * JS regex check could still make a client reject the whole config.
 */
export const RULE_SET_TYPES = [
	"DOMAIN",
	"DOMAIN-SUFFIX",
	"DOMAIN-KEYWORD",
	"DOMAIN-WILDCARD",
	"IP-CIDR",
] as const;

export type RuleSetType = (typeof RULE_SET_TYPES)[number];

/**
 * Symbolic RULE-SET targets, resolved to real names at generation time. The
 * literal proxy-group names of a config depend on which projection rules were
 * selected, so a rule set stores intent instead of a name.
 */
export const RULE_SET_POLICIES = ["DIRECT", "REJECT", "PROXY", "NODE"] as const;

export type RuleSetPolicy = (typeof RULE_SET_POLICIES)[number];

/** Items accepted by one import call (mirrors the Hosts entry import). */
export const MAX_IMPORT_ITEMS = 50;

/** Cap on active rule sets, mirrored from the backend. */
export const MAX_RULE_SETS = 20;

export const RuleSetItemSchema = z.object({
	id: z.number().int().positive(),
	rule_set_id: z.number().int().positive(),
	type: z.enum(RULE_SET_TYPES),
	payload: z.string().min(1),
	enabled: z.boolean(),
	created_at: z.string(),
	updated_at: z.string(),
	deleted_at: z.string().nullable().optional(),
});
export type RuleSetItem = z.infer<typeof RuleSetItemSchema>;

export const RuleSetSchema = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1),
	/** Public capability in the distribution link. */
	slug: z.string().min(1),
	/** YAML key under `rule-providers` in a generated config. */
	key: z.string().min(1),
	policy: z.enum(RULE_SET_POLICIES),
	policy_node: z.string().nullable(),
	items: z.array(RuleSetItemSchema),
	created_at: z.string(),
	updated_at: z.string(),
	deleted_at: z.string().nullable().optional(),
});
export type RuleSet = z.infer<typeof RuleSetSchema>;

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const WILDCARD_LABEL =
	/^[a-z0-9*?](?:[a-z0-9*?-]{0,61}[a-z0-9*?])?$|^[a-z0-9*?]$/;

function normalizeDomain(value: string): string {
	return value.trim().toLowerCase().replace(/\.+$/, "");
}

function isValidIPv4(value: string): boolean {
	const parts = value.split(".");
	return (
		parts.length === 4 &&
		parts.every(
			(part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
		)
	);
}

/**
 * Minimal IPv6 literal check: hex groups separated by ":", optionally with a
 * single "::" run and an optional trailing embedded IPv4 (::ffff:1.2.3.4).
 */
function isValidIPv6(value: string): boolean {
	if (!/^[0-9a-f:.]+$/.test(value)) return false;
	const doubleColons = value.split("::").length - 1;
	if (doubleColons > 1) return false;
	const [head, tail] = doubleColons === 1 ? value.split("::") : [value, null];
	const headGroups = head === "" ? [] : head.split(":");
	const tailGroups = tail === null || tail === "" ? [] : tail.split(":");
	const groups = [...headGroups, ...tailGroups];
	let count = 0;
	for (let index = 0; index < groups.length; index += 1) {
		const group = groups[index];
		if (group.includes(".")) {
			if (index !== groups.length - 1 || !isValidIPv4(group)) return false;
			count += 2;
			continue;
		}
		if (!/^[0-9a-f]{1,4}$/.test(group)) return false;
		count += 1;
	}
	return doubleColons === 1 ? count <= 7 : count === 8;
}

/**
 * Normalize one matcher payload for its type, or null when it cannot be rendered
 * as a valid `TYPE,PAYLOAD` line. Mirrors the backend exactly: domains are
 * lower-cased and lose the trailing dot, a bare IP gains its single-host prefix,
 * and commas / whitespace are rejected (they would split the line).
 */
export function normalizePayload(
	type: RuleSetType,
	rawPayload: string,
): string | null {
	const raw = rawPayload.trim();
	if (raw === "" || /[,\s]/.test(raw)) return null;

	switch (type) {
		case "DOMAIN":
		case "DOMAIN-SUFFIX": {
			const domain = normalizeDomain(raw);
			if (
				domain === "" ||
				domain.length > 253 ||
				/^\d+(?:\.\d+){3}$/.test(domain)
			) {
				return null;
			}
			return domain.split(".").every((label) => LABEL.test(label))
				? domain
				: null;
		}
		case "DOMAIN-KEYWORD": {
			const keyword = raw.toLowerCase();
			return /^[a-z0-9.\-_*]+$/.test(keyword) ? keyword : null;
		}
		case "DOMAIN-WILDCARD": {
			const pattern = normalizeDomain(raw);
			if (pattern === "" || pattern.length > 253) return null;
			if (!pattern.includes("*") && !pattern.includes("?")) return null;
			return pattern.split(".").every((label) => WILDCARD_LABEL.test(label))
				? pattern
				: null;
		}
		case "IP-CIDR": {
			const value = raw.toLowerCase();
			const slash = value.indexOf("/");
			const address = slash === -1 ? value : value.slice(0, slash);
			const prefixText = slash === -1 ? null : value.slice(slash + 1);
			const isV6 = address.includes(":");
			if (isV6 ? !isValidIPv6(address) : !isValidIPv4(address)) return null;
			const maxPrefix = isV6 ? 128 : 32;
			if (prefixText === null) return `${address}/${maxPrefix}`;
			if (!/^(?:0|[1-9]\d{0,2})$/.test(prefixText)) return null;
			const prefix = Number(prefixText);
			return prefix <= maxPrefix ? `${address}/${prefix}` : null;
		}
		default:
			return null;
	}
}

export interface ParsedRuleLine {
	line: number;
	type: RuleSetType;
	payload: string;
}
export interface SkippedRuleLine {
	line: number;
	text: string;
}
export interface RuleSetImportPreview {
	items: ParsedRuleLine[];
	skipped: SkippedRuleLine[];
	ignoredAfterLimit: number;
}

/** Type names accepted as an explicit `TYPE,PAYLOAD` prefix, case-insensitively. */
const TYPE_BY_NAME = new Map<string, RuleSetType>(
	RULE_SET_TYPES.map((type) => [type, type]),
);

/**
 * Infer the matcher type of a bare line (no `TYPE,` prefix).
 *
 * The defaults are the ones that make a pasted list behave the way people
 * expect: something that parses as an IP or CIDR is IP-CIDR, a pattern with
 * `*` / `?` is DOMAIN-WILDCARD, a leading dot or `+.` (clash's own suffix
 * shorthand) is DOMAIN-SUFFIX, and a plain domain is DOMAIN-SUFFIX too — a
 * pasted domain list almost always means "this site and its subdomains".
 * Exact-only matching stays available through the explicit `DOMAIN,` prefix.
 */
function inferType(text: string): { type: RuleSetType; body: string } | null {
	if (text.includes("/") || /^\d+(?:\.\d+){3}$/.test(text)) {
		return { type: "IP-CIDR", body: text };
	}
	if (text.includes(":") && /^[0-9a-fA-F:.]+$/.test(text)) {
		return { type: "IP-CIDR", body: text };
	}
	if (text.includes("*") || text.includes("?")) {
		return { type: "DOMAIN-WILDCARD", body: text };
	}
	if (text.startsWith("+.")) {
		return { type: "DOMAIN-SUFFIX", body: text.slice(2) };
	}
	if (text.startsWith(".")) {
		return { type: "DOMAIN-SUFFIX", body: text.slice(1) };
	}
	return { type: "DOMAIN-SUFFIX", body: text };
}

/**
 * Parse pasted text into matchers, considering exactly the first 50 physical
 * lines (mirrors parseHostsInput). Blank lines and `#` comments are skipped
 * silently; unrecognized lines are reported so the preview can show them.
 */
export function parseRuleSetInput(input: string): RuleSetImportPreview {
	const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/);
	const considered = lines.slice(0, MAX_IMPORT_ITEMS);
	const items: ParsedRuleLine[] = [];
	const skipped: SkippedRuleLine[] = [];

	for (let index = 0; index < considered.length; index += 1) {
		const raw = considered[index];
		const text = raw.trim();
		if (text === "" || text.startsWith("#") || text.startsWith("//")) continue;

		// An explicit `TYPE,PAYLOAD` prefix wins; a trailing policy field (the
		// shape of a full clash rule) is ignored so lines copied out of a config
		// still import.
		const fields = text.split(",").map((field) => field.trim());
		let candidate: { type: RuleSetType; body: string } | null = null;
		const explicit = TYPE_BY_NAME.get(fields[0].toUpperCase());
		if (explicit !== undefined && fields.length >= 2) {
			candidate = { type: explicit, body: fields[1] };
		} else if (fields.length === 1) {
			candidate = inferType(text);
		}

		const payload =
			candidate === null
				? null
				: normalizePayload(candidate.type, candidate.body);
		if (candidate === null || payload === null) {
			skipped.push({ line: index + 1, text: raw });
			continue;
		}
		items.push({ line: index + 1, type: candidate.type, payload });
	}

	return {
		items,
		skipped,
		ignoredAfterLimit: Math.max(0, lines.length - MAX_IMPORT_ITEMS),
	};
}
