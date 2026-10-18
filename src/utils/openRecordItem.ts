import { defaultTabId } from "@/utils/defaultTab";
import { groupControls } from "@/utils/ribbonMenu";
import type { CommandDefinition, RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

/**
 * Overriding what opening a row of a table's grid does (#22): double-clicking
 * a row, selecting its primary column link, or pressing Enter on it. Microsoft
 * (https://learn.microsoft.com/power-apps/developer/model-driven-apps/override-default-open-behavior-grids):
 * "The application looks for the `Mscrm.OpenRecordItem` command ID for a table
 * when you try to open a record from the entity-bound grid" and runs its
 * action instead of opening the record (Unified Interface only).
 *
 * The documented recipe also adds a button that uses the command to the grid
 * whose behaviour changes (the home grid, or the table's sub-grid ribbon for
 * sub-grids on other tables' forms): the command reaches a grid's ribbon only
 * through a control of that location, and hiding that control with a
 * HideCustomAction breaks the override (Microsoft's SharePoint documents
 * known issue, "Mscrm.OpenRecordItem.Hide"). So CBS writes both — the
 * CommandDefinition and a "carrier" button per location — through the normal
 * new-button / delete-button publish path.
 */
export const OPEN_RECORD_ITEM_COMMAND_ID = "Mscrm.OpenRecordItem";

/** Locations with entity-bound grids, where the override applies. */
export const OPEN_RECORD_ITEM_LOCATIONS: readonly RibbonLocation[] = ["HomepageGrid", "SubGrid"];

/** A control of a location that uses Mscrm.OpenRecordItem. */
export interface OpenRecordCarrier {
	tabId: string;
	groupId: string;
	button: RibbonButton;
}

/**
 * Ids of the carriers the switch creates (`newButtonIds`):
 * `{prefix}.{table}.{HomepageGrid|SubGrid}.OpenRecordItem[n].Button`.
 */
const CARRIER_ID = /\.(HomepageGrid|SubGrid)\.OpenRecordItem\d*\.Button$/;

/** Whether `button` is a carrier the switch created (and may delete). */
export function isOpenRecordCarrier(button: Pick<RibbonButton, "id" | "commandId">): boolean {
	return button.commandId === OPEN_RECORD_ITEM_COMMAND_ID && CARRIER_ID.test(button.id);
}

/** Every control of `ribbon` that uses Mscrm.OpenRecordItem (carriers and your own buttons alike). */
export function openRecordCommandUsers(ribbon: RibbonDefinition | undefined): OpenRecordCarrier[] {
	const out: OpenRecordCarrier[] = [];
	for (const tab of ribbon?.tabs ?? [])
		for (const group of tab.groups)
			for (const button of groupControls(group))
				if (button.commandId === OPEN_RECORD_ITEM_COMMAND_ID) out.push({ tabId: tab.id, groupId: group.id, button });
	return out;
}

/**
 * The carriers of `ribbon` the switch created. Only these are deleted when it
 * is turned off: another button that uses the command (e.g. one of your own)
 * stays, and so does the command while it does (#22 review).
 */
export function openRecordCarriers(ribbon: RibbonDefinition | undefined): OpenRecordCarrier[] {
	return openRecordCommandUsers(ribbon).filter((c) => isOpenRecordCarrier(c.button));
}

/**
 * Whether a carrier can be deleted: yours (unmanaged layer or this session),
 * "unknown" while its provenance isn't resolved and the layer doesn't list it,
 * else another solution's.
 */
export function openRecordCarrierOwnership(
	carrier: OpenRecordCarrier,
	layerControlIds?: Iterable<string>,
): "yours" | "unknown" | "theirs" {
	const origin = carrier.button.origin;
	if (origin === "unmanaged") return "yours";
	if (origin === undefined) return [...(layerControlIds ?? [])].includes(carrier.button.id) ? "yours" : "unknown";
	return "theirs";
}

/**
 * Where a new carrier goes: the location's main tab, in its Management group
 * (where Microsoft's sample puts it) or else the tab's first group. Null when
 * the location has no group.
 */
export function openRecordCarrierPlacement(ribbon: RibbonDefinition | undefined): { tabId: string; groupId: string } | null {
	const tabs = ribbon?.tabs ?? [];
	const tabId = defaultTabId(tabs.filter((t) => t.groups.length > 0));
	const tab = tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => /\.Management$/.test(g.id)) ?? tab?.groups[0];
	return tab && group ? { tabId: tab.id, groupId: group.id } : null;
}

/**
 * The command a new override starts with: a JavaScript action receiving the
 * selected row's reference (`SelectedControlSelectedItemReferences`, as in
 * Microsoft's samples). The library is left empty so the publish is blocked
 * until a real web resource is chosen.
 */
export function defaultOpenRecordCommand(): CommandDefinition {
	return {
		id: OPEN_RECORD_ITEM_COMMAND_ID,
		enableRules: [],
		displayRules: [],
		actions: [
			{
				kind: "javascript",
				library: "$webresource:",
				functionName: "YourNamespace.openRecord",
				params: [{ kind: "CrmParameter", value: "SelectedControlSelectedItemReferences" }],
			},
		],
	};
}

/**
 * Why the override can't be published as it is, or null: a JavaScript action
 * without a web resource or function would replace opening a record from every
 * grid of the table with an error. (A command without actions is allowed: it
 * deliberately makes opening a row do nothing.)
 */
export function openRecordCommandProblem(cmd: CommandDefinition): string | null {
	for (const a of cmd.actions) {
		if (a.kind !== "javascript") continue;
		const library = a.library.trim().replace(/^\$webresource:/i, "").trim();
		if (!library || !a.functionName.trim()) {
			return `${OPEN_RECORD_ITEM_COMMAND_ID} has a JavaScript action without a web resource or function — set them in the Command Editor, or turn the override off`;
		}
	}
	return null;
}
