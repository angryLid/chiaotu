import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GenericIOError } from "~/errors/generic-io-error";

function resolvePath(filePath: string): string {
	if (filePath.startsWith("~")) {
		const homeDir = os.homedir();
		return path.join(homeDir, filePath.slice(1));
	} else if (!path.isAbsolute(filePath)) {
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
		await fs.access(resolvedSourcePath);
	} catch (error) {
		throw new GenericIOError(`Source file not found: ${resolvedSourcePath}`, {
			cause: error,
		});
	}

	try {
		const destinationDir = path.dirname(resolvedDestinationPath);
		await fs.mkdir(destinationDir, { recursive: true });

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
		const dir = path.dirname(resolvedPath);
		await fs.mkdir(dir, { recursive: true });

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
		const content = await fs.readFile(resolvedPath, "utf8");
		return content;
	} catch (error) {
		throw new GenericIOError(`Failed to read file: ${resolvedPath}`, {
			cause: error,
		});
	}
}

export async function selectAllFiles(
	directoryPath: string,
	extensionName: string,
): Promise<string[]> {
	const resolvedPath = resolvePath(directoryPath);

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
					await scanDirectory(fullPath);
				} else if (entry.isFile()) {
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
