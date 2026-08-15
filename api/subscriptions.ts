/**
 * /api/subscriptions — collection.
 *   GET  list subscription summaries (no content)
 *   POST create a subscription (with a url, fetch and store content; url wins)
 * Mirrors internal/controller/subscriptions.go (subscriptionsCollection).
 */

import { withAuth } from "./_lib/auth";
import { MAX_CONTENT_SIZE } from "./_lib/constants";
import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { LimitExceeded } from "./_lib/errors";
import { fetchUrl } from "./_lib/fetch-url";
import { readJson } from "./_lib/http";
import { insert, isNull, order, select } from "./_lib/supabase";
import { MAX_SUBSCRIPTIONS, resolveSubscription } from "./_lib/validate";

export const config = { runtime: "edge" };

export default withAuth(async (request) => {
	switch (request.method) {
		case "GET":
			return listSubscriptions();
		case "POST":
			return createSubscription(request);
		default:
			return methodNotAllowed();
	}
});

/** GET: list subscription summaries (no content), ordered by id asc. */
async function listSubscriptions(): Promise<Response> {
	try {
		const { data, error } = await select("subscriptions", {
			select: "id,name,url,created_at,updated_at",
			...isNull("deleted_at"),
			...order("id", "asc"),
		});
		if (error) return err(new Error(error.message));
		return ok(data ?? []);
	} catch (e) {
		return err(e);
	}
}

/** POST: create a subscription (url wins; fetch content when url is present). */
async function createSubscription(request: Request): Promise<Response> {
	try {
		const input = await readJson(request, MAX_CONTENT_SIZE);
		// Enforce the 10-subscription cap before any url fetch (mirrors service.CreateSubscription).
		const { data: countRows, error: countErr } = await select("subscriptions", {
			select: "id",
			...isNull("deleted_at"),
		});
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

		const { data, error } = await insert("subscriptions", {
			name: resolved.name,
			url: resolved.url,
			content: resolved.content,
		});
		if (error) return err(new Error(error.message));
		return ok((data ?? [])[0] ?? null);
	} catch (e) {
		return err(e);
	}
}

/** Coerce a JSON value to string ("" when absent). */
function asStr(v: unknown): string {
	return typeof v === "string" ? v : "";
}
