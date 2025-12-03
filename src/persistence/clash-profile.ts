import { z } from "zod";

/**
 * Zod schema for Proxy definition.
 *
 * This schema defines a single proxy entry with:
 * - Required name field
 * - Flexible additional properties
 */
export const ProxySchema = z
	.object({
		/**
		 * Unique name of the proxy.
		 * This name is used to reference this proxy in proxy groups and rules.
		 */
		name: z.string(),

		/**
		 * Flattened properties containing proxy-specific configuration.
		 * This allows for flexible proxy types and additional settings.
		 */
		properties: z.record(z.string(), z.unknown()).optional(),
	})
	.loose();

/**
 * Zod schema for ProxyGroup definition.
 *
 * This schema defines a group of proxies that can be used together for
 * load balancing, fallback, or other proxy management strategies.
 */
export const ProxyGroupSchema = z.object({
	/**
	 * Name of the proxy group.
	 * Used to reference this group in rules.
	 */
	name: z.string(),

	/**
	 * Type of the proxy group.
	 * Common types include: "select", "fallback", "load-balance", "url-test"
	 */
	type: z.string(),

	/**
	 * Array of proxy names that belong to this group.
	 * These proxies should be defined in the proxies section.
	 */
	proxies: z.array(z.string()),

	/**
	 * Optional timeout for health checks or operations in milliseconds.
	 * Only relevant for certain group types (e.g., "url-test").
	 */
	timeout: z.number().positive().int().optional(),

	/**
	 * Optional interval for health checks in milliseconds.
	 * Only relevant for certain group types (e.g., "url-test").
	 */
	interval: z.number().positive().int().optional(),

	/**
	 * Optional URL for health checks.
	 * Used by group types like "url-test" to determine proxy health.
	 */
	url: z.url().optional(),
});
/**
 * Zod schema for Clash profile configuration.
 *
 * This schema defines the structure for a Clash profile, which includes:
 * - Flexible properties (flattened structure for additional config)
 * - Array of proxy definitions
 * - Array of proxy group definitions
 * - Array of routing rules
 */
export const ClashProfileSchema = z
	.object({
		/**
		 * Flattened properties containing additional configuration values.
		 * This allows for flexible, undefined properties that can be added to the profile.
		 */
		properties: z.record(z.string(), z.unknown()).optional(),

		/**
		 * Array of proxy definitions available in this profile.
		 * Each proxy defines a connection endpoint (e.g., HTTP, SOCKS, Shadowsocks).
		 */
		proxies: z.array(ProxySchema),

		/**
		 * Array of proxy group definitions.
		 * These groups organize proxies for different purposes (e.g., based on regions, protocols, or priorities).
		 * Note: Field renamed from "proxy_groups" to match TypeScript convention.
		 */
		"proxy-groups": z.array(ProxyGroupSchema),

		/**
		 * Array of routing rules that determine how traffic should be handled.
		 * Each rule is a string that defines routing conditions and proxy assignments.
		 */
		rules: z.array(z.string()),
	})
	.loose();
/**
 * Type alias for the ClashProfile type inferred from the Zod schema.
 * This provides TypeScript type safety and validation capabilities.
 */
export type ClashProfile = z.infer<typeof ClashProfileSchema>;

/**
 * Type alias for the Proxy type inferred from the Zod schema.
 */
export type Proxy = z.infer<typeof ProxySchema>;

/**
 * Type alias for the ProxyGroup type inferred from the Zod schema.
 */
export type ProxyGroup = z.infer<typeof ProxyGroupSchema>;

/**
 * Zod schema for a partial ClashProfile configuration.
 *
 * This schema allows for partial ClashProfile objects, where only some of the
 * properties are required. This is useful for:
 * - Updating specific fields of a profile without requiring all fields
 * - Default configuration that can be extended with specific values
 * - Optional profile sections in larger configurations
 *
 * All fields from ClashProfile are made optional in this schema.
 */
export const ClashProfileSegmentSchema = ClashProfileSchema.partial();

/**
 * Type alias for a partial ClashProfile inferred from the segment schema.
 * This represents ClashProfile objects that may have only a subset of the required properties.
 */
export type ClashProfileSegment = z.infer<typeof ClashProfileSegmentSchema>;
