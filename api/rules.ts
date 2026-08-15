/**
 * /api/rules — collection.
 *   GET  list all rules (newest first)
 *   POST create a rule (name required+unique; filter validated, subIds must exist)
 * Mirrors internal/controller/rules.go (rulesCollection).
 *
 * rule.filter is stored as jsonb. On read, PostgREST returns it as a JSON value;
 * we echo it back as-is (the frontend zod guarantees its shape).
 */

import { withAuth } from "./_lib/auth";
import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { InvalidArgument } from "./_lib/errors";
import { readJson } from "./_lib/http";
import { insert, isNull, order, select } from "./_lib/supabase";
import { MAX_RULE_SIZE, resolveRule } from "./_lib/validate";

export const config = { runtime: "edge" };

export default withAuth(async (request) => {
	switch (request.method) {
		case "GET":
			return listRules();
		case "POST":
			return createRule(request);
		default:
			return methodNotAllowed();
	}
});

/** GET: list all rules, newest first. */
async function listRules(): Promise<Response> {
	try {
		const { data, error } = await select("rules", {
			select: "*",
			...order("id", "desc"),
		});
		if (error) return err(new Error(error.message));
		return ok(data ?? []);
	} catch (e) {
		return err(e);
	}
}

/** POST: create a rule. */
async function createRule(request: Request): Promise<Response> {
	try {
		const input = await readJson(request, MAX_RULE_SIZE);
		const existingIds = await activeSubscriptionIds();
		if (existingIds === null)
			return err(new Error("failed to load subscriptions"));
		const { name, filter } = resolveRule({
			name: typeof input.name === "string" ? input.name : "",
			filter: input.filter,
			existingIds,
		});
		const { data, error } = await insert("rules", {
			name,
			filter: parseFilter(filter),
		});
		if (error) {
			// UNIQUE constraint violation on name -> INVALID_ARGUMENT (mirrors Go ruleWriteError).
			if (error.code === "23505")
				return err(InvalidArgument("rule name already exists"));
			return err(new Error(error.message));
		}
		return ok((data ?? [])[0] ?? null);
	} catch (e) {
		return err(e);
	}
}

/** Load the set of active subscription ids (as strings) for subIds validation. */
async function activeSubscriptionIds(): Promise<Set<string> | null> {
	const { data, error } = await select("subscriptions", {
		select: "id",
		...isNull("deleted_at"),
	});
	if (error) return null;
	return new Set((data ?? []).map((r) => String((r as { id: unknown }).id)));
}

/** Convert a raw filter JSON string into a jsonb value for PostgREST. */
function parseFilter(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
