/** History-mode navigation helper (replaces the old hash-based routing).
 * `history.pushState` alone does not fire `popstate`, so we dispatch it manually
 * to keep the single route listener in App.tsx in sync. */
export function navigate(path: string) {
	history.pushState({}, "", path);
	window.dispatchEvent(new PopStateEvent("popstate"));
}
