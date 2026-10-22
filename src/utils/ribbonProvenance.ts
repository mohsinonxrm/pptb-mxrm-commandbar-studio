import type {
	RibbonButton,
	RibbonDefinition,
	RibbonGroup,
	RibbonLocation,
	RibbonOrigin,
	RibbonTab,
} from "@/types/ribbon";
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
	return deletableControls(loadedOwnership(baseline), [button]);
}

/** Whether each control loaded with the workspace was yours, by id. */
function loadedOwnership(baseline: RibbonDefinition): Map<string, boolean> {
	const loaded = new Map<string, boolean>();
	for (const tab of baseline.tabs)
		for (const group of tab.groups)
			for (const control of groupControls(group)) {
				// The application ribbon repeats ids: yours only if every occurrence is.
				loaded.set(control.id, (loaded.get(control.id) ?? true) && isOwnControl(control));
			}
	return loaded;
}

function deletableControls(loaded: Map<string, boolean>, buttons: RibbonButton[]): boolean {
	return withMenuItems(buttons).every((control) => loaded.get(control.id) ?? isOwnControl(control));
}

/** Tab / group ids the scope's unmanaged layer adds (LayerSnapshot.containerIds). */
export type OwnContainerIds = ReadonlySet<string> | readonly string[] | undefined;

/**
 * Whether a tab or group is yours — publishPlan's rule for removing one: it
 * was created this session, or the unmanaged layer adds it. Unknown (no layer
 * read) means not yours for anything loaded.
 */
function isOwnContainer(id: string, loaded: boolean, own: OwnContainerIds): boolean {
	if (!loaded) return true;
	if (!own) return false;
	return "has" in own ? own.has(id) : own.includes(id);
}

/**
 * Whether a group can be deleted (#17 review): it goes with every control in
 * it, so it must be yours and so must they — otherwise publish refuses the
 * removal, or deletes your group and leaves another solution's CustomAction
 * pointing at it.
 */
export function canDeleteGroup(group: RibbonGroup, baseline: RibbonDefinition, own: OwnContainerIds): boolean {
	const loaded = baseline.tabs.some((t) => t.groups.some((g) => g.id === group.id));
	return isOwnContainer(group.id, loaded, own) && deletableControls(loadedOwnership(baseline), group.buttons);
}

/** The parts of the scope's unmanaged layer the rename rule reads (LayerSnapshot). */
export interface RenameLayer {
	containerIds?: OwnContainerIds;
	locLabelIds?: OwnContainerIds;
}

/** Why a tab or group can't be renamed, in words (#33). */
export const RENAME_NOT_PUBLISHABLE =
	"Only tabs and groups your unmanaged customizations add (with a translatable title), or new ones, can be renamed";

/**
 * Whether renaming a tab or group can be published (#33): publishPlan's rename
 * rule. It was created this session, or the unmanaged layer adds it and its
 * title as loaded is a `$LocLabels:` label the layer defines (its text changes).
 * Out-of-the-box and managed ones would need an override of the whole tab /
 * group (#135). Unknown (no layer read) means no, for anything loaded.
 */
export function canRenameContainer(
	id: string,
	baseline: RibbonDefinition,
	layer: RenameLayer | null | undefined,
): boolean {
	const loaded =
		baseline.tabs.find((t) => t.id === id) ??
		baseline.tabs.flatMap((t) => t.groups).find((g) => g.id === id);
	if (!loaded) return true;
	if (!isOwnContainer(id, true, layer?.containerIds)) return false;
	const labelId = /^\$LocLabels:(.+)$/.exec(loaded.label ?? "")?.[1];
	return !!labelId && isOwnContainer(labelId, true, layer?.locLabelIds);
}

/** Whether a tab can be deleted (#17 review): yours, and so is every group and control in it. */
export function canDeleteTab(tab: RibbonTab, baseline: RibbonDefinition, own: OwnContainerIds): boolean {
	const loaded = baseline.tabs.some((t) => t.id === tab.id);
	return isOwnContainer(tab.id, loaded, own) && tab.groups.every((g) => canDeleteGroup(g, baseline, own));
}

/** Why a control can't be deleted, in words (#17): where it comes from. */
export function deleteBlockedReason(button: RibbonButton, baseline: RibbonDefinition): string {
	// As loaded: "Create override…" makes the canvas copy yours, not the original.
	// The application ribbon repeats ids: every occurrence counts.
	const loaded = baseline.tabs.flatMap((t) => t.groups.flatMap((g) => groupControls(g))).filter((c) => c.id === button.id);
	const foreign = loaded.find((c) => !isOwnControl(c));
	const from = foreign ?? loaded[0] ?? button;
	const source =
		from.origin === "oob"
			? "the out-of-the-box ribbon"
			: from.origin === "managed"
				? from.solutionName
					? `the managed solution "${from.solutionName}"`
					: "a managed solution"
				: undefined;
	if (foreign && loaded.some(isOwnControl)) {
		return `The ribbon also places a button with this id from ${source ?? "another solution"}, and that one can't be deleted.`;
	}
	if (source && isOwnControl(button)) {
		return `It is your override of a button from ${source}: the original stays in the ribbon underneath it.`;
	}
	if (source) return `It comes from ${source}.`;
	if (isOwnControl(from)) return "Its menu holds items from another solution.";
	return "It comes from another solution.";
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
