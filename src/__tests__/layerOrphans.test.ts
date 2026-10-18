/**
 * #64 part 3: what the table's unmanaged layer adds that the ribbon doesn't
 * return anywhere — a button on the Charts tab, in a group that no longer
 * exists, in a menu section that isn't there — is listed, can be deleted
 * through the normal publish (undoably), and is kept by every other publish.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { findLayerOrphans, type LayerOrphan } from "@/services/layerOrphans";
import { planScope } from "@/services/publishPlan";
import { emptyRibbonDiffParts, parseRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { layerSnapshotFromParts } from "@/services/dataverse/ribbonLayerService";
import { addLayerTabs } from "@/services/dataverse/ribbonService";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { useRibbonStore } from "@/store/ribbonStore";
import type { CommandDefinition, RibbonButton, RibbonDefinition, RibbonGroup } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const E = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${E}.MainTab`;
const MGMT = `${MAIN}.Management`;
const CHARTS = "Mscrm.HomepageGrid.AllEntities.VisualizationTab";
const CHARTS_GROUP = `${CHARTS}.Save`;
const OOB_FLYOUT = `${MAIN}.ExportData`;
const OOB_SECTION_CONTROLS = `${OOB_FLYOUT}.Menu.Section1.Controls`;

const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));
const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const ca = (id: string, location: string, inner: string, seq = 50) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
const button = (id: string, command: string, label = `$LocLabels:${id}.LabelText`) =>
	`<Button Id="${id}" Command="${command}" Sequence="50" LabelText="${label}" TemplateAlias="o1" />`;
const command = (id: string, enableRule?: string) =>
	`<CommandDefinition Id="${id}"><EnableRules>${enableRule ? `<EnableRule Id="${enableRule}" />` : ""}</EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs_/x.js" FunctionName="run" /></Actions></CommandDefinition>`;
const label = (id: string, text: string) =>
	`<LocLabel Id="${id}"><Titles><Title languagecode="1033" description="${text}" /></Titles></LocLabel>`;
const layerOf = (opts: { actions: string[]; commands?: string[]; enable?: string[]; labels?: string[] }) =>
	parseRibbonDiffParts(
		`<RibbonDiffXml><CustomActions>${opts.actions.join("")}</CustomActions>` +
			`<CommandDefinitions>${(opts.commands ?? []).join("")}</CommandDefinitions>` +
			`<RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules>${(opts.enable ?? []).join("")}</EnableRules></RuleDefinitions>` +
			`<LocLabels>${(opts.labels ?? []).join("")}</LocLabels></RibbonDiffXml>`,
	);

const btn = (id: string, extra: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence: 50,
	templateAlias: "o1",
	commandId: "",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...extra,
});
const oob = (id: string, extra: Partial<RibbonButton> = {}) => btn(id, { oob: true, custom: false, origin: "oob", ...extra });
const group = (id: string, buttons: RibbonButton[], sequence = 10): RibbonGroup => ({
	id,
	label: id,
	sequence,
	template: "Mscrm.Templates.Flexible2",
	buttons,
});

/** The home grid as RetrieveEntityRibbon returns it: the main tab and the Charts tab. */
function grid(mgmtButtons: RibbonButton[] = []): RibbonDefinition {
	return {
		location: "HomepageGrid",
		entityLogicalName: E,
		tabs: [
			{
				id: CHARTS,
				label: "Charts",
				sequence: 10,
				tabDisplayRules: [],
				groups: [group(CHARTS_GROUP, [oob(`${CHARTS_GROUP}.NewChart`)])],
			},
			{
				id: MAIN,
				label: "Records",
				sequence: 100,
				tabDisplayRules: [],
				groups: [
					group(MGMT, [
						oob(`${MAIN}.NewRecord`),
						oob(OOB_FLYOUT, {
							kind: "flyout",
							menu: {
								id: `${OOB_FLYOUT}.Menu`,
								sections: [
									{
										id: `${OOB_FLYOUT}.Menu.Section1`,
										sequence: 10,
										controlsId: OOB_SECTION_CONTROLS,
										controls: [oob(`${OOB_FLYOUT}.Excel`)],
									},
								],
							},
						}),
						...mgmtButtons,
					]),
				],
			},
		],
	};
}
const empty = (location: RibbonDefinition["location"]): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
const ribbonsOf = (homepage: RibbonDefinition) => [homepage, empty("SubGrid"), empty("Form")];

