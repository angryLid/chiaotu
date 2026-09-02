/**
 * Rule-set domain logic shared by every /api/rulesets route: the matcher
 * whitelist, payload normalization, the rule-provider key derivation, and the
 * text payload renderer.
 *
 * Why validation is strict: the payload is consumed by mihomo as a `classical`
 * rule-provider. A malformed line is only warned about and skipped, but an
 * unknown rule *type* inside a referenced provider — and any bad line in the
 * generated config's own `rules` — makes the client reject the whole config
 * (see mihomo config.parseRules: "error: proxy [%s] not found" / ParseRule's
 * "unsupported rule type"). So the API refuses anything it cannot render as a
 * valid `TYPE,PAYLOAD` line instead of storing it and breaking clients later.
 *
 * Mirrored on the frontend by src/persistence/rule-sets.ts (same normalization,
 * so the paste preview shows exactly what the server will store).
 */

import { InvalidArgument, LimitExceeded } from "./errors";

/** Cap on the number of active rule sets (mirrors MAX_SUBSCRIPTIONS' spirit). */
export const MAX_RULE_SETS = 20;

/** Cap on active items per rule set. */
export const MAX_RULE_SET_ITEMS = 500;

/** Items accepted by one import call (mirrors the Hosts entry import). */
export const MAX_IMPORT_ITEMS = 50;

/** Rule-set name length cap (mirrors hosts profile names). */
export const MAX_RULE_SET_NAME = 100;

/** Request body cap for rule-set writes; an import of 50 matchers is tiny. */
export const MAX_RULE_SET_SIZE = 64 << 10;

/**
 * Accepted matcher types. Deliberately a subset of mihomo's routing rules:
 * DOMAIN-REGEX is excluded because mihomo evaluates RE2 while the UI can only
 * validate with JS regex semantics, so a pattern accepted here could still make
 * a client refuse the config.
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
 * Symbolic RULE-SET targets. The literal proxy-group names of a generated config
 * depend on which projection rules were selected at generation time, so a rule
 * set stores intent instead of a name: DIRECT / REJECT are mihomo built-ins,
 * PROXY resolves to the always-present manual-select group, and NODE resolves to
 * the single node named by `policy_node`.
 */
export const RULE_SET_POLICIES = ["DIRECT", "REJECT", "PROXY", "NODE"] as const;

export type RuleSetPolicy = (typeof RULE_SET_POLICIES)[number];

/** Length of a rule-set slug (the public capability in the download link). */
export const SLUG_LENGTH = 16;

const SLUG_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Generate a rule-set slug with the Web Crypto API (available in the edge
 * runtime). Rejection sampling keeps the distribution uniform over the
 * alphabet; a biased slug would shrink the effective keyspace of a capability
 * that is the only thing protecting the payload.
 */
export function generateSlug(): string {
	const limit = 256 - (256 % SLUG_ALPHABET.length);
	let slug = "";
	const bytes = new Uint8Array(SLUG_LENGTH * 2);
	while (slug.length < SLUG_LENGTH) {
		crypto.getRandomValues(bytes);
		for (const byte of bytes) {
			if (byte >= limit) continue;
			slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
			if (slug.length === SLUG_LENGTH) break;
		}
	}
	return slug;
}

/**
 * The YAML key a generated config declares this rule set under in
 * `rule-providers`. Derived from the id so it is stable, unique, and can never
 * collide with the base template's own provider names (ai_non_ip, lan_ip, …).
 */
export function ruleSetKey(id: number): string {
	return `chiaotu_rs_${id}`;
}

/** A single domain label: letters / digits / hyphen, not starting or ending with a hyphen. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Same label rule, but `*` and `?` are additionally allowed (DOMAIN-WILDCARD). */
const WILDCARD_LABEL =
	/^[a-z0-9*?](?:[a-z0-9*?-]{0,61}[a-z0-9*?])?$|^[a-z0-9*?]$/;

/** Lower-case and drop the trailing dot(s) of a domain (mirrors hosts normalizeDomain). */
function normalizeDomain(value: string): string {
	return value.trim().toLowerCase().replace(/\.+$/, "");
}

