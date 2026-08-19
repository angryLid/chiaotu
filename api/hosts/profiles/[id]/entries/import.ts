import { err, methodNotAllowed, ok } from "../../../../_lib/envelope";
import { InvalidArgument, NotFound } from "../../../../_lib/errors";
import { readJson } from "../../../../_lib/http";
import { withApi } from "../../../../_lib/with-api";

const IPV4 = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function domain(value: string) {
	const v = value.trim().toLowerCase().replace(/\.+$/, "");
	if (
		!v ||
		v.length > 253 ||
		/^\d+(?:\.\d+){3}$/.test(v) ||
		!v.split(".").every((x) => LABEL.test(x))
	)
		return null;
	return v;
}
function ip(value: string) {
	if (value === "") return "";
	if (!IPV4.test(value)) return null;
	const p = value.split(".");
	return p.every((x) => Number(x) <= 255) ? value : null;
}
export const config = { runtime: "edge" };
export default withApi(async (request, ctx) => {
	if (request.method !== "POST") return methodNotAllowed();
	const match = new URL(request.url).pathname.match(
		/^\/api\/hosts\/profiles\/(\d+)\/entries\/import\/?$/,
	);
	const id = match ? Number(match[1]) : null;
	if (id === null || !Number.isSafeInteger(id) || id < 1)
		return err(InvalidArgument("invalid id"));
	const input = await readJson(request, 200_000);
	const raw = input.entries;
	if (!Array.isArray(raw) || raw.length > 50)
		return err(InvalidArgument("at most 50 entries are allowed"));
	const profile = await ctx.supabaseAdmin
		.from("hosts_profiles")
		.select("id")
		.eq("id", id)
		.is("deleted_at", null)
		.maybeSingle();
	if (profile.error) return err(new Error(profile.error.message));
	if (!profile.data) return err(NotFound("Hosts profile not found"));
	const entries = new Map<string, { domain: string; ip: string }>();
	for (const item of raw) {
		if (item === null || typeof item !== "object" || Array.isArray(item))
			return err(InvalidArgument("invalid entry"));
		const obj = item as Record<string, unknown>;
		const d = typeof obj.domain === "string" ? domain(obj.domain) : null;
		const value = typeof obj.ip === "string" ? ip(obj.ip) : null;
		if (!d || value === null)
			return err(InvalidArgument("invalid Hosts entry"));
		entries.set(d, { domain: d, ip: value });
	}
	for (const entry of entries.values()) {
		const existing = await ctx.supabaseAdmin
			.from("hosts_entries")
			.select("id, ip, enabled, deleted_at")
			.eq("profile_id", id)
			.eq("domain", entry.domain)
			.maybeSingle();
		if (existing.error) return err(new Error(existing.error.message));
		if (existing.data) {
			const nextIp = entry.ip !== "" ? entry.ip : (existing.data.ip ?? "");
			const result = await ctx.supabaseAdmin
				.from("hosts_entries")
				.update({ ip: nextIp, deleted_at: null })
				.eq("id", existing.data.id)
				.select()
				.single();
			if (result.error) return err(new Error(result.error.message));
		} else {
			const result = await ctx.supabaseAdmin
				.from("hosts_entries")
				.insert({
					profile_id: id,
					domain: entry.domain,
					ip: entry.ip,
					enabled: true,
				})
				.select()
				.single();
			if (result.error) return err(new Error(result.error.message));
		}
	}
	const result = await ctx.supabaseAdmin
		.from("hosts_entries")
		.select("*")
		.eq("profile_id", id)
		.is("deleted_at", null)
		.order("id", { ascending: true });
	if (result.error) return err(new Error(result.error.message));
	return ok(result.data ?? []);
});
