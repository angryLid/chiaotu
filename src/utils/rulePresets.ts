/**
 * Frontend-hardcoded rule presets: clicking a preset fills the rule editor form;
 * saving persists a copy as a normal rule server-side. Presets themselves are
 * never persisted and never appear in the rules list.
 */

import type { RuleFilter } from "~/persistence/rules";

export interface RulePreset {
	key: string;
	name: string;
	filter: RuleFilter;
}

export const RULE_PRESETS: readonly RulePreset[] = [
	{
		key: "apac",
		name: "亚太区",
		filter: { nameKeywords: ["香港", "美国", "US", "HK"] },
	},
	{
		key: "anti-censorship",
		name: "抗打节点",
		filter: { typeMatch: ["vless", "hysteria2"] },
	},
];
