import { z } from "zod";

export const ProxySchema = z
	.object({
		name: z.string(),

		properties: z.record(z.string(), z.unknown()).optional(),
	})
	.loose();

export const ProxyGroupSchema = z.object({
	name: z.string(),

	type: z.string(),

	proxies: z.array(z.string()),

	timeout: z.number().positive().int().optional(),

	interval: z.number().positive().int().optional(),

	url: z.url().optional(),
});
export const ClashProfileSchema = z
	.object({
		properties: z.record(z.string(), z.unknown()).optional(),

		proxies: z.array(ProxySchema),

		// Renamed from "proxy_groups" to match the TypeScript convention.
		"proxy-groups": z.array(ProxyGroupSchema),

		rules: z.array(z.string()),
	})
	.loose();
export type ClashProfile = z.infer<typeof ClashProfileSchema>;

export type Proxy = z.infer<typeof ProxySchema>;

export type ProxyGroup = z.infer<typeof ProxyGroupSchema>;

export const ClashProfileSegmentSchema = ClashProfileSchema.partial();

export type ClashProfileSegment = z.infer<typeof ClashProfileSegmentSchema>;
