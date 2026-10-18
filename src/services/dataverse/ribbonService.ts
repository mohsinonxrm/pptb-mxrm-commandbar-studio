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
import {
	foldIntoOwnContainers,
	hideActionsOf,
	ownControlIds,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { groupControls, removeMenuItem } from "@/utils/ribbonMenu";
import { OPEN_RECORD_ITEM_COMMAND_ID } from "@/utils/openRecordItem";

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
function locationsFromTabDisplayRules(tab: RibbonTab): EntityRibbonLocation[] {
	const found = new Set<EntityRibbonLocation>();
	for (const tdr of tab.tabDisplayRules)
		for (const rule of tdr.rules) {
			if (rule.kind !== "EntityRule") continue;
			if (rule.context === "Form") found.add("Form");
			if (rule.context === "HomePageGrid") found.add("HomepageGrid");
			if (rule.context === "SubGridStandard" || rule.context === "SubGridAssociated") found.add("SubGrid");
		}
	// One location per tab (the model keeps a tab in one place), chosen the same
	// way whatever the rule order: home grid, then form, then sub-grid.
	return (["HomepageGrid", "Form", "SubGrid"] as const).filter((l) => found.has(l));
}

function locationFromTabDisplayRules(tab: RibbonTab): EntityRibbonLocation | undefined {
	return locationsFromTabDisplayRules(tab)[0];
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
	// Template layouts go with every location, for the pre-publish check (#35);
	// scaling went with its tab's location above (#66).
	if (parsed.ribbon.templateLayouts) {
		for (const def of Object.values(ribbons)) def.templateLayouts = parsed.ribbon.templateLayouts;
	}

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
 * nothing the merged ribbon returned is replaced. `alsoCommandIds` are added
 * the same way even when no button uses them (Mscrm.OpenRecordItem, #22: the
 * merged ribbon carries only the commands its controls use). Returns the added
 * command ids.
 */
export function reconcileWithLayer(
	defs: RibbonDefinition[],
	data: Pick<RibbonWorkspaceData, "commands" | "enableRules" | "displayRules">,
	layer: RibbonDiffParts,
	alsoCommandIds: readonly string[] = [],
): string[] {
	const known = new Set(data.commands.map((c) => c.id));
	const missing = new Set<string>(
		alsoCommandIds.filter((id) => !known.has(id) && layer.commandDefinitions.has(id)),
	);
	for (const def of defs)
		for (const tab of def.tabs)
			for (const group of tab.groups)
				for (const button of groupControls(group))
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
				for (const button of groupControls(group)) {
					for (const section of button.menu?.sections ?? []) {
						const token = section.attributes?.["Title"];
						if (token?.startsWith("$LocLabels:")) section.title = resolveDisplayLabel(token, locLabels, languageCode);
					}
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

/**
 * Adds the tabs the unmanaged layer adds that the merged ribbon doesn't
 * return (#58). Verified live: a tab added at `Mscrm.Tabs._children` (with a
 * Command and a TabDisplayRule) is published, kept in the layer and shown by
 * Unified Interface, but neither RetrieveEntityRibbon nor
 * RetrieveApplicationRibbon ever returns it — they return the table's template
 * tabs only. So such a tab is rebuilt from its layer row: its Tab element
 * (groups, controls, scaling) is parsed like the merged ribbon, children the
 * layer adds separately are folded in first, controls the layer hides are left
 * out (as RetrieveEntityRibbon does), and it is placed by its TabDisplayRule
 * (sub-grid tabs by their contextual-group location). Mutates `ribbons`;
 * returns the ids of the tabs added.
 */
export function addLayerTabs(
	ribbons: Partial<Record<RibbonLocation, RibbonDefinition>>,
	layer: RibbonDiffParts,
	entityLogicalName: string | null,
	locLabels: LocLabel[],
): string[] {
	const known = new Set(Object.values(ribbons).flatMap((d) => d?.tabs.map((t) => t.id) ?? []));
	const hidden = new Set(hideActionsOf(layer).map((h) => h.location));
	const subGridLocation = entityLogicalName ? `Mscrm.SubGrid.${entityLogicalName}.ContextualTabs._children` : null;
	const tabsXml: { xml: string; subGrid: boolean }[] = [];
	for (const xml of foldIntoOwnContainers(layer.customActions).values()) {
		const ca = new DOMParser().parseFromString(xml, "application/xml").documentElement;
		if (ca.tagName !== "CustomAction") continue;
		const location = ca.getAttribute("Location");
		if (location !== "Mscrm.Tabs._children" && location !== subGridLocation) continue;
		const tab = Array.from(ca.getElementsByTagName("CommandUIDefinition")[0]?.children ?? [])[0];
		const id = tab?.tagName === "Tab" ? tab.getAttribute("Id") : null;
		if (!id || known.has(id)) continue;
		tabsXml.push({ xml: new XMLSerializer().serializeToString(tab), subGrid: location === subGridLocation });
	}
	if (tabsXml.length === 0) return [];

	const doc =
		`<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>${tabsXml.map((t) => t.xml).join("")}</Tabs></Ribbon></UI>` +
		`<RuleDefinitions><TabDisplayRules>${[...layer.tabDisplayRules.values()].join("")}</TabDisplayRules></RuleDefinitions>` +
		`</RibbonDefinition></RibbonDefinitions>`;
	const parsed = parseRibbonXml(doc, entityLogicalName ? "HomepageGrid" : "Application", entityLogicalName ?? "{!EntityLogicalName}", locLabels);
	// What the layer hides — tabs, groups, controls — isn't shown, as in
	// RetrieveEntityRibbon (#66 review m2).
	parsed.ribbon.tabs = parsed.ribbon.tabs.filter((t) => !hidden.has(t.id));
	for (const tab of parsed.ribbon.tabs) {
		tab.groups = tab.groups.filter((g) => !hidden.has(g.id));
		for (const group of tab.groups) {
			group.buttons = group.buttons.filter((b) => !hidden.has(b.id));
			// Hidden menu items too (#27).
			for (const item of groupControls(group)) if (hidden.has(item.id)) removeMenuItem(group, item.id);
		}
	}

	const subGridIds = new Set(
		tabsXml.filter((t) => t.subGrid).map((t) => new DOMParser().parseFromString(t.xml, "application/xml").documentElement.getAttribute("Id")),
	);
	const place = (tab: RibbonTab): RibbonLocation => {
		if (!entityLogicalName) return "Application";
		if (subGridIds.has(tab.id)) return "SubGrid";
		return locationFromTabDisplayRules(tab) ?? "HomepageGrid";
	};
	for (const tab of parsed.ribbon.tabs) {
		const also = entityLogicalName && !subGridIds.has(tab.id) ? locationsFromTabDisplayRules(tab).slice(1) : [];
		if (also.length > 0) {
			useRuntimeLogStore
				.getState()
				.logWarn(
					"ribbon",
					`Tab ${tab.id} shows on the ${place(tab)} and on the ${also.join(" and ")} (its display rules); ` +
						`Command Bar Studio lists it under ${place(tab)} only.`,
				);
		}
		const def = ribbons[place(tab)];
		if (!def) continue;
		def.tabs.push(tab);
		def.tabs.sort((a, b) => a.sequence - b.sequence);
		const scaling = parsed.ribbon.scalingByTab?.[tab.id];
		if (scaling) def.scalingByTab = { ...(def.scalingByTab ?? {}), [tab.id]: scaling };
	}
	return parsed.ribbon.tabs.map((t) => t.id);
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
		const tabs = addLayerTabs(entity.ribbons, entityLayer, entityLogicalName, [...entityLabels, ...appLabels]);
		if (tabs.length > 0) logs.logInfo("ribbon", `Loaded tab(s) ${tabs.join(", ")} from the table's unmanaged layer.`);
		const own = ownControlIds(entityLayer);
		for (const def of Object.values(entity.ribbons)) applyLayerOwnership(def, own);
		const added = reconcileWithLayer(Object.values(entity.ribbons), entity, entityLayer, [OPEN_RECORD_ITEM_COMMAND_ID]);
		if (added.length > 0) {
			logs.logWarn(
				"ribbon",
				`RetrieveEntityRibbon returned ${added.length} button command(s) without their definition ` +
					`(it can lag right after a publish); loaded them from the unmanaged layer: ${added.join(", ")}.`,
			);
		}
	}
	if (appLayer) {
		addLayerTabs({ Application: application.ribbon }, appLayer, null, appLabels);
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
