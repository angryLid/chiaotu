/**
 * GET /healthz — health probe, mirroring friend-cats internal/controller/health.go.
 *
 * Authenticated via withAuth (Bearer token against API_TOKEN), so the frontend
 * auth page can validate a token by calling this endpoint. On success it probes
 * Supabase connectivity (parity with friend-cats service.Health) and returns the
 * unified envelope { status: "Ok", result: "ok" }; on failure it returns
 * Err:INTERNAL. A missing/invalid token yields Err:UNAUTHORIZED. HTTP stays 200.
 */

import { withAuth } from "./_lib/auth";
import { err, ok } from "./_lib/envelope";
import { ping } from "./_lib/supabase";

export const config = { runtime: "edge" };

export default withAuth(async () => {
	try {
		// DB-connectivity probe (parity with service.Health -> repo.Ping). The
		// PostgREST root 200s regardless of whether any application table exists.
		const { error } = await ping();
		if (error) return err(new Error("database unavailable"));
		return ok("ok");
	} catch (e) {
		return err(e);
	}
});
