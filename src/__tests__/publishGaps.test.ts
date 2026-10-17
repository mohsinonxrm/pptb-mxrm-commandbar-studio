/**
 * Publish gaps found by the second adversarial review (#11):
 *   #47 controls hidden by the layer can be listed and un-hidden
 *   #48 deleting a tab / group the layer adds removes it (and what's inside)
 *   #49 translation-only edits and existing-tab display-rule edits publish
 *   #50 edited labels are written in the organisation's base language
 *   #26 moving / re-sequencing your own buttons publishes
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import {
	partsFromRibbonTables,
	mergeScopeChanges,
	ownControlIds,
	ownContainerIds,
	hideActionsOf,
	compareRibbonDiffParts,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { planScope, type PlanInput } from "@/services/publishPlan";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { layerSnapshotFromParts } from "@/services/dataverse/ribbonLayerService";
import { useRibbonStore, sequenceBetween } from "@/store/ribbonStore";
import type { LocLabel, RibbonDefinition } from "@/types/ribbon";

// Module re-imports and DOM parsing are slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;

// The merged ribbon (RetrieveEntityRibbon): an out-of-the-box tab with one of
// your groups and buttons in it, plus a whole tab you added.
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10">
    <Groups Id="${MAIN}.Groups">
      <Group Id="${MAIN}.Management" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${MAIN}.Management.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="$Resources:New" TemplateAlias="o1" />
          <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="$Resources:Edit" TemplateAlias="o1" />
          <Button Id="cbs.B4" Command="cbs.B4.Command" Sequence="900" LabelText="$LocLabels:cbs.B4.LabelText" TemplateAlias="o1" />
          <Button Id="cbs.B5" Command="cbs.Shared.Command" Sequence="910" LabelText="Five" TemplateAlias="o1" />
        </Controls>
      </Group>
      <Group Id="cbs.Grp" Sequence="100" Template="Mscrm.Templates.Flexible2">
        <Controls Id="cbs.Grp.Controls">
          <Button Id="cbs.B3" Command="cbs.Shared.Command" Sequence="10" LabelText="$LocLabels:cbs.B3.LabelText" TemplateAlias="o1" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
  <Tab Id="cbs.Tab" Command="cbs.Tab.Command" Title="$LocLabels:cbs.Tab.Title" Sequence="500">
    <Groups Id="cbs.Tab.Groups">
      <Group Id="cbs.Tab.G1" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="cbs.Tab.G1.Controls">
          <Button Id="cbs.B1" Command="cbs.B1.Command" Sequence="10" LabelText="$LocLabels:cbs.B1.LabelText" TemplateAlias="o1" />
        </Controls>
      </Group>
      <Group Id="cbs.Tab.G2" Sequence="20" Template="Mscrm.Templates.Flexible2">
        <Controls Id="cbs.Tab.G2.Controls">
          <Button Id="cbs.B2" Command="cbs.Shared.Command" Sequence="10" LabelText="Two" TemplateAlias="o1" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="cbs.B1.Command"><EnableRules><EnableRule Id="cbs.B1.Rule"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="B1"/></Actions></CommandDefinition>
  <CommandDefinition Id="cbs.Shared.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="Shared"/></Actions></CommandDefinition>
  <CommandDefinition Id="cbs.B4.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="B4"/></Actions></CommandDefinition>
  <CommandDefinition Id="cbs.Tab.Command"><EnableRules/><DisplayRules/><Actions/></CommandDefinition>
</CommandDefinitions>
<RuleDefinitions>
  <TabDisplayRules>
    <TabDisplayRule TabCommand="cbs.Tab.Command"><EntityRule EntityName="${T}" Context="HomePageGrid" AppliesTo="PrimaryEntity"/></TabDisplayRule>
  </TabDisplayRules>
  <DisplayRules/>
  <EnableRules><EnableRule Id="cbs.B1.Rule"><SelectionCountRule Minimum="1"/></EnableRule></EnableRules>
</RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const ca = (id: string, location: string, seq: number, inner: string) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
const label = (id: string, ...titles: [number, string][]) =>
	`<LocLabel Id="${id}"><Titles>${titles.map(([l, d]) => `<Title languagecode="${l}" description="${d}" />`).join("")}</Titles></LocLabel>`;

// The table's unmanaged layer, as the ribbon component tables return it.
const LAYER_ROWS = {
	diffs: [
		{
			difftype: 0,
			rdx: ca(
				"cbs.Tab.CustomAction",
				"Mscrm.Tabs._children",
				500,
				`<Tab Id="cbs.Tab" Command="cbs.Tab.Command" Title="$LocLabels:cbs.Tab.Title" Sequence="500"><Groups Id="cbs.Tab.Groups"><Group Id="cbs.Tab.G1" Title="$LocLabels:cbs.Tab.G1.Title" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.Tab.G1.Controls" /></Group><Group Id="cbs.Tab.G2" Title="$LocLabels:cbs.Tab.G2.Title" Sequence="20" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.Tab.G2.Controls" /></Group></Groups><Scaling Id="cbs.Tab.Scaling"><MaxSize Id="cbs.Tab.G1.MaxSize" GroupId="cbs.Tab.G1" Sequence="10" Size="LargeLarge" /><MaxSize Id="cbs.Tab.G2.MaxSize" GroupId="cbs.Tab.G2" Sequence="20" Size="LargeLarge" /></Scaling></Tab>`,
			),
		},
		{
			difftype: 0,
			rdx: ca("cbs.B1.CustomAction", "cbs.Tab.G1.Controls._children", 10, `<Button Id="cbs.B1" Command="cbs.B1.Command" Sequence="10" LabelText="$LocLabels:cbs.B1.LabelText" TemplateAlias="o1" />`),
		},
		{
			difftype: 0,
			rdx: ca("cbs.B2.CustomAction", "cbs.Tab.G2.Controls._children", 10, `<Button Id="cbs.B2" Command="cbs.Shared.Command" Sequence="10" LabelText="Two" TemplateAlias="o1" />`),
		},
		{
			difftype: 0,
			rdx: ca("cbs.Grp.CustomAction", `${MAIN}.Groups._children`, 100, `<Group Id="cbs.Grp" Title="$LocLabels:cbs.Grp.Title" Sequence="100" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.Grp.Controls" /></Group>`),
		},
		{
			difftype: 0,
			rdx: ca("cbs.Grp.MaxSize.CustomAction", `${MAIN}.Scaling._children`, 120, `<MaxSize Id="cbs.Grp.MaxSize" GroupId="cbs.Grp" Sequence="120" Size="LargeLarge" />`),
		},
		{
			difftype: 0,
			rdx: ca("cbs.B3.CustomAction", "cbs.Grp.Controls._children", 10, `<Button Id="cbs.B3" Command="cbs.Shared.Command" Sequence="10" LabelText="$LocLabels:cbs.B3.LabelText" TemplateAlias="o1" />`),
		},
		{
			difftype: 0,
			rdx: ca("cbs.B4.CustomAction", `${MAIN}.Management.Controls._children`, 900, `<Button Id="cbs.B4" Command="cbs.B4.Command" Sequence="900" LabelText="$LocLabels:cbs.B4.LabelText" TemplateAlias="o1" />`),
		},
		{
			difftype: 0,
			rdx: ca("cbs.B5.CustomAction", `${MAIN}.Management.Controls._children`, 910, `<Button Id="cbs.B5" Command="cbs.Shared.Command" Sequence="910" LabelText="Five" TemplateAlias="o1" />`),
		},
		{ difftype: 0, rdx: `<HideCustomAction HideActionId="cbs.HideRefresh" Location="Mscrm.HomepageGrid.${T}.Refresh" />` },
		{ difftype: 3, rdx: label("cbs.Tab.Title", [1033, "CBS"]) },
		{ difftype: 3, rdx: label("cbs.Tab.G1.Title", [1033, "G1"]) },
		{ difftype: 3, rdx: label("cbs.Tab.G2.Title", [1033, "G2"]) },
		{ difftype: 3, rdx: label("cbs.Grp.Title", [1033, "Grp"]) },
		{ difftype: 3, rdx: label("cbs.B1.LabelText", [1033, "One"]) },
		{ difftype: 3, rdx: label("cbs.B3.LabelText", [1033, "Three"]) },
		{ difftype: 3, rdx: label("cbs.B4.LabelText", [1033, "Four"], [1031, "Vier"]) },
	],
	commands: [
		{ command: "cbs.B1.Command", commanddefinition: '<CommandDefinition Id="cbs.B1.Command"><EnableRules><EnableRule Id="cbs.B1.Rule" /></EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="B1" /></Actions></CommandDefinition>' },
		{ command: "cbs.Shared.Command", commanddefinition: '<CommandDefinition Id="cbs.Shared.Command"><EnableRules /><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="Shared" /></Actions></CommandDefinition>' },
		{ command: "cbs.B4.Command", commanddefinition: '<CommandDefinition Id="cbs.B4.Command"><EnableRules /><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="B4" /></Actions></CommandDefinition>' },
		{ command: "cbs.Tab.Command", commanddefinition: '<CommandDefinition Id="cbs.Tab.Command"><EnableRules /><DisplayRules /><Actions /></CommandDefinition>' },
	],
	rules: [
		{ ruleid: "cbs.B1.Rule", ruletype: 1, ruledefinition: '<EnableRule Id="cbs.B1.Rule"><SelectionCountRule Minimum="1" /></EnableRule>' },
		{ ruleid: "cbs.Tab.Command", ruletype: 3, ruledefinition: `<TabDisplayRule TabCommand="cbs.Tab.Command"><EntityRule EntityName="${T}" Context="HomePageGrid" AppliesTo="PrimaryEntity" /></TabDisplayRule>` },
	],
};

const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));
const layerParts = () => partsFromRibbonTables(LAYER_ROWS);

function load() {
	const parsed = parseRibbonXml(MERGED, "HomepageGrid", T, locLabelsOf(layerParts()));
	applyLayerOwnership(parsed.ribbon, ownControlIds(layerParts()));
	return parsed;
}

function locLabelsOf(parts: RibbonDiffParts): LocLabel[] {
	return Array.from(parts.locLabels.entries()).map(([id, xml]) => ({
		id,
		titles: Array.from(new DOMParser().parseFromString(xml, "application/xml").querySelectorAll("Title")).map((t) => ({
			languageCode: Number(t.getAttribute("languagecode")),
			description: t.getAttribute("description") ?? "",
		})),
	}));
}

type Parsed = ReturnType<typeof load>;
const tab = (def: RibbonDefinition, id: string) => def.tabs.find((t) => t.id === id)!;
const group = (def: RibbonDefinition, id: string) => def.tabs.flatMap((t) => t.groups).find((g) => g.id === id)!;

function plan(current: RibbonDefinition, parsed: Parsed = load(), extra: Partial<PlanInput> = {}) {
	const base = load();
	return planScope({
		locations: [{ current, baseline: base.ribbon }],
		commands: parsed.commands,
		baselineCommands: base.commands,
		enableRules: parsed.enableRules,
		baselineEnableRules: base.enableRules,
		displayRules: parsed.displayRules,
		baselineDisplayRules: base.displayRules,
		locLabels: parsed.locLabels,
		baselineLocLabels: base.locLabels,
		layer: layerSnapshotFromParts(layerParts()),
		...extra,
	});
}

async function build(current: RibbonDefinition, parsed: Parsed = load(), extra: Partial<PlanInput> = {}, languageCode?: number) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const p = plan(current, parsed, extra);
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: T, schemaName: T },
		locations: [{ current, baseline: load().ribbon }],
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
		plan: p,
		languageCode,
	});
	const doc = new DOMParser().parseFromString(result.xml, "application/xml");
	return { ...result, plan: p, doc };
}

const ids = (doc: Document, selector: string, attr = "Id") =>
	Array.from(doc.querySelectorAll(selector)).map((e) => e.getAttribute(attr));

beforeEach(() => {
	layer = layerParts();
});

describe("layer snapshot", () => {
	it("knows the layer's own tabs / groups (including groups inside its tab), labels and hides", () => {
		const snap = layerSnapshotFromParts(layerParts());
		expect(new Set(snap.containerIds)).toEqual(new Set(["cbs.Tab", "cbs.Tab.G1", "cbs.Tab.G2", "cbs.Grp"]));
		expect(snap.controlIds).toEqual(expect.arrayContaining(["cbs.B1", "cbs.B4", "cbs.Tab", "cbs.Grp"]));
		expect(snap.locLabelIds).toContain("cbs.B4.LabelText");
		expect(snap.hides).toEqual([{ hideActionId: "cbs.HideRefresh", location: `Mscrm.HomepageGrid.${T}.Refresh` }]);
		expect(hideActionsOf(layerParts())).toHaveLength(1);
		expect(ownContainerIds(layerParts()).has("cbs.B1")).toBe(false);
	});

	it("an unchanged load plans nothing", () => {
		const parsed = load();
		const p = plan(parsed.ribbon, parsed);
		expect(p.hasChanges).toBe(false);
		expect(p.unsupported).toEqual([]);
	});
});

describe("#47 — controls hidden by the layer can be un-hidden", () => {
	const refresh = `Mscrm.HomepageGrid.${T}.Refresh`;

	it("an un-hide chosen from the hidden list is a change and removes the HideCustomAction", async () => {
		const parsed = load();
		const p = plan(parsed.ribbon, parsed, { unhiddenLayerHideIds: [refresh] });
		expect(p.hasChanges).toBe(true);
		expect(p.unhiddenButtonIds).toEqual([refresh]);
		const { doc } = await build(parsed.ribbon, parsed, { unhiddenLayerHideIds: [refresh] });
		expect(doc.querySelectorAll("HideCustomAction")).toHaveLength(0);
		// Nothing else is lost.
		expect(ids(doc, "CustomActions > CustomAction")).toHaveLength(8);
	});

	it("the store tracks pending un-hides and drops them from the list once published", () => {
		const s = useRibbonStore.getState();
		s.loadWorkspace({
			ribbons: { HomepageGrid: load().ribbon, SubGrid: { location: "SubGrid", entityLogicalName: T, tabs: [] }, Form: { location: "Form", entityLogicalName: T, tabs: [] }, Application: { location: "Application", entityLogicalName: "", tabs: [] } },
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
			layers: { entity: layerSnapshotFromParts(layerParts()) },
		});
		useRibbonStore.getState().setLayerHideUnhidden("entity", refresh, true);
		expect(useRibbonStore.getState().pendingUnhides.entity).toEqual([refresh]);
		expect(useRibbonStore.getState().mutationsSincePublish).toBe(1);
		useRibbonStore.getState().setLayerHideUnhidden("entity", refresh, false);
		expect(useRibbonStore.getState().pendingUnhides.entity).toEqual([]);
		useRibbonStore.getState().setLayerHideUnhidden("entity", refresh, true);

		// Publishing only the application ribbon leaves the table's un-hide pending.
		useRibbonStore.getState().markPublished(["Application"]);
		expect(useRibbonStore.getState().pendingUnhides.entity).toEqual([refresh]);
		expect(useRibbonStore.getState().mutationsSincePublish).toBeGreaterThan(0);

		useRibbonStore.getState().markPublished(["HomepageGrid", "SubGrid", "Form"]);
		expect(useRibbonStore.getState().pendingUnhides.entity).toEqual([]);
		expect(useRibbonStore.getState().layers.entity!.hides).toEqual([]);
	});
});

describe("#48 — deleting a tab or group the layer adds", () => {
	it("a deleted tab is planned with its own buttons", () => {
		const parsed = load();
		parsed.ribbon.tabs = parsed.ribbon.tabs.filter((t) => t.id !== "cbs.Tab");
		const p = plan(parsed.ribbon, parsed);
		expect(p.deletedContainerIds).toEqual(["cbs.Tab"]);
		expect(p.deletedButtonIds.sort()).toEqual(["cbs.B1", "cbs.B2"]);
		expect(p.unsupported).toEqual([]);
		expect(p.hasChanges).toBe(true);
	});

	it("removes the tab, its inline groups, buttons placed in them, their labels, unused commands / rules and its tab display rule", async () => {
		const parsed = load();
		parsed.ribbon.tabs = parsed.ribbon.tabs.filter((t) => t.id !== "cbs.Tab");
		const { doc } = await build(parsed.ribbon, parsed);
		const cas = ids(doc, "CustomActions > CustomAction");
		expect(cas).not.toContain("cbs.Tab.CustomAction");
		expect(cas).not.toContain("cbs.B1.CustomAction");
		expect(cas).not.toContain("cbs.B2.CustomAction");
		expect(cas).toEqual(expect.arrayContaining(["cbs.Grp.CustomAction", "cbs.B3.CustomAction", "cbs.B4.CustomAction", "cbs.B5.CustomAction"]));
		const labels = ids(doc, "LocLabels > LocLabel");
		for (const gone of ["cbs.Tab.Title", "cbs.Tab.G1.Title", "cbs.Tab.G2.Title", "cbs.B1.LabelText"]) expect(labels).not.toContain(gone);
		expect(labels).toEqual(expect.arrayContaining(["cbs.Grp.Title", "cbs.B3.LabelText", "cbs.B4.LabelText"]));
		const commands = ids(doc, "CommandDefinitions > CommandDefinition");
		expect(commands).not.toContain("cbs.B1.Command");
		expect(commands).not.toContain("cbs.Tab.Command");
		// Still used by cbs.B3 / cbs.B5.
		expect(commands).toContain("cbs.Shared.Command");
		expect(ids(doc, "EnableRules > EnableRule")).not.toContain("cbs.B1.Rule");
		expect(doc.querySelectorAll("TabDisplayRule")).toHaveLength(0);
		// The hide of an out-of-the-box control is untouched.
		expect(doc.querySelectorAll("HideCustomAction")).toHaveLength(1);
	});

	it("a group declared inside the layer's tab is removed from that tab in place (with its scaling)", async () => {
		const parsed = load();
		const t = tab(parsed.ribbon, "cbs.Tab");
		t.groups = t.groups.filter((g) => g.id !== "cbs.Tab.G2");
		const { doc, plan: p } = await build(parsed.ribbon, parsed);
		expect(p.deletedContainerIds).toEqual(["cbs.Tab.G2"]);
		const tabEl = doc.querySelector('Tab[Id="cbs.Tab"]')!;
		expect(ids(tabEl.ownerDocument, 'Tab[Id="cbs.Tab"] Group')).toEqual(["cbs.Tab.G1"]);
		expect(tabEl.querySelector('MaxSize[GroupId="cbs.Tab.G2"]')).toBeNull();
		expect(tabEl.querySelector('MaxSize[GroupId="cbs.Tab.G1"]')).not.toBeNull();
		expect(ids(doc, "CustomActions > CustomAction")).not.toContain("cbs.B2.CustomAction");
		expect(ids(doc, "LocLabels > LocLabel")).not.toContain("cbs.Tab.G2.Title");
		expect(ids(doc, "LocLabels > LocLabel")).toContain("cbs.Tab.Title");
		expect(doc.querySelectorAll("TabDisplayRule")).toHaveLength(1);
	});

	it("a group the layer adds to an out-of-the-box tab is removed with its buttons and MaxSize", async () => {
		const parsed = load();
		const t = tab(parsed.ribbon, MAIN);
		t.groups = t.groups.filter((g) => g.id !== "cbs.Grp");
		const { doc, plan: p } = await build(parsed.ribbon, parsed);
		expect(p.deletedContainerIds).toEqual(["cbs.Grp"]);
		const cas = ids(doc, "CustomActions > CustomAction");
		for (const gone of ["cbs.Grp.CustomAction", "cbs.Grp.MaxSize.CustomAction", "cbs.B3.CustomAction"]) expect(cas).not.toContain(gone);
		expect(ids(doc, "LocLabels > LocLabel")).not.toContain("cbs.Grp.Title");
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).toContain("cbs.Shared.Command");
	});

	it("deleting an out-of-the-box tab or group is reported, not silently dropped", () => {
		const parsed = load();
		const t = tab(parsed.ribbon, MAIN);
		t.groups = t.groups.filter((g) => g.id !== `${MAIN}.Management`);
		const p = plan(parsed.ribbon, parsed);
		expect(p.deletedContainerIds).toEqual([]);
		expect(p.unsupported.join("\n")).toContain(`Removing group ${MAIN}.Management`);

		const parsed2 = load();
		parsed2.ribbon.tabs = parsed2.ribbon.tabs.filter((x) => x.id !== MAIN);
		expect(plan(parsed2.ribbon, parsed2).unsupported.join("\n")).toContain(`Removing tab ${MAIN}`);
	});

	it("without layer information tab deletes are reported, and the publish refuses a container the layer doesn't add", async () => {
		const parsed = load();
		parsed.ribbon.tabs = parsed.ribbon.tabs.filter((t) => t.id !== "cbs.Tab");
		expect(plan(parsed.ribbon, parsed, { layer: undefined }).unsupported.join("\n")).toContain("Removing tab cbs.Tab");

		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		await expect(
			buildMergedRibbonDiffXml({
				entity: { logicalName: T },
				locations: [],
				commands: [],
				enableRules: [],
				displayRules: [],
				locLabels: [],
				plan: { editedCommandIds: [], editedEnableRuleIds: [], editedDisplayRuleIds: [], deletedButtonIds: [], unhiddenButtonIds: [], deletedContainerIds: [MAIN] },
			}),
		).rejects.toThrow(/Can't delete/);
	});

	it("mergeScopeChanges removes hides and overrides that target a deleted container's controls", () => {
		const existing = layerParts();
		existing.customActions.set("hide:x", `<HideCustomAction HideActionId="x" Location="cbs.B1" />`);
		existing.customActions.set(
			"ca:cbs.B2.Override",
			ca("cbs.B2.Override", "cbs.B2", 10, `<Button Id="cbs.B2" Command="cbs.Shared.Command" Sequence="10" LabelText="Two!" />`),
		);
		const merged = mergeScopeChanges(existing, partsFromRibbonTables({ diffs: [], commands: [], rules: [] }), {
			deletedContainerIds: ["cbs.Tab"],
		});
		expect(merged.customActions.has("hide:x")).toBe(false);
		expect(merged.customActions.has("ca:cbs.B2.Override")).toBe(false);
		expect(merged.customActions.has("hide:cbs.HideRefresh")).toBe(true);
	});
});

describe("#49 — translation-only and existing-tab display rule edits", () => {
	it("a translation of a label the layer defines is published with every language", async () => {
		const parsed = load();
		parsed.locLabels = parsed.locLabels.map((l) =>
			l.id === "cbs.B4.LabelText" ? { id: l.id, titles: [...l.titles.filter((t) => t.languageCode !== 1031), { languageCode: 1031, description: "Vier!" }, { languageCode: 1036, description: "Quatre" }] } : l,
		);
		const { doc, plan: p } = await build(parsed.ribbon, parsed);
		expect(p.editedLocLabelIds).toEqual(["cbs.B4.LabelText"]);
		expect(p.hasChanges).toBe(true);
		const titles = Array.from(doc.querySelectorAll('LocLabel[Id="cbs.B4.LabelText"] Title')).map(
			(t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`,
		);
		expect(titles.sort()).toEqual(["1031=Vier!", "1033=Four", "1036=Quatre"]);
		// No CustomAction is touched.
		expect(doc.querySelectorAll("CustomActions > CustomAction")).toHaveLength(8);
	});

	it("a translation of the tab title (referenced by the tab) is published", () => {
		const parsed = load();
		parsed.locLabels = parsed.locLabels.map((l) =>
			l.id === "cbs.Tab.Title" ? { id: l.id, titles: [...l.titles, { languageCode: 1031, description: "CBS (de)" }] } : l,
		);
		expect(plan(parsed.ribbon, parsed).editedLocLabelIds).toEqual(["cbs.Tab.Title"]);
	});

	it("a translation of a label defined elsewhere is reported", () => {
		const parsed = load();
		parsed.locLabels = parsed.locLabels.map((l) =>
			l.id === "cbs.B4.LabelText" ? { ...l, titles: [...l.titles, { languageCode: 1036, description: "Quatre" }] } : l,
		);
		const p = plan(parsed.ribbon, parsed, { layer: { containerIds: [], locLabelIds: [] } });
		expect(p.editedLocLabelIds).toEqual([]);
		expect(p.unsupported.join("\n")).toContain("Translations of label cbs.B4.LabelText");
	});

	it("translations for a button whose text isn't a label yet are reported", () => {
		const parsed = load();
		parsed.locLabels.push({ id: "cbs.B5.LabelText", titles: [{ languageCode: 1033, description: "Five" }, { languageCode: 1031, description: "Fünf" }] });
		const p = plan(parsed.ribbon, parsed);
		expect(p.unsupported.join("\n")).toMatch(/Translations for "Five" \(cbs\.B5\)/);
	});

	it("…but once the text is edited, the generator writes the label with the translations", async () => {
		const parsed = load();
		parsed.locLabels.push({ id: "cbs.B5.LabelText", titles: [{ languageCode: 1033, description: "Five" }, { languageCode: 1031, description: "Fünf" }] });
		group(parsed.ribbon, `${MAIN}.Management`).buttons.find((b) => b.id === "cbs.B5")!.label = "Five!";
		const { doc, plan: p } = await build(parsed.ribbon, parsed);
		expect(p.unsupported).toEqual([]);
		expect(p.editedLocLabelIds).toEqual([]);
		const titles = Array.from(doc.querySelectorAll('LocLabel[Id="cbs.B5.LabelText"] Title')).map(
			(t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`,
		);
		expect(titles.sort()).toEqual(["1031=Fünf", "1033=Five!"]);
		expect(doc.querySelector('Button[Id="cbs.B5"]')!.getAttribute("LabelText")).toBe("$LocLabels:cbs.B5.LabelText");
	});

	it("the store counts a translation edit as a change and advances the label baseline on publish", () => {
		const s = useRibbonStore.getState();
		s.loadWorkspace({
			ribbons: clone(useRibbonStore.getState().ribbons),
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [{ id: "x", titles: [{ languageCode: 1033, description: "X" }] }],
		});
		useRibbonStore.getState().upsertLocLabel({ id: "x", titles: [{ languageCode: 1033, description: "X" }] });
		expect(useRibbonStore.getState().mutationsSincePublish).toBe(0);
		useRibbonStore.getState().upsertLocLabel({ id: "x", titles: [{ languageCode: 1033, description: "Y" }] });
		expect(useRibbonStore.getState().mutationsSincePublish).toBe(1);
		expect(useRibbonStore.getState().baselineLocLabels[0].titles[0].description).toBe("X");
		useRibbonStore.getState().markPublished();
		expect(useRibbonStore.getState().baselineLocLabels[0].titles[0].description).toBe("Y");
	});

	it("an edited display rule of the layer's own tab replaces its TabDisplayRule", async () => {
		const parsed = load();
		tab(parsed.ribbon, "cbs.Tab").tabDisplayRules = [
			{ tabCommand: "cbs.Tab.Command", rules: [{ kind: "EntityRule", entityName: T, context: "Form", appliesTo: "PrimaryEntity" }] },
		];
		const { doc, plan: p } = await build(parsed.ribbon, parsed);
		expect(p.editedTabIds).toEqual(["cbs.Tab"]);
		expect(p.hasChanges).toBe(true);
		const rules = doc.querySelectorAll('TabDisplayRule[TabCommand="cbs.Tab.Command"]');
		expect(rules).toHaveLength(1);
		expect(rules[0].querySelector("EntityRule")!.getAttribute("Context")).toBe("Form");
	});

	it("removing every display rule of the layer's own tab removes its TabDisplayRule", async () => {
		const parsed = load();
		tab(parsed.ribbon, "cbs.Tab").tabDisplayRules = [];
		const { doc } = await build(parsed.ribbon, parsed);
		expect(doc.querySelectorAll("TabDisplayRule")).toHaveLength(0);
		expect(ids(doc, "CustomActions > CustomAction")).toContain("cbs.Tab.CustomAction");
	});

	it("changing an out-of-the-box tab's display rules is reported", () => {
		const parsed = load();
		tab(parsed.ribbon, MAIN).tabDisplayRules = [{ tabCommand: MAIN, rules: [{ kind: "PageRule", address: "/x" }] }];
		const p = plan(parsed.ribbon, parsed);
		expect(p.editedTabIds).toEqual([]);
		expect(p.unsupported.join("\n")).toContain(`Changing the display rules of tab ${MAIN}`);
	});
});

describe("#50 — labels are written in the organisation's base language", () => {
	it("an edited $LocLabels label updates the base-language title and keeps the others", async () => {
		const parsed = load();
		group(parsed.ribbon, `${MAIN}.Management`).buttons.find((b) => b.id === "cbs.B4")!.label = "Vier!!";
		const { doc } = await build(parsed.ribbon, parsed, {}, 1031);
		const titles = Array.from(doc.querySelectorAll('LocLabel[Id="cbs.B4.LabelText"] Title')).map(
			(t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`,
		);
		expect(titles.sort()).toEqual(["1031=Vier!!", "1033=Four"]);
	});

	it("new buttons, tabs and groups get base-language titles", () => {
		const base = load().ribbon;
		const current = clone(base);
		current.tabs.push({
			id: "cbs.NewTab",
			label: "Neu",
			sequence: 900,
			tabDisplayRules: [],
			groups: [{ id: "cbs.NewTab.G", label: "Gruppe", sequence: 10, template: "Flexible2", buttons: [] }],
		});
		group(current, `${MAIN}.Management`).buttons.push({
			id: "cbs.New",
			label: "Knopf",
			kind: "button",
			sequence: 990,
			templateAlias: "o1",
			commandId: "cbs.Shared.Command",
			hidden: false,
			oob: false,
			custom: true,
			managed: false,
		});
		const xml = generateRibbonDiffXml({
			current,
			baseline: base,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: T,
			location: "HomepageGrid",
			languageCode: 1031,
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const langs = Array.from(doc.querySelectorAll("LocLabel Title")).map((t) => t.getAttribute("languagecode"));
		expect(langs.length).toBeGreaterThanOrEqual(3);
		expect(new Set(langs)).toEqual(new Set(["1031"]));
	});

	it("an unchanged label shown in the base language is not treated as edited", () => {
		const parsed = load();
		const b4 = group(parsed.ribbon, `${MAIN}.Management`).buttons.find((b) => b.id === "cbs.B4")!;
		// What the canvas shows in a German organisation; the tooltip edit forces an override.
		b4.label = "Vier";
		b4.tooltipTitle = "Tip";
		const baseline = clone(parsed.ribbon);
		group(baseline, `${MAIN}.Management`).buttons.find((b) => b.id === "cbs.B4")!.tooltipTitle = undefined;
		const xml = generateRibbonDiffXml({
			current: parsed.ribbon,
			baseline,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: parsed.locLabels,
			entityLogicalName: T,
			location: "HomepageGrid",
			languageCode: 1031,
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const titles = Array.from(doc.querySelectorAll('LocLabel[Id="cbs.B4.LabelText"] Title')).map(
			(t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`,
		);
		expect(titles.sort()).toEqual(["1031=Vier", "1033=Four"]);
	});
});

describe("#26 — moving / re-sequencing your own buttons", () => {
	it("sequenceBetween keeps a fitting value and otherwise picks one between the neighbours", () => {
		expect(sequenceBetween(15, 10, 20)).toBe(15);
		expect(sequenceBetween(900, 10, 20)).toBe(15);
		expect(sequenceBetween(900, 10, 11)).toBe(11);
		expect(sequenceBetween(5, 10, undefined)).toBe(20);
		expect(sequenceBetween(50, undefined, 10)).toBe(1);
		expect(sequenceBetween(50, undefined, 100)).toBe(50);
		expect(sequenceBetween(7)).toBe(7);
	});

	it("moveButton gives the moved button a sequence matching its new position", () => {
		const parsed = load();
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: parsed.ribbon,
				SubGrid: { location: "SubGrid", entityLogicalName: T, tabs: [] },
				Form: { location: "Form", entityLogicalName: T, tabs: [] },
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		useRibbonStore.getState().moveButton(
			{ groupId: `${MAIN}.Management`, buttonId: "cbs.B4", tabId: MAIN, location: "HomepageGrid" },
			{ groupId: `${MAIN}.Management`, beforeButtonId: `Mscrm.HomepageGrid.${T}.Edit`, tabId: MAIN, location: "HomepageGrid" },
		);
		const buttons = group(useRibbonStore.getState().ribbons.HomepageGrid, `${MAIN}.Management`).buttons;
		expect(buttons.map((b) => b.id).slice(0, 3)).toEqual([`Mscrm.HomepageGrid.${T}.NewRecord`, "cbs.B4", `Mscrm.HomepageGrid.${T}.Edit`]);
		expect(buttons[1].sequence).toBe(15);
	});

	it("a move of your own button is planned and its CustomAction is relocated in place", async () => {
		const parsed = load();
		const from = group(parsed.ribbon, `${MAIN}.Management`);
		const b4 = from.buttons.find((b) => b.id === "cbs.B4")!;
		from.buttons = from.buttons.filter((b) => b !== b4);
		group(parsed.ribbon, "cbs.Tab.G1").buttons.push({ ...b4, sequence: 20 });
		const { doc, plan: p } = await build(parsed.ribbon, parsed);
		expect(p.unsupported).toEqual([]);
		expect(p.movedButtons).toEqual([{ id: "cbs.B4", groupId: "cbs.Tab.G1", sequence: 20 }]);
		const caEl = doc.querySelector('CustomAction[Id="cbs.B4.CustomAction"]')!;
		expect(caEl.getAttribute("Location")).toBe("cbs.Tab.G1.Controls._children");
		expect(caEl.getAttribute("Sequence")).toBe("20");
		expect(caEl.querySelector("Button")!.getAttribute("Sequence")).toBe("20");
		// Moved, not copied.
		expect(doc.querySelectorAll('Button[Id="cbs.B4"]')).toHaveLength(1);
	});

	it("a re-sequence plus an edit keeps one CustomAction with both changes", async () => {
		const parsed = load();
		const b4 = group(parsed.ribbon, `${MAIN}.Management`).buttons.find((b) => b.id === "cbs.B4")!;
		b4.sequence = 5;
		b4.tooltipTitle = "Moved";
		const { doc } = await build(parsed.ribbon, parsed);
		expect(doc.querySelectorAll('Button[Id="cbs.B4"]')).toHaveLength(1);
		const caEl = doc.querySelector('CustomAction[Id="cbs.B4.CustomAction"]')!;
		expect(caEl.getAttribute("Sequence")).toBe("5");
		expect(caEl.getAttribute("Location")).toBe(`${MAIN}.Management.Controls._children`);
		expect(caEl.querySelector("Button")!.getAttribute("ToolTipTitle")).toBe("$LocLabels:cbs.B4.ToolTipTitle");
	});

	it("moving an out-of-the-box button is still reported as unsupported", () => {
		const parsed = load();
		group(parsed.ribbon, `${MAIN}.Management`).buttons.find((b) => b.id === `Mscrm.HomepageGrid.${T}.Edit`)!.sequence = 1;
		const p = plan(parsed.ribbon, parsed);
		expect(p.movedButtons).toEqual([]);
		expect(p.unsupported.join("\n")).toContain("Moving or re-ordering");
	});

	it("the publish refuses to move a control the layer doesn't add", async () => {
		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		await expect(
			buildMergedRibbonDiffXml({
				entity: { logicalName: T },
				locations: [],
				commands: [],
				enableRules: [],
				displayRules: [],
				locLabels: [],
				plan: {
					editedCommandIds: [],
					editedEnableRuleIds: [],
					editedDisplayRuleIds: [],
					deletedButtonIds: [],
					unhiddenButtonIds: [],
					movedButtons: [{ id: `Mscrm.HomepageGrid.${T}.Edit`, groupId: "x", sequence: 1 }],
				},
			}),
		).rejects.toThrow(/Can't move/);
	});
});

describe("compareRibbonDiffParts (#46 verification)", () => {
	it("reports missing and unexpected elements by part and id", () => {
		const a = layerParts();
		const b = layerParts();
		b.customActions.delete("ca:cbs.B1.CustomAction");
		b.locLabels.set("extra", label("extra", [1033, "x"]));
		expect(compareRibbonDiffParts(a, b)).toEqual({
			missing: ["customActions:ca:cbs.B1.CustomAction"],
			unexpected: ["locLabels:extra"],
		});
		expect(compareRibbonDiffParts(a, layerParts())).toEqual({ missing: [], unexpected: [] });
	});
});
