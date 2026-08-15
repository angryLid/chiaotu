import { zhCN } from "./zh-CN";

/**
 * Maps a nested resource shape to the same key tree with plain string values,
 * so `en` is type-checked to have exactly the keys of `zhCN` (no missing /
 * extra / mistyped keys) without being forced to reuse its literal values.
 */
type DeepString<T> = {
	[K in keyof T]: T[K] extends object ? DeepString<T[K]> : string;
};

export const en: DeepString<typeof zhCN> = {
	app: {
		nav: {
			subscriptions: "Subscriptions",
			nodes: "All Nodes",
			rules: "Rules",
		},
		backend: {
			checking: "Checking backend…",
			unreachable: "Backend unreachable",
			connected: "Backend connected",
		},
		rules: {
			underConstruction: "Under construction",
		},
		lang: {
			label: "Language",
		},
	},
	common: {
		loading: "Loading…",
		close: "Close",
		cancel: "Cancel",
	},
	subs: {
		title: "Subscriptions",
		createTitle: "New subscription",
		new: "+ New subscription",
		refresh: "Refresh",
		refreshing: "Refreshing…",
		empty: "No subscriptions yet. Click “New subscription” in the top-right to add the first one.",
		create: "Create",
		save: "Save",
		edit: "Edit",
		delete: "Delete",
		deleting: "Deleting…",
		view: "View",
		submit: "Submitting…",
		deleteConfirm: "Delete subscription “{{name}}”? This cannot be undone.",
		detailTitle: "Subscription #{{id}}",
		editTitle: "Edit subscription #{{id}}",
		field: {
			name: "Name",
			url: "URL (update source)",
			content: "Content (raw)",
			optional: "(optional)",
			placeholderName: "e.g. My airport",
			placeholderUrl: "https://example.com/sub.yaml",
			placeholderContent: "Paste the subscription content when there is no URL",
			hintName: "Defaults to the last segment of the URL path when omitted",
			hintUrlContent:
				"At least one of url or content is required; when both are set, the fetched url content wins (content is overwritten).",
		},
		validation: {
			urlOrContent: "Provide at least one of url or content",
			urlScheme: "URL only supports http/https",
		},
		detail: {
			url: "URL",
			createdAt: "Created at",
			updatedAt: "Updated at",
			content: "Content",
			noUrl: "(none — content stored directly)",
			noUrlList: "(no URL — content stored directly)",
			emptyContent: "(empty)",
		},
		updatedSuffix: "Updated {{date}}",
	},
	nodes: {
		title: "All Nodes",
		refresh: "Refresh",
		build: "Build",
		building: "Building…",
		buildTitle: "Build “All Nodes”",
		buildHint:
			"Select upstream subscriptions: the frontend fetches content → parses nodes in the browser → writes back to the backend (append-only, historical versions are preserved); the result is read by shared consumers.",
		chooseUpstream: "Upstream subscriptions ({{selected}} selected)",
		selectAll: "Select all",
		clearAll: "Clear all",
		noSubscriptions: "No subscriptions yet. Add one in “Subscriptions” first.",
		unnamed: "(unnamed)",
		nodeCount: "#{{subId}} · {{total}} nodes",
		noNodes: "No nodes were parsed from this subscription",
		col: {
			name: "Name",
			type: "Type",
			server: "Server",
			port: "Port",
		},
		buildSuccess: "Build succeeded: snapshot #{{version}} saved ({{date}})",
		latestBuild: "Latest build",
		latestMeta: "Version {{version}} · built {{date}} · {{total}} nodes total",
		emptySnapshot: "No snapshot has been built yet. Select upstream subscriptions and click “Build”.",
		emptyBuild: "This snapshot is empty (none of the selected upstreams parsed any nodes).",
	},
	errors: {
		UNKNOWN: "Request failed",
		TRANSPORT_FAILED: "Cannot reach the backend — please make sure friend-cats is running",
		INVALID_RESPONSE: "The backend returned an unparseable response",
		SUBSCRIPTIONS_MISSING: "These subscriptions do not exist or were deleted: {{ids}} — build aborted",
		INVALID_YAML: "Subscription “{{name}}” is not valid YAML — build aborted",
		PARSE_FAILED: "Failed to parse subscription “{{name}}”: {{detail}} — build aborted",
		INVALID_ARGUMENT: "Invalid request parameters",
		NOT_FOUND: "Resource not found (or already deleted)",
		FETCH_FAILED: "Failed to fetch the upstream subscription",
		METHOD_NOT_ALLOWED: "Request method not allowed",
		INTERNAL: "Internal server error",
	},
};
