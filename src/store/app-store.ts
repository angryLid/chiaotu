/**
 * Global application store (zustand): holds the domain state hydrated from
 * GET /api/initial-dump — full subscriptions, rules, and the per-subscription
 * node parse results. It is the single client-side source of truth for data
 * that spans pages (the subscriptions page's node tables, the rule engine's
 * input).
 *
 * Data flow:
 * - App fetches the initial dump via react-query (useInitialDump) and calls
 *   hydrate() whenever the response changes (after a mutation the query is
 *   invalidated → refetched → hydrate() runs again);
 * - parseNodes() runs eagerly per subscription; a failing subscription is
 *   isolated ({ nodes: null, error }) instead of breaking the whole app;
 * - hydratedAt records the client-side sync time (backend has no timestamp).
 *
 * Page-local UI state (selection sets, open modals, tabs) stays in component
 * useState; the store only holds cross-page domain data.
 */

import { create } from "zustand";
import { ApiError } from "~/api/errors";
import type { InitialDump, Subscription } from "~/api/subscriptions";
import type { HostsProfile } from "~/persistence/hosts";
import type { Rule } from "~/persistence/rules";
import { type NodeProxy, parseNodes } from "~/utils/nodes";

/** Parse result of one subscription: nodes when the YAML parsed, error otherwise. */
export interface ParsedSubscription {
	nodes: NodeProxy[] | null;
	error: ApiError | null;
}

interface AppStore {
	/** All active subscriptions (full content), from the initial dump. */
	subscriptions: Subscription[];
	/** All rules, newest first, from the initial dump. */
	rules: Rule[];
	hostsProfiles: HostsProfile[];
	/** Per-subscription parse result, keyed by subId (string). */
	parsed: Record<string, ParsedSubscription>;
	/** Client-side timestamp of the last hydration (for "synced at" display). */
	hydratedAt: number | null;
	/** Replace all store data from one initial dump (idempotent). */
	hydrate: (dump: InitialDump) => void;
}

export const useAppStore = create<AppStore>()((set) => ({
	subscriptions: [],
	rules: [],
	hostsProfiles: [],
	parsed: {},
	hydratedAt: null,
	hydrate: (dump) => {
		const parsed: Record<string, ParsedSubscription> = {};
		for (const sub of dump.subscriptions) {
			try {
				parsed[String(sub.id)] = {
					nodes: parseNodes(sub.content, sub.name),
					error: null,
				};
			} catch (error) {
				parsed[String(sub.id)] = {
					nodes: null,
					error:
						error instanceof ApiError
							? error
							: new ApiError("", "PARSE_FAILED", { name: sub.name }),
				};
			}
		}
		set({
			subscriptions: dump.subscriptions,
			rules: dump.rules,
			hostsProfiles: dump.hostsProfiles,
			parsed,
			hydratedAt: Date.now(),
		});
	},
}));
