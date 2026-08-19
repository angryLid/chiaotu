/**
 * Business validation, mirrored from the Go backend (internal/model/service.go).
 * These run in the Edge Functions before writing to Supabase. The Supabase DB
 * has no business triggers for these — this TS module is the single source of
 * truth for the business rules.
 */

import { InvalidArgument } from "./errors";

/** Cap on the total number of subscriptions (mirrors model.MaxSubscriptions). */
export const MAX_SUBSCRIPTIONS = 10;

/** Rule request bodies are tiny (name + filter); 64 KB cap (model.MaxRuleSize). */
export const MAX_RULE_SIZE = 64 << 10;

/** Accepted rule filter dimensions; each, when present, is an array of non-empty strings. */
const RULE_FILTER_KEYS = ["subIds", "nameKeywords", "typeMatch"] as const;

/**
 * Validate and normalize a subscription input. Returns { name, url, content }.
 * Rules: at least one of url and content must be non-empty; url wins (fetched
 * content overwrites content); when name is empty and url is provided, the name
 * is derived from the url's last path segment.
 * `fetchContent` is a callback that fetches the url text (injected so the caller
 * can supply the real fetch or the Edge Function's fetch); it must throw a
 * BizError(FetchFailed) on failure and return the content string on success.
 */
export async function resolveSubscription(
	input: { name?: string; url?: string; content?: string },
	fetchContent: (url: string) => Promise<string>,
): Promise<{ name: string; url: string; content: string }> {
	const url = (input.url ?? "").trim();
	let content = input.content ?? "";

	if (url === "" && content.trim() === "") {
		throw InvalidArgument("url and content: at least one must be non-empty");
	}

	if (url !== "") {
		content = await fetchContent(url);
	}
	const name = input.name ?? "";
	return { name, url, content };
}

/** Derive the subscription file name from the url's last path segment; fall back to host. */
export function deriveName(rawUrl: string): string {
	let u: URL;
	try {
		u = new URL(rawUrl);
	} catch {
		return "";
	}
	const segments = u.pathname.split("/").filter((s) => s !== "");
	const base = segments[segments.length - 1] ?? "";
	if (base === "" || base === ".") return u.host;
	return base;
}

/** Validate a generated result input: name and content must be non-empty. */
export function resolveGenerated(input: {
	name?: string;
	display_name?: string | null;
	content?: string;
}): { name: string; display_name: string | null; content: string } {
	const name = (input.name ?? "").trim();
	if (name === "") throw InvalidArgument("generated name must not be empty");
	const display_name = normalizeDisplayName(input.display_name);
	const content = input.content ?? "";
	if (content.trim() === "")
		throw InvalidArgument("generated content must not be empty");
	return { name, display_name, content };
}

/** Empty display names are stored consistently as NULL. */
export function normalizeDisplayName(
	value: string | null | undefined,
): string | null {
	const normalized = typeof value === "string" ? value.trim() : "";
	return normalized === "" ? null : normalized;
}

/**
 * Validate a rule input. Returns { name, filter } where filter is the raw JSON
 * string to persist. Rules: name non-empty; filter must be a JSON object whose
 * subIds/nameKeywords/typeMatch, when present, are arrays of non-empty strings;
 * absent filter is treated as "{}". subIds existence is validated by the caller
 * (needs the DB); pass existingIds to check.
 */
export function resolveRule(input: {
	name?: string;
	filter?: unknown;
	existingIds?: Set<string>;
}): { name: string; filter: string } {
	const name = (input.name ?? "").trim();
	if (name === "") throw InvalidArgument("rule name must not be empty");

	let raw: string;
	if (input.filter === undefined || input.filter === null) {
		raw = "{}";
	} else {
		if (typeof input.filter === "string") {
			raw = input.filter.trim();
		} else {
			// already a JS object (from JSON body) -> stringify
			raw = JSON.stringify(input.filter);
		}
	}

	let obj: unknown;
	try {
		obj = JSON.parse(raw);
	} catch {
		throw InvalidArgument("filter must be a valid JSON object");
	}
	if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
		throw InvalidArgument("filter must be a valid JSON object");
	}

	const record = obj as Record<string, unknown>;
	for (const key of RULE_FILTER_KEYS) {
		if (record[key] !== undefined && record[key] !== null) {
			validateStringArray(key, record[key]);
		}
	}
	if (input.existingIds && record.subIds) {
		validateSubIds(record.subIds as unknown[], input.existingIds);
	}
	return { name, filter: raw };
}

/** Check that v is an array of non-empty strings. */
function validateStringArray(key: string, v: unknown): void {
	if (!Array.isArray(v)) {
		throw InvalidArgument(`filter field ${key} must be an array of strings`);
	}
	for (const item of v) {
		if (typeof item !== "string" || item.trim() === "") {
			throw InvalidArgument(
				`filter field ${key} must contain only non-empty strings`,
			);
		}
	}
}

/** Check that subIds are numeric strings and reference existing subscriptions. */
function validateSubIds(ids: unknown[], existing: Set<string>): void {
	for (const s of ids) {
		if (typeof s !== "string" || s.trim() === "") {
			throw InvalidArgument(
				"filter field subIds must contain only non-empty strings",
			);
		}
		if (!/^\d+$/.test(s)) {
			throw InvalidArgument(
				`filter field subIds contains a non-numeric id: ${s}`,
			);
		}
		if (!existing.has(s)) {
			throw InvalidArgument(`subscription not found: ${s}`);
		}
	}
}
