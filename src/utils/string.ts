/**
 * Parse filename from Content-Disposition header
 * @param contentDisposition The Content-Disposition header value
 * @returns Extracted filename or null if not found
 */
export function getFilenameFromContentDisposition(
	contentDisposition: string,
): string | null {
	const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
	const match = contentDisposition.match(filenameRegex);
	if (match?.[1]) {
		let filename = match[1];
		// Remove quotes if present
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

/**
 * Format a Unix timestamp into a formatted string yyyy-MM-dd-HH-mm-ss
 * Gets UTC time first, then applies the timezone offset from current OS settings
 * to get the local time representation.
 * @param timestamp - Unix timestamp in milliseconds (optional, defaults to current UTC time)
 * @returns Formatted date string with timezone offset applied (e.g., 2025-12-03-20-15-30)
 */
export function formatTimestamp(timestamp?: number): string {
	// Get base timestamp (UTC time if provided, otherwise current UTC time)
	const baseTimestamp = timestamp ? timestamp : Date.now();

	// Create date object from UTC timestamp
	const date = new Date(baseTimestamp);

	// Apply timezone offset to get local time

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
}
