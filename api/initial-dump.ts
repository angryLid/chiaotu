/**
 * GET /api/initial-dump — complete application state in one call: all active
 * subscriptions (with content) + all rules (newest first). Mirrors
 * internal/controller/initial_dump.go + service.InitialDump. The frontend calls
 * this once on entry and hydrates its store.
 */

import { withAuth } from "./_lib/auth";
import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { isNull, order, select } from "./_lib/supabase";

export const config = { runtime: "edge" };

export default withAuth(async (request) => {
	if (request.method !== "GET") return methodNotAllowed();
	try {
		const [subs, rules] = await Promise.all([
			select("subscriptions", {
				select: "*",
				...isNull("deleted_at"),
				...order("id", "asc"),
			}),
			select("rules", { select: "*", ...order("id", "desc") }),
		]);
		if (subs.error) return err(new Error(subs.error.message));
		if (rules.error) return err(new Error(rules.error.message));
		return ok({ subscriptions: subs.data ?? [], rules: rules.data ?? [] });
	} catch (e) {
		return err(e);
	}
});
