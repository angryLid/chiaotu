/** Parse the filename from a Content-Disposition header, or null when absent. */
export function getFilenameFromContentDisposition(
	contentDisposition: string,
): string | null {
	const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
	const match = contentDisposition.match(filenameRegex);
	if (match?.[1]) {
		let filename = match[1];
		if (filename.startsWith('"') && filename.endsWith('"')) {
			filename = filename.slice(1, -1);
		}
		// Handle UTF-8 encoded filenames
		if (filename.startsWith("UTF-8''")) {
			filename = decodeURIComponent(filename.substring(7));
		}
		return filename;
	}
	return null;
}

/** Format a Unix timestamp as yyyy-MM-dd-HH-mm-ss in local time. */
export function formatTimestamp(timestamp?: number): string {
	const baseTimestamp = timestamp ? timestamp : Date.now();

	const date = new Date(baseTimestamp);

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}

/** Resolve a flag emoji by matching keywords in the node name. */
export function getFlagByNodeName(nodeName: string) {
	const flagMap = {
		日本: "🇯🇵",
		新加坡: "🇸🇬",
		香港: "🇭🇰",
		韩国: "🇰🇷",
		印度: "🇮🇳",
		台湾: "🇼🇸",
		美国: "🇺🇸",
		加拿大: "🇨🇦",
		德国: "🇩🇪",
		英国: "🇬🇧",
		越南: "🇻🇳",
		俄罗斯: "🇷🇺",
		乌克兰: "🇺🇦",
		土耳其: "🇹🇷",
		尼日利亚: "🇳🇬",
		印度尼西亚: "🇮🇩",
		马来西亚: "🇲🇾",
		// Hong Kong
		HK: "🇭🇰",
		// Singapore
		SG: "🇸🇬",
		// Taiwan
		TW: "🇼🇸",
		// Japan
		JP: "🇯🇵",
		// United States
		US: "🇺🇸",
		// Germany
		DE: "🇩🇪",
		// United Kingdom
		UK: "🇬🇧",
		// Indonesia
		ID: "🇮🇩",
		// Malaysia
		MY: "🇲🇾",
		// Vietnam
		VN: "🇻🇳",
	};

	for (const [name, flag] of Object.entries(flagMap)) {
		if (nodeName.includes(name)) {
			return flag;
		}
	}

	return "";
}
