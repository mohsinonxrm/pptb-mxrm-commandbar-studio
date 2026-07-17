import type { RibbonButton, RibbonDefinition, RibbonLocation, RibbonOrigin } from "@/types/ribbon";

/**
 * Platform-owned base ribbon ids. Microsoft's out-of-the-box ribbon uses the
 * `Mscrm.` / `Microsoft.` namespaces exclusively. This is only a FALLBACK signal
 * for OOB-vs-not when solution-layer data is unavailable — it deliberately makes
 * NO managed-vs-unmanaged claim (that requires layer data, since first-party apps
 * like `msdyn_*`, `adx_*`, Field Service, Contact Center and ISVs all use their
 * own prefixes yet are "from a solution", not OOB).
 */
export function isSystemRibbonId(id: string): boolean {
	return /^(Mscrm|Microsoft)\./.test(id);
}

export interface ButtonProvenance {
	origin: RibbonOrigin;
	solutionName?: string;
	publisherName?: string;
}

/**
 * Sets `origin` and the derived legacy booleans (`oob` / `custom` / `managed`)
 * on a button in place, so existing UI that still reads those flags keeps
 * working while new UI can read the richer `origin`.
 */
export function applyButtonOrigin(button: RibbonButton, p: ButtonProvenance): void {
	button.origin = p.origin;
	button.solutionName = p.solutionName;
	button.publisherName = p.publisherName;
	button.oob = p.origin === "oob";
	button.custom = p.origin === "unmanaged";
	button.managed = p.origin === "managed";
}

/**
 * Best-effort origin used at parse time, before (or instead of) solution-layer
 * data. A button defined via a `<CustomAction>` is definitely a customization;
 * otherwise fall back to the namespace heuristic.
 */
export function heuristicOrigin(id: string, inCustomAction: boolean): RibbonOrigin {
	if (inCustomAction) return "unmanaged";
	return isSystemRibbonId(id) ? "oob" : "unmanaged";
}

/**
 * Overlays authoritative solution-layer provenance onto every button in a set
 * of ribbons (mutates in place). Buttons not present in the map keep whatever
 * the parser's heuristic set.
 */
export function applyProvenanceToRibbons(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
	provenance: Map<string, ButtonProvenance>,
): void {
	if (provenance.size === 0) return;
	for (const location of Object.keys(ribbons) as RibbonLocation[]) {
		for (const tab of ribbons[location].tabs) {
			for (const group of tab.groups) {
				for (const button of group.buttons) {
					const p = provenance.get(button.id);
					if (p) applyButtonOrigin(button, p);
				}
			}
		}
	}
}
