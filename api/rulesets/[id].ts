/**
 * /api/rulesets/{id} — item.
 *   GET    a single rule set with its active items
 *   PUT    replace name / policy / policy_node (slug is immutable)
 *   DELETE soft-delete the set and all its items (atomic RPC)
 */

import { err, methodNotAllowed, ok } from "../_lib/envelope";
import { InvalidArgument, NotFound } from "../_lib/errors";
import { idFromPath, readJson } from "../_lib/http";
import {
	MAX_RULE_SET_SIZE,
	type RuleSetRow,
	resolveRuleSet,
	shapeRuleSet,
} from "../_lib/rule-sets";
import { type ApiCtx, withApi } from "../_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	const id = idFromPath(new URL(request.url).pathname, "/api/rulesets/");
	if (id === null) return err(InvalidArgument("invalid id"));

	switch (request.method) {
		case "GET":
			return getRuleSet(ctx, id);
		case "PUT":
			return updateRuleSet(request, ctx, id);
		case "DELETE":
			return deleteRuleSet(ctx, id);
		default:
			return methodNotAllowed();
	}
});

/** GET: a single rule set with its active items. */
async function getRuleSet(ctx: ApiCtx, id: number): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("rule_sets")
		.select("*, rule_set_items(*)")
		.eq("id", id)
		.is("deleted_at", null)
		.is("rule_set_items.deleted_at", null)
		.order("id", { referencedTable: "rule_set_items", ascending: true });
	if (error) return err(new Error(error.message));
	const row = (data ?? [])[0];
	return row
		? ok(shapeRuleSet(row as RuleSetRow))
		: err(NotFound("rule set not found"));
}

/** PUT: replace the rule set's name / policy. Items are untouched. */
async function updateRuleSet(
	request: Request,
	ctx: ApiCtx,
	id: number,
): Promise<Response> {
	const input = await readJson(request, MAX_RULE_SET_SIZE);
	const { name, policy, policy_node } = resolveRuleSet(input);
	const { data, error } = await ctx.supabaseAdmin
		.from("rule_sets")
		.update({ name, policy, policy_node })
		.eq("id", id)
		.is("deleted_at", null)
		.select("*, rule_set_items(*)")
		.is("rule_set_items.deleted_at", null)
		.order("id", { referencedTable: "rule_set_items", ascending: true });
	if (error) {
		return error.code === "23505"
			? err(InvalidArgument("rule set name already exists"))
			: err(new Error(error.message));
	}
	const row = (data ?? [])[0];
	return row
		? ok(shapeRuleSet(row as RuleSetRow))
		: err(NotFound("rule set not found"));
}

/**
 * DELETE: soft-delete the set and every item under it in one transaction.
 *
 * Note the client-side limit: mihomo serves its last cached copy of a
 * rule-provider when a refresh fails, so deleting a set does not revoke it from
 * clients that already downloaded the payload.
 */
async function deleteRuleSet(ctx: ApiCtx, id: number): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin.rpc("soft_delete_rule_set", {
		p_rule_set_id: id,
	});
	if (error) return err(new Error(error.message));
	if (data !== true) return err(NotFound("rule set not found"));
	return ok(null);
}
