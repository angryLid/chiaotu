/**
 * /api/subscriptions/{id} — item.
 *   GET    full subscription (with content)
 *   PUT    fully replace name/url/content (url wins; fetch when present)
 *   DELETE soft-delete (mark deleted_at, excluded from all reads)
 * Mirrors internal/controller/subscriptions.go (subscriptionItem).
 */

import { MAX_CONTENT_SIZE } from "~api/_lib/constants";
import { err, methodNotAllowed, ok } from "~api/_lib/envelope";
import { InvalidArgument, NotFound } from "~api/_lib/errors";
import { fetchUrl } from "~api/_lib/fetch-url";
import { idFromPath, readJson } from "~api/_lib/http";
import { resolveSubscription } from "~api/_lib/validate";
import { type ApiCtx, withApi } from "~api/_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	const id = idFromPath(new URL(request.url).pathname, "/api/subscriptions/");
	if (id === null) return err(InvalidArgument("invalid id"));

	switch (request.method) {
		case "GET":
			return getSubscription(ctx, id);
		case "PUT":
			return updateSubscription(request, ctx, id);
		case "DELETE":
			return deleteSubscription(ctx, id);
		default:
			return methodNotAllowed();
	}
});

/** GET: the full subscription (with content). */
async function getSubscription(ctx: ApiCtx, id: number): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("subscriptions")
		.select("*")
		.eq("id", id)
		.is("deleted_at", null);
	if (error) return err(new Error(error.message));
	const sub = (data ?? [])[0];
	if (!sub) return err(NotFound("subscription not found"));
	return ok(sub);
}

/** PUT: fully replace the subscription (url wins when present). */
async function updateSubscription(
	request: Request,
	ctx: ApiCtx,
	id: number,
): Promise<Response> {
	const input = await readJson(request, MAX_CONTENT_SIZE);
	const resolved = await resolveSubscription(
		{
			name: asStr(input.name),
			url: asStr(input.url),
			content: asStr(input.content),
		},
		async (url) => (await fetchUrl(url)).content,
	);
	const { data, error } = await ctx.supabaseAdmin
		.from("subscriptions")
		.update({
			name: resolved.name,
			url: resolved.url,
			content: resolved.content,
		})
		.eq("id", id)
		.is("deleted_at", null)
		.select();
	if (error) return err(new Error(error.message));
	const sub = (data ?? [])[0];
	if (!sub) return err(NotFound("subscription not found"));
	return ok(sub);
}

/** DELETE: soft-delete (mark deleted_at; mirrors Go repo.Delete's tombstone update). */
async function deleteSubscription(ctx: ApiCtx, id: number): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("subscriptions")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id)
		.is("deleted_at", null)
		.select();
	if (error) return err(new Error(error.message));
	// An empty result means no active row matched — already deleted or absent.
	if ((data ?? []).length === 0) return err(NotFound("subscription not found"));
	return ok(null);
}

/** Coerce a JSON value to string ("" when absent). */
function asStr(v: unknown): string {
	return typeof v === "string" ? v : "";
}
