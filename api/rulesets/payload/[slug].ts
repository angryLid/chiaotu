/**
 * GET /api/rulesets/payload/{slug} — the distribution endpoint.
 *
 * Auth: intentionally UNAUTHENTICATED. The slug is the capability itself — the
 * link is the secret — so it can be pasted straight into a `rule-providers`
 * entry with no token machinery, exactly like GET /api/generated/{name}.
 *
 * Response: the raw mihomo `classical` payload (one `TYPE,PAYLOAD` per line;
 * envelope exception — this is a file download). Not-found keeps the envelope.
 *
 * Security headers matter here because the body is user-authored text served
 * from the app's own origin: `text/plain` + `nosniff` stops a browser from
 * interpreting a crafted payload as HTML/JS under this origin.
 *
 * Caching: rule-provider refreshes poll on their own interval (mihomo sends
 * If-None-Match when ETag support is on), so a weak ETag plus a short
 * max-age keeps repeat polls off the database.
 */

import { err, methodNotAllowed } from "../../_lib/envelope";
import { InvalidArgument, NotFound } from "../../_lib/errors";
import { payloadETag, renderPayload } from "../../_lib/rule-sets";
import { type ApiCtx, withPublicCtx } from "../../_lib/with-api";

export const config = { runtime: "edge" };

/** How long a client may reuse the payload without revalidating. */
const MAX_AGE_SECONDS = 300;

async function handleGet(request: Request, ctx: ApiCtx): Promise<Response> {
	if (request.method !== "GET") return methodNotAllowed();

	const prefix = "/api/rulesets/payload/";
	const slug = new URL(request.url).pathname
		.slice(prefix.length)
		.replace(/^\/+|\/+$/g, "");
	// Slugs are lower-case alphanumerics; anything else cannot exist, so reject it
	// before touching the database.
	if (!/^[0-9a-z]{1,64}$/.test(slug)) {
		return err(InvalidArgument("invalid rule set slug"));
	}

	const { data, error } = await ctx.supabaseAdmin
		.from("rule_sets")
		.select("id, rule_set_items(type, payload, enabled)")
		.eq("slug", slug)
		.is("deleted_at", null)
		.is("rule_set_items.deleted_at", null)
		// Deterministic line order keeps the payload bytes — and thus the ETag —
		// stable for unchanged data, so a polling client gets its 304.
		.order("id", { referencedTable: "rule_set_items", ascending: true })
		.limit(1);
	if (error) return err(new Error(error.message));
	const row = (data ?? [])[0];
	if (!row) return err(NotFound("rule set not found"));

	const payload = renderPayload(row.rule_set_items ?? []);
	const etag = payloadETag(payload);
	const headers: Record<string, string> = {
		"Content-Type": "text/plain; charset=utf-8",
		"X-Content-Type-Options": "nosniff",
		"Cache-Control": `public, max-age=${MAX_AGE_SECONDS}`,
		ETag: etag,
	};
	if (request.headers.get("if-none-match") === etag) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(payload, { status: 200, headers });
}

export default withPublicCtx(handleGet);
