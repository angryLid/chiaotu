import { USER_AGENT } from "~/constants";
import { store } from "~/persistence/store";
import { getFilenameFromContentDisposition } from "~/utils/string";

/**
 * addSubscription download and save the raw profile from the airport.
 * @param link The subscription link
 * @returns
 */
export async function addSubscription(link: string) {
	const response = await fetch(link, {
		headers: {
			"User-Agent": USER_AGENT,
		},
	});

	const contentDisposition = response.headers.get("Content-Disposition");

	if (!contentDisposition) {
		throw new Error("No filename found in Content-Disposition header");
	}

	const name = getFilenameFromContentDisposition(contentDisposition);

	if (!name) {
		throw new Error("Failed to parse Content-Disposition");
	}

	const content = await response.text();

	store.set((conf) => {
		const existing = conf.subscriptions.find((s) => s.name === name);

		const toUpdate = {
			link,
			name,
			content,
			updatedTime: new Date(),
		};

		if (existing) {
			Object.assign(existing, toUpdate);
		} else {
			conf.subscriptions.push(toUpdate);
		}
	});
}

export function list() {
	const { subscriptions } = store.state.configuration;

	console.table(
		subscriptions.map(({ content, link, ...rest }) => ({ ...rest })),
	);
}
