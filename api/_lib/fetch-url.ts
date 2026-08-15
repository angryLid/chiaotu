/**
 * url fetching, mirrored from the Go backend (internal/model/fetch.go).
 * Only http/https; 1MB content cap (user decision: 10MB was overkill); 10s
 * timeout; non-200 upstream is a FetchFailed error; User-Agent disguised as
 * ClashMetaForAndroid to avoid upstream rejection.
 */

import { MAX_CONTENT_SIZE, USER_AGENT } from "./constants";
import { BizError, FetchFailed } from "./errors";
import { deriveName } from "./validate";

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch the text content of a url, returning { name, content }. */
export async function fetchUrl(
	rawUrl: string,
): Promise<{ name: string; content: string }> {
	let u: URL;
	try {
		u = new URL(rawUrl);
	} catch {
		throw FetchFailed("invalid url");
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") {
		throw FetchFailed("only http/https schemes are supported");
	}
	if (!u.host) {
		throw FetchFailed("url is missing a host");
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetch(u.toString(), {
			headers: { "user-agent": USER_AGENT },
			signal: controller.signal,
		});
		if (!resp.ok) {
			throw FetchFailed(`upstream returned status code ${resp.status}`);
		}
		const content = await resp.text();
		if (content.length > MAX_CONTENT_SIZE) {
			throw FetchFailed(
				`content exceeds the size limit of ${MAX_CONTENT_SIZE} bytes`,
			);
		}
		return { name: deriveName(rawUrl), content };
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") {
			throw FetchFailed("request timed out");
		}
		// Re-raise a BizError (e.g. upstream non-200 or size limit) as-is.
		if (e instanceof BizError) throw e;
		throw FetchFailed(`request failed: ${String(e)}`);
	} finally {
		clearTimeout(timer);
	}
}
