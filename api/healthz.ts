/**
 * GET /healthz — health probe, mirroring friend-cats internal/controller/health.go.
 *
 * Authenticated via withApi (Bearer token against API_TOKEN), so the frontend
 * auth page can validate a token by calling this endpoint. On success it probes
 * Supabase connectivity (parity with friend-cats service.Health) and returns the
 * unified envelope { status: "Ok", result: "ok" }; on failure it returns
 * Err:INTERNAL. A missing/invalid token yields Err:UNAUTHORIZED. HTTP stays 200.
 */

import { err, ok } from "./_lib/envelope";
import { withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (_request, ctx) => {
	// DB-connectivity probe (parity with service.Health -> repo.Ping). A tiny
	// read on the app's core table verifies the data path end to end.
	const { error } = await ctx.supabaseAdmin
		.from("subscriptions")
		.select("id")
		.limit(1);
	if (error) return err(new Error("database unavailable"));
	return ok("ok");
});
