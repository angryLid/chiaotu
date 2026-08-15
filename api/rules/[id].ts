/**
 * /api/rules/{id} — item.
 *   GET    single rule
 *   PUT    fully replace name/filter
 *   DELETE hard-delete
 * Mirrors internal/controller/rules.go (ruleItem).
 */

import { withAuth } from "../_lib/auth";
import { err, methodNotAllowed, ok } from "../_lib/envelope";
import { InvalidArgument, NotFound } from "../_lib/errors";
import { idFromPath, readJson } from "../_lib/http";
import { eq, isNull, remove, select, update } from "../_lib/supabase";
import { MAX_RULE_SIZE, resolveRule } from "../_lib/validate";

export const config = { runtime: "edge" };

export default withAuth(async (request) => {
	const id = idFromPath(new URL(request.url).pathname, "/api/rules/");
	if (id === null) return err(InvalidArgument("invalid id"));

	switch (request.method) {
		case "GET":
			return getRule(id);
		case "PUT":
			return updateRule(request, id);
		case "DELETE":
			return deleteRule(id);
		default:
			return methodNotAllowed();
	}
});

/** GET: a single rule. */
async function getRule(id: number): Promise<Response> {
	try {
		const { data, error } = await select("rules", {
			select: "*",
			...eq("id", id),
		});
		if (error) return err(new Error(error.message));
		const rule = (data ?? [])[0];
		if (!rule) return err(NotFound("rule not found"));
		return ok(rule);
	} catch (e) {
		return err(e);
	}
}

/** PUT: fully replace the rule. */
async function updateRule(request: Request, id: number): Promise<Response> {
	try {
		const input = await readJson(request, MAX_RULE_SIZE);
		const { name, filter } = resolveRule({
			name: typeof input.name === "string" ? input.name : "",
			filter: input.filter,
		});
		// Re-validate subIds against existing subscriptions (mirrors Go, which
		// validates on write).
		const existingIds = await activeSubscriptionIds();
		if (existingIds === null)
			return err(new Error("failed to load subscriptions"));
		resolveRule({ name, filter, existingIds });

		const { data, error } = await update(
			"rules",
			{ ...eq("id", id) },
			{ name, filter: parseFilter(filter) },
		);
		if (error) {
			if (error.code === "23505")
				return err(InvalidArgument("rule name already exists"));
			return err(new Error(error.message));
		}
		const rule = (data ?? [])[0];
		if (!rule) return err(NotFound("rule not found"));
		return ok(rule);
	} catch (e) {
		return err(e);
	}
}

/** DELETE: hard-delete the rule. */
async function deleteRule(id: number): Promise<Response> {
	try {
		const resp = await remove("rules", { ...eq("id", id) });
		if (!resp.ok) {
			const body = (await resp.json().catch(() => null)) as {
				message?: string;
			} | null;
			return err(new Error(body?.message ?? `HTTP ${resp.status}`));
		}
		if (resp.status === 204) return err(NotFound("rule not found"));
		return ok(null);
	} catch (e) {
		return err(e);
	}
}

async function activeSubscriptionIds(): Promise<Set<string> | null> {
	const { data, error } = await select("subscriptions", {
		select: "id",
		...isNull("deleted_at"),
	});
	if (error) return null;
	return new Set((data ?? []).map((r) => String((r as { id: unknown }).id)));
}

function parseFilter(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
