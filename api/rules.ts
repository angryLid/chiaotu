/**
 * /api/rules — collection.
 *   GET  list all rules (newest first)
 *   POST create a rule (name required+unique; filter validated, subIds must exist)
 * Mirrors internal/controller/rules.go (rulesCollection).
 *
 * rule.filter is stored as jsonb. On read, PostgREST returns it as a JSON value;
 * we echo it back as-is (the frontend zod guarantees its shape).
 */

import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { InvalidArgument } from "./_lib/errors";
import { readJson } from "./_lib/http";
import { MAX_RULE_SIZE, resolveRule } from "./_lib/validate";
import { type ApiCtx, withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	switch (request.method) {
		case "GET":
			return listRules(ctx);
		case "POST":
			return createRule(request, ctx);
		default:
			return methodNotAllowed();
	}
});

/** GET: list all rules, newest first. */
async function listRules(ctx: ApiCtx): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("rules")
		.select("*")
		.is("deleted_at", null)
		.order("id", { ascending: false });
	if (error) return err(new Error(error.message));
	return ok(data ?? []);
}

/** POST: create a rule. */
async function createRule(request: Request, ctx: ApiCtx): Promise<Response> {
	const input = await readJson(request, MAX_RULE_SIZE);
	const existingIds = await activeSubscriptionIds(ctx);
	if (existingIds === null)
		return err(new Error("failed to load subscriptions"));
	const { name, filter } = resolveRule({
		name: typeof input.name === "string" ? input.name : "",
		filter: input.filter,
		existingIds,
	});
	const { data, error } = await ctx.supabaseAdmin
		.from("rules")
		.insert({ name, filter: parseFilter(filter) })
		.select();
	if (error) {
		// UNIQUE constraint violation on name -> INVALID_ARGUMENT (mirrors Go ruleWriteError).
		if (error.code === "23505")
			return err(InvalidArgument("rule name already exists"));
		return err(new Error(error.message));
	}
	return ok((data ?? [])[0] ?? null);
}

/** Load the set of active subscription ids (as strings) for subIds validation. */
async function activeSubscriptionIds(ctx: ApiCtx): Promise<Set<string> | null> {
	const { data, error } = await ctx.supabaseAdmin
		.from("subscriptions")
		.select("id")
		.is("deleted_at", null);
	if (error) return null;
	return new Set((data ?? []).map((r) => String(r.id)));
}

/** Convert a raw filter JSON string into a jsonb value for PostgREST. */
function parseFilter(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
