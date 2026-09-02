/** Vercel Cron: soft-delete unnamed generated artifacts whose updated_at is older than 3 days. */
import { methodNotAllowed, ok } from "../_lib/envelope";
import { type ApiCtx, withCron } from "../_lib/with-api";

export const config = { runtime: "edge" };

export default withCron(async (request, ctx) => {
	if (request.method !== "GET") return methodNotAllowed();
	return cleanupGenerated(ctx);
});

async function cleanupGenerated(ctx: ApiCtx): Promise<Response> {
	const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
	const { data, error } = await ctx.supabaseAdmin
		.from("generated")
		.update({ deleted_at: new Date().toISOString() })
		.is("deleted_at", null)
		.is("display_name", null)
		.lt("updated_at", cutoff)
		.select("id");
	if (error) throw new Error(error.message);
	return ok({ deleted: (data ?? []).length });
}
