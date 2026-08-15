/**
 * React data layer for the friend-cats backend (TanStack Query).
 *
 * Responsibilities:
 * - Query keys and cache invalidation rules are centralized here; pages never touch queryClient;
 * - Mutations invalidate their own keys in onSuccess so data changes propagate automatically;
 * - Transport (request<T> / envelope parsing) stays in subscriptions.ts / nodes.ts, not reimplemented here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createSubscription,
	deleteSubscription,
	getSubscription,
	listSubscriptions,
	listSubscriptionsFull,
	updateSubscription,
	type SubscriptionInput,
} from "./subscriptions";
import { ApiError } from "./errors";
import {
	createNodeBuild,
	getLatestNodeSnapshot,
	type NodeBuildResult,
} from "./nodes";
import { parseNodes } from "~/utils/nodes";

// ---- query keys (single source of truth; invalidation references the same keys) ----

const subscriptionKeys = {
	all: ["subscriptions"] as const,
	detail: (id: number) => ["subscription", id] as const,
};

const nodeSnapshotKey = ["nodeSnapshot"] as const;

// ---- queries ----

/** Subscription summaries. */
export function useSubscriptions() {
	return useQuery({
		queryKey: subscriptionKeys.all,
		queryFn: listSubscriptions,
	});
}

/** Single subscription (with raw content); detail and edit share the same cache entry. */
export function useSubscription(id: number) {
	return useQuery({
		queryKey: subscriptionKeys.detail(id),
		queryFn: () => getSubscription(id),
	});
}

/** Latest "all nodes" build snapshot; data is null when nothing has been built yet. */
export function useNodeSnapshot() {
	return useQuery({
		queryKey: nodeSnapshotKey,
		queryFn: getLatestNodeSnapshot,
	});
}

// ---- mutations (invalidate the affected queries on success) ----

/** Create: invalidate the list on success. */
export function useCreateSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createSubscription,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
		},
	});
}

/** Update: invalidate the list and detail on success. */
export function useUpdateSubscription(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SubscriptionInput) => updateSubscription(id, input),
		onSuccess: (sub) => {
			void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
			void queryClient.invalidateQueries({
				queryKey: subscriptionKeys.detail(sub.id),
			});
		},
	});
}

/** Delete: invalidate the list and drop the detail from cache on success. */
export function useDeleteSubscription() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteSubscription,
		onSuccess: (_data, id) => {
			void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
			queryClient.removeQueries({ queryKey: subscriptionKeys.detail(id) });
		},
	});
}

/** Build the "all nodes" snapshot; invalidate the snapshot query on success. */
export function useCreateNodeBuild() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (ids: number[]): Promise<NodeBuildResult> => {
			const full = await listSubscriptionsFull(ids);
			const found = new Set(full.map((sub) => sub.id));
			const missing = ids.filter((id) => !found.has(id));
			if (missing.length > 0) {
				throw new ApiError("", "SUBSCRIPTIONS_MISSING", {
					ids: missing.join("、"),
				});
			}
			const dump = full.map((sub) => ({
				subId: String(sub.id),
				content: parseNodes(sub.content, sub.name),
			}));
			return createNodeBuild(dump);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: nodeSnapshotKey });
		},
	});
}
