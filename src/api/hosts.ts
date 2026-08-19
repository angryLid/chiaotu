import {
	type HostsEntry,
	HostsEntrySchema,
	type HostsProfile,
	HostsProfileSchema,
	isValidIPv4,
	normalizeDomain,
} from "~/persistence/hosts";
import { request } from "./subscriptions";

function parseProfile(value: unknown): HostsProfile {
	const result = HostsProfileSchema.safeParse(value);
	if (!result.success) throw new Error("Invalid Hosts profile response");
	return result.data;
}
function parseEntry(value: unknown): HostsEntry {
	const result = HostsEntrySchema.safeParse(value);
	if (!result.success) throw new Error("Invalid Hosts entry response");
	return result.data;
}
export interface HostsProfileInput {
	name: string;
}
export interface HostsImportEntry {
	domain: string;
	ip: string;
}

export function listHostsProfiles(): Promise<HostsProfile[]> {
	return request<unknown[]>("/hosts/profiles").then((v) => v.map(parseProfile));
}
export function createHostsProfile(
	input: HostsProfileInput,
): Promise<HostsProfile> {
	return request<unknown>("/hosts/profiles", {
		method: "POST",
		body: JSON.stringify(input),
	}).then(parseProfile);
}
export function getHostsProfile(id: number): Promise<HostsProfile> {
	return request<unknown>(`/hosts/profiles/${id}`).then(parseProfile);
}
export function updateHostsProfile(
	id: number,
	input: HostsProfileInput,
): Promise<HostsProfile> {
	return request<unknown>(`/hosts/profiles/${id}`, {
		method: "PUT",
		body: JSON.stringify(input),
	}).then(parseProfile);
}
export function deleteHostsProfile(id: number): Promise<null> {
	return request<null>(`/hosts/profiles/${id}`, { method: "DELETE" });
}
export function importHostsEntries(
	id: number,
	entries: HostsImportEntry[],
): Promise<HostsEntry[]> {
	const normalized = entries.map((entry) => ({
		domain: normalizeDomain(entry.domain),
		ip: entry.ip === "" ? "" : entry.ip,
	}));
	if (
		normalized.length > 50 ||
		normalized.some(
			(entry) =>
				entry.domain === "" || (entry.ip !== "" && !isValidIPv4(entry.ip)),
		)
	)
		throw new Error("Invalid Hosts import");
	return request<unknown[]>(`/hosts/profiles/${id}/entries/import`, {
		method: "POST",
		body: JSON.stringify({ entries: normalized }),
	}).then((v) => v.map(parseEntry));
}
export function updateHostsEntry(
	id: number,
	entryId: number,
	input: HostsImportEntry & { enabled: boolean },
): Promise<HostsEntry> {
	return request<unknown>(`/hosts/profiles/${id}/entries/${entryId}`, {
		method: "PUT",
		body: JSON.stringify(input),
	}).then(parseEntry);
}
export function deleteHostsEntry(id: number, entryId: number): Promise<null> {
	return request<null>(`/hosts/profiles/${id}/entries/${entryId}`, {
		method: "DELETE",
	});
}
