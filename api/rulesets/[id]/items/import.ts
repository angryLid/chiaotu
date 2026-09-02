/**
 * POST /api/rulesets/{id}/items/import — bulk-add matchers to a rule set.
 *
 * Mirrors the Hosts entry import: the frontend parses the pasted text (at most
 * the first 50 physical lines) and posts normalized {type, payload} pairs. A
 * matcher already present in the set is revived / left alone instead of
 * duplicated, so re-importing the same text is idempotent.
 */

import { err, methodNotAllowed, ok } from "../../../_lib/envelope";
import { InvalidArgument, LimitExceeded, NotFound } from "../../../_lib/errors";
import { readJson } from "../../../_lib/http";
import {
	MAX_RULE_SET_ITEMS,
	MAX_RULE_SET_SIZE,
	resolveImport,
} from "../../../_lib/rule-sets";
import { withApi } from "../../../_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	if (request.method !== "POST") return methodNotAllowed();
	const match = new URL(request.url).pathname.match(
		/^\/api\/rulesets\/(\d+)\/items\/import\/?$/,
	);
	const id = match ? Number(match[1]) : null;
	if (id === null || !Number.isSafeInteger(id) || id < 1) {
		return err(InvalidArgument("invalid id"));
	}

	const input = await readJson(request, MAX_RULE_SET_SIZE);
	const items = resolveImport(input.items);

	const set = await ctx.supabaseAdmin
		.from("rule_sets")
		.select("id")
		.eq("id", id)
		.is("deleted_at", null)
		.maybeSingle();
	if (set.error) return err(new Error(set.error.message));
	if (!set.data) return err(NotFound("rule set not found"));

	// Existing rows (including soft-deleted ones) decide insert vs revive: the
	// partial unique index only covers active rows, but reviving a tombstoned
	// matcher keeps its id stable across delete → re-import cycles.
	const existing = await ctx.supabaseAdmin
		.from("rule_set_items")
		.select("id, type, payload, deleted_at")
		.eq("rule_set_id", id);
	if (existing.error) return err(new Error(existing.error.message));

	const byMatcher = new Map(
		(existing.data ?? []).map((row) => [`${row.type},${row.payload}`, row]),
	);
	const activeCount = (existing.data ?? []).filter(
		(row) => row.deleted_at === null,
	).length;
	const additions = items.filter((item) => {
		const row = byMatcher.get(`${item.type},${item.payload}`);
		return row === undefined || row.deleted_at !== null;
	}).length;
	if (activeCount + additions > MAX_RULE_SET_ITEMS) {
		return err(
			LimitExceeded(
				`rule set item limit reached: at most ${MAX_RULE_SET_ITEMS} items`,
			),
		);
	}

	const revivals: number[] = [];
	const inserts: Array<{ rule_set_id: number; type: string; payload: string }> =
		[];
	for (const item of items) {
		const row = byMatcher.get(`${item.type},${item.payload}`);
		if (row === undefined) {
			inserts.push({ rule_set_id: id, type: item.type, payload: item.payload });
		} else if (row.deleted_at !== null) {
			revivals.push(row.id);
		}
	}

	// Two bulk statements at most, unlike the per-row loop of the Hosts import:
	// a 50-line paste must not become 50 round trips inside one edge invocation.
	if (revivals.length > 0) {
		const revive = await ctx.supabaseAdmin
			.from("rule_set_items")
			.update({ deleted_at: null, enabled: true })
			.in("id", revivals);
		if (revive.error) return err(new Error(revive.error.message));
	}
	if (inserts.length > 0) {
		const insert = await ctx.supabaseAdmin
			.from("rule_set_items")
			.insert(inserts);
		if (insert.error) return err(new Error(insert.error.message));
	}

	const result = await ctx.supabaseAdmin
		.from("rule_set_items")
		.select("*")
		.eq("rule_set_id", id)
		.is("deleted_at", null)
		.order("id", { ascending: true });
	if (result.error) return err(new Error(result.error.message));
	return ok(result.data ?? []);
});
