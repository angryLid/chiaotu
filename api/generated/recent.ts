/**
 * /api/generated/recent — recent-history listing.
 *   GET  the most recently generated results, newest first (default 5, clamped 1–20)
 * Used by the run-status panel to show a collapsible history of the last few
 * generated configs. Returns an empty array (not Err:NOT_FOUND) when nothing
 * has been generated yet.
 */

import { err, methodNotAllowed, ok } from "../_lib/envelope";
import { type ApiCtx, withApi } from "../_lib/with-api";

export const config = { runtime: "edge" };

/** Default page size when no `limit` query param is given. */
const DEFAULT_LIMIT = 5;
/** Hard bounds for the `limit` query param. */
const MIN_LIMIT = 1;
const MAX_LIMIT = 20;

export default withApi(async (request, ctx) => {
	switch (request.method) {
		case "GET":
			return recentGenerated(request, ctx);
		default:
			return methodNotAllowed();
	}
});

/** Parse the `limit` query param (default 5, clamped to 1–20). */
function parseLimit(request: Request): number {
	const raw = new URL(request.url).searchParams.get("limit");
	if (raw === null || raw === "") return DEFAULT_LIMIT;
	const n = Number(raw);
	if (!Number.isFinite(n)) return DEFAULT_LIMIT;
	return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(n)));
}

/** GET: the most recently generated results, newest first, up to `limit`. */
async function recentGenerated(
	request: Request,
	ctx: ApiCtx,
): Promise<Response> {
	const limit = parseLimit(request);
	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.select("*")
		.is("deleted_at", null)
		.order("created_at", { ascending: false })
		.limit(limit);
	if (error) return err(new Error(error.message));
	return ok(data ?? []);
}