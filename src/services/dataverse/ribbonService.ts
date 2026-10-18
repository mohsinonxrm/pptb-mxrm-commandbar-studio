import { decompressRibbonZip } from "@/utils/decompressRibbonZip";
import { parseRibbonXml } from "@/services/xmlParser";
import type { LocLabel, RibbonDefinition, RibbonLocation, RibbonTab, ScalingDefinition } from "@/types/ribbon";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import {
	definitionsFromParts,
	fetchUnmanagedRibbonParts,
	layerSnapshotFromParts,
	locLabelsFromParts,
	type LayerSnapshot,
} from "@/services/dataverse/ribbonLayerService";
import { fetchOrganizationLanguageCode } from "@/services/dataverse/environmentService";
import { ownControlIds, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { resolveDisplayLabel } from "@/utils/displayLabel";

const dataverseAPI = (window as Window & typeof globalThis).dataverseAPI!;

type EntityRibbonLocation = Exclude<RibbonLocation, "Application">;

export interface RibbonWorkspaceData {
	ribbons: Record<RibbonLocation, ReturnType<typeof parseRibbonXml>["ribbon"]>;
	commands: ReturnType<typeof parseRibbonXml>["commands"];
	displayRules: ReturnType<typeof parseRibbonXml>["displayRules"];
	enableRules: ReturnType<typeof parseRibbonXml>["enableRules"];
	locLabels: ReturnType<typeof parseRibbonXml>["locLabels"];
	/** The table's and the application ribbon's unmanaged layers (null when unreadable). */
	layers?: { entity: LayerSnapshot | null; application: LayerSnapshot | null };
	/** Organisation base language (`organizations.languagecode`). */
	baseLanguageCode?: number;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
	const seen = new Set<string>();
	const deduped: T[] = [];
	for (const item of items) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		deduped.push(item);
	}
	return deduped;
}

/** The location a custom tab's display rules show it in (the first EntityRule with a Context). */
function locationFromTabDisplayRules(tab: RibbonTab): EntityRibbonLocation | undefined {
	for (const tdr of tab.tabDisplayRules)
		for (const rule of tdr.rules) {
			if (rule.kind !== "EntityRule") continue;
			if (rule.context === "Form") return "Form";
			if (rule.context === "HomePageGrid") return "HomepageGrid";
			if (rule.context === "SubGridStandard" || rule.context === "SubGridAssociated") return "SubGrid";
		}
	return undefined;
}

/**
 * Splits the merged entity-ribbon tabs into the three EntityRibbonLocation
 * buckets based on the Microsoft tab-ID naming convention documented at
 * https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/ribbons-available:
 *   - Mscrm.Form.<entity>.*        → Form
 *   - Mscrm.HomepageGrid.<entity>.* → HomepageGrid
 *   - Mscrm.SubGrid.<entity>.*     → SubGrid
 *
 * A custom tab (e.g. one CBS or Ribbon Workbench added) has its own id. All of
 * an entity's grid and form tabs live in the one `Mscrm.Tabs` collection, so
 * the tab's TabDisplayRule says where it belongs (#58): an EntityRule with
 * Context `Form` → Form, `HomePageGrid` → HomepageGrid, `SubGridStandard` /
 * `SubGridAssociated` → SubGrid. Tabs with neither default to HomepageGrid.
 */
export function splitTabsByLocation(
	tabs: RibbonTab[],
	entityLogicalName: string,
	scalingByTab: Record<string, ScalingDefinition> = {},
): Record<EntityRibbonLocation, RibbonDefinition> {
	const buckets: Record<EntityRibbonLocation, RibbonTab[]> = {
		HomepageGrid: [],
		SubGrid: [],
		Form: [],
	};

	for (const tab of tabs) {
		if (tab.id.startsWith("Mscrm.Form.")) {
			buckets.Form.push(tab);
		} else if (tab.id.startsWith("Mscrm.SubGrid.")) {
			buckets.SubGrid.push(tab);
		} else if (tab.id.startsWith("Mscrm.HomepageGrid.")) {
			buckets.HomepageGrid.push(tab);
		} else {
			buckets[locationFromTabDisplayRules(tab) ?? "HomepageGrid"].push(tab);
		}
	}

	// Each location keeps its tabs' scaling (new groups' MaxSize sequences are
	// chosen around it — #66 review).
	const make = (location: EntityRibbonLocation): RibbonDefinition => {
		const scaling = Object.fromEntries(
			buckets[location].filter((t) => scalingByTab[t.id]).map((t) => [t.id, scalingByTab[t.id]] as const),
		);
		return {
			location,
			entityLogicalName,
			tabs: buckets[location],
			...(Object.keys(scaling).length > 0 ? { scalingByTab: scaling } : {}),
		};
	};
	return { HomepageGrid: make("HomepageGrid"), SubGrid: make("SubGrid"), Form: make("Form") };
}

