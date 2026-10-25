import type { LocLabel } from "@/types/ribbon";
import { resolveDisplayLabel } from "@/utils/displayLabel";

/**
 * Generates a $LocLabels: reference string for a LocLabel ID.
 */
export function locLabelRef(locLabelId: string): string {
	return `$LocLabels:${locLabelId}`;
}

/**
 * Extracts the LocLabel ID from a $LocLabels: reference, or returns null.
 */
export function extractLocLabelId(value: string): string | null {
	const match = value.match(/^\$LocLabels:(.+)$/);
	return match ? match[1] : null;
}

/**
 * Longest LocLabel Id a publish accepts everywhere: one used by a flyout /
 * split-button menu item makes PublishXml fail with 0x80090429 ("would be
 * truncated … LocalizedLabel.ObjectColumnName") from 129 characters on —
 * measured live, after the import itself succeeded (#86).
 */
export const MAX_LOC_LABEL_ID_LENGTH = 128;

/** `{controlId}.{suffix}`, shortened with a stable hash of the control id when it would be too long (#86). */
function conventionLabelId(controlId: string, suffix: string): string {
	const id = `${controlId}.${suffix}`;
	if (id.length <= MAX_LOC_LABEL_ID_LENGTH) return id;
	const hash = fnv1a(controlId);
	const keep = MAX_LOC_LABEL_ID_LENGTH - suffix.length - hash.length - 2;
	return `${controlId.slice(0, keep)}_${hash}.${suffix}`;
}

/** 32-bit FNV-1a as 8 hex digits. */
function fnv1a(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Returns the LocLabel ID for a button's label text.
 * Convention: {buttonId}.LabelText (shortened when too long, #86)
 */
export function buttonLabelId(buttonId: string): string {
	return conventionLabelId(buttonId, "LabelText");
}

/**
 * Returns the LocLabel ID for a button's tooltip title.
 */
export function buttonTooltipTitleId(buttonId: string): string {
	return conventionLabelId(buttonId, "ToolTipTitle");
}

/**
 * Returns the LocLabel ID for a button's tooltip body.
 */
export function buttonTooltipBodyId(buttonId: string): string {
	return conventionLabelId(buttonId, "ToolTipDescription");
}

/** The LocLabel ID for a menu section's title: {sectionId}.Title (shortened when too long, #86). */
export function sectionTitleLabelId(sectionId: string): string {
	return conventionLabelId(sectionId, "Title");
}

/**
 * The LocLabel ids of a button's text, tooltip title and tooltip body: the
 * `$LocLabels:` label each one references as loaded (a Ribbon Workbench or
 * solution label keeps its own id), else the convention id (#49).
 */
export function buttonLocLabelIds(
	buttonId: string,
	source?: { labelToken?: string; tooltipTitleToken?: string; tooltipBodyToken?: string },
): { label: string; tooltipTitle: string; tooltipBody: string } {
	const refOr = (token: string | undefined, fallback: string) => (token ? extractLocLabelId(token) : null) ?? fallback;
	return {
		label: refOr(source?.labelToken, buttonLabelId(buttonId)),
		tooltipTitle: refOr(source?.tooltipTitleToken, buttonTooltipTitleId(buttonId)),
		tooltipBody: refOr(source?.tooltipBodyToken, buttonTooltipBodyId(buttonId)),
	};
}

/**
 * The LocLabel a text of a control is written to, as the generator writes it
 * (#137): the label its `$LocLabels:` token names when that label is loaded;
 * `null` for another solution's label (not loaded) while the text is as
 * loaded — it's shared, and written back as it is; else the convention id.
 */
export function textLabelId(
	token: string | undefined,
	conventionId: string,
	text: string | undefined,
	locLabels: readonly LocLabel[],
	lang = 1033,
): string | null {
	const id = token ? extractLocLabelId(token) : null;
	if (!id) return conventionId;
	if (locLabels.some((l) => l.id === id)) return id;
	return (text ?? "") === resolveDisplayLabel(token, [...locLabels], lang) ? null : conventionId;
}

/**
 * Languages a button has text in, from its own labels only (exact ids, #22: a
 * prefix match also picked up `Foo.Button2`'s labels for `Foo.Button`), with
 * the base language first.
 */
export function buttonTranslationLcids(
	button: { id: string; source?: { labelToken?: string; tooltipTitleToken?: string; tooltipBodyToken?: string } },
	locLabels: readonly { id: string; titles: readonly { languageCode: number }[] }[],
	baseLanguageCode = 1033,
): number[] {
	const ids = new Set(Object.values(buttonLocLabelIds(button.id, button.source)));
	const lcids = new Set<number>();
	for (const label of locLabels) if (ids.has(label.id)) label.titles.forEach((t) => lcids.add(t.languageCode));
	return [...lcids].sort((a, b) => (a === baseLanguageCode ? -1 : b === baseLanguageCode ? 1 : a - b));
}
