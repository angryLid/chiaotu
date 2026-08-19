/**
 * GET /api/generated/{name} — fetch a generated result by its name as raw
 * YAML. When the request User-Agent contains "clash" (case-insensitive), the
 * response carries Content-Disposition: attachment with the result filename;
 * other clients get the YAML inline without a filename.
 *
 * Auth: intentionally UNAUTHENTICATED. The name (a frontend-chosen nanoid) is
 * the capability itself — the link is the secret, so it can be pasted into a
 * browser or a clash client as a subscription URL with no token machinery.
 * GET is public; PUT uses the normal API_TOKEN-protected wrapper.
 *
 * Response: on success the body is the raw YAML content (envelope exception —
 * this is a file download, not a JSON envelope); not-found and errors keep the
 * envelope (Err:NOT_FOUND).
 */

import { MAX_CONTENT_SIZE } from "~api/_lib/constants";
import { err, methodNotAllowed, ok } from "~api/_lib/envelope";
import { InvalidArgument, NotFound } from "~api/_lib/errors";
import { readJson } from "~api/_lib/http";
import { normalizeDisplayName } from "~api/_lib/validate";
import { type ApiCtx, withApi, withPublicCtx } from "~api/_lib/with-api";

export const config = { runtime: "edge" };

async function handleGet(request: Request, ctx: ApiCtx): Promise<Response> {
	if (request.method !== "GET") return methodNotAllowed();

	// name is everything after /api/generated/ (no trailing slash, no sub-paths).
	const prefix = "/api/generated/";
	const name = new URL(request.url).pathname
		.slice(prefix.length)
		.replace(/^\/+|\/+$/g, "");
	if (name === "" || name.includes("/")) {
		return err(InvalidArgument("invalid generated name"));
	}

	// UA check: clash-family clients identify via a User-Agent containing
	// "clash" (case-insensitive) and need the filename to save the config;
	// everyone else gets the YAML inline without a filename attachment.
	const isClashClient = (request.headers.get("user-agent") ?? "")
		.toLowerCase()
		.includes("clash");

	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.select("*")
		.eq("name", name)
		.is("deleted_at", null)
		.order("created_at", { ascending: false })
		.limit(1);
	if (error) return err(new Error(error.message));
	const g = (data ?? [])[0];
	if (!g) return err(NotFound("generated result not found"));
	const headers: Record<string, string> = {
		"Content-Type": "text/yaml; charset=utf-8",
	};
	if (isClashClient) {
		const filename = (g.display_name ?? g.name).replace(/[\\"\r\n]/g, "_");
		headers["Content-Disposition"] = `attachment; filename="${filename}.yaml"`;
	}
	return new Response(g.content, { status: 200, headers });
}

async function handleUpdate(request: Request, ctx: ApiCtx): Promise<Response> {
	if (request.method !== "PUT") return methodNotAllowed();
	const input = await readJson(request, MAX_CONTENT_SIZE);
	const hasContent = typeof input.content === "string";
	const hasDisplayName =
		typeof input.display_name === "string" || input.display_name === null;
	if (!hasContent && !hasDisplayName)
		return err(InvalidArgument("at least one field must be provided"));
	if (hasContent && input.content.trim() === "")
		return err(InvalidArgument("generated content must not be empty"));
	const name = new URL(request.url).pathname
		.slice("/api/generated/".length)
		.replace(/^\/+|\/+$/g, "");
	if (name === "" || name.includes("/"))
		return err(InvalidArgument("invalid generated name"));
	const patch: { content?: string; display_name?: string | null } = {};
	if (hasContent) patch.content = input.content;
	if (hasDisplayName)
		patch.display_name = normalizeDisplayName(input.display_name);
	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.update(patch)
		.eq("name", name)
		.is("deleted_at", null)
		.select()
		.limit(1);
	if (error) return err(new Error(error.message));
	const updated = (data ?? [])[0];
	if (!updated) return err(NotFound("generated result not found"));
	return ok(updated);
}

export default async function generatedItem(
	request: Request,
): Promise<Response> {
	if (request.method === "GET") return withPublicCtx(handleGet)(request);
	return withApi(handleUpdate)(request);
}