const byId = (orphans: LayerOrphan[]) => Object.fromEntries(orphans.map((o) => [o.id, o]));

beforeEach(() => {
	layer = emptyRibbonDiffParts();
});

// ---------------------------------------------------------------------------

describe("detection", () => {
	it("a button the layer adds to the Charts tab is reported: Unified Interface doesn't show that tab", () => {
		layer = layerOf({
			actions: [ca("cbs.Chart.CustomAction", `${CHARTS_GROUP}.Controls._children`, button("cbs.Chart.Button", "cbs.Chart.Command"))],
			labels: [label("cbs.Chart.Button.LabelText", "Chart it")],
		});
		const orphans = findLayerOrphans(layer, ribbonsOf(grid()), E, {
			locLabels: [{ id: "cbs.Chart.Button.LabelText", titles: [{ languageCode: 1033, description: "Chart it" }] }],
		});
		expect(orphans).toHaveLength(1);
		expect(orphans[0]).toMatchObject({
			id: "cbs.Chart.Button",
			element: "Button",
			label: "Chart it",
			location: `${CHARTS_GROUP}.Controls._children`,
			customActionId: "cbs.Chart.CustomAction",
			reason: "hidden-tab",
			deleteControlIds: ["cbs.Chart.Button"],
			deleteContainerIds: [],
		});
		expect(orphans[0].why).toContain(CHARTS);
	});

	it("a button in a group that no longer exists (or a misspelled Location) is reported", () => {
		layer = layerOf({
			actions: [
				ca("cbs.Old.CustomAction", `${MAIN}.Gone.Controls._children`, button("cbs.Old.Button", "cbs.Old.Command")),
				ca("cbs.Typo.CustomAction", `${MAIN}.Managment.Controls._children`, button("cbs.Typo.Button", "cbs.Typo.Command")),
			],
		});
		const orphans = byId(findLayerOrphans(layer, ribbonsOf(grid()), E));
		expect(Object.keys(orphans).sort()).toEqual(["cbs.Old.Button", "cbs.Typo.Button"]);
		expect(orphans["cbs.Old.Button"].reason).toBe("missing-location");
		expect(orphans["cbs.Old.Button"].why).toContain(`${MAIN}.Gone.Controls`);
		expect(orphans["cbs.Typo.Button"].reason).toBe("missing-location");
	});

	it("menu items added to a menu section: reported when the section is missing or the item isn't returned, not when it is", () => {
		layer = layerOf({
			actions: [
				// In the out-of-the-box flyout's section, and returned.
				ca("cbs.Csv.CustomAction", `${OOB_SECTION_CONTROLS}._children`, button("cbs.Csv.Button", "cbs.Csv.Command")),
				// In the same section, but not returned.
				ca("cbs.Pdf.CustomAction", `${OOB_SECTION_CONTROLS}._children`, button("cbs.Pdf.Button", "cbs.Pdf.Command")),
				// In a section of a flyout that isn't there any more.
				ca("cbs.Item.CustomAction", "cbs.GoneFlyout.Menu.Section1.Controls._children", button("cbs.Item.Button", "cbs.Item.Command")),
			],
		});
		const ribbon = grid();
		const flyout = ribbon.tabs[1].groups[0].buttons[1];
		flyout.menu!.sections[0].controls.push(btn("cbs.Csv.Button"));
		const orphans = byId(findLayerOrphans(layer, ribbonsOf(ribbon), E));
		expect(Object.keys(orphans).sort()).toEqual(["cbs.Item.Button", "cbs.Pdf.Button"]);
		expect(orphans["cbs.Pdf.Button"].reason).toBe("not-returned");
		expect(orphans["cbs.Item.Button"].reason).toBe("missing-location");
	});

	it("what is on the canvas, hidden, or not a control the canvas shows isn't reported", () => {
		layer = layerOf({
			actions: [
				ca("cbs.Shown.CustomAction", `${MGMT}.Controls._children`, button("cbs.Shown.Button", "cbs.Shown.Command")),
				// `{!EntityLogicalName}` in the Location and the id.
				ca(
					"cbs.Tpl.CustomAction",
					`Mscrm.HomepageGrid.{!EntityLogicalName}.MainTab.Management.Controls._children`,
					button("cbs.{!EntityLogicalName}.Tpl.Button", "cbs.Tpl.Command"),
				),
				// Hidden by the layer: listed under "Hidden by customizations" instead.
				ca("cbs.Hidden.CustomAction", `${MAIN}.Gone.Controls._children`, button("cbs.Hidden.Button", "cbs.Hidden.Command")),
				`<HideCustomAction HideActionId="cbs.Hidden.Button.Hide" Location="cbs.Hidden.Button" />`,
				// Inside an out-of-the-box group the layer hides.
				ca("cbs.InHidden.CustomAction", `${CHARTS_GROUP}.Controls._children`, button("cbs.InHidden.Button", "cbs.InHidden.Command")),
				`<HideCustomAction HideActionId="${CHARTS_GROUP}.Hide" Location="${CHARTS_GROUP}" />`,
				// Not something the canvas models.
				ca("cbs.Sep.CustomAction", `${MAIN}.Gone.Controls._children`, `<Separator Id="cbs.Sep" Sequence="5" />`),
				// Scaling.
				ca("cbs.Max.CustomAction", `${MAIN}.Scaling._children`, `<MaxSize Id="cbs.Max" GroupId="cbs.Gone.Group" Size="LargeLarge" Sequence="62" />`),
			],
		});
		const orphans = findLayerOrphans(
			layer,
			ribbonsOf(grid([btn("cbs.Shown.Button"), btn(`cbs.${E}.Tpl.Button`)])),
			E,
		);
		expect(orphans).toEqual([]);
	});

	it("the layer's tabs that addLayerTabs rebuilds aren't reported", () => {
		const tab = `<Tab Id="cbs.${E}.HomepageGrid.Mine.Tab" Command="cbs.${E}.HomepageGrid.Mine.Tab.Command" Sequence="200" Title="Mine"><Scaling Id="cbs.Mine.Scaling" /><Groups Id="cbs.Mine.Groups"><Group Id="cbs.Mine.Group" Sequence="10" Template="Mscrm.Templates.Flexible2" Title="G"><Controls Id="cbs.Mine.Group.Controls">${button("cbs.Mine.Button", "cbs.Mine.Command", "Mine")}</Controls></Group></Groups></Tab>`;
		layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions>${ca("cbs.Mine.Tab.CustomAction", "Mscrm.Tabs._children", tab)}</CustomActions>` +
				`<RuleDefinitions><TabDisplayRules><TabDisplayRule TabCommand="cbs.${E}.HomepageGrid.Mine.Tab.Command"><EntityRule EntityName="${E}" Context="HomePageGrid" AppliesTo="PrimaryEntity" /></TabDisplayRule></TabDisplayRules></RuleDefinitions></RibbonDiffXml>`,
		);
		const ribbons = { HomepageGrid: grid(), SubGrid: empty("SubGrid"), Form: empty("Form") };
		addLayerTabs(ribbons, layer, E, []);
		expect(findLayerOrphans(layer, Object.values(ribbons), E)).toEqual([]);
	});

	it("a group whose tab is gone is reported once, with the button added to it separately and the group's own controls", () => {
		const grp = `<Group Id="cbs.Lost.Group" Sequence="70" Template="Mscrm.Templates.Flexible2" Title="Lost"><Controls Id="cbs.Lost.Group.Controls">${button("cbs.Lost.Inline.Button", "cbs.Lost.Command", "Inline")}</Controls></Group>`;
		layer = layerOf({
			actions: [
				ca("cbs.Lost.Group.CustomAction", "Mscrm.HomepageGrid.othertable.MainTab.Groups._children", grp),
				ca("cbs.Lost.Late.CustomAction", "cbs.Lost.Group.Controls._children", button("cbs.Lost.Late.Button", "cbs.Lost.Command", "Late")),
			],
		});
		const orphans = findLayerOrphans(layer, ribbonsOf(grid()), E);
		expect(orphans).toHaveLength(1);
		expect(orphans[0]).toMatchObject({
			id: "cbs.Lost.Group",
			element: "Group",
			label: "Lost",
			reason: "missing-location",
			deleteContainerIds: ["cbs.Lost.Group"],
			deleteControlIds: ["cbs.Lost.Late.Button"],
		});
	});

	it("a button written in a separate CustomAction into the layer's own group that Dataverse dropped (#59) is reported", () => {
		const grp = `<Group Id="cbs.Own.Group" Sequence="70" Template="Mscrm.Templates.Flexible2" Title="Own"><Controls Id="cbs.Own.Group.Controls">${button("cbs.Own.A.Button", "cbs.Own.Command", "A")}${button("cbs.Own.B.Button", "cbs.Own.Command", "B")}</Controls></Group>`;
		layer = layerOf({
			actions: [
				ca("cbs.Own.Group.CustomAction", `${MAIN}.Groups._children`, grp),
				ca("cbs.Own.C.CustomAction", "cbs.Own.Group.Controls._children", button("cbs.Own.C.Button", "cbs.Own.Command", "C")),
			],
		});
		const ribbon = grid();
		// Returned: the group and its first inline button only.
		ribbon.tabs[1].groups.push(group("cbs.Own.Group", [btn("cbs.Own.A.Button")], 70));
		const orphans = byId(findLayerOrphans(layer, ribbonsOf(ribbon), E));
		expect(Object.keys(orphans).sort()).toEqual(["cbs.Own.B.Button", "cbs.Own.C.Button"]);
		expect(orphans["cbs.Own.B.Button"]).toMatchObject({ reason: "not-returned", location: "cbs.Own.Group.Controls._children" });
		expect(orphans["cbs.Own.C.Button"]).toMatchObject({ reason: "not-returned", deleteControlIds: ["cbs.Own.C.Button"] });
	});
});

// ---------------------------------------------------------------------------

const VISIBLE = "cbs.Visible.Button";
const SHARED = "cbs.Shared.Command";
const SHARED_LABEL = "cbs.Shared.LabelText";

/**
 * The layer: one button on the canvas, two orphans. The Charts-tab orphan has
 * a command, enable rule and label only it uses; the other orphan shares the
 * visible button's command and label.
 */
function seedLayer() {
	layer = layerOf({
		actions: [
			ca("cbs.Visible.CustomAction", `${MGMT}.Controls._children`, button(VISIBLE, SHARED, `$LocLabels:${SHARED_LABEL}`)),
			ca("cbs.Chart.CustomAction", `${CHARTS_GROUP}.Controls._children`, button("cbs.Chart.Button", "cbs.Chart.Command")),
			ca("cbs.Old.CustomAction", `${MAIN}.Gone.Controls._children`, button("cbs.Old.Button", SHARED, `$LocLabels:${SHARED_LABEL}`)),
		],
		commands: [command(SHARED), command("cbs.Chart.Command", "cbs.Chart.Enable")],
		enable: [`<EnableRule Id="cbs.Chart.Enable"><SelectionCountRule Minimum="1" /></EnableRule>`],
		labels: [label(SHARED_LABEL, "Shared"), label("cbs.Chart.Button.LabelText", "Chart it")],
	});
}

const visibleButton = () =>
	btn(VISIBLE, {
		label: "Shared",
		commandId: SHARED,
		source: { labelToken: `$LocLabels:${SHARED_LABEL}`, attributes: { Id: VISIBLE, Command: SHARED, Sequence: "50", LabelText: `$LocLabels:${SHARED_LABEL}`, TemplateAlias: "o1" } },
	});
const sharedCommand: CommandDefinition = {
	id: SHARED,
	enableRules: [],
	displayRules: [],
	actions: [{ kind: "javascript", library: "$webresource:cbs_/x.js", functionName: "run", params: [] }],
};

async function publish(current: RibbonDefinition, baseline: RibbonDefinition, deletedOrphans: LayerOrphan[] = []) {
	const { buildMergedRibbonDiffXml, publishValidationContext } = await import("@/services/dataverse/publishService");
	const commands = [sharedCommand];
	const input = {
		locations: [{ current, baseline }],
		commands,
		baselineCommands: clone(commands),
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		locLabels: [{ id: SHARED_LABEL, titles: [{ languageCode: 1033, description: "Shared" }] }],
	};
	const plan = planScope({ ...input, layer: layerSnapshotFromParts(layer), deletedOrphans });
	const merged = await buildMergedRibbonDiffXml({
		...input,
		entity: { logicalName: E, schemaName: "Cbstest_RibbonTest" },
		plan,
		languageCode: 1033,
	});
	const findings = validatePublishRibbonDiff(
		merged.parts,
		publishValidationContext({ ...input, entity: { logicalName: E }, publisherPrefix: "cbs" }, merged),
	);
	return { plan, ...merged, findings, doc: parse(merged.xml) };
}

const ids = (doc: Document, selector: string, attr = "Id") =>
	Array.from(doc.querySelectorAll(selector)).map((e) => e.getAttribute(attr));

describe("delete", () => {
	it("deleting the orphans removes their CustomActions, and the command, rule and label only they use; shared ones stay", async () => {
		seedLayer();
		const ribbon = grid([visibleButton()]);
		const orphans = findLayerOrphans(layer, ribbonsOf(ribbon), E);
		expect(orphans.map((o) => o.id).sort()).toEqual(["cbs.Chart.Button", "cbs.Old.Button"]);

		const { plan, doc, findings } = await publish(ribbon, clone(ribbon), orphans);
		expect(plan.hasChanges).toBe(true);
		expect(plan.unsupported).toEqual([]);
		expect(plan.deletedButtonIds.sort()).toEqual(["cbs.Chart.Button", "cbs.Old.Button"]);

		expect(ids(doc, "CustomActions > CustomAction")).toEqual(["cbs.Visible.CustomAction"]);
		// Only the Charts button used these.
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).toEqual([SHARED]);
		expect(ids(doc, "EnableRules > EnableRule")).toEqual([]);
		expect(ids(doc, "LocLabels > LocLabel")).toEqual([SHARED_LABEL]);
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
	});

	it("deleting one orphan leaves the other untouched", async () => {
		seedLayer();
		const ribbon = grid([visibleButton()]);
		const chart = findLayerOrphans(layer, ribbonsOf(ribbon), E).filter((o) => o.id === "cbs.Chart.Button");
		const { parts } = await publish(ribbon, clone(ribbon), chart);
		expect(parts.customActions.get("ca:cbs.Old.CustomAction")).toBe(layer.customActions.get("ca:cbs.Old.CustomAction"));
		expect(parts.customActions.has("ca:cbs.Chart.CustomAction")).toBe(false);
	});

	it("deleting an orphaned group removes it with the button added to it in a CustomAction of its own", async () => {
		const grp = `<Group Id="cbs.Lost.Group" Sequence="70" Template="Mscrm.Templates.Flexible2" Title="$LocLabels:cbs.Lost.Group.Title"><Controls Id="cbs.Lost.Group.Controls">${button("cbs.Lost.Inline.Button", "cbs.Lost.Command")}</Controls></Group>`;
		layer = layerOf({
			actions: [
				ca("cbs.Lost.Group.CustomAction", "Mscrm.HomepageGrid.othertable.MainTab.Groups._children", grp),
				ca("cbs.Lost.Late.CustomAction", "cbs.Lost.Group.Controls._children", button("cbs.Lost.Late.Button", "cbs.Lost.Command")),
				ca("cbs.Lost.Max.CustomAction", "Mscrm.HomepageGrid.othertable.MainTab.Scaling._children", `<MaxSize Id="cbs.Lost.Group.MaxSize" GroupId="cbs.Lost.Group" Size="LargeLarge" Sequence="62" />`),
			],
			commands: [command("cbs.Lost.Command")],
			labels: [label("cbs.Lost.Group.Title", "Lost"), label("cbs.Lost.Inline.Button.LabelText", "Inline"), label("cbs.Lost.Late.Button.LabelText", "Late")],
		});
		const ribbon = grid();
		const orphans = findLayerOrphans(layer, ribbonsOf(ribbon), E);
		expect(orphans.map((o) => o.id)).toEqual(["cbs.Lost.Group"]);
		const { plan, doc } = await publish(ribbon, clone(ribbon), orphans);
		expect(plan.deletedContainerIds).toEqual(["cbs.Lost.Group"]);
		expect(ids(doc, "CustomActions > CustomAction")).toEqual([]);
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).toEqual([]);
		expect(ids(doc, "LocLabels > LocLabel")).toEqual([]);
	});
});

describe("publishing anything else keeps the orphans", () => {
	it("an unrelated edit leaves every orphan element exactly as it is in the layer", async () => {
		seedLayer();
		const baseline = grid([visibleButton()]);
		const current = clone(baseline);
		current.tabs[1].groups[0].buttons[2].tooltipTitle = "Edited";
		const { plan, parts, changedKeys } = await publish(current, baseline);
		expect(plan.hasChanges).toBe(true);
		expect(plan.deletedButtonIds).toEqual([]);
		for (const key of ["ca:cbs.Chart.CustomAction", "ca:cbs.Old.CustomAction"]) {
			expect(parts.customActions.get(key)).toBe(layer.customActions.get(key));
		}
		expect(parts.commandDefinitions.get("cbs.Chart.Command")).toBe(layer.commandDefinitions.get("cbs.Chart.Command"));
		expect(parts.enableRules.get("cbs.Chart.Enable")).toBe(layer.enableRules.get("cbs.Chart.Enable"));
		expect(parts.locLabels.get("cbs.Chart.Button.LabelText")).toBe(layer.locLabels.get("cbs.Chart.Button.LabelText"));
		// Verification after the publish checks these by content: none of them changed.
		expect(changedKeys.filter((k) => /Chart|Old/.test(k))).toEqual([]);
	});

	it("a session that doesn't delete the orphans plans nothing for them", () => {
		seedLayer();
		const ribbon = grid([visibleButton()]);
		const plan = planScope({
			locations: [{ current: ribbon, baseline: clone(ribbon) }],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
			layer: layerSnapshotFromParts(layer),
		});
		expect(plan.hasChanges).toBe(false);
	});
});

describe("pre-publish check", () => {
	it("warns when this publish adds a button to the Charts tab or to a group the table doesn't have", async () => {
		seedLayer();
		const baseline = grid([visibleButton()]);
		const current = clone(baseline);
		current.tabs[0].groups[0].buttons.push(btn("cbs.NewChart.Button", { origin: undefined, commandId: SHARED }));
		const { findings } = await publish(current, baseline);
		const orphanFindings = findings.filter((f) => f.code === "orphan-location");
		expect(orphanFindings.map((f) => [f.severity, f.elementId])).toEqual([["warning", "cbs.NewChart.Button"]]);
		expect(orphanFindings[0].message).toContain(CHARTS);

		const typo = validatePublishRibbonDiff(
			layerOf({ actions: [ca("cbs.Typo.CustomAction", `${MAIN}.Managment.Controls._children`, button("cbs.Typo.Button", SHARED))] }),
			{ places: { entityLogicalName: E, tabByCollection: { [`${MGMT}.Controls`]: MAIN } } },
		);
		expect(typo.filter((f) => f.code === "orphan-location").map((f) => f.elementId)).toEqual(["cbs.Typo.Button"]);
	});

	it("doesn't warn about orphans already in the layer, nor without the table's places (application ribbon)", async () => {
		seedLayer();
		const ribbon = grid([visibleButton()]);
		const current = clone(ribbon);
		current.tabs[1].groups[0].buttons[2].tooltipTitle = "Edited";
		const { findings } = await publish(current, ribbon);
		expect(findings.filter((f) => f.code === "orphan-location")).toEqual([]);
		expect(validatePublishRibbonDiff(layer).filter((f) => f.code === "orphan-location")).toEqual([]);
	});
});

// ---------------------------------------------------------------------------

describe("store", () => {
	function load() {
		seedLayer();
		const ribbon = grid([visibleButton()]);
		const orphans = findLayerOrphans(layer, ribbonsOf(ribbon), E);
		useRibbonStore.getState().loadWorkspace({
			ribbons: { HomepageGrid: ribbon, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [sharedCommand],
			displayRules: [],
			enableRules: [],
			locLabels: [],
			layers: { entity: layerSnapshotFromParts(layer) },
			orphans: { entity: orphans },
		});
	}

	it("a delete is pending until published, and can be undone and redone", () => {
		load();
		const store = useRibbonStore.getState;
		expect(store().orphans.entity.map((o) => o.id).sort()).toEqual(["cbs.Chart.Button", "cbs.Old.Button"]);
		store().setOrphanDeleted("entity", "cbs.Chart.Button", true);
		expect(store().pendingOrphanDeletes.entity).toEqual(["cbs.Chart.Button"]);
		expect(store().mutationsSincePublish).toBe(1);
		store().undo();
		expect(store().pendingOrphanDeletes.entity).toEqual([]);
		expect(store().mutationsSincePublish).toBe(0);
		store().redo();
		expect(store().pendingOrphanDeletes.entity).toEqual(["cbs.Chart.Button"]);
		// Unknown ids are ignored.
		store().setOrphanDeleted("entity", "cbs.Nope", true);
		expect(store().pendingOrphanDeletes.entity).toEqual(["cbs.Chart.Button"]);
	});

	it("after publishing, the deleted orphan leaves the list and undo doesn't bring the delete back", () => {
		load();
		const store = useRibbonStore.getState;
		store().setOrphanDeleted("entity", "cbs.Chart.Button", true);
		store().upsertLocLabel({ id: SHARED_LABEL, titles: [{ languageCode: 1033, description: "Shared" }, { languageCode: 1031, description: "Geteilt" }] });
		store().markPublished();
		expect(store().orphans.entity.map((o) => o.id)).toEqual(["cbs.Old.Button"]);
		expect(store().pendingOrphanDeletes.entity).toEqual([]);
		expect(store().mutationsSincePublish).toBe(0);
		// Back to before the label edit: the orphan was deleted by then, and is gone.
		store().undo();
		expect(store().pendingOrphanDeletes.entity).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Adversarial review of PR #84
// ---------------------------------------------------------------------------

describe("review — no false orphans", () => {
	const tabXml = (id: string, command: string) =>
		`<Tab Id="${id}" Command="${command}" Sequence="200" Title="Mine"><Scaling Id="${id}.Scaling" /><Groups Id="${id}.Groups"><Group Id="${id}.Group" Sequence="10" Template="Mscrm.Templates.Flexible2" Title="G"><Controls Id="${id}.Group.Controls">${button(`${id}.Button`, "cbs.Mine.Command", "Mine")}</Controls></Group></Groups></Tab>`;
	const tabLayer = (location: string, id: string, rule: string) => {
		const cmd = `${id}.Command`;
		return parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions>${ca("cbs.Mine.Tab.CustomAction", location, tabXml(id, cmd))}</CustomActions>` +
				`<RuleDefinitions><TabDisplayRules><TabDisplayRule TabCommand="${cmd}">${rule}</TabDisplayRule></TabDisplayRules></RuleDefinitions></RibbonDiffXml>`,
		);
	};
	const ribbonSet = () => ({ HomepageGrid: grid(), SubGrid: empty("SubGrid"), Form: empty("Form") });

	it("1 — a layer tab with a {!EntityLogicalName} id, rebuilt by addLayerTabs, isn't an orphan", () => {
		layer = tabLayer(
			"Mscrm.Tabs._children",
			"cbs.{!EntityLogicalName}.HomepageGrid.Mine.Tab",
			`<EntityRule EntityName="{!EntityLogicalName}" Context="HomePageGrid" AppliesTo="PrimaryEntity" />`,
		);
		const ribbons = ribbonSet();
		expect(addLayerTabs(ribbons, layer, E, [])).toHaveLength(1);
		expect(findLayerOrphans(layer, Object.values(ribbons), E)).toEqual([]);
	});

	it("2 — a sub-grid tab at Mscrm.SubGrid.{!EntityLogicalName}.ContextualTabs._children is loaded, and isn't an orphan", () => {
		layer = tabLayer(
			"Mscrm.SubGrid.{!EntityLogicalName}.ContextualTabs._children",
			`cbs.${E}.SubGrid.Mine.Tab`,
			`<EntityRule EntityName="${E}" Context="SubGridStandard" AppliesTo="SelectedEntity" />`,
		);
		const ribbons = ribbonSet();
		expect(addLayerTabs(ribbons, layer, E, [])).toEqual([`cbs.${E}.SubGrid.Mine.Tab`]);
		expect(ribbons.SubGrid.tabs.map((t) => t.id)).toEqual([`cbs.${E}.SubGrid.Mine.Tab`]);
		expect(findLayerOrphans(layer, Object.values(ribbons), E)).toEqual([]);
	});

	it("3 — a button in a group the application layer hides isn't an orphan", () => {
		layer = layerOf({
			actions: [ca("cbs.InAppHidden.CustomAction", `${MAIN}.Workflow.Controls._children`, button("cbs.InAppHidden.Button", "cbs.X.Command"))],
		});
		expect(findLayerOrphans(layer, ribbonsOf(grid()), E).map((o) => o.id)).toEqual(["cbs.InAppHidden.Button"]);
		expect(
			findLayerOrphans(layer, ribbonsOf(grid()), E, { otherHides: ["Mscrm.HomepageGrid.{!EntityLogicalName}.MainTab.Workflow"] }),
		).toEqual([]);
	});

	it("3 — a missing location says it may be hidden by another solution; a platform one isn't called misspelled", () => {
		layer = layerOf({
			actions: [
				ca("cbs.A.CustomAction", `${MAIN}.Workflow.Controls._children`, button("cbs.A.Button", "cbs.X.Command")),
				ca("cbs.B.CustomAction", "cbs.Gone.Group.Controls._children", button("cbs.B.Button", "cbs.X.Command")),
			],
		});
		const orphans = byId(findLayerOrphans(layer, ribbonsOf(grid()), E));
		expect(orphans["cbs.A.Button"].why).toMatch(/possibly hidden by another solution/);
		expect(orphans["cbs.A.Button"].why).not.toMatch(/misspelled/);
		expect(orphans["cbs.B.Button"].why).toMatch(/hidden by another solution/);
	});

	it("5 — a control placed in a group of a tab the layer hides isn't an orphan, whatever the group's id", () => {
		const tab = `<Tab Id="cbs.Hid.Tab" Command="cbs.Hid.Tab.Command" Sequence="200" Title="H"><Groups Id="cbs.Hid.Tab.Groups"><Group Id="rw.Group1" Sequence="10" Template="Mscrm.Templates.Flexible2" Title="G"><Controls Id="rw.Group1.Controls" /></Group></Groups></Tab>`;
		layer = layerOf({
			actions: [
				ca("cbs.Hid.Tab.CustomAction", "Mscrm.Tabs._children", tab),
				ca("cbs.Late.CustomAction", "rw.Group1.Controls._children", button("cbs.Late.Button", "cbs.X.Command")),
				`<HideCustomAction HideActionId="cbs.Hid.Tab.Hide" Location="cbs.Hid.Tab" />`,
			],
		});
		expect(findLayerOrphans(layer, ribbonsOf(grid()), E)).toEqual([]);
	});
});

