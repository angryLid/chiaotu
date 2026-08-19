import { z } from "zod";

export const HostsEntrySchema = z.object({
	id: z.number().int().positive(),
	profile_id: z.number().int().positive(),
	domain: z.string().min(1),
	ip: z.string(),
	enabled: z.boolean(),
	created_at: z.string(),
	updated_at: z.string(),
	deleted_at: z.string().nullable().optional(),
});
export type HostsEntry = z.infer<typeof HostsEntrySchema>;

export const HostsProfileSchema = z.object({
	id: z.number().int().positive(),
	name: z.string().min(1),
	entries: z.array(HostsEntrySchema),
	created_at: z.string(),
	updated_at: z.string(),
	deleted_at: z.string().nullable().optional(),
});
export type HostsProfile = z.infer<typeof HostsProfileSchema>;

export function normalizeDomain(value: string): string {
	return value.trim().toLowerCase().replace(/\.+$/, "");
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function isValidDomain(value: string): boolean {
	const domain = normalizeDomain(value);
	if (
		domain.length === 0 ||
		domain.length > 253 ||
		/^\d+(?:\.\d+){3}$/.test(domain)
	)
		return false;
	return domain
		.split(".")
		.every((label) => label.length <= 63 && LABEL.test(label));
}

export function isValidIPv4(value: string): boolean {
	const parts = value.trim().split(".");
	return (
		parts.length === 4 &&
		parts.every(
			(part) => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
		)
	);
}

export interface ParsedHostLine {
	line: number;
	domain: string;
	ip: string;
}
export interface SkippedHostLine {
	line: number;
	text: string;
}
export interface HostImportPreview {
	entries: ParsedHostLine[];
	skipped: SkippedHostLine[];
	ignoredAfterLimit: number;
}

/** Parse exactly the first 50 physical lines. */
export function parseHostsInput(input: string): HostImportPreview {
	const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/);
	const considered = lines.slice(0, 50);
	const entries: ParsedHostLine[] = [];
	const skipped: SkippedHostLine[] = [];
	for (let index = 0; index < considered.length; index += 1) {
		const text = considered[index].trim();
		if (text === "" || text.startsWith("#")) continue;
		const fields = text.split(/\s+/);
		let ip = "";
		let domain = "";
		if (
			fields.length === 2 &&
			isValidIPv4(fields[0]) &&
			isValidDomain(fields[1])
		) {
			ip = fields[0];
			domain = normalizeDomain(fields[1]);
		} else if (fields.length === 1 && isValidDomain(fields[0])) {
			domain = normalizeDomain(fields[0]);
		} else {
			skipped.push({ line: index + 1, text: considered[index] });
			continue;
		}
		entries.push({ line: index + 1, domain, ip });
	}
	return {
		entries,
		skipped,
		ignoredAfterLimit: Math.max(0, lines.length - 50),
	};
}
