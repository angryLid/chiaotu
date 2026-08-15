/**
 * Pure parsing logic: subscription content → node list (no Node / network deps, runs directly in the browser).
 * Each upstream subscription's content is parsed through this function when building the "all nodes" snapshot.
 */

import yaml from "js-yaml";
import { ApiError } from "~/api/errors";
import { ClashProfileSegmentSchema } from "~/persistence/clash-profile";
import type { NodeProxy } from "~/api/nodes";

/**
 * Parse one subscription's content into all its nodes (full proxy objects, no "expired" filtering, no flag prefixes).
 * Any parse failure throws — a build is atomic and aborts entirely.
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
		const detail = parsed.error.issues
			.map((issue) => issue.message)
			.join("；");
		throw new ApiError("", "PARSE_FAILED", { name: subName, detail });
	}
	const proxies = parsed.data.proxies ?? [];
	return proxies.map((proxy) => ({ ...proxy }) as NodeProxy);
}
