/**
 * /api/subscriptions — collection.
 *   GET  list subscription summaries (no content)
 *   POST create a subscription (with a url, fetch and store content; url wins)
 * Mirrors internal/controller/subscriptions.go (subscriptionsCollection).
 */

import { MAX_CONTENT_SIZE } from "./_lib/constants";
import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { LimitExceeded } from "./_lib/errors";
import { fetchUrl } from "./_lib/fetch-url";
import { readJson } from "./_lib/http";
import { MAX_SUBSCRIPTIONS, resolveSubscription } from "./_lib/validate";
import { type ApiCtx, withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	switch (request.method) {
		case "GET":
			return listSubscriptions(ctx);
		case "POST":
			return createSubscription(request, ctx);
		default:
			return methodNotAllowed();
	}
});

/** GET: list subscription summaries (no content), ordered by id asc. */
async function listSubscriptions(ctx: ApiCtx): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("subscriptions")
		.select("id,name,url,created_at,updated_at")
		.is("deleted_at", null)
		.order("id", { ascending: true });
	if (error) return err(new Error(error.message));
	return ok(data ?? []);
}

/** POST: create a subscription (url wins; fetch content when url is present). */
async function createSubscription(
	request: Request,
	ctx: ApiCtx,
): Promise<Response> {
	const input = await readJson(request, MAX_CONTENT_SIZE);
	// Enforce the 10-subscription cap before any url fetch (mirrors service.CreateSubscription).
	const { data: countRows, error: countErr } = await ctx.supabaseAdmin
		.from("subscriptions")
		.select("id")
		.is("deleted_at", null);
	if (countErr) return err(new Error(countErr.message));
	if ((countRows ?? []).length >= MAX_SUBSCRIPTIONS) {
		return err(
			LimitExceeded(
				`subscription limit reached: at most ${MAX_SUBSCRIPTIONS} subscriptions`,
			),
		);
	}

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
		.insert({
			name: resolved.name,
			url: resolved.url,
			content: resolved.content,
		})
		.select();
	if (error) return err(new Error(error.message));
	return ok((data ?? [])[0] ?? null);
}

/** Coerce a JSON value to string ("" when absent). */
function asStr(v: unknown): string {
	return typeof v === "string" ? v : "";
}
