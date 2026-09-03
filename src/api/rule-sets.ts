/**
 * REST client for the rule-set resource.
 *
 * Contract points (see docs/openapi.yaml):
 * - HTTP is always 200; success is decided by the envelope { status, result };
 * - a rule set is { id, name, slug, key, policy, items }, where
 *   `slug` is the public capability of the distribution link and `key` is the
 *   YAML key a generated config declares it under in `rule-providers`;
 * - the slug is assigned by the backend and rotated through its own endpoint;
 * - items are managed in bulk (import) or one flag at a time (enable/delete):
 *   type / payload are immutable because they are the item's identity.
 */

import {
	type RuleSet,
	type RuleSetItem,
	RuleSetItemSchema,
	type RuleSetPolicy,
	RuleSetSchema,
	type RuleSetType,
} from "~/persistence/rule-sets";
import { ApiError } from "./errors";
import { request } from "./subscriptions";

/** Body for creating / updating a rule set. */
export interface RuleSetInput {
	name: string;
	policy: RuleSetPolicy;
}

/** One matcher of an import batch (already normalized by the caller). */
export interface RuleSetImportItem {
	type: RuleSetType;
	payload: string;
}

function parseRuleSet(value: unknown): RuleSet {
	const result = RuleSetSchema.safeParse(value);
	if (!result.success) throw new ApiError("", "INVALID_RESPONSE");
	return result.data;
}

function parseItem(value: unknown): RuleSetItem {
	const result = RuleSetItemSchema.safeParse(value);
	if (!result.success) throw new ApiError("", "INVALID_RESPONSE");
	return result.data;
}

/** List all active rule sets (newest first) with their active items. */
export function listRuleSets(): Promise<RuleSet[]> {
	return request<unknown[]>("/rulesets").then((rows) => rows.map(parseRuleSet));
}

/** Get a single rule set. */
export function getRuleSet(id: number): Promise<RuleSet> {
	return request<unknown>(`/rulesets/${id}`).then(parseRuleSet);
}

/** Create a rule set (the backend assigns the slug). */
export function createRuleSet(input: RuleSetInput): Promise<RuleSet> {
	return request<unknown>("/rulesets", {
		method: "POST",
		body: JSON.stringify(input),
	}).then(parseRuleSet);
}

/** Replace a rule set's name / policy (items are untouched). */
export function updateRuleSet(
	id: number,
	input: RuleSetInput,
): Promise<RuleSet> {
	return request<unknown>(`/rulesets/${id}`, {
		method: "PUT",
		body: JSON.stringify(input),
	}).then(parseRuleSet);
}

/** Soft-delete a rule set and all of its items. */
export function deleteRuleSet(id: number): Promise<null> {
	return request<null>(`/rulesets/${id}`, { method: "DELETE" });
}

/**
 * Issue a fresh slug, invalidating the previous distribution link. Configs that
 * still reference the old URL must be regenerated.
 */
export function rotateRuleSetSlug(id: number): Promise<RuleSet> {
	return request<unknown>(`/rulesets/${id}/rotate-slug`, {
		method: "POST",
	}).then(parseRuleSet);
}

/** Import matchers into a rule set; resolves with the full active item list. */
export function importRuleSetItems(
	id: number,
	items: RuleSetImportItem[],
): Promise<RuleSetItem[]> {
	return request<unknown[]>(`/rulesets/${id}/items/import`, {
		method: "POST",
		body: JSON.stringify({ items }),
	}).then((rows) => rows.map(parseItem));
}

/** Toggle one matcher's enabled flag. */
export function updateRuleSetItem(
	id: number,
	itemId: number,
	enabled: boolean,
): Promise<RuleSetItem> {
	return request<unknown>(`/rulesets/${id}/items/${itemId}`, {
		method: "PUT",
		body: JSON.stringify({ enabled }),
	}).then(parseItem);
}

/** Soft-delete one matcher. */
export function deleteRuleSetItem(id: number, itemId: number): Promise<null> {
	return request<null>(`/rulesets/${id}/items/${itemId}`, {
		method: "DELETE",
	});
}

/**
 * The public distribution URL of a rule set. Unauthenticated by design — the
 * slug is the capability — so it can be pasted straight into a `rule-providers`
 * entry.
 */
export function ruleSetPayloadUrl(slug: string): string {
	return `${window.location.origin}/api/rulesets/payload/${encodeURIComponent(slug)}`;
}
