/**
 * GET /api/initial-dump — complete application state in one call: all active
 * subscriptions (with content) + all rules (newest first) + all Hosts profiles +
 * all rule sets. Mirrors internal/controller/initial_dump.go +
 * service.InitialDump. The frontend calls this once on entry and hydrates its
 * store.
 */

import { err, methodNotAllowed, ok } from "./_lib/envelope";
import { type RuleSetRow, shapeRuleSet } from "./_lib/rule-sets";
import { withApi } from "./_lib/with-api";

export const config = { runtime: "edge" };

export default withApi(async (request, ctx) => {
	if (request.method !== "GET") return methodNotAllowed();
	const [subs, rules, hosts, ruleSets] = await Promise.all([
		ctx.supabaseAdmin
			.from("subscriptions")
			.select("*")
			.is("deleted_at", null)
			.order("id", { ascending: true }),
		ctx.supabaseAdmin
			.from("rules")
			.select("*")
			.is("deleted_at", null)
			.order("id", { ascending: false }),
		ctx.supabaseAdmin
			.from("hosts_profiles")
			.select("*, hosts_entries(*)")
			.is("deleted_at", null)
			.is("hosts_entries.deleted_at", null)
			.order("id", { ascending: false }),
		ctx.supabaseAdmin
			.from("rule_sets")
			.select("*, rule_set_items(*)")
			.is("deleted_at", null)
			.is("rule_set_items.deleted_at", null)
			.order("id", { ascending: false })
			.order("id", { referencedTable: "rule_set_items", ascending: true }),
	]);
	if (subs.error) return err(new Error(subs.error.message));
	if (rules.error) return err(new Error(rules.error.message));
	if (hosts.error) return err(new Error(hosts.error.message));
	if (ruleSets.error) return err(new Error(ruleSets.error.message));
	return ok({
		subscriptions: subs.data ?? [],
		rules: rules.data ?? [],
		hostsProfiles: (hosts.data ?? []).map((profile) => ({
			...profile,
			entries: profile.hosts_entries ?? [],
		})),
		ruleSets: (ruleSets.data ?? []).map((row) =>
			shapeRuleSet(row as RuleSetRow),
		),
	});
});
