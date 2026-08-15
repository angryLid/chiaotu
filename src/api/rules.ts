/**
 * REST client for the friend-cats "rule" resource.
 *
 * Contract points (see friend-cats README and openapi.yaml):
 * - HTTP is always 200; success is decided by the envelope { status, result };
 * - a rule is { id, name, filter, created_at, updated_at }, where filter is the
 *   JSON filter spec (frontend zod guarantees its shape; the backend validates
 *   that referenced subscription ids exist and stores the object as-is);
 * - name is required and unique; update is a full replacement (PUT).
 */

import { type Rule, type RuleFilter, RuleSchema } from "~/persistence/rules";
import { ApiError } from "./errors";
import { request } from "./subscriptions";

/** Body for creating / updating a rule. */
export interface RuleInput {
	name: string;
	filter: RuleFilter;
}

/** Parse a backend rule with the zod contract; on mismatch the response is treated as junk. */
function parseRule(data: unknown): Rule {
	const parsed = RuleSchema.safeParse(data);
	if (!parsed.success) {
		throw new ApiError("", "INVALID_RESPONSE");
	}
	return parsed.data;
}

/** List all rules, newest first. */
export function listRules(): Promise<Rule[]> {
	return request<Rule[]>("/rules").then((data) => data.map(parseRule));
}

/** Get a single rule. */
export function getRule(id: number): Promise<Rule> {
	return request<Rule>(`/rules/${id}`).then(parseRule);
}

/** Create a rule. */
export function createRule(input: RuleInput): Promise<Rule> {
	return request<Rule>("/rules", {
		method: "POST",
		body: JSON.stringify(input),
	}).then(parseRule);
}

/** Replace the whole rule: name / filter are all overwritten with the new values. */
export function updateRule(id: number, input: RuleInput): Promise<Rule> {
	return request<Rule>(`/rules/${id}`, {
		method: "PUT",
		body: JSON.stringify(input),
	}).then(parseRule);
}

/** Delete a rule. */
export function deleteRule(id: number): Promise<null> {
	return request<null>(`/rules/${id}`, { method: "DELETE" });
}
