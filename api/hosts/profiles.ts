import { err, methodNotAllowed, ok } from "~api/_lib/envelope";
import { InvalidArgument } from "~api/_lib/errors";
import { readJson } from "~api/_lib/http";
import { type ApiCtx, withApi } from "~api/_lib/with-api";

export const config = { runtime: "edge" };
const PROFILE_LIMIT = 100;

export default withApi(async (request, ctx) => {
	if (request.method === "GET") return list(ctx);
	if (request.method === "POST") return create(request, ctx);
	return methodNotAllowed();
});
async function list(ctx: ApiCtx): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("hosts_profiles")
		.select("*, hosts_entries(*)")
		.is("deleted_at", null)
		.is("hosts_entries.deleted_at", null)
		.order("id", { ascending: false });
	if (error) return err(new Error(error.message));
	return ok(
		(data ?? []).map((profile) => ({
			...profile,
			entries: profile.hosts_entries ?? [],
		})),
	);
}
async function create(request: Request, ctx: ApiCtx): Promise<Response> {
	const input = await readJson(request, PROFILE_LIMIT);
	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (name === "" || name.length > PROFILE_LIMIT)
		return err(
			InvalidArgument(
				"profile name is required and must be at most 100 characters",
			),
		);
	const { data, error } = await ctx.supabaseAdmin
		.from("hosts_profiles")
		.insert({ name })
		.select()
		.single();
	if (error)
		return error.code === "23505"
			? err(InvalidArgument("Hosts profile name already exists"))
			: err(new Error(error.message));
	return ok({ ...data, entries: [] });
}
