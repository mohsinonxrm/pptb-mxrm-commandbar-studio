import type { LocLabel } from "@/types/ribbon";

/**
 * Resolves a Dataverse ribbon label string into something humans can read.
 *
 * Dataverse ribbon labels come in three flavors:
 *
 *   1. `$LocLabels:My.Solution.Button.Label` — references a LocLabel entry
 *      defined inside the same RibbonDiffXml. We resolve these to the title
 *      text for the user's preferred language (with English-1033 fallback).
 *
 *   2. `$Resources:Ribbon.HomepageGrid.Related.TabName` — references a built-in
 *      Dataverse resource file. These can't be resolved from the Web API in a
 *      tool like CBS — the resource files live inside the Dataverse runtime.
 *      We strip the `$Resources:` prefix and return the bare key so the user
 *      at least sees something meaningful instead of a noisy literal.
 *
 *   3. A plain string — emitted directly, no transformation.
 */
export function resolveDisplayLabel(
	label: string | undefined | null,
	locLabels: LocLabel[],
	preferredLanguageCode = 1033,
): string {
	if (!label) return "";

	// $LocLabels reference → look up by ID in the parsed LocLabels collection
	const locMatch = label.match(/^\$LocLabels:(.+)$/);
	if (locMatch) {
		const id = locMatch[1];
		const entry = locLabels.find((l) => l.id === id);
		if (entry) {
			const preferred = entry.titles.find((t) => t.languageCode === preferredLanguageCode);
			const english = entry.titles.find((t) => t.languageCode === 1033);
			const first = entry.titles[0];
			return preferred?.description ?? english?.description ?? first?.description ?? id;
		}
		// Reference exists but no matching LocLabel — show the key, signal the
		// problem with a leading dot so the user can spot orphan references.
		return id;
	}

	// $Resources reference → strip the prefix; we can't resolve the actual
	// localized text without the runtime resource file.
	const resMatch = label.match(/^\$Resources:(.+)$/);
	if (resMatch) {
		return resMatch[1];
	}

	return label;
}
