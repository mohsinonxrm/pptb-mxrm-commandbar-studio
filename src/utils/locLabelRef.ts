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
