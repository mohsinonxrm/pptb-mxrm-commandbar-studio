import recorded from "@/services/uciPreview/resourceLabels.json";

/**
 * Unified Interface's English text for `$Resources:` labels (#191), which Dataverse resolves and
 * the ribbon CBS loads doesn't carry: as recorded on CRM279420's command bars and Command
 * Checker (2026-10-29 and 2026-11-15). Generated from those fixtures by
 * `uciLabels191.test.ts`. An entity's name in a label is `{EntityDisplayName}`.
 */
const LABELS: Readonly<Record<string, string>> = recorded;

/** The text Unified Interface shows for a `$Resources:` label, if it was recorded. */
export function uciLabel(token: string | undefined, entityLabel: string): string | undefined {
	const text = token ? LABELS[token] : undefined;
	return text?.replace(/\{EntityDisplayName\}/g, entityLabel);
}
