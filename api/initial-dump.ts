/**
 * GET /api/initial-dump — complete application state in one call: all active
 * subscriptions (with content) + all rules (newest first). Mirrors
 * internal/controller/initial_dump.go + service.InitialDump. The frontend calls
 * this once on entry and hydrates its store.
 */

import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	if (request.method !== "GET") return methodNotAllowed();
	const [subs, rules] = await Promise.all([
		ctx.supabaseAdmin
			.from("subscriptions")
			.select("*")
			.is("deleted_at", null)
			.order("id", { ascending: true }),
		ctx.supabaseAdmin
			.from("rules")
			.select("*")
			.order("id", { ascending: false }),
	]);
	if (subs.error) return err(new Error(subs.error.message));
	if (rules.error) return err(new Error(rules.error.message));
	return ok({ subscriptions: subs.data ?? [], rules: rules.data ?? [] });
});
