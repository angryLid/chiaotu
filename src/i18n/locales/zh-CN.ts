/**
 * Simplified Chinese (zh-CN) UI copy — the source of truth for the key space.
 *
 * `en.ts` is type-checked against this shape, and the i18next type augmentation in
 * `~/i18n` derives compile-time key checking from `typeof zhCN`, so every `t()` call
 * in the SPA is verified against this tree at build time.
 */
export const zhCN = {
	app: {
		nav: {
			subscriptions: "订阅管理",
			nodes: "所有节点",
			rules: "规则管理",
		},
		backend: {
			checking: "后端检查中…",
			unreachable: "后端不可达",
			connected: "后端已连接",
		},
		rules: {
			underConstruction: "功能开发中",
		},
		lang: {
			label: "语言",
		},
	},
	common: {
		loading: "加载中…",
		close: "关闭",
		cancel: "取消",
	},
	subs: {
		title: "订阅管理",
		createTitle: "新建订阅",
		new: "+ 新建订阅",
		refresh: "刷新",
		refreshing: "刷新中…",
		empty: "还没有订阅，点击右上角「新建订阅」添加第一个。",
		create: "创建",
		save: "保存",
		edit: "编辑",
		delete: "删除",
		deleting: "删除中…",
		view: "查看",
		submit: "提交中…",
		deleteConfirm: "确定删除订阅「{{name}}」吗？删除后无法恢复。",
		detailTitle: "订阅详情 #{{id}}",
		editTitle: "编辑订阅 #{{id}}",
		field: {
			name: "名称",
			url: "URL（更新来源）",
			content: "内容（原文）",
			optional: "（可选）",
			placeholderName: "例如：我的机场",
			placeholderUrl: "https://example.com/sub.yaml",
			placeholderContent: "无 URL 时直接粘贴订阅内容",
			hintName: "缺省时后端从 URL 路径末段推导",
			hintUrlContent:
				"url 与 content 至少填一项；同时填写时以 url 抓取的内容为准（content 将被覆盖）。",
		},
		validation: {
			urlOrContent: "url 与 content 至少填写一项",
			urlScheme: "URL 仅支持 http/https 协议",
		},
		detail: {
			url: "URL",
			createdAt: "创建时间",
			updatedAt: "更新时间",
			content: "内容",
			noUrl: "（无，直接存储的内容）",
			noUrlList: "（无 URL，直接存储的内容）",
			emptyContent: "（空内容）",
		},
		updatedSuffix: "更新于 {{date}}",
	},
	nodes: {
		title: "所有节点",
		refresh: "刷新",
		build: "构建",
		building: "构建中…",
		buildTitle: "构建「所有节点」",
		buildHint:
			"选择上游订阅：前端获取正文 → 浏览器解析节点 → 写回后端（只追加，不修改历史版本），产物供共享消费者读取。",
		chooseUpstream: "上游订阅（已选 {{selected}} 个）",
		selectAll: "全选",
		clearAll: "清空",
		noSubscriptions: "暂无订阅，请先在「订阅管理」中添加。",
		unnamed: "（未命名）",
		nodeCount: "#{{subId}} · {{total}} 个节点",
		noNodes: "该订阅未解析出节点",
		col: {
			name: "名称",
			type: "类型",
			server: "服务器",
			port: "端口",
		},
		buildSuccess: "构建成功：第 {{version}} 版快照已保存（{{date}}）",
		latestBuild: "最近一次构建",
		latestMeta: "第 {{version}} 版 · 构建于 {{date}} · 共 {{total}} 个节点",
		emptySnapshot: "尚未构建任何快照。选择上游订阅并点击「构建」。",
		emptyBuild: "该快照为空（所选上游均未解析出节点）。",
	},
	errors: {
		UNKNOWN: "请求失败",
		TRANSPORT_FAILED: "无法连接后端服务，请确认 friend-cats 已启动",
		INVALID_RESPONSE: "后端返回了无法解析的响应",
		SUBSCRIPTIONS_MISSING: "以下订阅不存在或已被删除：{{ids}}，构建中止",
		INVALID_YAML: "订阅「{{name}}」不是合法的 YAML，构建中止",
		PARSE_FAILED: "订阅「{{name}}」解析失败：{{detail}}，构建中止",
		INVALID_ARGUMENT: "请求参数无效",
		NOT_FOUND: "资源不存在（或已被删除）",
		FETCH_FAILED: "上游订阅抓取失败",
		METHOD_NOT_ALLOWED: "请求方式不被允许",
		INTERNAL: "服务器内部错误",
	},
} as const;
