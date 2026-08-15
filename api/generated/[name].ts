/**
 * GET /api/generated/{name} — fetch a generated result by its name as raw
 * YAML. When the request User-Agent contains "clash" (case-insensitive), the
 * response carries Content-Disposition: attachment with the result filename;
 * other clients get the YAML inline without a filename.
 *
 * Auth: intentionally UNAUTHENTICATED. The name (a frontend-chosen nanoid) is
 * the capability itself — the link is the secret, so it can be pasted into a
 * browser or a clash client as a subscription URL with no token machinery.
 * Do not wrap this handler in withAuth.
 *
 * Response: on success the body is the raw YAML content (envelope exception —
 * this is a file download, not a JSON envelope); not-found and errors keep the
 * envelope (Err:NOT_FOUND).
 */

import { err, methodNotAllowed } from "../_lib/envelope";
import { InvalidArgument, NotFound } from "../_lib/errors";
import { eq, isNull, limit, order, select } from "../_lib/supabase";

/** The generated-row fields the download needs (name for the filename, content for the body). */
interface GeneratedRow {
	name: string;
	content: string;
}

export const config = { runtime: "edge" };

export default async (request: Request): Promise<Response> => {
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

	try {
		const { data, error } = await select<GeneratedRow>("generated", {
			select: "*",
			...eq("name", name),
			...isNull("deleted_at"),
			...order("created_at", "desc"),
			...limit(1),
		});
		if (error) return err(new Error(error.message));
		const g = (data ?? [])[0];
		if (!g) return err(NotFound("generated result not found"));
		const headers: Record<string, string> = {
			"Content-Type": "text/yaml; charset=utf-8",
		};
		if (isClashClient) {
			headers["Content-Disposition"] = `attachment; filename="${g.name}.yaml"`;
		}
		return new Response(g.content, { status: 200, headers });
	} catch (e) {
		return err(e);
	}
};
