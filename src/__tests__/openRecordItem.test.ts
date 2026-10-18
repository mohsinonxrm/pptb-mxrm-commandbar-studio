/**
 * #22 — the grid open override (Mscrm.OpenRecordItem): turning it on and off
 * publishes through the read-merge-write pipeline, and it survives a reload.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { partsFromRibbonTables, ownControlIds, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { planScope } from "@/services/publishPlan";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { layerSnapshotFromParts } from "@/services/dataverse/ribbonLayerService";
import { reconcileWithLayer } from "@/services/dataverse/ribbonService";
import { useRibbonStore } from "@/store/ribbonStore";
import { OPEN_RECORD_ITEM_COMMAND_ID as OPEN, openRecordCarriers } from "@/utils/openRecordItem";
import type { CommandDefinition, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const T = "cbstest_ribbontest";
const HG_MGMT = `Mscrm.HomepageGrid.${T}.MainTab.Management`;
const SG_MGMT = `Mscrm.SubGrid.${T}.MainTab.Management`;
const HG_CARRIER = `cbs.${T}.HomepageGrid.OpenRecordItem.Button`;
const SG_CARRIER = `cbs.${T}.SubGrid.OpenRecordItem.Button`;
const LIB = "$webresource:cbs_/openrecord.js";

const OPEN_XML = `<CommandDefinition Id="${OPEN}"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="Cbs.openRecord" Library="${LIB}"><CrmParameter Value="SelectedControlSelectedItemReferences"/></JavaScriptFunction></Actions></CommandDefinition>`;
const MINE_XML = `<CommandDefinition Id="cbs.Mine.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="Cbs.mine" Library="$webresource:cbs_/mine.js"/></Actions></CommandDefinition>`;

const carrierButton = (id: string) =>
	`<Button Id="${id}" Command="${OPEN}" Sequence="910" LabelText="$LocLabels:${id}.LabelText" ToolTipTitle="$LocLabels:${id}.ToolTipTitle" ToolTipDescription="$LocLabels:${id}.ToolTipDescription" TemplateAlias="o1" />`;

/** RetrieveEntityRibbon for one location: the Management group with your own button, optionally a carrier. */
function merged(location: "HomepageGrid" | "SubGrid", carrier?: string, withOpenCommand = false) {
	const mgmt = location === "HomepageGrid" ? HG_MGMT : SG_MGMT;
	const tab = mgmt.replace(/\.Management$/, "");
	return `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${tab}" Command="${tab}" Sequence="10">
    <Groups Id="${tab}.Groups">
      <Group Id="${mgmt}" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${mgmt}.Controls">
          <Button Id="Mscrm.${location}.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="$Resources:Ribbon.HomepageGrid.Edit" TemplateAlias="o1" />
          ${location === "HomepageGrid" ? `<Button Id="cbs.Mine" Command="cbs.Mine.Command" Sequence="900" LabelText="Mine" TemplateAlias="o1" />` : ""}
          ${carrier ? carrierButton(carrier) : ""}
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Open.openSelectedRecord" Library="$webresource:Main_system_library.js"><CrmParameter Value="SelectedControl"/></JavaScriptFunction></Actions></CommandDefinition>
  ${location === "HomepageGrid" ? MINE_XML : ""}
  ${withOpenCommand ? OPEN_XML : ""}
</CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;
}

const ca = (id: string, location: string, inner: string) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="910"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
const label = (id: string, text: string) =>
	`<LocLabel Id="${id}"><Titles><Title languagecode="1033" description="${text}"/></Titles></LocLabel>`;
const carrierRows = (id: string, mgmt: string) => [
	{ difftype: 0, rdx: ca(`${id}.CustomAction`, `${mgmt}.Controls._children`, carrierButton(id)) },
	{ difftype: 3, rdx: label(`${id}.LabelText`, "Open record") },
	{ difftype: 3, rdx: label(`${id}.ToolTipTitle`, "Open record") },
	{ difftype: 3, rdx: label(`${id}.ToolTipDescription`, "Runs the open action") },
];

/** The table's unmanaged layer: your button, plus the carriers / the override command when given. */
function layerParts(opts: { carriers?: ("HomepageGrid" | "SubGrid")[]; openCommand?: boolean } = {}) {
	return partsFromRibbonTables({
		diffs: [
			{
				difftype: 0,
				rdx: ca(
					"cbs.Mine.CustomAction",
					`${HG_MGMT}.Controls._children`,
					`<Button Id="cbs.Mine" Command="cbs.Mine.Command" Sequence="900" LabelText="Mine" TemplateAlias="o1" />`,
				),
			},
			...(opts.carriers ?? []).flatMap((l) =>
				carrierRows(l === "HomepageGrid" ? HG_CARRIER : SG_CARRIER, l === "HomepageGrid" ? HG_MGMT : SG_MGMT),
			),
		],
		commands: [
			{ command: "cbs.Mine.Command", commanddefinition: MINE_XML },
			...(opts.openCommand ? [{ command: OPEN, commanddefinition: OPEN_XML }] : []),
		],
		rules: [],
	});
}

const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: T, tabs: [] });

/**
 * Loads the store as fetchRibbonWorkspace does: the merged ribbon of each
 * location, layer ownership, and command definitions the merged ribbon lacks
 * filled in from the layer.
 */
function loadStore(opts: { carriers?: ("HomepageGrid" | "SubGrid")[]; openCommand?: boolean; mergedOpenCommand?: boolean } = {}) {
	layer = layerParts(opts);
	const hg = parseRibbonXml(
		merged("HomepageGrid", opts.carriers?.includes("HomepageGrid") ? HG_CARRIER : undefined, opts.mergedOpenCommand),
		"HomepageGrid",
		T,
	);
	const sg = parseRibbonXml(merged("SubGrid", opts.carriers?.includes("SubGrid") ? SG_CARRIER : undefined), "SubGrid", T);
	const own = ownControlIds(layer);
	applyLayerOwnership(hg.ribbon, own);
	applyLayerOwnership(sg.ribbon, own);
	const dedupe = <X extends { id: string }>(xs: X[]) => [...new Map(xs.map((x) => [x.id, x])).values()];
	const data = {
		commands: dedupe([...hg.commands, ...sg.commands]),
		enableRules: [...hg.enableRules, ...sg.enableRules],
		displayRules: [...hg.displayRules, ...sg.displayRules],
	};
	reconcileWithLayer([hg.ribbon, sg.ribbon], data, layer, [OPEN]);
	useRibbonStore.getState().loadWorkspace({
		ribbons: { HomepageGrid: hg.ribbon, SubGrid: sg.ribbon, Form: empty("Form"), Application: empty("Application") },
		...data,
		locLabels: [...hg.locLabels, ...sg.locLabels],
		layers: { entity: layerSnapshotFromParts(layer), application: null },
	});
}

const ENTITY: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

function storePlan() {
	const s = useRibbonStore.getState();
	return planScope({
		locations: ENTITY.map((l) => ({ current: s.ribbons[l], baseline: s.baseline[l] })),
		commands: s.commands,
		baselineCommands: s.baselineCommands,
		enableRules: s.enableRules,
		baselineEnableRules: s.baselineEnableRules,
		displayRules: s.displayRules,
		baselineDisplayRules: s.baselineDisplayRules,
		locLabels: s.locLabels,
		baselineLocLabels: s.baselineLocLabels,
		layer: s.layers.entity ?? undefined,
		customisedCommandIds: s.customisedCommandIds,
		uncustomisedCommandIds: s.uncustomisedCommandIds.entity,
	});
}

async function build() {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const s = useRibbonStore.getState();
	const plan = storePlan();
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: T, schemaName: T },
		locations: ENTITY.map((l) => ({ current: s.ribbons[l], baseline: s.baseline[l] })),
		commands: s.commands,
		enableRules: s.enableRules,
		displayRules: s.displayRules,
		locLabels: s.locLabels,
		plan,
		languageCode: 1033,
	});
	return { ...result, plan, doc: new DOMParser().parseFromString(result.xml, "application/xml") };
}

const ids = (doc: Document, selector: string) =>
	Array.from(doc.querySelectorAll(selector)).map((e) => e.getAttribute("Id"));
const openCommandOf = () => useRibbonStore.getState().commands.find((c) => c.id === OPEN);
/** Gives the placeholder action a real web resource and function, as the Command Editor would. */
function setOpenAction() {
	const cmd = openCommandOf()!;
	const real: CommandDefinition = {
		...cmd,
		actions: [
			{
				kind: "javascript",
				library: LIB,
				functionName: "Cbs.openRecord",
				params: [{ kind: "CrmParameter", value: "SelectedControlSelectedItemReferences" }],
			},
		],
	};
	useRibbonStore.getState().upsertCommand(real);
}

beforeEach(() => {
	loadStore();
});

describe("#22 — Mscrm.OpenRecordItem override", () => {
	it("on: adds a carrier button in the Management group and the command, as one undo step", () => {
		const pastBefore = useRibbonStore.getState().past.length;
		expect(useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", true, "cbs")).toBe(true);
		const s = useRibbonStore.getState();
		const carriers = openRecordCarriers(s.ribbons.HomepageGrid);
		expect(carriers.map((c) => [c.groupId, c.button.id, c.button.origin])).toEqual([
			[HG_MGMT, HG_CARRIER, "unmanaged"],
		]);
		expect(openRecordCarriers(s.ribbons.SubGrid)).toEqual([]);
		const cmd = openCommandOf()!;
		expect(cmd.actions).toEqual([
			expect.objectContaining({
				kind: "javascript",
				params: [{ kind: "CrmParameter", value: "SelectedControlSelectedItemReferences" }],
			}),
		]);
		expect(s.past.length).toBe(pastBefore + 1);
		s.undo();
		expect(openRecordCarriers(useRibbonStore.getState().ribbons.HomepageGrid)).toEqual([]);
		expect(openCommandOf()).toBeUndefined();
	});

	it("blocks the publish while the action is the placeholder", () => {
		useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", true, "cbs");
		expect(storePlan().unsupported).toEqual([expect.stringContaining(`${OPEN} has a JavaScript action without a web resource`)]);
		setOpenAction();
		expect(storePlan().unsupported).toEqual([]);
	});

	it("on, published: the layer gets the carrier CustomAction and the CommandDefinition", async () => {
		useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", true, "cbs");
		setOpenAction();
		const { doc, plan } = await build();
		expect(plan.editedCommandIds).toEqual([OPEN]);
		const carrier = doc.querySelector(`CustomAction[Location="${HG_MGMT}.Controls._children"] Button[Id="${HG_CARRIER}"]`);
		expect(carrier?.getAttribute("Command")).toBe(OPEN);
		const def = Array.from(doc.querySelectorAll("CommandDefinitions > CommandDefinition")).find(
			(c) => c.getAttribute("Id") === OPEN,
		);
		const fn = def?.querySelector("Actions > JavaScriptFunction");
		expect(fn?.getAttribute("Library")).toBe(LIB);
		expect(fn?.getAttribute("FunctionName")).toBe("Cbs.openRecord");
		expect(Array.from(fn?.querySelectorAll("CrmParameter") ?? []).map((p) => p.getAttribute("Value"))).toEqual([
			"SelectedControlSelectedItemReferences",
		]);
		expect(ids(doc, "LocLabels > LocLabel")).toEqual(
			expect.arrayContaining([`${HG_CARRIER}.LabelText`, `${HG_CARRIER}.ToolTipTitle`]),
		);
		// Everything else in the layer is kept.
		expect(ids(doc, "CommandDefinitions > CommandDefinition").sort()).toEqual(["cbs.Mine.Command", OPEN].sort());
	});

	it("on then off in the same session leaves nothing to publish", () => {
		const s = useRibbonStore.getState();
		s.setOpenRecordOverride("HomepageGrid", true, "cbs");
		expect(useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", false, "cbs")).toBe(true);
		const after = useRibbonStore.getState();
		expect(openRecordCarriers(after.ribbons.HomepageGrid)).toEqual([]);
		expect(openCommandOf()).toBeUndefined();
		expect(storePlan().hasChanges).toBe(false);
	});

	it("reload: the carrier is yours and the command comes back from the layer", () => {
		// RetrieveEntityRibbon can return the button without the command (#52).
		loadStore({ carriers: ["HomepageGrid"], openCommand: true });
		const s = useRibbonStore.getState();
		expect(openRecordCarriers(s.ribbons.HomepageGrid).map((c) => [c.button.id, c.button.origin])).toEqual([
			[HG_CARRIER, "unmanaged"],
		]);
		expect(openCommandOf()?.actions).toEqual([expect.objectContaining({ library: LIB, functionName: "Cbs.openRecord" })]);
		expect(storePlan().hasChanges).toBe(false);
		// Already on: turning it on again changes nothing.
		expect(s.setOpenRecordOverride("HomepageGrid", true, "cbs")).toBe(true);
		expect(useRibbonStore.getState().past).toHaveLength(0);
	});

	it("reload: a command-only override in the layer is loaded, and turning on reuses it", async () => {
		loadStore({ openCommand: true });
		expect(openCommandOf()?.actions).toEqual([expect.objectContaining({ library: LIB })]);
		useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", true, "cbs");
		const { doc, plan } = await build();
		expect(plan.unsupported).toEqual([]);
		// The layer's definition is kept as is, the carrier is added.
		expect(plan.editedCommandIds).toEqual([]);
		expect(doc.querySelector(`Button[Id="${HG_CARRIER}"]`)?.getAttribute("Command")).toBe(OPEN);
		const kept = layer.commandDefinitions.get(OPEN);
		const out = Array.from(doc.querySelectorAll("CommandDefinitions > CommandDefinition")).find(
			(c) => c.getAttribute("Id") === OPEN,
		);
		expect(out && new XMLSerializer().serializeToString(out)).toBe(
			new XMLSerializer().serializeToString(new DOMParser().parseFromString(kept!, "application/xml").documentElement),
		);
	});

	it("off after reload: the carrier, its labels and the command leave the layer", async () => {
		loadStore({ carriers: ["HomepageGrid"], openCommand: true });
		expect(useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", false, "cbs")).toBe(true);
		const { doc, plan } = await build();
		expect(plan.unsupported).toEqual([]);
		expect(plan.deletedButtonIds).toEqual([HG_CARRIER]);
		expect(doc.querySelector(`[Id="${HG_CARRIER}"]`)).toBeNull();
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).toEqual(["cbs.Mine.Command"]);
		expect(ids(doc, "LocLabels > LocLabel")).toEqual([]);
		expect(ids(doc, "CustomActions > CustomAction")).toEqual(["cbs.Mine.CustomAction"]);
	});

	it("off on the home grid keeps the command while the sub-grid's carrier uses it", async () => {
		loadStore({ carriers: ["HomepageGrid", "SubGrid"], openCommand: true });
		useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", false, "cbs");
		expect(openRecordCarriers(useRibbonStore.getState().ribbons.SubGrid)).toHaveLength(1);
		const { doc, plan } = await build();
		expect(plan.deletedButtonIds).toEqual([HG_CARRIER]);
		expect(ids(doc, "CommandDefinitions > CommandDefinition").sort()).toEqual(["cbs.Mine.Command", OPEN].sort());
		expect(doc.querySelector(`Button[Id="${SG_CARRIER}"]`)?.getAttribute("Command")).toBe(OPEN);
	});

	it("on for the sub-grid goes on the sub-grid's main tab", () => {
		useRibbonStore.getState().setOpenRecordOverride("SubGrid", true, "cbs");
		const s = useRibbonStore.getState();
		expect(openRecordCarriers(s.ribbons.SubGrid).map((c) => [c.groupId, c.button.id])).toEqual([[SG_MGMT, SG_CARRIER]]);
		expect(openRecordCarriers(s.ribbons.HomepageGrid)).toEqual([]);
	});

	it("reports uncustomising the command while its buttons still use it", () => {
		loadStore({ carriers: ["HomepageGrid"], openCommand: true });
		useRibbonStore.getState().uncustomiseCommand(OPEN, "entity");
		expect(storePlan().unsupported).toEqual([expect.stringContaining(`Uncustomising ${OPEN}`)]);
	});

	it("refuses to remove a carrier that isn't yours, and the form / application ribbon", () => {
		loadStore({ carriers: ["HomepageGrid"], openCommand: true });
		const s = useRibbonStore.getState();
		const managed = JSON.parse(JSON.stringify(s.ribbons));
		openRecordCarriers(managed.HomepageGrid)[0].button.origin = "managed";
		s.loadWorkspace({ ...s, ribbons: managed, layers: s.layers });
		expect(useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", false, "cbs")).toBe(false);
		expect(openRecordCarriers(useRibbonStore.getState().ribbons.HomepageGrid)).toHaveLength(1);
		expect(useRibbonStore.getState().setOpenRecordOverride("Form", true, "cbs")).toBe(false);
		expect(useRibbonStore.getState().setOpenRecordOverride("Application", true, "cbs")).toBe(false);
	});
});
