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
 * Returns the LocLabel ID for a button's label text.
 * Convention: {buttonId}.LabelText
 */
export function buttonLabelId(buttonId: string): string {
	return `${buttonId}.LabelText`;
}

/**
 * Returns the LocLabel ID for a button's tooltip title.
 */
export function buttonTooltipTitleId(buttonId: string): string {
	return `${buttonId}.ToolTipTitle`;
}

/**
 * Returns the LocLabel ID for a button's tooltip body.
 */
export function buttonTooltipBodyId(buttonId: string): string {
	return `${buttonId}.ToolTipDescription`;
}
