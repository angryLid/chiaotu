/**
 * /api/generated/recent — paged generated-history listing.
 *   GET  a page of generated results, newest modified first (10 per page)
 * Used by the run-status panel to show a paged history of generated configs.
 * Returns an empty page (not Err:NOT_FOUND) when nothing has been generated yet.
 */

import { err, methodNotAllowed, ok } from "../_lib/envelope";
import { type ApiCtx, withApi } from "../_lib/with-api";

export const config = { runtime: "edge" };

/** Fixed page size for the generated-history listing. */
const PAGE_SIZE = 10;
/** Default 1-based page number when no `page` query param is given. */
const DEFAULT_PAGE = 1;

export default withApi(async (request, ctx) => {
	switch (request.method) {
		case "GET":
			return recentGenerated(request, ctx);
		default:
			return methodNotAllowed();
	}
});

/** Parse the `page` query param (default 1, clamped to >= 1). */
function parsePage(request: Request): number {
	const raw = new URL(request.url).searchParams.get("page");
	if (raw === null || raw === "") return DEFAULT_PAGE;
	const n = Number(raw);
	if (!Number.isFinite(n)) return DEFAULT_PAGE;
	return Math.max(DEFAULT_PAGE, Math.trunc(n));
}

/** GET: one page of generated results, newest modified first. */
async function recentGenerated(
	request: Request,
	ctx: ApiCtx,
): Promise<Response> {
	const page = parsePage(request);

	const { count, error: countError } = await ctx.supabaseAdmin
		.from("generated")
		.select("id", { count: "exact", head: true })
		.is("deleted_at", null);
	if (countError) return err(new Error(countError.message));

	const total = count ?? 0;
	const totalPages = Math.ceil(total / PAGE_SIZE);
	const pageNumber = totalPages === 0 ? 0 : Math.min(page, totalPages);
	const fromClamped = totalPages === 0 ? 0 : (pageNumber - 1) * PAGE_SIZE;

	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.select("*")
		.is("deleted_at", null)
		.order("updated_at", { ascending: false })
		.range(fromClamped, fromClamped + PAGE_SIZE - 1);
	if (error) return err(new Error(error.message));

	return ok({
		items: data ?? [],
		page: pageNumber,
		page_size: PAGE_SIZE,
		total,
		total_pages: totalPages,
	});
}
