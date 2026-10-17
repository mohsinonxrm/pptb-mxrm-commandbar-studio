/**
 * Regression tests for the second adversarial review of the publish pipeline
 * (N1–N11): only edited commands/rules are written, managed controls can't be
 * "deleted", menus / existing overrides survive edits, deletes are precise,
 * and every publish refreshes Unified Interface metadata.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import {
	partsFromRibbonTables,
	parseRibbonDiffParts,
	mergeScopeChanges,
	ownControlIds,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { planScope } from "@/services/publishPlan";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonButton, RibbonDefinition } from "@/types/ribbon";

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", () => ({
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
	locLabelsFromParts: vi.fn(() => []),
}));

// Merged ribbon: one button of yours (rw.*), one from a managed first-party
// solution (msdyn.*, uses its own command + CustomRule), one out-of-the-box.
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.HomepageGrid.contact.MainTab" Command="Mscrm.HomepageGrid.contact.MainTab" Sequence="10">
    <Groups Id="Mscrm.HomepageGrid.contact.MainTab.Groups">
      <Group Id="Mscrm.HomepageGrid.contact.MainTab.Management" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="Mscrm.HomepageGrid.contact.MainTab.Management.Controls">
          <Button Id="rw.contact.Mine.Button" Command="rw.contact.Mine.Command" Sequence="900" LabelText="Mine" TemplateAlias="o1" />
          <Button Id="msdyn.contact.Book.Button" Command="msdyn.contact.Book.Command" Sequence="800" LabelText="Book" TemplateAlias="o1" ModernImage="Calendar" />
          <Button Id="Mscrm.HomepageGrid.contact.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="New" TemplateAlias="o1" ModernImage="New" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="rw.contact.Mine.Command"><EnableRules><EnableRule Id="rw.contact.Mine.Rule"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:x.js" FunctionName="X.mine"/></Actions></CommandDefinition>
  <CommandDefinition Id="msdyn.contact.Book.Command"><EnableRules><EnableRule Id="msdyn.contact.CanBook"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:msdyn_/book.js" FunctionName="Book.open"><CrmParameter Value="SelectedControl"/></JavaScriptFunction></Actions></CommandDefinition>
</CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules>
  <EnableRule Id="rw.contact.Mine.Rule"><CustomRule Library="$webresource:x.js" FunctionName="X.can"/></EnableRule>
  <EnableRule Id="msdyn.contact.CanBook"><CustomRule Library="$webresource:msdyn_/book.js" FunctionName="Book.can"><StringParameter Value="lost-by-parser"/></CustomRule></EnableRule>
</EnableRules></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const LAYER_ROWS = {
	diffs: [
		{
			diffid: "rw.contact.Mine.Button.CustomAction",
			difftype: 0,
			rdx: '<CustomAction Id="rw.contact.Mine.Button.CustomAction" Location="Mscrm.HomepageGrid.contact.MainTab.Management.Controls._children" Sequence="900"><CommandUIDefinition><Button Id="rw.contact.Mine.Button" Command="rw.contact.Mine.Command" Sequence="900" LabelText="$LocLabels:rw.contact.Mine.Button.LabelText" TemplateAlias="o1" /></CommandUIDefinition></CustomAction>',
		},
		{
			diffid: "rw.contact.Mine.Button.LabelText",
			difftype: 3,
			rdx: '<LocLabel Id="rw.contact.Mine.Button.LabelText"><Titles><Title languagecode="1033" description="Mine" /></Titles></LocLabel>',
		},
		{
			// A label belonging to ANOTHER button whose id merely starts with this one's.
			diffid: "rw.contact.Mine.Button.All.LabelText",
			difftype: 3,
			rdx: '<LocLabel Id="rw.contact.Mine.Button.All.LabelText"><Titles><Title languagecode="1033" description="All" /></Titles></LocLabel>',
		},
		{
			// An existing Ribbon Workbench override of an out-of-the-box button.
			diffid: "rw.override.NewRecord",
			difftype: 0,
			rdx: '<CustomAction Id="rw.override.NewRecord" Location="Mscrm.HomepageGrid.contact.NewRecord" Sequence="10"><CommandUIDefinition><Button Id="Mscrm.HomepageGrid.contact.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="New" TemplateAlias="o1" ModernImage="New" /></CommandUIDefinition></CustomAction>',
		},
		{
			diffid: "rw.contact.Fly.CustomAction",
			difftype: 0,
			rdx: '<CustomAction Id="rw.contact.Fly.CustomAction" Location="Mscrm.HomepageGrid.contact.MainTab.Management.Controls._children" Sequence="950"><CommandUIDefinition><FlyoutAnchor Id="rw.contact.Fly" Command="rw.contact.Fly.Command" Sequence="950" LabelText="Fly" TemplateAlias="o1"><Menu Id="rw.contact.Fly.Menu"><MenuSection Id="rw.contact.Fly.Section" Sequence="10"><Controls Id="rw.contact.Fly.Controls"><Button Id="rw.contact.Fly.Item" Command="rw.contact.Mine.Command" Sequence="10" LabelText="Item" /></Controls></MenuSection></Menu></FlyoutAnchor></CommandUIDefinition></CustomAction>',
		},
	],
	commands: [
		{
			command: "rw.contact.Mine.Command",
			commanddefinition:
				'<CommandDefinition Id="rw.contact.Mine.Command"><EnableRules><EnableRule Id="rw.contact.Mine.Rule" /></EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:x.js" FunctionName="X.mine" /></Actions></CommandDefinition>',
		},
		{
			command: "rw.contact.Solo.Command",
			commanddefinition:
				'<CommandDefinition Id="rw.contact.Solo.Command"><EnableRules><EnableRule Id="rw.contact.Solo.Rule" /></EnableRules><DisplayRules /><Actions /></CommandDefinition>',
		},
	],
	rules: [
		{ ruleid: "rw.contact.Mine.Rule", ruletype: 1, ruledefinition: '<EnableRule Id="rw.contact.Mine.Rule"><CustomRule Library="$webresource:x.js" FunctionName="X.can" /></EnableRule>' },
		{ ruleid: "rw.contact.Solo.Rule", ruletype: 1, ruledefinition: '<EnableRule Id="rw.contact.Solo.Rule"><CustomRule Library="$webresource:x.js" FunctionName="X.solo" /></EnableRule>' },
	],
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const btn = (def: RibbonDefinition, id: string) => def.tabs[0].groups[0].buttons.find((b) => b.id === id)!;

function load() {
	const parsed = parseRibbonXml(MERGED, "HomepageGrid", "contact");
	applyLayerOwnership(parsed.ribbon, ownControlIds(partsFromRibbonTables(LAYER_ROWS)));
	return parsed;
}

function plan(current: RibbonDefinition, baseline: RibbonDefinition, parsed = load()) {
	const base = load();
	return planScope({
		locations: [{ current, baseline }],
		commands: parsed.commands,
		baselineCommands: base.commands,
		enableRules: parsed.enableRules,
		baselineEnableRules: base.enableRules,
		displayRules: parsed.displayRules,
		baselineDisplayRules: base.displayRules,
	});
}

async function build(current: RibbonDefinition, baseline: RibbonDefinition, parsed = load()) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const p = plan(current, baseline, parsed);
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: "contact", schemaName: "Contact" },
		locations: [{ current, baseline }],
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
		plan: p,
	});
	return { ...result, plan: p, doc: new DOMParser().parseFromString(result.xml, "application/xml") };
}

beforeEach(() => {
	layer = partsFromRibbonTables(LAYER_ROWS);
});

describe("N4 — ownership comes from the unmanaged layer", () => {
	it("marks managed first-party buttons as managed, layer buttons as yours", () => {
		const def = load().ribbon;
		expect(btn(def, "rw.contact.Mine.Button").origin).toBe("unmanaged");
		expect(btn(def, "msdyn.contact.Book.Button").origin).toBe("managed");
		expect(btn(def, "Mscrm.HomepageGrid.contact.NewRecord").origin).toBe("oob");
	});

	it("deleting a managed button is reported as unsupported, not planned", () => {
		const base = load().ribbon;
		const cur = clone(base);
		cur.tabs[0].groups[0].buttons = cur.tabs[0].groups[0].buttons.filter((b) => b.id !== "msdyn.contact.Book.Button");
		const p = plan(cur, base);
		expect(p.deletedButtonIds).toEqual([]);
		expect(p.unsupported.some((u) => u.includes("msdyn.contact.Book.Button"))).toBe(true);
	});

	it("publish refuses to 'delete' a control the layer doesn't define", async () => {
		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		const base = load();
		await expect(
			buildMergedRibbonDiffXml({
				entity: { logicalName: "contact" },
				locations: [{ current: base.ribbon, baseline: base.ribbon }],
				commands: [], enableRules: [], displayRules: [], locLabels: [],
				plan: { editedCommandIds: [], editedEnableRuleIds: [], editedDisplayRuleIds: [], deletedButtonIds: ["msdyn.contact.Book.Button"], unhiddenButtonIds: [] },
			}),
		).rejects.toThrow(/Can't delete msdyn\.contact\.Book\.Button/);
	});
});

describe("N2 — only edited / new commands and rules are written", () => {
	it("editing a managed button's tooltip doesn't copy its command or rules into the layer", async () => {
		const base = load().ribbon;
		const cur = clone(base);
		btn(cur, "msdyn.contact.Book.Button").tooltipTitle = "Book an appointment";
		const { doc } = await build(cur, base);
		expect(doc.querySelector('CustomAction[Location="msdyn.contact.Book.Button"]')).not.toBeNull();
		expect(doc.querySelector('CommandDefinition[Id="msdyn.contact.Book.Command"]')).toBeNull();
		expect(doc.querySelector('EnableRule[Id="msdyn.contact.CanBook"]')).toBeNull();
	});

	it("a new button still brings its new command", async () => {
		const base = load().ribbon;
		const parsed = load();
		const cur = clone(base);
		cur.tabs[0].groups[0].buttons.push({
			...btn(cur, "rw.contact.Mine.Button"),
			id: "cbstest.contact.New.Button",
			commandId: "cbstest.contact.New.Command",
			label: "New one",
			source: undefined,
			sequence: 990,
		} as RibbonButton);
		parsed.commands.push({ id: "cbstest.contact.New.Command", enableRules: [], displayRules: [], actions: [] });
		const { doc } = await build(cur, base, parsed);
		expect(doc.querySelector('CommandDefinition[Id="cbstest.contact.New.Command"]')).not.toBeNull();
		expect(doc.querySelector('CommandDefinition[Id="msdyn.contact.Book.Command"]')).toBeNull();
	});
});

describe("N3 / N7 — edits keep menus and replace existing overrides", () => {
	it("an attribute edit of your own flyout keeps its <Menu>", () => {
		const delta = parseRibbonDiffParts(
			'<RibbonDiffXml><CustomActions><CustomAction Id="x" Location="rw.contact.Fly"><CommandUIDefinition><FlyoutAnchor Id="rw.contact.Fly" Command="rw.contact.Fly.Command" Sequence="950" LabelText="Fly" ToolTipTitle="Tip" TemplateAlias="o1"/></CommandUIDefinition></CustomAction></CustomActions></RibbonDiffXml>',
		);
		const merged = mergeScopeChanges(layer, delta);
		const xml = merged.customActions.get("ca:rw.contact.Fly.CustomAction")!;
		expect(xml).toContain('ToolTipTitle="Tip"');
		expect(xml).toContain('<Button Id="rw.contact.Fly.Item"');
	});

	it("editing a control the layer already overrides replaces that override", async () => {
		const base = load().ribbon;
		const cur = clone(base);
		btn(cur, "Mscrm.HomepageGrid.contact.NewRecord").tooltipTitle = "Create";
		const { doc } = await build(cur, base);
		expect(doc.querySelectorAll('CustomAction[Location="Mscrm.HomepageGrid.contact.NewRecord"]')).toHaveLength(1);
	});

	it("new flyouts and edits of others' flyouts are reported as unsupported", () => {
		const base = load().ribbon;
		const cur = clone(base);
		cur.tabs[0].groups[0].buttons.push({ ...btn(cur, "rw.contact.Mine.Button"), id: "cbstest.Fly", kind: "flyout", source: undefined } as RibbonButton);
		const managed = btn(base, "msdyn.contact.Book.Button");
		managed.kind = "splitButton";
		btn(cur, "msdyn.contact.Book.Button").kind = "splitButton";
		btn(cur, "msdyn.contact.Book.Button").tooltipTitle = "x";
		const p = plan(cur, base);
		expect(p.unsupported.some((u) => u.includes("New flyout"))).toBe(true);
		expect(p.unsupported.some((u) => u.includes("msdyn.contact.Book.Button") && u.includes("menu button"))).toBe(true);
	});
});

describe("N6 / N9 / kind — silent drops are reported", () => {
	it("a built-in icon, a kind change and a Power Fx action are unsupported", () => {
		const base = load().ribbon;
		const parsed = load();
		const cur = clone(base);
		btn(cur, "rw.contact.Mine.Button").icon = "add_20_regular";
		btn(cur, "Mscrm.HomepageGrid.contact.NewRecord").kind = "splitButton";
		parsed.commands = parsed.commands.map((c) =>
			c.id === "rw.contact.Mine.Command" ? { ...c, actions: [{ kind: "powerFx", expression: "Notify(1)" } as never] } : c,
		);
		const p = plan(cur, base, parsed);
		expect(p.unsupported.some((u) => u.includes("icon"))).toBe(true);
		expect(p.unsupported.some((u) => u.includes("kind"))).toBe(true);
		expect(p.unsupported.some((u) => u.includes("Power Fx"))).toBe(true);
	});

	it("an SVG web resource icon is allowed", () => {
		const base = load().ribbon;
		const cur = clone(base);
		btn(cur, "rw.contact.Mine.Button").icon = "$webresource:cbstest_/icons/x.svg";
		expect(plan(cur, base).unsupported).toEqual([]);
	});
});

describe("N11 — deletes are precise and leave no orphans", () => {
	it("removes only the deleted control's labels, and its now-unused command and rule", () => {
		const delta = parseRibbonDiffParts("<RibbonDiffXml/>");
		layer.customActions.set(
			"rw.contact.Solo.CustomAction",
			'<CustomAction Id="rw.contact.Solo.CustomAction" Location="X.Controls._children"><CommandUIDefinition><Button Id="rw.contact.Solo" Command="rw.contact.Solo.Command" LabelText="Solo" /></CommandUIDefinition></CustomAction>',
		);
		const merged = mergeScopeChanges(layer, delta, { deletedControlIds: ["rw.contact.Mine.Button", "rw.contact.Solo"] });
		expect(merged.locLabels.has("rw.contact.Mine.Button.LabelText")).toBe(false);
		expect(merged.locLabels.has("rw.contact.Mine.Button.All.LabelText")).toBe(true);
		// rw.contact.Mine.Command is still used by the flyout's menu item.
		expect(merged.commandDefinitions.has("rw.contact.Mine.Command")).toBe(true);
		expect(merged.commandDefinitions.has("rw.contact.Solo.Command")).toBe(false);
		expect(merged.enableRules.has("rw.contact.Solo.Rule")).toBe(false);
		expect(merged.enableRules.has("rw.contact.Mine.Rule")).toBe(true);
	});

	it("keeps a deleted control's command when another button in the ribbon still uses it", () => {
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts("<RibbonDiffXml/>"), {
			deletedControlIds: ["rw.contact.Fly", "rw.contact.Mine.Button"],
			retainedCommandIds: ["rw.contact.Mine.Command"],
		});
		expect(merged.commandDefinitions.has("rw.contact.Mine.Command")).toBe(true);
	});
});

describe("N5 — duplicates are new controls", () => {
	it("a duplicate doesn't reuse the original's LocLabel tokens", () => {
		const parsed = load();
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: parsed.ribbon,
				SubGrid: { location: "SubGrid", entityLogicalName: "contact", tabs: [] },
				Form: { location: "Form", entityLogicalName: "contact", tabs: [] },
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: parsed.commands,
			displayRules: parsed.displayRules,
			enableRules: parsed.enableRules,
			locLabels: parsed.locLabels,
		});
		const tab = parsed.ribbon.tabs[0];
		useRibbonStore.getState().duplicateButton("HomepageGrid", tab.id, tab.groups[0].id, "rw.contact.Mine.Button");
		const copy = useRibbonStore
			.getState()
			.ribbons.HomepageGrid.tabs[0].groups[0].buttons.find((b) => b.id.startsWith("rw.contact.Mine.Button_copy"))!;
		expect(copy.source).toBeUndefined();
		expect(copy.origin).toBe("unmanaged");
	});
});

describe("N1 — every publish refreshes Unified Interface metadata", () => {
	it("a command-only edit imports twice", async () => {
		const deploySolution = vi.fn(async () => undefined);
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = Object.assign(
			(window as unknown as { dataverseAPI?: object }).dataverseAPI ?? {},
			{
				deploySolution,
				getImportJobStatus: vi.fn(async () => ({ progress: 100 })),
				retrieve: vi.fn(async () => ({
					data: '<importexportxml><entityRibbon id="Contact" processed="true"><result result="success" /></entityRibbon></importexportxml>',
				})),
				queryData: vi.fn(async () => ({ value: [{ languagecode: 1033 }] })),
				publishCustomizations: vi.fn(async () => undefined),
			},
		);
		vi.resetModules();
		const { publishRibbon } = await import("@/services/dataverse/publishService");
		const base = load();
		const parsed = load();
		parsed.commands = parsed.commands.map((c) =>
			c.id === "rw.contact.Mine.Command"
				? { ...c, actions: [{ kind: "javascript", library: "$webresource:x.js", functionName: "X.changed", params: [] }] }
				: c,
		);
		await publishRibbon({
			entity: { logicalName: "contact", schemaName: "Contact" },
			locations: [{ current: base.ribbon, baseline: base.ribbon }],
			commands: parsed.commands,
			enableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			locLabels: parsed.locLabels,
			plan: { editedCommandIds: ["rw.contact.Mine.Command"], editedEnableRuleIds: [], editedDisplayRuleIds: [], deletedButtonIds: [], unhiddenButtonIds: [] },
			solution: {
				uniqueName: "CBSLiveTest",
				friendlyName: "CBS Live Test",
				version: "1.0.0.0",
				publisherUniqueName: "cbstest",
				publisherName: "CBS Test",
				publisherPrefix: "cbstest",
			} as never,
		});
		expect(deploySolution).toHaveBeenCalledTimes(2);
	});
});
