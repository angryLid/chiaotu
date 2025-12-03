import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GenericIOError } from "~/errors/generic-io-error";

function resolvePath(filePath: string): string {
	// Handle tilde expansion for home directory
	if (filePath.startsWith("~")) {
		const homeDir = os.homedir();
		return path.join(homeDir, filePath.slice(1));
	} else if (!path.isAbsolute(filePath)) {
		// Handle relative paths by resolving against current working directory
		return path.resolve(process.cwd(), filePath);
	}
	return filePath;
}

async function ensureFileExists(filePath: string): Promise<void> {
	try {
		await fs.access(filePath);
	} catch {
		await writeFile(filePath, "{}");
	}
}

export async function saveFile(filePath: string, destination: string) {
	const resolvedSourcePath = resolvePath(filePath);
	const resolvedDestinationPath = resolvePath(destination);

	try {
		// Check if source file exists
		await fs.access(resolvedSourcePath);
	} catch (error) {
		throw new GenericIOError(`Source file not found: ${resolvedSourcePath}`, {
			cause: error,
		});
	}

	try {
		// Ensure the destination directory exists
		const destinationDir = path.dirname(resolvedDestinationPath);
		await fs.mkdir(destinationDir, { recursive: true });

		// Copy file to destination
		await fs.copyFile(resolvedSourcePath, resolvedDestinationPath);
	} catch (error) {
		throw new GenericIOError(
			`Failed to save file to destination: ${resolvedDestinationPath}`,
			{ cause: error },
		);
	}
}

export async function writeFile(filePath: string, content: string) {
	const resolvedPath = resolvePath(filePath);

	try {
		// Ensure the directory exists
		const dir = path.dirname(resolvedPath);
		await fs.mkdir(dir, { recursive: true });

		// Write content to file
		await fs.writeFile(resolvedPath, content, "utf8");
	} catch (error) {
		throw new GenericIOError(`Failed to write file: ${resolvedPath}`, {
			cause: error,
		});
	}
}

export async function readFile(
	filePath: string,
	autoCreate = true,
): Promise<string> {
	const resolvedPath = resolvePath(filePath);

	if (autoCreate) {
		await ensureFileExists(resolvedPath);
	}

	try {
		// Read file content as string
		const content = await fs.readFile(resolvedPath, "utf8");
		return content;
	} catch (error) {
		throw new GenericIOError(`Failed to read file: ${resolvedPath}`, {
			cause: error,
		});
	}
}

/**
 * Retrieves all files with a specific extension from a directory and its subdirectories.
 *
 * This function recursively searches through the specified directory and all its subdirectories
 * to find files that match the given extension. It returns an array of full file paths
 * for all matching files found.
 *
 * @param directoryPath - The path to the directory to search for files. Can be relative or absolute.
 * @param extensionName - The file extension to search for (e.g., "yaml", "json", "txt").
 *                       Should not include the dot prefix (e.g., use "yaml", not ".yaml").
 * @returns A Promise that resolves to an array of strings, where each string is the full path
 *          to a file with the specified extension.
 *
 * @throws {GenericIOError} If the directory cannot be accessed or read.
 *
 * @example
 * // Get all YAML files in the current directory
 * const yamlFiles = await selectAllFiles("./config", "yaml");
 * console.log(yamlFiles); // ["./config/settings.yaml", "./config/database.yaml"]
 *
 * @example
 * // Get all JSON files in the documents directory
 * const jsonFiles = await selectAllFiles("~/Documents", "json");
 * console.log(jsonFiles); // ["/Users/username/Documents/data.json", "/Users/username/Documents/config.json"]
 */
export async function selectAllFiles(
	directoryPath: string,
	extensionName: string,
): Promise<string[]> {
	const resolvedPath = resolvePath(directoryPath);

	// Normalize extension to remove leading dot if present
	const normalizedExtension = extensionName.startsWith(".")
		? extensionName.slice(1)
		: extensionName;

	const matchingFiles: string[] = [];

	async function scanDirectory(currentPath: string): Promise<void> {
		try {
			const entries = await fs.readdir(currentPath, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(currentPath, entry.name);

				if (entry.isDirectory()) {
					// Recursively scan subdirectories
					await scanDirectory(fullPath);
				} else if (entry.isFile()) {
					// Check if file has the correct extension
					const fileExtension = path.extname(entry.name).slice(1);
					if (fileExtension === normalizedExtension) {
						matchingFiles.push(fullPath);
					}
				}
			}
		} catch (error) {
			throw new GenericIOError(`Failed to read directory: ${currentPath}`, {
				cause: error,
			});
		}
	}

	await scanDirectory(resolvedPath);
	return matchingFiles;
}
