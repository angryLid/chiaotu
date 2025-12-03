import path from "node:path";
import yaml from "js-yaml";
import { GenericIOError } from "~/errors/generic-io-error";
import { address } from "~/persistence/address";
import {
	type ClashProfile,
	ClashProfileSchema,
	type Proxy as IProxy,
	type ProxyGroup,
} from "~/persistence/clash-profile";
import { readFile, selectAllFiles, writeFile } from "~/persistence/file-utils";
import { store } from "~/persistence/store";
import {
	formatTimestamp,
	getFilenameFromContentDisposition,
} from "~/utils/string";

const USER_AGENT = "ClashMetaForAndroid/2.11.19";
export async function commandGenerate(skipDownload = false) {
	if (!skipDownload) {
		await download();
	}

	const baseTmpl = await readFile(address.template);
	const baseProfile = ClashProfileSchema.parse(yaml.load(baseTmpl));
	const filePathList = await selectAllFiles(address.cache, "yaml");

	const proxies: ClashProfile["proxies"] = [];
	for (const filePath of filePathList) {
		const fileContent = await readFile(filePath);
		const rawProfile = yaml.load(fileContent);
		const profile = ClashProfileSchema.parse(rawProfile);
		proxies.push(
			...profile.proxies.map(({ name, ...rest }) => ({
				name: `${name}@..${filePath.slice(-7, -5)}`,
				rest,
			})),
		);
	}

	const filteredProxies = proxies.filter(
		({ name }) => !name.includes("剩余") && !name.includes("到期"),
	);

	const group = createGroupsByCountry(filteredProxies);

	baseProfile.proxies = filteredProxies;
	baseProfile["proxy-groups"] = group;

	await writeFile(
		path.join(address.result, `${formatTimestamp()}.yaml`),
		yaml.dump(baseProfile, { flowLevel: 2, indent: 2, lineWidth: 80 }),
	);
}

/**
 * Creates proxy groups organized by country/region based on proxy names.
 * This function categorizes proxies into regional groups and creates special
 * purpose groups for different services.
 *
 * @param proxies - Array of proxy objects to organize
 * @returns Array of proxy groups categorized by country/region and service
 */
function createGroupsByCountry(proxies: Array<IProxy>): ProxyGroup[] {
	const de: ProxyGroup = {
		name: "Germany",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600, // 60 * 60 seconds
		url: "https://www.gstatic.com/generate_204",
	};

	const tw: ProxyGroup = {
		name: "Taiwan",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const hk: ProxyGroup = {
		name: "Hong Kong",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const jp: ProxyGroup = {
		name: "Japan",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const sg: ProxyGroup = {
		name: "Singapore",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const us: ProxyGroup = {
		name: "US",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const uk: ProxyGroup = {
		name: "UK",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const asia: ProxyGroup = {
		name: "Asia",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const others: ProxyGroup = {
		name: "Other",
		type: "url-test",
		proxies: [],
		timeout: undefined,
		interval: 3600,
		url: "https://www.gstatic.com/generate_204",
	};

	const asiaKeywords = [
		"越南",
		"VN",
		"泰国",
		"TH",
		"马来西亚",
		"MY",
		"印尼",
		"印度尼西亚",
		"ID",
		"韩国",
		"KR",
		"PH",
		"菲律宾",
	];

	for (const proxy of proxies) {
		const name = proxy.name as string;

		if (name.includes("德国") || name.includes("DE")) {
			de.proxies.push(name);
		} else if (name.includes("台湾") || name.includes("TW")) {
			tw.proxies.push(name);
		} else if (name.includes("香港") || name.includes("HK")) {
			hk.proxies.push(name);
		} else if (name.includes("日本") || name.includes("JP")) {
			jp.proxies.push(name);
		} else if (name.includes("新加坡") || name.includes("SG")) {
			sg.proxies.push(name);
		} else if (name.includes("美国") || name.includes("US")) {
			us.proxies.push(name);
		} else if (name.includes("英国") || name.includes("UK")) {
			uk.proxies.push(name);
		} else if (asiaKeywords.some((keyword) => name.includes(keyword))) {
			asia.proxies.push(name);
		} else {
			others.proxies.push(name);
		}
	}

	const baseProxies = [
		"Hong Kong",
		"Taiwan",
		"Japan",
		"Singapore",
		"Asia",
		"Germany",
		"US",
		"UK",
		"Other",
	];

	const select: ProxyGroup = {
		name: "手动选择",
		type: "select",
		proxies: baseProxies,
		timeout: undefined,
		interval: undefined,
		url: undefined,
	};

	const ms: ProxyGroup = {
		name: "Microsoft",
		type: "select",
		proxies: ["DIRECT", ...baseProxies],
		timeout: undefined,
		interval: undefined,
		url: undefined,
	};

	const apple: ProxyGroup = {
		name: "Apple",
		type: "select",
		proxies: ["DIRECT", ...baseProxies],
		timeout: undefined,
		interval: undefined,
		url: undefined,
	};

	const google: ProxyGroup = {
		name: "AI",
		type: "select",
		proxies: baseProxies.slice(),
		timeout: undefined,
		interval: undefined,
		url: undefined,
	};

	return [select, google, ms, apple, tw, hk, jp, sg, asia, us, uk, de, others];
}

async function download() {
	const {
		state: {
			configuration: { upstreams },
		},
	} = store;

	const results = await Promise.allSettled(
		upstreams.map(async (url) => {
			const response = await fetch(url, {
				headers: {
					"User-Agent": USER_AGENT,
				},
			});
			const contentDisposition = response.headers.get("Content-Disposition");
			const filename = contentDisposition
				? getFilenameFromContentDisposition(contentDisposition)
				: null;

			if (!filename) {
				throw new Error("No filename found in Content-Disposition header");
			}

			const content = await response.text();
			return { url, filename, content };
		}),
	);

	const successfulDownloads: Array<{
		url: string;
		filename: string;
		content: string;
	}> = [];

	const errors: Array<{
		url: string;
		error: Error;
	}> = [];

	results.forEach((result) => {
		if (result.status === "fulfilled") {
			successfulDownloads.push(result.value);
		} else {
			errors.push({
				url: result.reason?.url || "unknown",
				error: result.reason,
			});
		}
	});

	// Write successful downloads to cache
	for (const download of successfulDownloads) {
		await writeFile(
			path.join(address.cache, `${download.filename}.yaml`),
			download.content,
		);
	}

	if (errors.length > 0) {
		throw new GenericIOError(`${errors.length} downloads failed`, {
			cause: errors,
		});
	}
}
