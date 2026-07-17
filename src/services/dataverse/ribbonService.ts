import { decompressRibbonZip } from "@/utils/decompressRibbonZip";
import { parseRibbonXml } from "@/services/xmlParser";
import type { RibbonDefinition, RibbonLocation, RibbonTab } from "@/types/ribbon";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";

const dataverseAPI = (window as Window & typeof globalThis).dataverseAPI!;

type EntityRibbonLocation = Exclude<RibbonLocation, "Application">;

export interface RibbonWorkspaceData {
	ribbons: Record<RibbonLocation, ReturnType<typeof parseRibbonXml>["ribbon"]>;
	commands: ReturnType<typeof parseRibbonXml>["commands"];
	displayRules: ReturnType<typeof parseRibbonXml>["displayRules"];
	enableRules: ReturnType<typeof parseRibbonXml>["enableRules"];
	locLabels: ReturnType<typeof parseRibbonXml>["locLabels"];
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

/**
 * Splits the merged entity-ribbon tabs into the three EntityRibbonLocation
 * buckets based on the Microsoft tab-ID naming convention documented at
 * https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/ribbons-available:
 *   - Mscrm.Form.<entity>.*        → Form
 *   - Mscrm.HomepageGrid.<entity>.* → HomepageGrid
 *   - Mscrm.SubGrid.<entity>.*     → SubGrid
 *
 * Tabs without a recognized prefix default to HomepageGrid (most common
 * fallback for custom tabs). This may need to be refined once we observe
 * real customer ribbon shapes in PPTB.
 */
function splitTabsByLocation(
	tabs: RibbonTab[],
	entityLogicalName: string,
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
			// Custom / unrecognized tab. Default to HomepageGrid; the user can
			// still see and edit it.
			buckets.HomepageGrid.push(tab);
		}
	}

	return {
		HomepageGrid: { location: "HomepageGrid", entityLogicalName, tabs: buckets.HomepageGrid },
		SubGrid: { location: "SubGrid", entityLogicalName, tabs: buckets.SubGrid },
		Form: { location: "Form", entityLogicalName, tabs: buckets.Form },
	};
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

export async function fetchEntityRibbonAllLocations(entityLogicalName: string): Promise<{
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
	const parsed = parseRibbonXml(xml, "HomepageGrid", entityLogicalName);
	const ribbons = splitTabsByLocation(parsed.ribbon.tabs, entityLogicalName);

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
export async function fetchApplicationRibbon() {
	useRuntimeLogStore.getState().logInfo("dataverse", "RetrieveApplicationRibbon()");
	const result = await dataverseAPI.execute({
		operationName: "RetrieveApplicationRibbon",
		operationType: "function",
	});

	const xml = await decompressRibbonZip(result.CompressedApplicationRibbonXml as string);
	useRuntimeLogStore.getState().logInfo("dataverse", "RetrieveApplicationRibbon succeeded");
	return parseRibbonXml(xml, "Application", "{!EntityLogicalName}");
}

export async function fetchRibbonWorkspace(
	entityLogicalName: string,
): Promise<RibbonWorkspaceData> {
	const [entity, application] = await Promise.all([
		fetchEntityRibbonAllLocations(entityLogicalName),
		fetchApplicationRibbon(),
	]);

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
		locLabels: dedupeById([...entity.locLabels, ...application.locLabels]),
	};
}
