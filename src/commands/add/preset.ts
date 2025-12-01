import { address } from "~/persistence/address";
import { saveFile } from "~/persistence/file-utils";

export function addPreset(filePath: string) {
	saveFile(filePath, address.preset);
}