/**
 * Retrieves the merged ribbon XML for an entity (all locations) and splits it
 * into HomepageGrid/SubGrid/Form ribbon definitions.
 *
 * Implementation note — Dataverse Web API enum parameter encoding:
 *
 * `RetrieveEntityRibbon` declares `RibbonLocationFilter` as Nullable: False
 * (https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveentityribbon).
 * Omitting it causes Dataverse's OData function-dispatch to fail with:
 *
 *   0x80060888: Resource not found for the segment 'RetrieveEntityRibbon'.
 *
 * The Web API expects the value as a type-qualified enum literal, e.g.
 *   RibbonLocationFilter=Microsoft.Dynamics.CRM.RibbonLocationFilters'All'
 *
 * PPTB's `formatFunctionParameter()` helper recognizes this pattern via the
 * regex `/^Microsoft\.Dynamics\.CRM\.\w+'.+'$/` and URL-encodes it WITHOUT the
 * Edm.String single-quote wrapping that ordinary strings receive. So we pass
 * the full type-qualified string and PPTB does the right thing.
 *
 * We use `'All'` (= 7, equivalent to Form | HomepageGrid | SubGrid) to fetch
 * the merged ribbon in a single call, then split by tab-ID prefix below.
 * Reference: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/ribbonlocationfilters
 */
const RIBBON_LOCATION_FILTER_ALL = "Microsoft.Dynamics.CRM.RibbonLocationFilters'All'";

export async function fetchEntityRibbonAllLocations(
	entityLogicalName: string,
	layerLocLabels: LocLabel[] = [],
): Promise<{
	ribbons: Record<EntityRibbonLocation, RibbonDefinition>;
	commands: ReturnType<typeof parseRibbonXml>["commands"];
	displayRules: ReturnType<typeof parseRibbonXml>["displayRules"];
	enableRules: ReturnType<typeof parseRibbonXml>["enableRules"];
	locLabels: ReturnType<typeof parseRibbonXml>["locLabels"];
}> {
	useRuntimeLogStore
		.getState()
		.logInfo("dataverse", `RetrieveEntityRibbon(${entityLogicalName}, All)`);
	const result = await dataverseAPI.execute({
		operationName: "RetrieveEntityRibbon",
		operationType: "function",
		parameters: {
			EntityName: entityLogicalName,
			RibbonLocationFilter: RIBBON_LOCATION_FILTER_ALL,
		},
	});

	const xml = await decompressRibbonZip(result.CompressedEntityXml as string);
	// Parse once with a neutral location; we'll bucket the tabs ourselves below.
	const parsed = parseRibbonXml(xml, "HomepageGrid", entityLogicalName, layerLocLabels);
	const ribbons = splitTabsByLocation(parsed.ribbon.tabs, entityLogicalName, parsed.ribbon.scalingByTab);

	useRuntimeLogStore
		.getState()
		.logInfo(
			"dataverse",
			`RetrieveEntityRibbon succeeded for ${entityLogicalName} ` +
				`(Form=${ribbons.Form.tabs.length}, ` +
				`HomepageGrid=${ribbons.HomepageGrid.tabs.length}, ` +
				`SubGrid=${ribbons.SubGrid.tabs.length})`,
		);

	return {
		ribbons,
		commands: parsed.commands,
		displayRules: parsed.displayRules,
		enableRules: parsed.enableRules,
		locLabels: parsed.locLabels,
	};
}

/**
 * Retrieves and parses the application ribbon (cross-entity + global tabs).
 */
export async function fetchApplicationRibbon(layerLocLabels: LocLabel[] = []) {
	useRuntimeLogStore.getState().logInfo("dataverse", "RetrieveApplicationRibbon()");
	const result = await dataverseAPI.execute({
		operationName: "RetrieveApplicationRibbon",
		operationType: "function",
	});

	const xml = await decompressRibbonZip(result.CompressedApplicationRibbonXml as string);
	useRuntimeLogStore.getState().logInfo("dataverse", "RetrieveApplicationRibbon succeeded");
	return parseRibbonXml(xml, "Application", "{!EntityLogicalName}", layerLocLabels);
}

/**
 * Fills in command / rule definitions the merged ribbon is missing but the
 * unmanaged layer has (#52): right after a publish RetrieveEntityRibbon has been
 * seen returning the new buttons without their CommandDefinitions for about a
 * minute. Only buttons' commands that are missing are added (with their rules);
 * nothing the merged ribbon returned is replaced. Returns the added command ids.
 */
