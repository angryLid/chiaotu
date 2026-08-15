import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n"; // i18n bootstrap: init runs before the first render
import App from "./App";
import { ApiError } from "./api/subscriptions";
import "./index.css";

/**
 * Global query policy (contract in friend-cats "unified response envelope"):
 * - Deterministic business errors (INVALID_ARGUMENT / NOT_FOUND) are not retried;
 * - Everything else (transport failure, FETCH_FAILED, INTERNAL) retries up to 2 times;
 * - staleTime 30s: lists rely on mutation invalidation to refresh, no refetch within the window.
 */
const NO_RETRY_CODES = new Set([
	"INVALID_ARGUMENT",
	"NOT_FOUND",
	"UNAUTHORIZED",
]);

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: (failureCount, error) => {
				if (
					error instanceof ApiError &&
					error.code !== null &&
					NO_RETRY_CODES.has(error.code)
				) {
					return false;
				}
				return failureCount < 2;
			},
		},
		mutations: {
			retry: false,
		},
	},
});

const rootElement = document.getElementById("root");
if (!rootElement) {
	throw new Error("Root element not found");
}
createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
			<ReactQueryDevtools initialIsOpen={false} />
		</QueryClientProvider>
	</StrictMode>,
);
