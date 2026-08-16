/**
 * Rule domain contract for node filtering: the zod schema is the source of truth
 * for the filter shape the frontend guarantees (the backend stores it as an
 * opaque JSON object and only guards against junk).
 */

import { z } from "zod";

/** One dimension of a node-filtering rule; all dimensions are optional. */
export const RuleFilterSchema = z.object({
	/** Subscription ids (as strings) to include; empty/absent = all subscriptions. */
	subIds: z.array(z.string().min(1)).optional(),
	/** Node names must contain at least one keyword (case-insensitive substring, OR). */
	nameKeywords: z.array(z.string().min(1)).optional(),
	/** Node types must equal one of the values (OR). */
	typeMatch: z.array(z.string().min(1)).optional(),
});

export type RuleFilter = z.infer<typeof RuleFilterSchema>;

/** A persisted rule as returned by the backend. */
export const RuleSchema = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1),
	filter: RuleFilterSchema,
	created_at: z.string(),
	updated_at: z.string(),
	/** Soft-delete tombstone; NULL = active. Deleted rules are never returned by the API. */
	deleted_at: z.string().nullish(),
});

export type Rule = z.infer<typeof RuleSchema>;
