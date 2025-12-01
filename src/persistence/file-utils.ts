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
		throw new GenericIOError(`Failed to write file: ${resolvedPath}`, { cause: error });
	}
}
