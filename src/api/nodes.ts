/**
 * REST client for the friend-cats "all nodes" build snapshot.
 *
 * Contract points (see friend-cats README and openapi.yaml):
 * - Snapshots are append-only: each POST adds a version, GET returns the latest one;
 * - subId is the subscription primary key as a string; content holds the parsed nodes;
 * - GET result is null until the first build (initial state, not an error);
 * - POST only validates "valid JSON array" and a size cap; node shape is the frontend's responsibility.
 */

import { request } from "./subscriptions";

// ---- types ----

/** A single node: the full proxy object as parsed from the subscription YAML (name required, other fields pass through). */
export interface NodeProxy {
	name: string;
	[key: string]: unknown;
}

/** Nodes of a single upstream subscription in one build. */
export interface NodeBuildItem {
	subId: string;
	content: NodeProxy[];
}

/** Snapshot of the most recent build. */
export interface NodeSnapshot {
	id: number;
	created_at: string;
	data: NodeBuildItem[];
}

/** Build receipt (the backend does not echo data, saving bandwidth). */
export interface NodeBuildResult {
	id: number;
	created_at: string;
}

// ---- API ----

/** Fetch the latest build snapshot; null when nothing has ever been built. */
export function getLatestNodeSnapshot(): Promise<NodeSnapshot | null> {
	return request<NodeSnapshot | null>("/nodes");
}

/** Append a build (body is the node dump array; history is never modified). */
export function createNodeBuild(data: NodeBuildItem[]): Promise<NodeBuildResult> {
	return request<NodeBuildResult>("/nodes", {
		method: "POST",
		body: JSON.stringify(data),
	});
}
