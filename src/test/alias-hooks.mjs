/**
 * Node test-runner resolver hook: makes the SPA's `~/*` path alias (tsconfig
 * paths → vite resolve.alias) and extension-less relative imports work under
 * `node --test`, which resolves ESM specifiers literally.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

const SRC = new URL("../", import.meta.url);

/** Append `.ts` when the specifier has no extension and the `.ts` file exists. */
function withTsExtension(href) {
	if (/\.[cm]?[jt]sx?$/.test(href)) return href;
	const candidate = `${href}.ts`;
	return existsSync(fileURLToPath(candidate)) ? candidate : href;
}

export async function resolve(specifier, context, next) {
	if (specifier.startsWith("~/")) {
		const target = new URL(specifier.slice(2), SRC).href;
		return next(withTsExtension(target), context);
	}
	if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
		const target = new URL(specifier, context.parentURL).href;
		const resolved = withTsExtension(target);
		if (resolved !== target) return next(resolved, context);
	}
	return next(specifier, context);
}