export function reconcileWithLayer(
	defs: RibbonDefinition[],
	data: Pick<RibbonWorkspaceData, "commands" | "enableRules" | "displayRules">,
	layer: RibbonDiffParts,
): string[] {
	const known = new Set(data.commands.map((c) => c.id));
	const missing = new Set<string>();
	for (const def of defs)
		for (const tab of def.tabs)
			for (const group of tab.groups)
				for (const button of group.buttons)
					if (button.commandId && !known.has(button.commandId) && layer.commandDefinitions.has(button.commandId))
						missing.add(button.commandId);
	if (missing.size === 0) return [];
	const fromLayer = definitionsFromParts(layer);
	const added = fromLayer.commands.filter((c) => missing.has(c.id));
	data.commands.push(...added);
	const haveEnable = new Set(data.enableRules.map((r) => r.id));
	const haveDisplay = new Set(data.displayRules.map((r) => r.id));
	for (const cmd of added) {
		for (const id of cmd.enableRules) {
			const rule = fromLayer.enableRules.find((r) => r.id === id);
			if (rule && !haveEnable.has(id)) {
				data.enableRules.push(rule);
				haveEnable.add(id);
			}
		}
		for (const id of cmd.displayRules) {
			const rule = fromLayer.displayRules.find((r) => r.id === id);
			if (rule && !haveDisplay.has(id)) {
				data.displayRules.push(rule);
				haveDisplay.add(id);
			}
		}
	}
	return added.map((c) => c.id);
}

/**
 * Re-resolves `$LocLabels:` button texts in the organisation's base language
 * (the parser resolves 1033), so what the canvas shows is what an edit
 * replaces (#50).
 */
function resolveLabelsIn(defs: RibbonDefinition[], locLabels: LocLabel[], languageCode: number): void {
	if (languageCode === 1033) return;
	for (const def of defs)
		for (const tab of def.tabs)
			for (const group of tab.groups)
				for (const button of group.buttons) {
					const src = button.source;
					if (!src) continue;
					const pairs: Array<[string | undefined, "label" | "tooltipTitle" | "tooltipBody"]> = [
						[src.labelToken, "label"],
						[src.tooltipTitleToken, "tooltipTitle"],
						[src.tooltipBodyToken, "tooltipBody"],
					];
					for (const [token, field] of pairs) {
						if (token?.startsWith("$LocLabels:")) button[field] = resolveDisplayLabel(token, locLabels, languageCode);
					}
				}
}

export async function fetchRibbonWorkspace(
	entityLogicalName: string,
): Promise<RibbonWorkspaceData> {
	const logs = useRuntimeLogStore.getState();
	// The merged ribbon carries no LocLabels, so read the unmanaged layers'
	// labels first; otherwise every `$LocLabels:` caption shows (and would be
	// republished) as its id (#12).
	const [entityLayer, appLayer, baseLanguageCode] = await Promise.all([
		fetchUnmanagedRibbonParts(entityLogicalName).catch(() => null),
		fetchUnmanagedRibbonParts(null).catch(() => null),
		fetchOrganizationLanguageCode(),
	]);
	const entityLabels = entityLayer ? locLabelsFromParts(entityLayer) : [];
	const appLabels = appLayer ? locLabelsFromParts(appLayer) : [];
	const [entity, application] = await Promise.all([
		fetchEntityRibbonAllLocations(entityLogicalName, [...entityLabels, ...appLabels]),
		fetchApplicationRibbon(appLabels),
	]);
	if (entityLayer) {
		const own = ownControlIds(entityLayer);
		for (const def of Object.values(entity.ribbons)) applyLayerOwnership(def, own);
		const added = reconcileWithLayer(Object.values(entity.ribbons), entity, entityLayer);
		if (added.length > 0) {
			logs.logWarn(
				"ribbon",
				`RetrieveEntityRibbon returned ${added.length} button command(s) without their definition ` +
					`(it can lag right after a publish); loaded them from the unmanaged layer: ${added.join(", ")}.`,
			);
		}
	}
	if (appLayer) {
		applyLayerOwnership(application.ribbon, ownControlIds(appLayer));
		reconcileWithLayer([application.ribbon], application, appLayer);
	}

	const locLabels = dedupeById([...entity.locLabels, ...application.locLabels]);
	resolveLabelsIn([...Object.values(entity.ribbons), application.ribbon], locLabels, baseLanguageCode);

	return {
		ribbons: {
			HomepageGrid: entity.ribbons.HomepageGrid,
			SubGrid: entity.ribbons.SubGrid,
			Form: entity.ribbons.Form,
			Application: application.ribbon,
		},
		commands: dedupeById([...entity.commands, ...application.commands]),
		displayRules: dedupeById([...entity.displayRules, ...application.displayRules]),
		enableRules: dedupeById([...entity.enableRules, ...application.enableRules]),
		locLabels,
		layers: {
			entity: entityLayer ? layerSnapshotFromParts(entityLayer) : null,
			application: appLayer ? layerSnapshotFromParts(appLayer) : null,
		},
		baseLanguageCode,
	};
}
