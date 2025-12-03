import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

async function initBaseDir(): Promise<string> {
	const homeDir = os.homedir();
	const baseDir = path.join(homeDir, ".config", "chiaotu");

	// Create the directory if it doesn't exist
	try {
		await fs.access(baseDir);
	} catch (_error) {
		// Directory doesn't exist, create it
		await fs.mkdir(baseDir, { recursive: true });
	}

	return baseDir;
}

// Initialize the base directory with top-level await
const baseDir = await initBaseDir();

export const address = {
	preset: path.join(baseDir, "presets"),
	cache: path.join(baseDir, "cache"),
	configuration: path.join(baseDir, "configuration.json"),
	template: path.join(baseDir, "templates", "base.yaml"),
	result: path.join(baseDir, "results"),
};
