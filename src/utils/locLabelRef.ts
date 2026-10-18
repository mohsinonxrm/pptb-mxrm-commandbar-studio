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
