/**
 * POST /api/rulesets/{id}/rotate-slug — issue a fresh capability.
 *
 * The slug is the only thing protecting the public payload URL, so a leaked link
 * must be revocable. Rotating invalidates the old URL immediately; any generated
 * config still referencing it will fail to refresh its rule-provider (mihomo
 * then keeps serving its cached copy), so the config has to be regenerated.
 */

import { err, methodNotAllowed, ok } from "../../_lib/envelope";
import { InvalidArgument, NotFound } from "../../_lib/errors";
import {
	generateSlug,
	type RuleSetRow,
	shapeRuleSet,
} from "../../_lib/rule-sets";
import { withApi } from "../../_lib/with-api";

export const config = { runtime: "edge" };

/** Retries for the (astronomically unlikely) slug collision. */
const SLUG_ATTEMPTS = 5;

export default withApi(async (request, ctx) => {
	if (request.method !== "POST") return methodNotAllowed();
	const match = new URL(request.url).pathname.match(
		/^\/api\/rulesets\/(\d+)\/rotate-slug\/?$/,
	);
	const id = match ? Number(match[1]) : null;
	if (id === null || !Number.isSafeInteger(id) || id < 1) {
		return err(InvalidArgument("invalid id"));
	}

	for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
		const { data, error } = await ctx.supabaseAdmin
			.from("rule_sets")
			.update({ slug: generateSlug() })
			.eq("id", id)
			.is("deleted_at", null)
			.select("*, rule_set_items(*)")
			.is("rule_set_items.deleted_at", null)
			.order("id", { referencedTable: "rule_set_items", ascending: true });
		if (error) {
			if (error.code !== "23505") return err(new Error(error.message));
			continue;
		}
		const row = (data ?? [])[0];
		return row
			? ok(shapeRuleSet(row as RuleSetRow))
			: err(NotFound("rule set not found"));
	}
	return err(new Error("failed to allocate a unique rule set slug"));
});
