import { err, methodNotAllowed, ok } from "../../../../../_lib/envelope";
import { InvalidArgument, NotFound } from "../../../../../_lib/errors";
import { readJson } from "../../../../../_lib/http";
import { withApi } from "../../../../../_lib/with-api";
export const config = { runtime: "edge" };
export default withApi(async (request, ctx) => {
	const parts = new URL(request.url).pathname.split("/");
	const id = Number(parts.at(-3));
	const entryId = Number(parts.at(-1));
	if (
		!Number.isInteger(id) ||
		!Number.isInteger(entryId) ||
		id < 1 ||
		entryId < 1
	)
		return err(InvalidArgument("invalid id"));
	if (request.method === "PUT") {
		const input = await readJson(request, 10000);
		if (
			typeof input.domain !== "string" ||
			typeof input.ip !== "string" ||
			typeof input.enabled !== "boolean"
		)
			return err(InvalidArgument("invalid Hosts entry"));
		const domain = input.domain.trim().toLowerCase().replace(/\.+$/, "");
		if (
			!domain ||
			(input.ip !== "" &&
				!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(input.ip))
		)
			return err(InvalidArgument("invalid Hosts entry"));
		const result = await ctx.supabaseAdmin
			.from("hosts_entries")
			.update({ domain, ip: input.ip, enabled: input.enabled })
			.eq("id", entryId)
			.eq("profile_id", id)
			.is("deleted_at", null)
			.select()
			.single();
		if (result.error)
			return result.error.code === "23505"
				? err(InvalidArgument("domain already exists in profile"))
				: err(new Error(result.error.message));
		return result.data
			? ok(result.data)
			: err(NotFound("Hosts entry not found"));
	}
	if (request.method === "DELETE") {
		const result = await ctx.supabaseAdmin
			.from("hosts_entries")
			.update({ deleted_at: new Date().toISOString() })
			.eq("id", entryId)
			.eq("profile_id", id)
			.is("deleted_at", null)
			.select();
		if (result.error) return err(new Error(result.error.message));
		return result.data?.length
			? ok(null)
			: err(NotFound("Hosts entry not found"));
	}
	return methodNotAllowed();
});