/** Whether the value is a bare IPv4 address (rejected where a domain is required). */
function looksLikeIPv4(value: string): boolean {
	return /^\d+(?:\.\d+){3}$/.test(value);
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
		// An embedded IPv4 tail occupies the final two 16-bit groups.
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
 * Normalize one matcher payload for its type, or return null when it cannot be
 * rendered as a valid line.
 *
 * - domains are lower-cased and lose their trailing dot;
 * - a bare IP in IP-CIDR gets its single-host prefix (/32 or /128) appended, so
 *   the stored value always matches mihomo's `ipcidr`-shaped expectation;
 * - anything containing a comma or whitespace is rejected: it would split into
 *   the wrong fields when the payload is served one matcher per line.
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
			if (domain === "" || domain.length > 253 || looksLikeIPv4(domain)) {
				return null;
			}
			return domain.split(".").every((label) => LABEL.test(label))
				? domain
				: null;
		}
		case "DOMAIN-KEYWORD": {
			// A keyword is matched as a substring, so it is not a domain and only
			// needs to be a safe, lower-cased fragment.
			const keyword = raw.toLowerCase();
			return /^[a-z0-9.\-_*]+$/.test(keyword) ? keyword : null;
		}
		case "DOMAIN-WILDCARD": {
			const pattern = normalizeDomain(raw);
			if (pattern === "" || pattern.length > 253) return null;
			// A pattern without a wildcard is just a DOMAIN; keep the distinction
			// explicit instead of silently storing a degenerate wildcard.
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

/**
 * A rule_sets row as selected by the API, optionally with its embedded items.
 * `key` is absent because it is derived, not stored (see ruleSetKey).
 */
export interface RuleSetRow {
	id: number;
	name: string;
	slug: string;
	policy: string;
	policy_node: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	rule_set_items?: unknown[] | null;
}

/**
 * Shape a row into the wire representation: the embedded `rule_set_items`
 * relation is renamed to `items` (mirrors the Hosts profile shaping) and the
 * derived `key` is added.
 */
export function shapeRuleSet(row: RuleSetRow): Record<string, unknown> {
	const { rule_set_items, ...rest } = row;
	return { ...rest, key: ruleSetKey(row.id), items: rule_set_items ?? [] };
}

/** Narrow an unknown value to a supported matcher type. */
export function asRuleSetType(value: unknown): RuleSetType | null {
	return typeof value === "string" &&
		(RULE_SET_TYPES as readonly string[]).includes(value)
		? (value as RuleSetType)
		: null;
}

/**
 * Validate a rule-set name / policy pair (shared by create and update).
 * `policy_node` is only meaningful for the NODE policy; it is dropped otherwise
 * so a stale node name can never linger (the DB CHECK enforces the same).
 *
 * The node itself is intentionally NOT verified here: nodes live inside
 * subscription YAML, which the backend never parses. The generating client
 * checks that the node survived into the config it builds.
 */
export function resolveRuleSet(input: {
	name?: unknown;
	policy?: unknown;
	policy_node?: unknown;
}): { name: string; policy: RuleSetPolicy; policy_node: string | null } {
	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (name === "" || name.length > MAX_RULE_SET_NAME) {
		throw InvalidArgument(
			`rule set name is required and must be at most ${MAX_RULE_SET_NAME} characters`,
		);
	}

	const rawPolicy = input.policy === undefined ? "PROXY" : input.policy;
	if (
		typeof rawPolicy !== "string" ||
		!(RULE_SET_POLICIES as readonly string[]).includes(rawPolicy)
	) {
		throw InvalidArgument(
			`policy must be one of ${RULE_SET_POLICIES.join(" / ")}`,
		);
	}
	const policy = rawPolicy as RuleSetPolicy;

	if (policy !== "NODE") return { name, policy, policy_node: null };

	const node =
		typeof input.policy_node === "string" ? input.policy_node.trim() : "";
	if (node === "") {
		throw InvalidArgument("policy_node is required when policy is NODE");
	}
	return { name, policy, policy_node: node };
}

/** One normalized import item. */
export interface RuleSetImportItem {
	type: RuleSetType;
	payload: string;
}

/**
 * Validate an import body into a deduplicated list of normalized matchers.
 * Duplicates within one request collapse (last wins) so the partial unique index
 * on (rule_set_id, type, payload) can never be violated by the request itself.
 */
export function resolveImport(raw: unknown): RuleSetImportItem[] {
	if (!Array.isArray(raw)) {
		throw InvalidArgument("items must be an array");
	}
	if (raw.length > MAX_IMPORT_ITEMS) {
		throw LimitExceeded(
			`rule set import limit reached: at most ${MAX_IMPORT_ITEMS} items per call`,
		);
	}
	const items = new Map<string, RuleSetImportItem>();
	for (const entry of raw) {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
			throw InvalidArgument("each item must be an object");
		}
		const record = entry as Record<string, unknown>;
		const type = asRuleSetType(record.type);
		if (type === null) {
			throw InvalidArgument(
				`item type must be one of ${RULE_SET_TYPES.join(" / ")}`,
			);
		}
		const payload =
			typeof record.payload === "string"
				? normalizePayload(type, record.payload)
				: null;
		if (payload === null) {
			throw InvalidArgument(`invalid payload for ${type}`);
		}
		items.set(`${type},${payload}`, { type, payload });
	}
	return [...items.values()];
}

/** The item shape the payload renderer needs. */
export interface RenderableItem {
	type: string;
	payload: string;
	enabled: boolean;
}

/**
 * Render the items as a mihomo `classical` / `format: text` payload: one
 * `TYPE,PAYLOAD` per line, disabled items omitted.
 *
 * The leading comment is not decoration: mihomo's text parser skips `#` lines,
 * and emitting it guarantees the body is never zero bytes even when every item
 * is disabled — an empty provider is a provider with no rules, which is
 * harmless, whereas an empty HTTP body is a needless edge case.
 */
export function renderPayload(items: RenderableItem[]): string {
	const lines = items
		.filter((item) => item.enabled)
		.map((item) => `${item.type},${item.payload}`);
	const header = `# chiaotu rule set (${lines.length} rules)\n`;
	return lines.length === 0 ? header : `${header}${lines.join("\n")}\n`;
}

/**
 * Weak ETag over the payload (FNV-1a). Rule-provider refreshes poll this
 * endpoint on their own interval, so a cheap validator lets unchanged sets be
 * answered with a bodyless 304.
 */
export function payloadETag(payload: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < payload.length; index += 1) {
		hash ^= payload.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return `W/"${hash.toString(16)}-${payload.length.toString(16)}"`;
}
