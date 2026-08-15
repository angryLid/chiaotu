import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useInitialDump } from "~/api/hooks";
import { changeLanguage, DEFAULT_LANGUAGE, type Language } from "~/i18n";
import RulesPage, { RuleFormPage } from "~/pages/rules";
import { navigate } from "~/router";
import StatusPage from "~/pages/status";
import SubscriptionsPage from "~/pages/subscriptions";
import AuthPage from "~/pages/auth";
import { useAppStore } from "~/store/app-store";
import { useAuthStore } from "~/store/auth-store";

type NavKey = "subscriptions" | "rules" | "status";

/**
 * App route, derived from the URL path (history API, no router dependency).
 * The rules section has sub-routes for create / edit; the other tabs are plain pages.
 */
type Route =
	| { page: "subscriptions" }
	| { page: "rules"; view: "list" }
	| { page: "rules"; view: "new" }
	| { page: "rules"; view: "edit"; id: number }
	| { page: "status" };

/** Parse /subscriptions | /rules | /rules/new | /rules/{id}/edit | /status. */
function parsePath(path: string): Route {
	const parts = path
		.replace(/^\/?/, "")
		.split("/")
		.filter((part) => part !== "");
	const [page, sub, tail] = parts;
	switch (page) {
		case "subscriptions":
			return { page };
		case "rules":
			if (sub === "new") return { page: "rules", view: "new" };
			if (sub !== undefined && tail === "edit" && /^\d+$/.test(sub)) {
				return { page: "rules", view: "edit", id: Number(sub) };
			}
			return { page: "rules", view: "list" };
		case "status":
			return { page: "status" };
		default:
			return { page: "subscriptions" };
	}
}

const NAV_ITEMS = [
	{ key: "status", labelKey: "app.nav.status", icon: "🚀" },
	{ key: "subscriptions", labelKey: "app.nav.subscriptions", icon: "📥" },
	{ key: "rules", labelKey: "app.nav.rules", icon: "📜" },
] as const;

function navigateTo(key: NavKey) {
	navigate(`/${key}`);
}

/** Shared nav button list, used by both the desktop sidebar and the mobile drawer. */
function NavButtons({
	active,
	onNavigate,
}: {
	active: NavKey;
	onNavigate: (key: NavKey) => void;
}) {
	const { t } = useTranslation();
	return (
		<nav className="flex-1 space-y-1 p-2" aria-label={t("app.nav.label")}>
			{NAV_ITEMS.map((item) => (
				<button
					key={item.key}
					type="button"
					onClick={() => onNavigate(item.key)}
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
	);
}

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
	// Auth gate: without a token nothing else may mount (no react-query tree, no
	// sidebar, no backend queries). The auth page is its own isolated screen.
	// The gate lives in a separate component so the Dashboard's hooks stay
	// unconditional (the token can change at runtime via clearToken).
	const token = useAuthStore((s) => s.token);
	return token === "" ? <AuthPage /> : <Dashboard />;
}

function Dashboard() {
	const { t } = useTranslation();
	const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname));
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const hamburgerRef = useRef<HTMLButtonElement>(null);
	const drawerRef = useRef<HTMLElement>(null);
	const openedOnceRef = useRef(false);

	// Single entry-point hydration: the store is rebuilt from each initial dump response.
	useHydrateStore();

	useEffect(() => {
		const onPopState = () => {
			setRoute(parsePath(window.location.pathname));
			setMobileNavOpen(false);
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	// Escape closes the drawer; the body is scroll-locked while it is open.
	useEffect(() => {
		if (!mobileNavOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMobileNavOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = originalOverflow;
		};
	}, [mobileNavOpen]);

	// Rotating / resizing up to the desktop layout closes the drawer.
	useEffect(() => {
		const mq = window.matchMedia("(min-width: 768px)");
		const onChange = (event: MediaQueryListEvent) => {
			if (event.matches) setMobileNavOpen(false);
		};
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	// Move focus into the drawer on open and back to the hamburger on close.
	// The hamburger restore is skipped on initial mount to avoid stealing focus.
	useEffect(() => {
		if (mobileNavOpen) {
			openedOnceRef.current = true;
			const first = drawerRef.current?.querySelector<HTMLElement>("button");
			first?.focus();
		} else if (openedOnceRef.current) {
			hamburgerRef.current?.focus();
		}
	}, [mobileNavOpen]);

	// Keep Tab navigation inside the drawer while it is open.
	const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
		if (event.key !== "Tab") return;
		const drawer = drawerRef.current;
		if (!drawer) return;
		const focusables = Array.from(
			drawer.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			),
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const active: NavKey =
		route.page === "rules"
			? "rules"
			: route.page === "status"
				? "status"
				: "subscriptions";

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900">
			{/* Mobile top bar: brand + hamburger, hidden at md and up */}
			<header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
				<div className="flex items-center gap-2">
					<button
						ref={hamburgerRef}
						type="button"
						onClick={() => setMobileNavOpen(true)}
						aria-label={t("app.nav.open")}
						aria-expanded={mobileNavOpen}
						aria-controls="mobile-nav-drawer"
						className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
					<span aria-hidden>🛫</span>
					<span className="text-lg font-bold">chiaotu</span>
				</div>
			</header>

			{/* Desktop sidebar: hidden on mobile, fixed at md and up */}
			<aside className="fixed inset-y-0 left-0 z-10 hidden w-56 flex-col border-r border-slate-200 bg-white md:flex">
				<div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
					<span aria-hidden>🛫</span>
					<span className="text-lg font-bold">chiaotu</span>
				</div>
				<NavButtons active={active} onNavigate={navigateTo} />
				<div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
					<LanguageSwitcher />
					<BackendStatus />
				</div>
			</aside>

			{/* Main content: full width on mobile, offset by the sidebar at md and up */}
			<main className="px-4 pb-4 pt-4 md:ml-56 md:px-6 md:py-6">
				{route.page === "subscriptions" ? (
					<SubscriptionsPage />
				) : route.page === "status" ? (
					<StatusPage />
				) : route.view === "list" ? (
					<RulesPage />
				) : (
					<RuleFormPage
						mode={route.view}
						id={route.view === "edit" ? route.id : undefined}
					/>
				)}
			</main>

			{/* Mobile left drawer: backdrop + slide-out panel, hidden at md and up */}
			<div
				className={`fixed inset-0 z-20 bg-slate-900/40 transition-opacity duration-300 md:hidden ${
					mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
				}`}
				onClick={() => setMobileNavOpen(false)}
				aria-hidden="true"
			/>
			<aside
				id="mobile-nav-drawer"
				ref={drawerRef}
				role="dialog"
				aria-modal="true"
				aria-label={t("app.nav.label")}
				tabIndex={-1}
				onKeyDown={handleDrawerKeyDown}
				className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-white shadow-xl transition-[transform,translate,scale,rotate,visibility] duration-300 ease-in-out md:hidden ${
					mobileNavOpen ? "translate-x-0 visible" : "-translate-x-full invisible"
				}`}
			>
				<div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
					<div className="flex items-center gap-2">
						<span aria-hidden>🛫</span>
						<span className="text-lg font-bold">chiaotu</span>
					</div>
					<button
						type="button"
						onClick={() => setMobileNavOpen(false)}
						aria-label={t("common.close")}
						className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<NavButtons
					active={active}
					onNavigate={(key) => {
						navigateTo(key);
						setMobileNavOpen(false);
					}}
				/>
				<div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
					<LanguageSwitcher />
					<BackendStatus />
				</div>
			</aside>
		</div>
	);
}
