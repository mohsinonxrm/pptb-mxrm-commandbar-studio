import type { RibbonButton, RibbonDefinition, RibbonLocation, RibbonOrigin } from "@/types/ribbon";
import { groupControls, withMenuItems } from "@/utils/ribbonMenu";

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
 * Corrects "unmanaged" using the table's actual unmanaged ribbon layer: a
 * control is yours only if that layer adds it. The parser can't tell (the
 * merged ribbon contains no CustomActions), so first-party / ISV controls with
 * their own prefixes were treated as yours and could be "deleted" (#11 review N4).
 */
export function applyLayerOwnership(def: RibbonDefinition, ownIds: Set<string>): void {
	for (const tab of def.tabs)
		for (const group of tab.groups)
			for (const button of groupControls(group)) {
				if (ownIds.has(button.id)) applyButtonOrigin(button, { origin: "unmanaged" });
				else if (button.origin === "unmanaged") applyButtonOrigin(button, { origin: "managed" });
			}
}

/**
 * Whether a control is yours: the table's unmanaged layer adds it (set at
 * load, applyLayerOwnership), or it was created this session. Publish removes
 * only these (publishPlan); anything else can only be hidden.
 */
export function isOwnControl(button: Pick<RibbonButton, "origin">): boolean {
	return button.origin === "unmanaged";
}

/**
 * Whether a control can be deleted (#17) — the same rule publish applies, so
 * the canvas never removes what publish refuses: a control loaded with the
 * workspace counts as it was loaded (an override made this session doesn't
 * make the original yours), a new one by its own origin. A flyout / split
 * button is deleted with its menu, so every item must be deletable too.
 */
export function canDeleteControl(button: RibbonButton, baseline: RibbonDefinition): boolean {
	const loaded = new Map<string, boolean>();
	for (const tab of baseline.tabs)
		for (const group of tab.groups)
			for (const control of groupControls(group)) {
				// The application ribbon repeats ids: yours only if every occurrence is.
				loaded.set(control.id, (loaded.get(control.id) ?? true) && isOwnControl(control));
			}
	return withMenuItems([button]).every((control) => loaded.get(control.id) ?? isOwnControl(control));
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
				for (const button of groupControls(group)) {
					const p = provenance.get(button.id);
					if (p) applyButtonOrigin(button, p);
				}
			}
		}
	}
}
