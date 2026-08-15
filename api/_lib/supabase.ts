/**
 * Thin Supabase (PostgREST) client for the Edge Functions, using the Edge
 * runtime's native fetch. No supabase-js dependency needed — the functions only
 * do simple CRUD, so a tiny typed wrapper over the PostgREST REST API is enough
 * and stays edge-friendly.
 *
 * The client authenticates with the service_role key (server-side secret) so it
 * bypasses RLS; the real auth boundary is withAuth's API_TOKEN check.
 *
 * Env required: SUPABASE_URL, SUPABASE_SECRET_KEY (the service_role key; Supabase's
 * current naming — formerly SUPABASE_SERVICE_ROLE_KEY).
 */

const BASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

interface PostgrestError {
	message: string;
	code: string;
	details?: string;
	hint?: string;
}

/** Result of a PostgREST request; rows are the parsed JSON array. */
interface PgResult<T> {
	data: T | null;
	error: { message: string; code: string } | null;
}

/** Build the base headers for a PostgREST request. */
function headers(): Record<string, string> {
	if (!BASE_URL || !SERVICE_KEY) {
		throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
	}
	return {
		apikey: SERVICE_KEY,
		Authorization: `Bearer ${SERVICE_KEY}`,
		"Content-Type": "application/json",
		Prefer: "return=representation",
	};
}

/** Timeout for a Supabase request (ms). Prevents a stalled upstream from hanging the edge function. */
const REQUEST_TIMEOUT_MS = 10_000;

/** fetch with a hard timeout via AbortController so a stale request cannot hang. */
async function fetchSupabase(
	url: string,
	init?: RequestInit,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

function pgUrl(path: string, params?: Record<string, string>): string {
	const url = new URL(`${BASE_URL}/rest/v1/${path}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	return url.toString();
}

/** Parse a PostgREST response into { data, error } (single row -> object). */
async function parse<T>(resp: Response, single: boolean): Promise<PgResult<T>> {
	if (!resp.ok) {
		let body: PostgrestError | unknown;
		try {
			body = (await resp.json()) as unknown;
		} catch {
			body = null;
		}
		const e = (body as PostgrestError | null) ?? null;
		return {
			data: null,
			error: {
				message: e?.message ?? `HTTP ${resp.status}`,
				code: e?.code ?? String(resp.status),
			},
		};
	}
	if (resp.status === 204) return { data: null, error: null };
	const json = (await resp.json()) as unknown;
	return {
		data: (single ? (Array.isArray(json) ? json[0] : json) : json) as T,
		error: null,
	};
}

/**
 * Connectivity probe (parity with friend-cats repo.Ping). Hits the PostgREST
 * root, which responds 200 with the API spec whenever the database is reachable
 * and the key is valid — no application table required.
 */
export async function ping(): Promise<PgResult<unknown>> {
	try {
		const resp = await fetchSupabase(`${BASE_URL}/rest/v1/`, {
			headers: headers(),
		});
		if (resp.ok) return { data: null, error: null };
		return {
			data: null,
			error: { message: `HTTP ${resp.status}`, code: String(resp.status) },
		};
	} catch (e) {
		return { data: null, error: { message: String(e), code: "FETCH_FAILED" } };
	}
}

/** Perform a GET (select) request. */
export async function select<T>(
	path: string,
	params?: Record<string, string>,
): Promise<PgResult<T[]>> {
	return parse<T[]>(
		await fetchSupabase(pgUrl(path, params), { headers: headers() }),
		false,
	);
}

/** Perform a GET expecting a single row (or null). */
export async function selectSingle<T>(
	path: string,
	params?: Record<string, string>,
): Promise<PgResult<T>> {
	return parse<T>(
		await fetchSupabase(pgUrl(path, params), { headers: headers() }),
		true,
	);
}

/** Perform an INSERT; rows are the inserted records (return=representation). */
export async function insert<T>(
	path: string,
	body: unknown,
): Promise<PgResult<T[]>> {
	return parse<T[]>(
		await fetchSupabase(pgUrl(path), {
			method: "POST",
			headers: headers(),
			body: JSON.stringify(body),
		}),
		false,
	);
}

/** Perform an UPDATE; rows are the updated records. */
export async function update<T>(
	path: string,
	params: Record<string, string>,
	body: unknown,
): Promise<PgResult<T[]>> {
	return parse<T[]>(
		await fetchSupabase(pgUrl(path, params), {
			method: "PATCH",
			headers: headers(),
			body: JSON.stringify(body),
		}),
		false,
	);
}

/** Perform a DELETE. */
export async function remove(
	path: string,
	params: Record<string, string>,
): Promise<Response> {
	return fetchSupabase(pgUrl(path, params), {
		method: "DELETE",
		headers: headers(),
	});
}

/** Build PostgREST query-param fragments; spread these into a params object. */
export const eq = (col: string, val: string | number) => ({
	[col]: `eq.${encodeURIComponent(String(val))}`,
});
export const isNull = (col: string) => ({ [col]: "is.null" });
export const order = (col: string, direction: "asc" | "desc") => ({
	order: `${col}.${direction}`,
});
export const limit = (n: number) => ({ limit: String(n) });
