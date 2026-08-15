/**
 * The rule engine: a pure function that applies a node-filtering rule to the
 * "all nodes" snapshot. No React, no network, no backend — runs anywhere and is
 * directly unit-testable.
 *
 * Matching semantics (see friend-cats openapi.yaml RuleFilter):
 * - subIds: when non-empty, only nodes of those subscriptions match (OR across the set);
 * - nameKeywords: when non-empty, the node name must contain at least one keyword,
 *   case-insensitive (OR; substring match survives flag emoji in raw names);
 * - typeMatch: when non-empty, the node type must equal one of the values (OR, case-insensitive);
 * - an empty dimension does not filter; a rule with no dimensions matches every node.
 */

import type { NodeBuildItem, NodeProxy } from "~/api/nodes";
import type { RuleFilter } from "~/persistence/rules";

/** A matched node: the node plus the subscription it came from. */
export interface MatchedNode extends NodeProxy {
	subId: string;
}

/** Apply a rule filter to the node dump; returns the matched nodes (with their subId). */
export function applyRule(filter: RuleFilter, items: NodeBuildItem[]): MatchedNode[] {
	const subIds = new Set(filter.subIds ?? []);
	const keywords = (filter.nameKeywords ?? []).map((keyword) => keyword.toLowerCase());
	const types = new Set((filter.typeMatch ?? []).map((value) => value.toLowerCase()));

	const matched: MatchedNode[] = [];
	for (const item of items) {
		if (subIds.size > 0 && !subIds.has(item.subId)) {
			continue;
		}
		for (const node of item.content) {
			const name = node.name.toLowerCase();
			if (keywords.length > 0 && !keywords.some((keyword) => name.includes(keyword))) {
				continue;
			}
			if (types.size > 0) {
				const type = typeof node.type === "string" ? node.type.toLowerCase() : "";
				if (!types.has(type)) {
					continue;
				}
			}
			matched.push({ ...node, subId: item.subId });
		}
	}
	return matched;
}
