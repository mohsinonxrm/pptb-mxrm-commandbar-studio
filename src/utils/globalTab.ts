import type { RibbonLocation } from "@/types/ribbon";

/**
 * The global command bar (#166). Microsoft's docs ("Customize the global command bar",
 * https://learn.microsoft.com/power-apps/developer/model-driven-apps/ribbons-available)
 * support one place for your buttons there: `Mscrm.GlobalTab.New.Controls._children`, in
 * Unified Interface. Its built-in buttons can't be changed (see isReadOnlyGlobalOobButton).
 */
export const GLOBAL_TAB_ID = "Mscrm.GlobalTab";
export const GLOBAL_NEW_GROUP_ID = "Mscrm.GlobalTab.New";

/** Why your buttons go only in the New group, as the publish dialog and the controls say it. */
export const GLOBAL_TAB_NOTE =
	"the global command bar shows your buttons only in its New group (Mscrm.GlobalTab.New), in Unified Interface";

export function isGlobalTab(location: RibbonLocation, tabId: string): boolean {
	return location === "Application" && tabId === GLOBAL_TAB_ID;
}

/** Why a group can't be added to this tab, or undefined when it can (#166). */
export function newGroupBlockedReason(location: RibbonLocation, tabId: string): string | undefined {
	return isGlobalTab(location, tabId)
		? "The global command bar shows your buttons only in its New group: add them there."
		: undefined;
}

/** Why a button can't be added to or moved into this group, or undefined when it can (#166). */
export function newButtonBlockedReason(
	location: RibbonLocation,
	tabId: string,
	groupId: string,
): string | undefined {
	return isGlobalTab(location, tabId) && groupId !== GLOBAL_NEW_GROUP_ID
		? "The global command bar shows your buttons only in its New group: add them there."
		: undefined;
}
