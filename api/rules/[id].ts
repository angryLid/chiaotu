/**
 * /api/rules/{id} — item.
 *   GET    single rule
 *   PUT    fully replace name/filter
 *   DELETE hard-delete
 * Mirrors internal/controller/rules.go (ruleItem).
 */

import { err, methodNotAllowed, ok } from "~api/_lib/envelope";
import { InvalidArgument, NotFound } from "~api/_lib/errors";
import { idFromPath, readJson } from "~api/_lib/http";
import { MAX_RULE_SIZE, resolveRule } from "~api/_lib/validate";
import { type ApiCtx, withApi } from "~api/_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	const id = idFromPath(new URL(request.url).pathname, "/api/rules/");
	if (id === null) return err(InvalidArgument("invalid id"));

	switch (request.method) {
		case "GET":
			return getRule(ctx, id);
		case "PUT":
			return updateRule(request, ctx, id);
		case "DELETE":
			return deleteRule(ctx, id);
		default:
			return methodNotAllowed();
	}
});

/** GET: a single rule. */
async function getRule(ctx: ApiCtx, id: number): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("rules")
		.select("*")
		.eq("id", id)
		.is("deleted_at", null);
	if (error) return err(new Error(error.message));
	const rule = (data ?? [])[0];
	if (!rule) return err(NotFound("rule not found"));
	return ok(rule);
}

/** PUT: fully replace the rule. */
async function updateRule(
	request: Request,
	ctx: ApiCtx,
	id: number,
): Promise<Response> {
	const input = await readJson(request, MAX_RULE_SIZE);
	const { name, filter } = resolveRule({
		name: typeof input.name === "string" ? input.name : "",
		filter: input.filter,
	});
	// Re-validate subIds against existing subscriptions (mirrors Go, which
	// validates on write).
	const existingIds = await activeSubscriptionIds(ctx);
	if (existingIds === null)
		return err(new Error("failed to load subscriptions"));
	resolveRule({ name, filter, existingIds });

	const { data, error } = await ctx.supabaseAdmin
		.from("rules")
		.update({ name, filter: parseFilter(filter) })
		.eq("id", id)
		.is("deleted_at", null)
		.select();
	if (error) {
		if (error.code === "23505")
			return err(InvalidArgument("rule name already exists"));
		return err(new Error(error.message));
	}
	const rule = (data ?? [])[0];
	if (!rule) return err(NotFound("rule not found"));
	return ok(rule);
}

/** DELETE: soft-delete (mark deleted_at; excluded from all reads; mirrors repo.Delete). */
async function deleteRule(ctx: ApiCtx, id: number): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("rules")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id)
		.is("deleted_at", null)
		.select();
	if (error) return err(new Error(error.message));
	// An empty result means no active row matched — already deleted or absent.
	if ((data ?? []).length === 0) return err(NotFound("rule not found"));
	return ok(null);
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
