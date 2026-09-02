/**
 * React data layer for the friend-cats backend (TanStack Query).
 *
 * Responsibilities:
 * - Query keys and cache invalidation rules are centralized here; pages never touch queryClient;
 * - GET /api/initial-dump is the single entry-point query: it carries the complete
 *   application state (subscriptions with content + rules). Pages read the data from
 *   the zustand store (hydrated from this query); this hook only powers loading /
 *   error / refetch;
 * - Every mutation invalidates the initial dump on success, so the store re-hydrates
 *   with fresh data automatically. The update mutations additionally write their
 *   return value straight into the detail cache (PUT returns the full resource).
 *   Detail queries (single subscription / rule) stay for the edit forms;
 * - Transport (request<T> / envelope parsing) stays in subscriptions.ts / rules.ts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HostsProfile } from "~/persistence/hosts";
import type { RuleSet, RuleSetItem } from "~/persistence/rule-sets";
import {
	createGenerated,
	type Generated,
	type GeneratedUpdate,
	getLatestGenerated,
	getRecentGenerated,
	updateGenerated,
} from "./generated";
import {
	createHostsProfile,
	deleteHostsProfile,
	getHostsProfile,
	type HostsImportEntry,
	importHostsEntries,
	updateHostsEntry,
} from "./hosts";
import {
	createRuleSet,
	deleteRuleSet,
	deleteRuleSetItem,
	getRuleSet,
	importRuleSetItems,
	type RuleSetImportItem,
	type RuleSetInput,
	rotateRuleSetSlug,
	updateRuleSet,
	updateRuleSetItem,
} from "./rule-sets";
import {
	createRule,
	deleteRule,
	getRule,
	type RuleInput,
	updateRule,
} from "./rules";
import {
	createSubscription,
	deleteSubscription,
	getInitialDump,
	getSubscription,
	type InitialDump,
	type SubscriptionInput,
	updateSubscription,
} from "./subscriptions";

// ---- query keys (single source of truth; invalidation references the same keys) ----

const initialDumpKey = ["initialDump"] as const;

const subscriptionDetailKey = (id: number) => ["subscription", id] as const;

const ruleDetailKey = (id: number) => ["rule", id] as const;
const hostsProfileDetailKey = (id: number) => ["hostsProfile", id] as const;
const ruleSetDetailKey = (id: number) => ["ruleSet", id] as const;

const latestGeneratedKey = ["latestGenerated"] as const;

const recentGeneratedKey = (page: number) => ["recentGenerated", page] as const;

// ---- queries ----

/** The single entry-point query: complete app state (subscriptions with content + rules). */
export function useInitialDump() {
	return useQuery({
		queryKey: initialDumpKey,
		queryFn: getInitialDump,
	});
}

/** Single subscription (with raw content); detail and edit share the same cache entry. */
export function useHostsProfile(id: number) {
	return useQuery({
		queryKey: hostsProfileDetailKey(id),
		queryFn: () => getHostsProfile(id),
	});
}

export function useCreateHostsProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createHostsProfile,
		onSuccess: (profile) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: { ...dump, hostsProfiles: [profile, ...dump.hostsProfiles] },
			);
			queryClient.setQueryData(hostsProfileDetailKey(profile.id), profile);
		},
	});
}
export function useImportHostsEntries() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			entries,
		}: {
			id: number;
			entries: HostsImportEntry[];
		}) => importHostsEntries(id, entries),
		onSuccess: (entries, variables) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							hostsProfiles: dump.hostsProfiles.map((profile) =>
								profile.id === variables.id ? { ...profile, entries } : profile,
							),
						},
			);
			queryClient.setQueryData(
				hostsProfileDetailKey(variables.id),
				(profile) =>
					profile === undefined ? profile : { ...profile, entries },
			);
		},
	});
}
export function useUpdateHostsEntry() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			profileId,
			entryId,
			...input
		}: {
			profileId: number;
			entryId: number;
			domain: string;
			ip: string;
			enabled: boolean;
		}) => updateHostsEntry(profileId, entryId, input),
		onSuccess: (entry, variables) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							hostsProfiles: dump.hostsProfiles.map((profile) =>
								profile.id !== variables.profileId
									? profile
									: {
											...profile,
											entries: profile.entries.map((item) =>
												item.id === entry.id ? entry : item,
											),
										},
							),
						},
			);
			queryClient.setQueryData<HostsProfile>(
				hostsProfileDetailKey(variables.profileId),
				(profile) =>
					profile === undefined
						? profile
						: {
								...profile,
								entries: profile.entries.map((item) =>
									item.id === entry.id ? entry : item,
								),
							},
			);
		},
	});
}
export function useDeleteHostsProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteHostsProfile,
		onSuccess: (_result, id) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							hostsProfiles: dump.hostsProfiles.filter(
								(profile) => profile.id !== id,
							),
						},
			);
			queryClient.removeQueries({ queryKey: hostsProfileDetailKey(id) });
		},
	});
}

