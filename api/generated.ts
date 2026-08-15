/**
 * /api/generated — collection.
 *   GET  the generated result with the most recent creation time (Err:NOT_FOUND if none)
 *   POST store a new generated result (content produced by the frontend)
 * Mirrors internal/controller/generated.go (generatedCollection).
 */

import { withAuth } from "./_lib/auth";
import { MAX_CONTENT_SIZE } from "./_lib/constants";
import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { NotFound } from "./_lib/errors";
import { readJson } from "./_lib/http";
import { insert, isNull, limit, order, select } from "./_lib/supabase";
import { resolveGenerated } from "./_lib/validate";

export const config = { runtime: "edge" };

export default withAuth(async (request) => {
	switch (request.method) {
		case "GET":
			return latestGenerated();
		case "POST":
			return createGenerated(request);
		default:
			return methodNotAllowed();
	}
});

/** GET: the most recently generated result (by creation time, newest first). */
async function latestGenerated(): Promise<Response> {
	try {
		const { data, error } = await select("generated", {
			select: "*",
			...isNull("deleted_at"),
			...order("created_at", "desc"),
			...limit(1),
		});
		if (error) return err(new Error(error.message));
		const g = (data ?? [])[0];
		if (!g) return err(NotFound("no generated result yet"));
		return ok(g);
	} catch (e) {
		return err(e);
	}
}

/** POST: store a new generated result (name + content, both non-empty). */
async function createGenerated(request: Request): Promise<Response> {
	try {
		const input = await readJson(request, MAX_CONTENT_SIZE);
		const { name, content } = resolveGenerated({
			name: typeof input.name === "string" ? input.name : "",
			content: typeof input.content === "string" ? input.content : "",
		});
		const { data, error } = await insert("generated", { name, content });
		if (error) return err(new Error(error.message));
		return ok((data ?? [])[0] ?? null);
	} catch (e) {
		return err(e);
	}
}