describe("review 4 — just published", () => {
	const orphanAt = (customActionId: string): LayerOrphan => ({
		id: `${customActionId}.Button`,
		element: "Button",
		label: "x",
		location: `${MAIN}.Gone.Controls._children`,
		customActionId,
		reason: "missing-location",
		why: "gone",
		deleteControlIds: [`${customActionId}.Button`],
		deleteContainerIds: [],
	});

	it("an orphan the table's last publish wrote is marked as just published; others as published recently; nothing after the window", async () => {
		const { annotateRecentPublish } = await import("@/services/layerOrphans");
		const now = Date.parse("2026-10-18T12:00:00Z");
		const recent = { at: now - 5 * 60_000, customActionIds: ["cbs.Just"] };
		const [just, other] = annotateRecentPublish([orphanAt("cbs.Just"), orphanAt("cbs.Old")], recent, now);
		expect(just.recentPublish).toEqual({ minutesAgo: 5, published: true });
		expect(just.why).toMatch(/may not have caught up/);
		expect(other.recentPublish).toEqual({ minutesAgo: 5, published: false });
		const later = annotateRecentPublish([orphanAt("cbs.Just")], recent, now + 60 * 60_000);
		expect(later[0].recentPublish).toBeUndefined();
	});

	it("the CustomActions a publish changed are remembered per table", async () => {
		const { rememberPublish, recentPublishOf } = await import("@/utils/recentPublish");
		rememberPublish("https://org.example", E, ["customActions:ca:cbs.Just", "commandDefinitions:cbs.X", "customActions:hide:cbs.H"], 1000);
		expect(recentPublishOf("https://org.example", E)).toEqual({ at: 1000, customActionIds: ["cbs.Just"] });
		expect(recentPublishOf("https://org.example", "other")).toBeNull();
	});
});
