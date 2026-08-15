/**
 * Pure parsing logic: subscription content → node list (no Node / network deps,
 * runs directly in the browser). Each upstream subscription's content is parsed
 * through this function when the SPA hydrates its global store from
 * GET /api/initial-dump.
 */

import yaml from "js-yaml";
import { ApiError } from "~/api/errors";
import { ClashProfileSegmentSchema } from "~/persistence/clash-profile";

/** A single node: the full proxy object as parsed from the subscription YAML (name required, other fields pass through). */
export interface NodeProxy {
	name: string;
	[key: string]: unknown;
}

/**
 * Parse one subscription's content into all its nodes (full proxy objects, no
 * "expired" filtering, no flag prefixes). Any parse failure throws — the caller
 * (store hydration) isolates the failure per subscription instead of aborting
 * the whole app.
 */
export function parseNodes(content: string, subName: string): NodeProxy[] {
	let raw: unknown;
	try {
		raw = yaml.load(content);
	} catch {
		throw new ApiError("", "INVALID_YAML", { name: subName });
	}
	const parsed = ClashProfileSegmentSchema.safeParse(raw);
	if (!parsed.success) {
		const detail = parsed.error.issues.map((issue) => issue.message).join("；");
		throw new ApiError("", "PARSE_FAILED", { name: subName, detail });
	}
	const proxies = parsed.data.proxies ?? [];
	return proxies.map((proxy) => ({ ...proxy }) as NodeProxy);
}
