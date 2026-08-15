/**
 * i18n bootstrap for the SPA — the single module that owns "which language the
 * UI is in" and "how a user-visible string / error message is produced".
 *
 * Responsibilities:
 * - initialises the i18next instance (side-effect: `main.tsx` imports this module);
 * - detects the initial language (persisted choice → browser language → zh-CN fallback);
 * - exposes `changeLanguage` which persists the choice and keeps <html lang> in sync;
 * - exposes `formatDateTime` (dates in the current language) and `errorMessage`
 *   (any thrown value → localised copy, see `~/api/errors`).
 *
 * The `CustomTypeOptions` augmentation derives the `t()` key space from the zh-CN
 * resources, so a missing or mistyped key is a compile-time error, not a runtime
 * `undefined`.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ApiError } from "~/api/errors";
import { en } from "./locales/en";
import { zhCN } from "./locales/zh-CN";

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "translation";
		resources: { translation: typeof zhCN };
	}
}

/** Locales supported by the UI. */
export type Language = "zh-CN" | "en";

export const DEFAULT_LANGUAGE: Language = "zh-CN";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["zh-CN", "en"];

const LANG_STORAGE_KEY = "chiaotu.lang";

function detectLanguage(): Language {
	try {
		const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
		if (stored === "zh-CN" || stored === "en") return stored;
	} catch {
		// localStorage unavailable (e.g. strict privacy mode) — fall through to the browser language
	}
	const browser = (window.navigator.language ?? "").toLowerCase();
	return browser.startsWith("zh") ? "zh-CN" : "en";
}

/** Switch the UI language, persist the choice, and keep <html lang> in sync. */
export function changeLanguage(lng: Language): void {
	document.documentElement.lang = lng;
	try {
		window.localStorage.setItem(LANG_STORAGE_KEY, lng);
	} catch {
		// persistence is best-effort
	}
	void i18n.changeLanguage(lng);
}

const initialLanguage = detectLanguage();
document.documentElement.lang = initialLanguage;

void i18n.use(initReactI18next).init({
	resources: {
		"zh-CN": { translation: zhCN },
		en: { translation: en },
	},
	lng: initialLanguage,
	fallbackLng: DEFAULT_LANGUAGE,
	interpolation: { escapeValue: false }, // React already escapes rendered values
});

export { i18n };

/** Format a timestamp in the current UI language. */
export function formatDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString(i18n.resolvedLanguage ?? DEFAULT_LANGUAGE, {
		hour12: false,
	});
}

/**
 * Dynamic-key translation: the strict `t()` typing only accepts statically known
 * keys, while error codes are dynamic (`errors.<CODE>`). The cast is the single
 * escape hatch; everything else goes through the typed `t` from `useTranslation`.
 */
const translateByKey = (key: string, params?: Record<string, unknown>): string =>
	(i18n.t as unknown as (key: string, params?: Record<string, unknown>) => string)(
		key,
		params,
	);

/**
 * Resolve any thrown value to a user-visible message in the current UI language.
 * Known codes (backend business codes and client-side codes, see `~/api/errors`)
 * map to translated copy; the backend's raw English description is the fallback
 * for unknown codes.
 */
export function errorMessage(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.code !== null) {
			const key = `errors.${error.code}`;
			if (i18n.exists(key)) return translateByKey(key, error.params);
		}
		if (error.message !== "") return error.message;
		return i18n.t("errors.UNKNOWN");
	}
	if (error instanceof Error) return error.message;
	return String(error);
}
