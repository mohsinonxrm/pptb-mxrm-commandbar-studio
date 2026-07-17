import { unzipSync, strFromU8 } from "fflate";

/**
 * Decompresses a base64-encoded ZIP returned by Dataverse RetrieveEntityRibbon /
 * RetrieveApplicationRibbon. The ZIP contains a single file "RibbonXml.xml".
 */
export async function decompressRibbonZip(base64Zip: string): Promise<string> {
	// 1. Decode base64 → Uint8Array
	const binaryStr = atob(base64Zip);
	const bytes = new Uint8Array(binaryStr.length);
	for (let i = 0; i < binaryStr.length; i++) {
		bytes[i] = binaryStr.charCodeAt(i);
	}

	// 2. Unzip synchronously (ZIP is small — < 5MB in practice)
	const unzipped = unzipSync(bytes);

	// 3. Find RibbonXml.xml (case-insensitive)
	const entry = Object.entries(unzipped).find(([name]) =>
		name.toLowerCase().endsWith("ribbonxml.xml"),
	);

	if (!entry) {
		// Fallback: return the first text file if the expected name is absent
		const first = Object.values(unzipped)[0];
		if (first) return strFromU8(first);
		throw new Error("decompressRibbonZip: no RibbonXml.xml entry found in ZIP");
	}

	return strFromU8(entry[1]);
}
