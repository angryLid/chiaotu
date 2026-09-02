/**
 * /api/rulesets/{id}/items/{itemId} — one matcher.
 *   PUT    toggle `enabled`
 *   DELETE soft-delete the matcher
 *
 * type / payload are immutable: they are the item's identity (the partial unique
 * index covers them), and editing them in place would silently change what a
 * distributed payload matches. Changing a matcher means deleting it and
 * importing the replacement.
 */

import { err, methodNotAllowed, ok } from "../../../_lib/envelope";
import { InvalidArgument, NotFound } from "../../../_lib/errors";
import { readJson } from "../../../_lib/http";
import { type ApiCtx, withApi } from "../../../_lib/with-api";

export const config = { runtime: "edge" };

/** Request bodies here are a single boolean. */
const MAX_BODY = 1000;

export default withApi(async (request, ctx) => {
	const match = new URL(request.url).pathname.match(
		/^\/api\/rulesets\/(\d+)\/items\/(\d+)\/?$/,
	);
	if (!match) return err(InvalidArgument("invalid id"));
	const id = Number(match[1]);
	const itemId = Number(match[2]);
	if (!Number.isSafeInteger(id) || !Number.isSafeInteger(itemId)) {
		return err(InvalidArgument("invalid id"));
	}

	switch (request.method) {
		case "PUT":
			return updateItem(request, ctx, id, itemId);
		case "DELETE":
			return deleteItem(ctx, id, itemId);
		default:
			return methodNotAllowed();
	}
});

/** PUT: toggle the matcher's enabled flag. */
async function updateItem(
	request: Request,
	ctx: ApiCtx,
	id: number,
	itemId: number,
): Promise<Response> {
	const input = await readJson(request, MAX_BODY);
	if (typeof input.enabled !== "boolean") {
		return err(InvalidArgument("enabled must be a boolean"));
	}
	const { data, error } = await ctx.supabaseAdmin
		.from("rule_set_items")
		.update({ enabled: input.enabled })
		.eq("id", itemId)
		.eq("rule_set_id", id)
		.is("deleted_at", null)
		.select();
	if (error) return err(new Error(error.message));
	const row = (data ?? [])[0];
	return row ? ok(row) : err(NotFound("rule set item not found"));
}

/** DELETE: soft-delete the matcher. */
async function deleteItem(
	ctx: ApiCtx,
	id: number,
	itemId: number,
): Promise<Response> {
	const { data, error } = await ctx.supabaseAdmin
		.from("rule_set_items")
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", itemId)
		.eq("rule_set_id", id)
		.is("deleted_at", null)
		.select();
	if (error) return err(new Error(error.message));
	return (data ?? []).length > 0
		? ok(null)
		: err(NotFound("rule set item not found"));
}
