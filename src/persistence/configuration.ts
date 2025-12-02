import { z } from "zod";
import { ConfigurationError } from "../errors/configuration-error";

export const ConfigurationSchema = z.object({
	// An array of URL, can be empty
	upstreams: z.array(z.url("Each upstream must be a valid URL")).default([]),
});

export type Configuration = z.infer<typeof ConfigurationSchema>;

export function validateConfiguration(data: unknown): Configuration {
	try {
		return ConfigurationSchema.parse(data);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const messages = error.issues.map(
				(err) => `${err.path.join(".")}: ${err.message}`,
			);
			throw new ConfigurationError(
				`Configuration validation failed:\n${messages.join("\n")}`,
			);
		}
		throw error;
	}
}