export function useSubscription(id: number) {
	return useQuery({
		queryKey: subscriptionDetailKey(id),
		queryFn: () => getSubscription(id),
	});
}

/** Single rule; detail and edit share the same cache entry. */
export function useRule(id: number) {
	return useQuery({
		queryKey: ruleDetailKey(id),
		queryFn: () => getRule(id),
	});
}

/** The generated result with the most recent generation time (run-status panel). */
export function useLatestGenerated() {
	return useQuery({
		queryKey: latestGeneratedKey,
		queryFn: getLatestGenerated,
	});
}

/** One page of generated results, newest first (run-status panel). */
export function useRecentGenerated(page: number) {
	return useQuery({
		queryKey: recentGeneratedKey(page),
		queryFn: () => getRecentGenerated(page),
	});
}

// ---- mutations (invalidate the initial dump on success so the store re-hydrates) ----

/** Create: invalidate the initial dump on success. */
export function useCreateSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createSubscription,
		onSuccess: (sub) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: { ...dump, subscriptions: [...dump.subscriptions, sub] },
			);
		},
	});
}

/**
 * Update: the PUT response is the full updated subscription, so write it into
 * both caches in place (the detail and the initial dump) instead of refetching.
 * Writing the dump updates its data reference, which re-runs hydration in
 * App.tsx and keeps the zustand store in sync — no extra GET requests.
 */
export function useUpdateSubscription(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SubscriptionInput) => updateSubscription(id, input),
		onSuccess: (sub) => {
			queryClient.setQueryData(subscriptionDetailKey(sub.id), sub);
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							subscriptions: dump.subscriptions.map((s) =>
								s.id === sub.id ? sub : s,
							),
						},
			);
		},
	});
}

/** Delete: invalidate the initial dump and drop the detail from cache on success. */
export function useDeleteSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteSubscription,
		onSuccess: (_data, id) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							subscriptions: dump.subscriptions.filter((sub) => sub.id !== id),
						},
			);
			queryClient.removeQueries({ queryKey: subscriptionDetailKey(id) });
		},
	});
}

/** Create: invalidate the initial dump on success. */
export function useCreateRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createRule,
		onSuccess: (rule) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined ? dump : { ...dump, rules: [rule, ...dump.rules] },
			);
		},
	});
}

/** Update: invalidate the initial dump and the detail on success. */
export function useUpdateRule(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: RuleInput) => updateRule(id, input),
		onSuccess: (rule) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							rules: dump.rules.map((item) =>
								item.id === rule.id ? rule : item,
							),
						},
			);
			queryClient.setQueryData(ruleDetailKey(rule.id), rule);
		},
	});
}

/** Delete: on success, drop the rule from the cached dump in place (no refetch). */
export function useDeleteRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteRule,
		onSuccess: (_data, id) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: { ...dump, rules: dump.rules.filter((r) => r.id !== id) },
			);
			queryClient.removeQueries({ queryKey: ruleDetailKey(id) });
		},
	});
}

/**
 * Store a new generated result: update the latest-result cache and invalidate
 * every recent-page query so the paged history re-reads on the next render.
 * A paged list cannot be updated safely from a single mutation response
 * (a create may push items across page boundaries).
 */
function updateGeneratedCaches(
	queryClient: ReturnType<typeof useQueryClient>,
	generated: Generated,
) {
	queryClient.setQueryData(latestGeneratedKey, generated);
	void queryClient.invalidateQueries({ queryKey: ["recentGenerated"] });
}

