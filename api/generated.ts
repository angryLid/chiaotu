/**
 * /api/generated — collection.
 *   GET  the generated result with the most recent creation time (Err:NOT_FOUND if none)
 *   POST store a new generated result (content produced by the frontend)
 * Mirrors internal/controller/generated.go (generatedCollection).
 */

import { MAX_CONTENT_SIZE } from "./_lib/constants";
import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { NotFound } from "./_lib/errors";
import { readJson } from "./_lib/http";
import { resolveGenerated } from "./_lib/validate";
import { type ApiCtx, withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	switch (request.method) {
		case "GET":
			return latestGenerated(ctx);
		case "POST":
			return createGenerated(request, ctx);
		default:
			return methodNotAllowed();
	}
});

/** GET: the most recently generated result (by creation time, newest first). */
async function latestGenerated(ctx: ApiCtx): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.select("*")
		.is("deleted_at", null)
		.order("created_at", { ascending: false })
		.limit(1);
	if (error) return err(new Error(error.message));
	const g = (data ?? [])[0];
	if (!g) return err(NotFound("no generated result yet"));
	return ok(g);
}

/** POST: store a new generated result (name + content, both non-empty). */
async function createGenerated(
	request: Request,
	ctx: ApiCtx,
): Promise<Response> {
	const input = await readJson(request, MAX_CONTENT_SIZE);
	const { name, content } = resolveGenerated({
		name: typeof input.name === "string" ? input.name : "",
		content: typeof input.content === "string" ? input.content : "",
	});
	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.insert({ name, content })
		.select();
	if (error) return err(new Error(error.message));
	return ok((data ?? [])[0] ?? null);
}
