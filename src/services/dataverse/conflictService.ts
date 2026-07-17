import type { ConflictEntry, ConflictSolutionLayer } from "@/types/ribbon";

function getDataverseAPI() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

function parseSolutions(rows: Record<string, unknown>[]): ConflictSolutionLayer[] {
	const mapped = rows.map((row) => {
		const publisher = row["publisherid"] as
			| { friendlyname?: string; customizationprefix?: string }
			| undefined;
		const versionNumberRaw = row["versionnumber"];
		const versionNumber =
			typeof versionNumberRaw === "number" ? versionNumberRaw : Number(versionNumberRaw ?? 0) || 0;

		return {
			solutionId: String(row["solutionid"] ?? ""),
			solutionName: String(row["friendlyname"] ?? row["uniquename"] ?? "Unknown Solution"),
			publisher: String(
				publisher?.friendlyname ?? publisher?.customizationprefix ?? "Unknown Publisher",
			),
			managed: Boolean(row["ismanaged"]),
			importedOn: row["modifiedon"] ? String(row["modifiedon"]) : undefined,
			wins: false,
			versionNumber,
		};
	});

	mapped.sort((a, b) => a.versionNumber - b.versionNumber);
	if (mapped.length > 0) {
		mapped[mapped.length - 1].wins = true;
	}

	return mapped.map(({ versionNumber: _versionNumber, ...layer }) => layer);
}

export async function fetchConflictLayersForElement(
	elementId: string,
): Promise<ConflictEntry | null> {
	if (!elementId) return null;
	const dataverseAPI = getDataverseAPI();

	const response = await dataverseAPI.getSolutions([
		"solutionid",
		"friendlyname",
		"uniquename",
		"ismanaged",
		"publisherid",
		"versionnumber",
		"modifiedon",
	]);

	const rows = response.value as Record<string, unknown>[];
	if (rows.length <= 1) return null;

	return {
		elementId,
		elementKind: "button",
		solutions: parseSolutions(rows),
	};
}
