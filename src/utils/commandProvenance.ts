import type { CommandDefinition, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { LayerScope } from "@/store/ribbonStore";
import type { LayerSnapshot } from "@/services/dataverse/ribbonLayerService";
import { isSystemRibbonId } from "@/utils/ribbonProvenance";
import { canUncustomiseCommand } from "@/services/ribbonDiffMerge";

/**
 * Where a command's definition comes from (#31):
 *  - "oob"            — out of the box or another solution; your layer doesn't define it
 *  - "customising"    — will be copied into your layer on publish (customised or edited this session)
 *  - "customised"     — your layer has a copy of an out-of-the-box / other solution's command
 *  - "uncustomising"  — your layer's copy is removed on publish
 *  - "custom"         — your own command (your layer, or created this session)
 *  - "reloadRequired" — uncustomised and published: reload the table to load the original
 */
export type CommandProvenance =
	"oob" | "customising" | "customised" | "uncustomising" | "custom" | "reloadRequired";

export interface CommandProvenanceInput {
	commands: CommandDefinition[];
	baselineCommands: CommandDefinition[];
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	baseline: Record<RibbonLocation, RibbonDefinition>;
	layers: Record<LayerScope, LayerSnapshot | null>;
	customisedCommandIds: string[];
	uncustomisedCommandIds: Record<LayerScope, string[]>;
	reloadRequiredCommandIds: string[];
}

export interface CommandProvenanceInfo {
	provenance: CommandProvenance;
	/**
	 * The layer a customisation is written to: the table's when a table button
	 * uses the command (shared out-of-the-box commands are customised for this
	 * table only), else the application ribbon's (every table). For
	 * "uncustomising", the layer whose copy is removed.
	 */
	scope: LayerScope;
	/** Used by a button of the table and by one of the application ribbon. */
	sharedWithApplication: boolean;
}

const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

export function commandProvenance(
	commandId: string,
	input: CommandProvenanceInput,
): CommandProvenanceInfo {
	// Buttons using the command; "theirs" = loaded and not added by your layer.
	const loadedOrigin = new Map<string, string | undefined>();
	for (const def of Object.values(input.baseline))
		for (const tab of def.tabs)
			for (const group of tab.groups)
				for (const b of group.buttons) loadedOrigin.set(b.id, b.origin);
	let usedByTable = false;
	let usedByApplication = false;
	let usedByTheirs = isSystemRibbonId(commandId);
	for (const [location, def] of Object.entries(input.ribbons) as [
		RibbonLocation,
		RibbonDefinition,
	][])
		for (const tab of def.tabs)
			for (const group of tab.groups)
				for (const b of group.buttons) {
					if (b.commandId !== commandId) continue;
					if (ENTITY_LOCATIONS.includes(location)) usedByTable = true;
					else usedByApplication = true;
					if (loadedOrigin.has(b.id) && loadedOrigin.get(b.id) !== "unmanaged")
						usedByTheirs = true;
				}
	const scope: LayerScope = usedByTable || !usedByApplication ? "entity" : "application";
	const sharedWithApplication = usedByTable && usedByApplication;

	const layer = input.layers[scope];
	const inLayer = layer?.commandIds ? layer.commandIds.includes(commandId) : undefined;
	const loaded = input.baselineCommands.find((c) => c.id === commandId);
	const result = (
		provenance: CommandProvenance,
		at: LayerScope = scope,
	): CommandProvenanceInfo => ({
		provenance,
		scope: at,
		sharedWithApplication,
	});

	if (input.reloadRequiredCommandIds.includes(commandId)) return result("reloadRequired");
	for (const at of ["entity", "application"] as const) {
		if (input.uncustomisedCommandIds[at].includes(commandId))
			return result("uncustomising", at);
	}
	if (!loaded) return result("custom");
	if (!usedByTheirs && inLayer !== false) return result("custom");
	if (inLayer) {
		// Only a copy of a command defined elsewhere is "customised": a command
		// your layer's own buttons or overrides use that isn't a platform command
		// may have no other definition — removing it would break those buttons.
		const hasOriginal = layer?.commandRefIds
			? canUncustomiseCommand(commandId, layer.commandRefIds)
			: isSystemRibbonId(commandId);
		return result(hasOriginal ? "customised" : "custom");
	}
	const current = input.commands.find((c) => c.id === commandId);
	const edited = !!current && JSON.stringify(current) !== JSON.stringify(loaded);
	if (input.customisedCommandIds.includes(commandId) || edited) return result("customising");
	return result("oob");
}

export const COMMAND_PROVENANCE_LABEL: Record<CommandProvenance, string> = {
	oob: "Out of the box",
	customising: "Customised (unpublished)",
	customised: "Customised in your layer",
	uncustomising: "Uncustomised (unpublished)",
	custom: "Custom",
	reloadRequired: "Uncustomised — reload the table",
};
