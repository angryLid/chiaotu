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
 *   with fresh data automatically. Detail queries (single subscription / rule) stay
 *   for the edit forms;
 * - Transport (request<T> / envelope parsing) stays in subscriptions.ts / rules.ts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGenerated, getLatestGenerated } from "./generated";
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
	type SubscriptionInput,
	updateSubscription,
} from "./subscriptions";

// ---- query keys (single source of truth; invalidation references the same keys) ----

const initialDumpKey = ["initialDump"] as const;

const subscriptionDetailKey = (id: number) => ["subscription", id] as const;

const ruleDetailKey = (id: number) => ["rule", id] as const;

const latestGeneratedKey = ["latestGenerated"] as const;

// ---- queries ----

/** The single entry-point query: complete app state (subscriptions with content + rules). */
export function useInitialDump() {
	return useQuery({
		queryKey: initialDumpKey,
		queryFn: getInitialDump,
	});
}

/** Single subscription (with raw content); detail and edit share the same cache entry. */
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

// ---- mutations (invalidate the initial dump on success so the store re-hydrates) ----

/** Create: invalidate the initial dump on success. */
export function useCreateSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createSubscription,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: initialDumpKey });
		},
	});
}

/** Update: invalidate the initial dump and the detail on success. */
export function useUpdateSubscription(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SubscriptionInput) => updateSubscription(id, input),
		onSuccess: (sub) => {
			void queryClient.invalidateQueries({ queryKey: initialDumpKey });
			void queryClient.invalidateQueries({
				queryKey: subscriptionDetailKey(sub.id),
			});
		},
	});
}

/** Delete: invalidate the initial dump and drop the detail from cache on success. */
export function useDeleteSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteSubscription,
		onSuccess: (_data, id) => {
			void queryClient.invalidateQueries({ queryKey: initialDumpKey });
			queryClient.removeQueries({ queryKey: subscriptionDetailKey(id) });
		},
	});
}

/** Create: invalidate the initial dump on success. */
export function useCreateRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createRule,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: initialDumpKey });
		},
	});
}

/** Update: invalidate the initial dump and the detail on success. */
export function useUpdateRule(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: RuleInput) => updateRule(id, input),
		onSuccess: (rule) => {
			void queryClient.invalidateQueries({ queryKey: initialDumpKey });
			void queryClient.invalidateQueries({ queryKey: ruleDetailKey(rule.id) });
		},
	});
}

/** Delete: invalidate the initial dump and drop the detail from cache on success. */
export function useDeleteRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteRule,
		onSuccess: (_data, id) => {
			void queryClient.invalidateQueries({ queryKey: initialDumpKey });
			queryClient.removeQueries({ queryKey: ruleDetailKey(id) });
		},
	});
}

/** Store a new generated result; invalidate the latest query on success so the panel shows it. */
export function useCreateGenerated() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createGenerated,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: latestGeneratedKey });
		},
	});
}
