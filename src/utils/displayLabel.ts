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
	const locMatch = label.match(LOC_LABELS);
	if (locMatch) {
		const [, parameter, id] = locMatch;
		const entry = locLabels.find((l) => l.id === id);
		if (entry) {
			const preferred = entry.titles.find((t) => t.languageCode === preferredLanguageCode);
			const english = entry.titles.find((t) => t.languageCode === 1033);
			const first = entry.titles[0];
			const text = preferred?.description ?? english?.description ?? first?.description;
			return text ? fillParameter(text, parameter) : id;
		}
		// Reference exists but no matching LocLabel — show the key, signal the
		// problem with a leading dot so the user can spot orphan references.
		return id;
	}

	// $Resources reference → strip the prefix; we can't resolve the actual
	// localized text without the runtime resource file.
	const resMatch = label.match(/^\$Resources(?:\([^)]*\))?:(.+)$/);
	if (resMatch) {
		return resMatch[1];
	}

	return label;
}

/**
 * A `$LocLabels:` reference, or a parameterised one such as Customer Service's
 * `$LocLabels(EntityDisplayName):Ribbon.HomepageGrid.incident.MainTab.Management.Controls.New`
 * (its text "New {0}", the entity's name in place of `{0}`).
 */
const LOC_LABELS = /^\$LocLabels(?:\(([^)]*)\))?:(.+)$/;

/**
 * A parameterised label's text with the table's name in place of `{0}`, as the placeholder the
 * application ribbon uses (`{!EntityDisplayName}`), so it reads (and simulates) the same way.
 */
export function fillParameter(text: string, parameter: string | undefined): string {
	if (parameter !== "EntityDisplayName" && parameter !== "EntityPluralDisplayName") return text;
	return text.replace(/\{0\}/g, `{!${parameter}}`);
}

/** The parameter of a `$LocLabels(…):` reference, if it has one. */
export function locLabelParameter(reference: string): string | undefined {
	return reference.match(LOC_LABELS)?.[1];
}

/** The LocLabel id a `$LocLabels:` reference names, parameterised or not. */
export function locLabelId(reference: string | undefined): string | undefined {
	return reference?.match(LOC_LABELS)?.[2];
}

/**
 * Text shown for a parameterised label (`{!EntityDisplayName}`) as its LocLabel stores it
 * (`{0}`), for writing an edit back.
 */
export function unfillParameter(text: string): string {
	return text.replace(/\{!(EntityDisplayName|EntityPluralDisplayName)\}/g, "{0}");
}

/**
 * A platform text: `$Resources:Key`, or a parameterised one such as
 * `$Resources(EntityDisplayName):Ribbon.Tooltip.New`. Dataverse resolves it;
 * CBS can't, so it's written back as is and never turned into a label (#86).
 */
export function isPlatformText(value: string | undefined): boolean {
	return !!value && /^\$Resources(\([^)]*\))?:/.test(value);
}
