import { join } from "node:path";
import { address } from "~/persistence/address";
import { saveFile } from "~/persistence/file-utils";

export function addPreset(filePath: string) {
	saveFile(filePath, join(address.preset, filePath));
}
