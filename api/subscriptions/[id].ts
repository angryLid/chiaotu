/**
 * /api/subscriptions/{id} — item.
 *   GET    full subscription (with content)
 *   PUT    fully replace name/url/content (url wins; fetch when present)
 *   DELETE soft-delete (mark deleted_at, excluded from all reads)
 * Mirrors internal/controller/subscriptions.go (subscriptionItem).
 */

import { withAuth } from "../_lib/auth";
import { MAX_CONTENT_SIZE } from "../_lib/constants";
import { err, methodNotAllowed, ok } from "../_lib/envelope";
import { InvalidArgument, NotFound } from "../_lib/errors";
import { fetchUrl } from "../_lib/fetch-url";
import { idFromPath, readJson } from "../_lib/http";
import { eq, isNull, remove, select, update } from "../_lib/supabase";
import { resolveSubscription } from "../_lib/validate";

export const config = { runtime: "edge" };

export default withAuth(async (request) => {
	const id = idFromPath(new URL(request.url).pathname, "/api/subscriptions/");
	if (id === null) return err(InvalidArgument("invalid id"));

	switch (request.method) {
		case "GET":
			return getSubscription(id);
		case "PUT":
			return updateSubscription(request, id);
		case "DELETE":
			return deleteSubscription(id);
		default:
			return methodNotAllowed();
	}
});

/** GET: the full subscription (with content). */
async function getSubscription(id: number): Promise<Response> {
	try {
		const { data, error } = await select("subscriptions", {
			select: "*",
			...eq("id", id),
			...isNull("deleted_at"),
		});
		if (error) return err(new Error(error.message));
		const sub = (data ?? [])[0];
		if (!sub) return err(NotFound("subscription not found"));
		return ok(sub);
	} catch (e) {
		return err(e);
	}
}

/** PUT: fully replace the subscription (url wins when present). */
async function updateSubscription(
	request: Request,
	id: number,
): Promise<Response> {
	try {
		const input = await readJson(request, MAX_CONTENT_SIZE);
		const resolved = await resolveSubscription(
			{
				name: asStr(input.name),
				url: asStr(input.url),
				content: asStr(input.content),
			},
			async (url) => (await fetchUrl(url)).content,
		);
		const { data, error } = await update(
			"subscriptions",
			{ ...eq("id", id), ...isNull("deleted_at") },
			{ name: resolved.name, url: resolved.url, content: resolved.content },
		);
		if (error) return err(new Error(error.message));
		const sub = (data ?? [])[0];
		if (!sub) return err(NotFound("subscription not found"));
		return ok(sub);
	} catch (e) {
		return err(e);
	}
}

/** DELETE: soft-delete (set deleted_at). */
async function deleteSubscription(id: number): Promise<Response> {
	try {
		const resp = await remove("subscriptions", {
			...eq("id", id),
			...isNull("deleted_at"),
		});
		// PostgREST delete returns 204 (no rows) or 200 with the deleted rows.
		if (!resp.ok) {
			const body = (await resp.json().catch(() => null)) as {
				message?: string;
			} | null;
			return err(new Error(body?.message ?? `HTTP ${resp.status}`));
		}
		// 204 -> nothing matched -> not found.
		if (resp.status === 204) return err(NotFound("subscription not found"));
		return ok(null);
	} catch (e) {
		return err(e);
	}
}

function asStr(v: unknown): string {
	return typeof v === "string" ? v : "";
}