export function useCreateGenerated() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createGenerated,
		onSuccess: (generated) => updateGeneratedCaches(queryClient, generated),
	});
}

export function useUpdateGenerated() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ name, input }: { name: string; input: GeneratedUpdate }) =>
			updateGenerated(name, input),
		onSuccess: (generated) => updateGeneratedCaches(queryClient, generated),
	});
}

// ---- rule sets ----

/**
 * Write one rule set into both caches it can appear in (the initial dump list
 * and its own detail entry). Every rule-set mutation returns the full resource,
 * so the caches are updated from the response instead of refetching.
 */
function putRuleSet(
	queryClient: ReturnType<typeof useQueryClient>,
	ruleSet: RuleSet,
) {
	queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
		dump === undefined
			? dump
			: {
					...dump,
					ruleSets: dump.ruleSets.some((item) => item.id === ruleSet.id)
						? dump.ruleSets.map((item) =>
								item.id === ruleSet.id ? ruleSet : item,
							)
						: [ruleSet, ...dump.ruleSets],
				},
	);
	queryClient.setQueryData(ruleSetDetailKey(ruleSet.id), ruleSet);
}

/** Replace one rule set's item list in both caches (import / toggle / delete). */
function putRuleSetItems(
	queryClient: ReturnType<typeof useQueryClient>,
	id: number,
	update: (items: RuleSetItem[]) => RuleSetItem[],
) {
	queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
		dump === undefined
			? dump
			: {
					...dump,
					ruleSets: dump.ruleSets.map((item) =>
						item.id === id ? { ...item, items: update(item.items) } : item,
					),
				},
	);
	queryClient.setQueryData<RuleSet>(ruleSetDetailKey(id), (ruleSet) =>
		ruleSet === undefined
			? ruleSet
			: { ...ruleSet, items: update(ruleSet.items) },
	);
}

/** Single rule set; shares its cache entry with the list. */
export function useRuleSet(id: number) {
	return useQuery({
		queryKey: ruleSetDetailKey(id),
		queryFn: () => getRuleSet(id),
	});
}

export function useCreateRuleSet() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createRuleSet,
		onSuccess: (ruleSet) => putRuleSet(queryClient, ruleSet),
	});
}

export function useUpdateRuleSet() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: RuleSetInput }) =>
			updateRuleSet(id, input),
		onSuccess: (ruleSet) => putRuleSet(queryClient, ruleSet),
	});
}

/**
 * Rotate the slug. The response carries the new slug, so the caches update in
 * place — but every generated config referencing the old URL is now stale and
 * has to be regenerated (the UI warns before calling this).
 */
export function useRotateRuleSetSlug() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: rotateRuleSetSlug,
		onSuccess: (ruleSet) => putRuleSet(queryClient, ruleSet),
	});
}

export function useDeleteRuleSet() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteRuleSet,
		onSuccess: (_result, id) => {
			queryClient.setQueryData<InitialDump>(initialDumpKey, (dump) =>
				dump === undefined
					? dump
					: {
							...dump,
							ruleSets: dump.ruleSets.filter((item) => item.id !== id),
						},
			);
			queryClient.removeQueries({ queryKey: ruleSetDetailKey(id) });
		},
	});
}

/** Import: the response is the set's full active item list, so it replaces items wholesale. */
export function useImportRuleSetItems() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, items }: { id: number; items: RuleSetImportItem[] }) =>
			importRuleSetItems(id, items),
		onSuccess: (items, variables) =>
			putRuleSetItems(queryClient, variables.id, () => items),
	});
}

export function useUpdateRuleSetItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			itemId,
			enabled,
		}: {
			id: number;
			itemId: number;
			enabled: boolean;
		}) => updateRuleSetItem(id, itemId, enabled),
		onSuccess: (item, variables) =>
			putRuleSetItems(queryClient, variables.id, (items) =>
				items.map((existing) => (existing.id === item.id ? item : existing)),
			),
	});
}

export function useDeleteRuleSetItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, itemId }: { id: number; itemId: number }) =>
			deleteRuleSetItem(id, itemId),
		onSuccess: (_result, variables) =>
			putRuleSetItems(queryClient, variables.id, (items) =>
				items.filter((item) => item.id !== variables.itemId),
			),
	});
}
