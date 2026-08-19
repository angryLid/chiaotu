import { err, methodNotAllowed, ok } from "../../_lib/envelope";
import { InvalidArgument, NotFound } from "../../_lib/errors";
import { idFromPath, readJson } from "../../_lib/http";
import { type ApiCtx, withApi } from "../../_lib/with-api";
export const config = { runtime: "edge" };
export default withApi(async (request, ctx) => {
	const id = idFromPath(new URL(request.url).pathname, "/api/hosts/profiles/");
	if (id === null) return err(InvalidArgument("invalid id"));
	if (request.method === "GET") return get(ctx, id);
	if (request.method === "PUT") return update(request, ctx, id);
	if (request.method === "DELETE") return remove(ctx, id);
	return methodNotAllowed();
});
async function get(ctx: ApiCtx, id: number) {
	const { data, error } = await ctx.supabaseAdmin
		.from("hosts_profiles")
		.select("*, hosts_entries(*)")
		.eq("id", id)
		.is("deleted_at", null)
		.is("hosts_entries.deleted_at", null);
	if (error) return err(new Error(error.message));
	const row = (data ?? [])[0];
	return row
		? ok({ ...row, entries: row.hosts_entries ?? [] })
		: err(NotFound("Hosts profile not found"));
}
async function update(request: Request, ctx: ApiCtx, id: number) {
	const input = await readJson(request, 1000);
	const name = typeof input.name === "string" ? input.name.trim() : "";
	if (!name || name.length > 100)
		return err(InvalidArgument("invalid profile name"));
	const { data, error } = await ctx.supabaseAdmin
		.from("hosts_profiles")
		.update({ name })
		.eq("id", id)
		.is("deleted_at", null)
		.select()
		.single();
	if (error)
		return error.code === "23505"
			? err(InvalidArgument("Hosts profile name already exists"))
			: err(new Error(error.message));
	return data
		? ok({ ...data, entries: [] })
		: err(NotFound("Hosts profile not found"));
}
async function remove(ctx: ApiCtx, id: number) {
	const { data, error } = await ctx.supabaseAdmin.rpc(
		"soft_delete_hosts_profile",
		{ p_profile_id: id },
	);
	if (error) return err(new Error(error.message));
	if (data !== true) return err(NotFound("Hosts profile not found"));
	return ok(null);
}
