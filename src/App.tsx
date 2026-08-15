import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInitialDump } from "~/api/hooks";
import { changeLanguage, DEFAULT_LANGUAGE, type Language } from "~/i18n";
import NodesPage from "~/pages/nodes";
import RulesPage, { RuleFormPage } from "~/pages/rules";
import SubscriptionsPage from "~/pages/subscriptions";
import { useAppStore } from "~/store/app-store";

type NavKey = "subscriptions" | "nodes" | "rules";

/**
 * App route, derived from the URL hash (no router dependency). The rules section
 * has sub-routes for create / edit; the other tabs are plain pages.
 */
type Route =
	| { page: "subscriptions" }
	| { page: "nodes" }
	| { page: "rules"; view: "list" }
	| { page: "rules"; view: "new" }
	| { page: "rules"; view: "edit"; id: number };

/** Parse #/subscriptions | #/nodes | #/rules | #/rules/new | #/rules/{id}/edit. */
function parseHash(hash: string): Route {
	const parts = hash
		.replace(/^#\/?/, "")
		.split("/")
		.filter((part) => part !== "");
	const [page, sub, tail] = parts;
	switch (page) {
		case "subscriptions":
		case "nodes":
			return { page };
		case "rules":
			if (sub === "new") return { page: "rules", view: "new" };
			if (sub !== undefined && tail === "edit" && /^\d+$/.test(sub)) {
				return { page: "rules", view: "edit", id: Number(sub) };
			}
			return { page: "rules", view: "list" };
		default:
			return { page: "subscriptions" };
	}
}

const NAV_ITEMS = [
	{ key: "subscriptions", labelKey: "app.nav.subscriptions", icon: "📥" },
	{ key: "nodes", labelKey: "app.nav.nodes", icon: "🛰️" },
	{ key: "rules", labelKey: "app.nav.rules", icon: "📜" },
] as const;

/** Hydrates the zustand store whenever the initial dump query resolves (idempotent).
 * useLayoutEffect (before paint) so the first data render never shows stale store state. */
function useHydrateStore() {
	const { data } = useInitialDump();
	const hydrate = useAppStore((s) => s.hydrate);
	useLayoutEffect(() => {
		if (data !== undefined) {
			hydrate(data);
		}
	}, [data, hydrate]);
}

/** Backend connectivity badge: reuses the initial dump query (same query key), so it fires no extra request. */
function BackendStatus() {
	const { t } = useTranslation();
	const query = useInitialDump();

	if (query.isLoading) {
		return <span className="text-amber-600">{t("app.backend.checking")}</span>;
	}
	if (query.isError) {
		return <span className="text-rose-600">{t("app.backend.unreachable")}</span>;
	}
	return <span className="text-emerald-600">{t("app.backend.connected")}</span>;
}

/** Language picker: persists the choice and keeps <html lang> in sync. */
function LanguageSwitcher() {
	const { t, i18n } = useTranslation();
	return (
		<select
			value={i18n.resolvedLanguage ?? DEFAULT_LANGUAGE}
			onChange={(event) => changeLanguage(event.target.value as Language)}
			aria-label={t("app.lang.label")}
			className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-600 focus:border-slate-500 focus:outline-none"
		>
			<option value="zh-CN">简体中文</option>
			<option value="en">English</option>
		</select>
	);
}

export default function App() {
	const { t } = useTranslation();
	const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

	// Single entry-point hydration: the store is rebuilt from each initial dump response.
	useHydrateStore();

	useEffect(() => {
		const onHashChange = () => setRoute(parseHash(window.location.hash));
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	const active: NavKey =
		route.page === "subscriptions"
			? "subscriptions"
			: route.page === "nodes"
				? "nodes"
				: "rules";

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900">
			{/* Mobile top bar: brand + backend status, hidden at md and up */}
			<header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
				<div className="flex items-center gap-2">
					<span aria-hidden>🛫</span>
					<span className="text-lg font-bold">chiaotu</span>
				</div>
				<div className="flex items-center gap-2 text-xs">
					<LanguageSwitcher />
					<BackendStatus />
				</div>
			</header>

			{/* Desktop sidebar: hidden on mobile, fixed at md and up */}
			<aside className="fixed inset-y-0 left-0 z-10 hidden w-56 flex-col border-r border-slate-200 bg-white md:flex">
				<div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
					<span aria-hidden>🛫</span>
					<span className="text-lg font-bold">chiaotu</span>
				</div>
				<nav className="flex-1 space-y-1 p-2">
					{NAV_ITEMS.map((item) => (
						<button
							key={item.key}
							type="button"
							onClick={() => {
								window.location.hash = `#/${item.key}`;
							}}
							className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
								active === item.key
									? "bg-slate-900 text-white"
									: "text-slate-600 hover:bg-slate-100"
							}`}
						>
							<span aria-hidden>{item.icon}</span>
							<span>{t(item.labelKey)}</span>
						</button>
					))}
				</nav>
				<div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
					<LanguageSwitcher />
					<BackendStatus />
				</div>
			</aside>

			{/* Main content: full width on mobile (leaving room for the bottom nav), offset by the sidebar at md and up */}
			<main className="px-4 pb-20 pt-4 md:ml-56 md:px-6 md:py-6">
				{route.page === "subscriptions" ? (
					<SubscriptionsPage />
				) : route.page === "nodes" ? (
					<NodesPage />
				) : route.view === "list" ? (
					<RulesPage />
				) : (
					<RuleFormPage
						mode={route.view}
						id={route.view === "edit" ? route.id : undefined}
					/>
				)}
			</main>

			{/* Mobile bottom nav: hidden at md and up */}
			<nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-slate-200 bg-white md:hidden">
				{NAV_ITEMS.map((item) => (
					<button
						key={item.key}
						type="button"
						onClick={() => {
							window.location.hash = `#/${item.key}`;
						}}
						className={`flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
							active === item.key
								? "text-slate-900"
								: "text-slate-400 hover:text-slate-600"
						}`}
					>
						<span className="text-lg" aria-hidden>
							{item.icon}
						</span>
						<span>{t(item.labelKey)}</span>
					</button>
				))}
			</nav>
		</div>
	);
}
