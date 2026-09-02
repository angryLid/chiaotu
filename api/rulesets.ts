/**
 * /api/rulesets — collection.
 *   GET  list active rule sets (newest first) with their active items
 *   POST create a rule set (name unique among active rows; slug assigned here)
 *
 * The slug is generated server-side and never accepted from the client: it is
 * the capability that protects GET /api/rulesets/payload/{slug}, so its
 * randomness must not be under the caller's control.
 */

import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { InvalidArgument, LimitExceeded } from "./_lib/errors";
import { readJson } from "./_lib/http";
import {
	generateSlug,
	MAX_RULE_SET_SIZE,
	MAX_RULE_SETS,
	type RuleSetRow,
	resolveRuleSet,
	shapeRuleSet,
} from "./_lib/rule-sets";
import { type ApiCtx, withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

/** Retries for the (astronomically unlikely) slug collision. */
const SLUG_ATTEMPTS = 5;

export default withApi(async (request, ctx) => {
	switch (request.method) {
		case "GET":
			return listRuleSets(ctx);
		case "POST":
			return createRuleSet(request, ctx);
		default:
			return methodNotAllowed();
	}
});

/** GET: all active rule sets with their active items, newest first. */
async function listRuleSets(ctx: ApiCtx): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("rule_sets")
		.select("*, rule_set_items(*)")
		.is("deleted_at", null)
		.is("rule_set_items.deleted_at", null)
		.order("id", { ascending: false })
		.order("id", { referencedTable: "rule_set_items", ascending: true });
	if (error) return err(new Error(error.message));
	return ok((data ?? []).map((row) => shapeRuleSet(row as RuleSetRow)));
}

/** POST: create a rule set. */
async function createRuleSet(request: Request, ctx: ApiCtx): Promise<Response> {
	const input = await readJson(request, MAX_RULE_SET_SIZE);
	const { name, policy, policy_node } = resolveRuleSet(input);

	const { count, error: countError } = await ctx.supabaseAdmin
		.from("rule_sets")
		.select("id", { count: "exact", head: true })
		.is("deleted_at", null);
	if (countError) return err(new Error(countError.message));
	if ((count ?? 0) >= MAX_RULE_SETS) {
		return err(
			LimitExceeded(
				`rule set limit reached: at most ${MAX_RULE_SETS} rule sets`,
			),
		);
	}

	// The unique index on slug is global (rotated / deleted slugs are never
	// re-issued), so a collision is retried rather than surfaced.
	for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
		const { data, error } = await ctx.supabaseAdmin
			.from("rule_sets")
			.insert({ name, slug: generateSlug(), policy, policy_node })
			.select()
			.single();
		if (!error) {
			return ok(shapeRuleSet(data as RuleSetRow));
		}
		if (error.code !== "23505") return err(new Error(error.message));
		// 23505 on the name is a user error; on the slug it is a retryable collision.
		if (!error.message.includes("slug")) {
			return err(InvalidArgument("rule set name already exists"));
		}
	}
	return err(new Error("failed to allocate a unique rule set slug"));
}
