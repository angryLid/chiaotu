import path from "node:path";
import { USER_AGENT } from "~/constants";
import { GenericIOError } from "~/errors/generic-io-error";
import { address } from "~/persistence/address";
import { writeFile } from "~/persistence/file-utils";
import { store } from "~/persistence/store";
import { produce } from "~/utils/produce";

import {
	formatTimestamp,
	getFilenameFromContentDisposition,
} from "~/utils/string";

export async function commandGenerate(skipDownload = true) {
	if (!skipDownload) {
		await download();
	}

	const dump = await produce();

	writeFile(path.join(address.result, `${formatTimestamp()}.yaml`), dump);
	writeFile(path.join(address.clashMeta, `chiaotu.yaml`), dump);
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
