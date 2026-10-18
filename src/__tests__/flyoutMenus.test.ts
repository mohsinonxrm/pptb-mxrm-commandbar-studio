/**
 * Flyout / split-button menus (#27): parsed into a nested Menu model instead of
 * being flattened into the group, written back losslessly, published as one
 * CustomAction for a new flyout, per item for an existing menu, and merged in
 * place for a flyout your unmanaged layer adds.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml, indexButtons, summarizeRibbonDiff } from "@/services/xmlGenerator";
import { validateRibbonDiffXml } from "@/services/xmlValidator";
import { canonicalXml, parseXmlElement } from "@/services/ribbonXmlCanonical";
import {
	partsFromRibbonTables,
	ownControlIds,
	mergeScopeChanges,
	parseRibbonDiffParts,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { planScope, type PlanInput } from "@/services/publishPlan";
import { layerSnapshotFromParts } from "@/services/dataverse/ribbonLayerService";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { copyControl, groupControls, menuItemsOf } from "@/utils/ribbonMenu";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonButton, RibbonDefinition, RibbonGroup, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const fixture = (name: string) =>
	readFileSync(resolve(__dirname, "../__fixtures__/ribbon", name), "utf-8");
const clone = <V>(v: V): V => JSON.parse(JSON.stringify(v));

const OOB = fixture("contact-homepage-menus.xml");
const SEND = "Mscrm.HomepageGrid.contact.Send";
const COLLABORATE = "Mscrm.HomepageGrid.contact.MainTab.Collaborate";

const controls = (def: RibbonDefinition) =>
	def.tabs.flatMap((t) => t.groups.flatMap(groupControls));
const ctl = (def: RibbonDefinition, id: string) => controls(def).find((b) => b.id === id)!;
const group = (def: RibbonDefinition, id: string) =>
	def.tabs.flatMap((t) => t.groups).find((g) => g.id === id)!;

function generate(current: RibbonDefinition, baseline: RibbonDefinition, parsed = parseOob()) {
	return generateRibbonDiffXml({
		current,
		baseline,
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
		entityLogicalName: "contact",
		location: current.location,
	});
}

function parseOob() {
	return parseRibbonXml(OOB, "HomepageGrid", "contact");
}

function planOf(
	current: RibbonDefinition,
	baseline: RibbonDefinition,
	extra: Partial<PlanInput> = {},
) {
	return planScope({
		locations: [{ current, baseline }],
		commands: [],
		baselineCommands: [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		...extra,
	});
}

const doc = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const customActions = (xml: string) =>
	Array.from(doc(xml).querySelectorAll("CustomActions > CustomAction"));

/** A source element without the attributes RetrieveEntityRibbon adds that RibbonDiffXml doesn't allow. */
function withoutSolutionNames(el: Element): Element {
	const copy = el.cloneNode(true) as Element;
	for (const e of [copy, ...Array.from(copy.getElementsByTagName("*"))])
		e.removeAttribute("SolutionUniqueName");
	return copy;
}

const item = (
	id: string,
	sequence: number,
	extra: Partial<RibbonButton> = {},
): Pick<RibbonButton, "id" | "label" | "commandId" | "sequence"> & Partial<RibbonButton> => ({
	id,
	label: id.split(".").pop()!,
	commandId: `${id}.Command`,
	sequence,
	...extra,
});

// ---------------------------------------------------------------------------

describe("#27 parse — menus stay inside their flyout / split button", () => {
	const { ribbon } = parseOob();

	it("doesn't flatten menu items into the group (the descendant-selector bug)", () => {
		const collaborate = group(ribbon, COLLABORATE);
		const top = collaborate.buttons.map((b) => b.id);
		expect(top).toContain(SEND);
		expect(top).not.toContain(`${SEND}.Selected`);
		expect(top).not.toContain(`${SEND}.View`);
		// Every top-level control is a direct child of a group's <Controls> — the
		// ToggleButton too, which is shown read-only since #42.
		const direct = Array.from(doc(OOB).querySelectorAll("Group > Controls > *")).map((e) => e.getAttribute("Id"));
		expect(
			ribbon.tabs.flatMap((t) => t.groups.flatMap((g) => g.buttons.map((b) => b.id))),
		).toEqual(direct);
	});

	it("models Mscrm.HomepageGrid.contact.Send (split button) with its Send.Menu", () => {
		const send = ctl(ribbon, SEND);
		expect(send.kind).toBe("splitButton");
		expect(send.menu?.id).toBe(`${SEND}.Menu`);
		expect(send.menu?.sections).toHaveLength(1);
		const [section] = send.menu!.sections;
		expect(section).toMatchObject({
			id: `${SEND}.MenuSection`,
			sequence: 10,
			displayMode: "Menu16",
			controlsId: `${SEND}.Controls`,
		});
		expect(section.controls.map((c) => [c.id, c.commandId, c.kind])).toEqual([
			[`${SEND}.Selected`, "Mscrm.SendShortcutSelected", "button"],
			[`${SEND}.View`, "Mscrm.SendShortcutView", "button"],
		]);
		expect(section.controls[0].origin).toBe("oob");
	});

	it("models nested flyouts, and keeps dynamic population attributes", () => {
		const flows = ctl(ribbon, "Mscrm.HomepageGrid.contact.Flows.RefreshCommandBar.Flows");
		const nested = flows.menu!.sections[0].controls;
		expect(nested.map((c) => c.kind)).toEqual(["flyout", "flyout", "flyout"]);
		expect(nested[1].source?.attributes).toMatchObject({
			PopulateDynamically: "true",
			PopulateQueryCommand: "Mscrm.DynamicMenu.Grid.Flows.PopulateFlowMenu",
		});
		expect(nested[1].menu).toBeUndefined();
		const dynamic = ctl(ribbon, "Mscrm.HomepageGrid.contact.Flows.RefreshCommandBar");
		expect(dynamic.menu).toBeUndefined();
		expect(dynamic.source?.attributes["PopulateQueryCommand"]).toBe(
			"Mscrm.DynamicMenu.Grid.Flows.PopulateMenu",
		);
	});

	it("keeps a section without Sequence / DisplayMode as it is", () => {
		const dummy = ctl(ribbon, "AIBuilder.contact.Flyout.Dummy");
		const [section] = dummy.menu!.sections;
		expect(section.displayMode).toBeUndefined();
		expect(section.attributes).toEqual({
			Id: "AIBuilder.contact.Flyout.Menu.MenuSection.Dummy",
		});
		expect(section.controls).toHaveLength(2);
	});

	it("an unchanged load publishes nothing", () => {
		const parsed = parseOob();
		expect(customActions(generate(parsed.ribbon, parseOob().ribbon))).toHaveLength(0);
		const plan = planOf(parsed.ribbon, parseOob().ribbon);
		expect(plan.hasChanges).toBe(false);
		expect(plan.unsupported).toEqual([]);
	});
});

describe("#27 round trip — parse → model → generate on the real menus", () => {
	const source = doc(OOB);
	const withMenus = Array.from(source.querySelectorAll("Group > Controls > *")).filter((e) =>
		Array.from(e.children).some((c) => c.tagName === "Menu"),
	);

	it("the fixture has the expected menus", () => {
		expect(withMenus.map((e) => e.tagName)).toEqual(
			expect.arrayContaining(["SplitButton", "FlyoutAnchor"]),
		);
		expect(withMenus.map((e) => e.getAttribute("Id"))).toEqual(
			expect.arrayContaining([
				SEND,
				"Mscrm.HomepageGrid.contact.DeleteMenu",
				"Mscrm.HomepageGrid.contact.ExportToExcel",
			]),
		);
	});

	it.each(withMenus.map((e) => [e.getAttribute("Id")!, e] as const))(
		"%s is written back with its whole <Menu>, losslessly",
		(id, sourceEl) => {
			const parsed = parseOob();
			// Treat the control as new (absent from the baseline), which writes it in full.
			const baseline = clone(parsed.ribbon);
			for (const g of baseline.tabs.flatMap((t) => t.groups))
				g.buttons = g.buttons.filter((b) => b.id !== id);
			const xml = generate(parsed.ribbon, baseline, parsed);
			const cas = customActions(xml);
			expect(cas).toHaveLength(1);
			const written = cas[0].querySelector("CommandUIDefinition")!.firstElementChild!;
			expect(canonicalXml(written)).toBe(canonicalXml(withoutSolutionNames(sourceEl)));
			// Items of a new menu are never written twice.
			expect(cas[0].getAttribute("Location")).toMatch(/\.Controls\._children$/);
		},
	);
});

describe("#27 a new flyout created in CBS", () => {
	function storeWith(items: number) {
		const parsed = parseOob();
		const s = useRibbonStore.getState();
		s.loadWorkspace({
			ribbons: {
				HomepageGrid: parsed.ribbon,
				SubGrid: { location: "SubGrid", entityLogicalName: "contact", tabs: [] },
				Form: { location: "Form", entityLogicalName: "contact", tabs: [] },
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: parsed.commands,
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		const tabId = parsed.ribbon.tabs[0].id;
		useRibbonStore.getState().createButton({
			location: "HomepageGrid",
			tabId,
			groupId: COLLABORATE,
			button: {
				id: "cbs.contact.Fly.Button",
				label: "Approvals",
				kind: "flyout",
				sequence: 900,
				templateAlias: "o1",
				commandId: "cbs.contact.Fly.Command",
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
			},
		});
		for (let i = 1; i <= items; i++) {
			useRibbonStore.getState().addMenuItem({
				location: "HomepageGrid",
				tabId,
				groupId: COLLABORATE,
				parentId: "cbs.contact.Fly.Button",
				// No sequence: the store appends after the last item.
				item: {
					id: `cbs.contact.Fly.Item${i}.Button`,
					label: `Item ${i}`,
					commandId: `cbs.contact.Item${i}.Command`,
				},
			});
		}
		return {
			current: useRibbonStore.getState().ribbons.HomepageGrid,
			baseline: useRibbonStore.getState().baseline.HomepageGrid,
		};
	}

	it("is written as ONE CustomAction holding its whole menu", () => {
		const { current, baseline } = storeWith(2);
		const xml = generate(current, baseline);
		const cas = customActions(xml);
		expect(cas).toHaveLength(1);
		expect(cas[0].getAttribute("Location")).toBe(`${COLLABORATE}.Controls._children`);
		const fly = cas[0].querySelector("CommandUIDefinition > FlyoutAnchor")!;
		expect(fly.getAttribute("Id")).toBe("cbs.contact.Fly.Button");
		const menu = fly.querySelector(":scope > Menu")!;
		expect(menu.getAttribute("Id")).toBe("cbs.contact.Fly.Button.Menu");
		const section = menu.querySelector(":scope > MenuSection")!;
		expect(section.getAttribute("DisplayMode")).toBe("Menu16");
		expect(section.getAttribute("Sequence")).toBe("10");
		const items = Array.from(section.querySelectorAll(":scope > Controls > Button"));
		expect(
			items.map((b) => [
				b.getAttribute("Id"),
				b.getAttribute("Sequence"),
				b.getAttribute("Command"),
			]),
		).toEqual([
			["cbs.contact.Fly.Item1.Button", "10", "cbs.contact.Item1.Command"],
			["cbs.contact.Fly.Item2.Button", "20", "cbs.contact.Item2.Command"],
		]);
		// Menu items take their size from the section, not a TemplateAlias.
		expect(items[0].hasAttribute("TemplateAlias")).toBe(false);
		// Every $LocLabels reference has its LocLabel.
		const labels = Array.from(doc(xml).querySelectorAll("LocLabels > LocLabel")).map((l) =>
			l.getAttribute("Id"),
		);
		expect(labels).toEqual(
			expect.arrayContaining([
				"cbs.contact.Fly.Button.LabelText",
				"cbs.contact.Fly.Item1.Button.LabelText",
				"cbs.contact.Fly.Item2.Button.LabelText",
			]),
		);
		expect(
			validateRibbonDiffXml(xml, baseline).filter((e) => !/Location/.test(e.message)),
		).toEqual([]);
	});

	it("is planned without unsupported changes; an empty one is reported", () => {
		const ok = storeWith(2);
		const plan = planOf(ok.current, ok.baseline);
		expect(plan.hasChanges).toBe(true);
		expect(plan.unsupported).toEqual([]);
		const empty = storeWith(0);
		expect(planOf(empty.current, empty.baseline).unsupported).toEqual([
			'New flyout / split button "Approvals" has no menu items — add at least one item to its menu',
		]);
	});

	it("summarizes as one new control", () => {
		const { current, baseline } = storeWith(2);
		expect(summarizeRibbonDiff(current, baseline).newButtons).toBe(1);
	});
});

describe("#27 an existing out-of-the-box menu", () => {
	const editOob = (edit: (def: RibbonDefinition) => void) => {
		const baseline = parseOob().ribbon;
		const current = clone(baseline);
		edit(current);
		return {
			current,
			baseline,
			xml: generate(current, baseline),
			plan: planOf(current, baseline),
		};
	};

	it("a new item goes to the menu section's Controls (Location = …Send.Controls._children)", () => {
		const { xml, plan } = editOob((def) => {
			ctl(def, SEND).menu!.sections[0].controls.push({
				...item("cbs.contact.SendTeams.Button", 30, { label: "Send to Teams" }),
				kind: "button",
				templateAlias: "",
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
				origin: "unmanaged",
			});
		});
		const cas = customActions(xml);
		expect(cas.map((c) => c.getAttribute("Location"))).toEqual([`${SEND}.Controls._children`]);
		expect(cas[0].querySelector("CommandUIDefinition > Button")?.getAttribute("Id")).toBe(
			"cbs.contact.SendTeams.Button",
		);
		expect(plan.unsupported).toEqual([]);
		expect(plan.hasChanges).toBe(true);
	});

	it("an edited item is overridden by its own id; a hidden one gets a HideCustomAction", () => {
		const { xml, plan } = editOob((def) => {
			ctl(def, `${SEND}.Selected`).label = "Email a link to the selection";
			ctl(def, `${SEND}.View`).hidden = true;
		});
		const cas = customActions(xml);
		expect(cas.map((c) => c.getAttribute("Location"))).toEqual([`${SEND}.Selected`]);
		expect(cas[0].querySelector("CommandUIDefinition > Button")?.getAttribute("Command")).toBe(
			"Mscrm.SendShortcutSelected",
		);
		const hides = Array.from(doc(xml).querySelectorAll("HideCustomAction")).map((h) =>
			h.getAttribute("Location"),
		);
		expect(hides).toEqual([`${SEND}.View`]);
		expect(plan.unsupported).toEqual([]);
	});

	it("deleting an out-of-the-box item, editing the split button itself or its sections is reported, not dropped", () => {
		const del = editOob((def) => {
			const s = ctl(def, SEND).menu!.sections[0];
			s.controls = s.controls.filter((c) => c.id !== `${SEND}.View`);
		});
		expect(del.plan.unsupported).toEqual([
			expect.stringMatching(
				/^Removing ".*" \(Mscrm\.HomepageGrid\.contact\.Send\.View\) — only your own/,
			),
		]);
		const anchor = editOob((def) => {
			ctl(def, SEND).label = "Share";
		});
		expect(anchor.plan.unsupported).toEqual([
			expect.stringMatching(/^Editing the flyout \/ split button "Share"/),
		]);
		const sections = editOob((def) => {
			ctl(def, SEND).menu!.sections[0].displayMode = "Menu32";
		});
		expect(sections.plan.unsupported).toEqual([expect.stringMatching(/menu sections of/)]);
	});

	it("re-ordering an out-of-the-box item is reported", () => {
		const { plan } = editOob((def) => {
			ctl(def, `${SEND}.View`).sequence = 5;
		});
		expect(plan.unsupported).toEqual([expect.stringMatching(/^Moving or re-ordering/)]);
	});
});

describe("#27 duplicate control ids are paired by occurrence", () => {
	const fly = (id: string, itemLabel: string): RibbonButton => ({
		id,
		label: id,
		kind: "flyout",
		sequence: 10,
		templateAlias: "o1",
		commandId: "",
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		menu: {
			id: `${id}.Menu`,
			sections: [
				{
					id: `${id}.Section`,
					sequence: 10,
					displayMode: "Menu16",
					controlsId: `${id}.Controls`,
					controls: [{ ...fly0("Mscrm.Dup.Item"), label: itemLabel }],
				},
			],
		},
	});
	const fly0 = (id: string): RibbonButton => ({
		id,
		label: id,
		kind: "button",
		sequence: 10,
		templateAlias: "",
		commandId: "Mscrm.Dup",
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
	});
	const def = (): RibbonDefinition => ({
		location: "Application",
		entityLogicalName: "",
		tabs: ["T1", "T2"].map((t, i) => ({
			id: `Mscrm.${t}`,
			label: t,
			sequence: i,
			tabDisplayRules: [],
			groups: [
				{
					id: `Mscrm.${t}.G`,
					label: "G",
					sequence: 10,
					template: "Mscrm.Templates.Flexible",
					buttons: [fly(`Mscrm.${t}.Fly`, "Same")],
				},
			],
		})),
	});

	it("indexes each occurrence of a repeated menu item id", () => {
		const keys = [...indexButtons(def()).keys()];
		expect(keys).toEqual([
			"Mscrm.T1.Fly#0",
			"Mscrm.Dup.Item#0",
			"Mscrm.T2.Fly#0",
			"Mscrm.Dup.Item#1",
		]);
		const second = indexButtons(def()).get("Mscrm.Dup.Item#1")!;
		expect(second.menu).toMatchObject({
			parentId: "Mscrm.T2.Fly",
			controlsId: "Mscrm.T2.Fly.Controls",
		});
		expect(second.groupId).toBe("Mscrm.T2.G");
	});

	it("an edit of the second occurrence only overrides that one", () => {
		const baseline = def();
		const current = def();
		current.tabs[1].groups[0].buttons[0].menu!.sections[0].controls[0].label = "Changed";
		expect(summarizeRibbonDiff(current, baseline)).toMatchObject({
			overriddenButtons: 1,
			newButtons: 0,
		});
		expect(planOf(current, baseline).unsupported).toEqual([]);
		expect(customActions(generate(current, baseline))).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// A flyout your unmanaged layer adds (CBS / Ribbon Workbench write the menu
// inline in the flyout's CustomAction), with one more item added to it by a
// separate `._children` CustomAction.

const T = "contact";
const G = `Mscrm.HomepageGrid.${T}.MainTab.Management`;
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.HomepageGrid.${T}.MainTab" Command="Mscrm.HomepageGrid.${T}.MainTab" Sequence="10">
    <Groups Id="Mscrm.HomepageGrid.${T}.MainTab.Groups">
      <Group Id="${G}" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${G}.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="$Resources:New" TemplateAlias="o1" />
          <FlyoutAnchor Id="cbs.Fly" Command="cbs.Fly.Command" Sequence="900" LabelText="$LocLabels:cbs.Fly.LabelText" TemplateAlias="o1">
            <Menu Id="cbs.Fly.Menu">
              <MenuSection Id="cbs.Fly.Section" Sequence="10" DisplayMode="Menu16">
                <Controls Id="cbs.Fly.Section.Controls">
                  <Button Id="cbs.Fly.A" Command="cbs.A.Command" Sequence="10" LabelText="$LocLabels:cbs.Fly.A.LabelText" />
                  <Button Id="cbs.Fly.B" Command="cbs.B.Command" Sequence="20" LabelText="$LocLabels:cbs.Fly.B.LabelText" />
                  <Button Id="cbs.Fly.C" Command="cbs.A.Command" Sequence="30" LabelText="Three" />
                </Controls>
              </MenuSection>
            </Menu>
          </FlyoutAnchor>
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="cbs.A.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="A"/></Actions></CommandDefinition>
  <CommandDefinition Id="cbs.B.Command"><EnableRules><EnableRule Id="cbs.B.Rule"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="B"/></Actions></CommandDefinition>
</CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules><EnableRule Id="cbs.B.Rule"><SelectionCountRule Minimum="1"/></EnableRule></EnableRules></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const ca = (id: string, location: string, seq: number, inner: string) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
const label = (id: string, text: string) =>
	`<LocLabel Id="${id}"><Titles><Title languagecode="1033" description="${text}" /></Titles></LocLabel>`;

const LAYER_ROWS = {
	diffs: [
		{
			difftype: 0,
			rdx: ca(
				"cbs.Fly.CustomAction",
				`${G}.Controls._children`,
				900,
				`<FlyoutAnchor Id="cbs.Fly" Command="cbs.Fly.Command" Sequence="900" LabelText="$LocLabels:cbs.Fly.LabelText" TemplateAlias="o1"><Menu Id="cbs.Fly.Menu"><MenuSection Id="cbs.Fly.Section" Sequence="10" DisplayMode="Menu16"><Controls Id="cbs.Fly.Section.Controls"><Button Id="cbs.Fly.A" Command="cbs.A.Command" Sequence="10" LabelText="$LocLabels:cbs.Fly.A.LabelText" /><Button Id="cbs.Fly.B" Command="cbs.B.Command" Sequence="20" LabelText="$LocLabels:cbs.Fly.B.LabelText" /></Controls></MenuSection></Menu></FlyoutAnchor>`,
			),
		},
		{
			difftype: 0,
			rdx: ca(
				"cbs.Fly.C.CustomAction",
				"cbs.Fly.Section.Controls._children",
				30,
				`<Button Id="cbs.Fly.C" Command="cbs.A.Command" Sequence="30" LabelText="Three" />`,
			),
		},
		{ difftype: 3, rdx: label("cbs.Fly.LabelText", "Approvals") },
		{ difftype: 3, rdx: label("cbs.Fly.A.LabelText", "One") },
		{ difftype: 3, rdx: label("cbs.Fly.B.LabelText", "Two") },
	],
	commands: [
		{
			command: "cbs.A.Command",
			commanddefinition:
				'<CommandDefinition Id="cbs.A.Command"><EnableRules /><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="A" /></Actions></CommandDefinition>',
		},
		{
			command: "cbs.B.Command",
			commanddefinition:
				'<CommandDefinition Id="cbs.B.Command"><EnableRules><EnableRule Id="cbs.B.Rule" /></EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="B" /></Actions></CommandDefinition>',
		},
	],
	rules: [
		{
			ruleid: "cbs.B.Rule",
			ruletype: 1,
			ruledefinition:
				'<EnableRule Id="cbs.B.Rule"><SelectionCountRule Minimum="1" /></EnableRule>',
		},
	],
};

// The merged ribbon / layer rows a test loads (some tests vary them).
let ownMerged = MERGED;
let ownRows: typeof LAYER_ROWS = LAYER_ROWS;
const layerParts = () => partsFromRibbonTables(ownRows);

function loadOwn() {
	const parts = layerParts();
	const labels = Array.from(parts.locLabels.entries()).map(([id, xml]) => ({
		id,
		titles: [
			{
				languageCode: 1033,
				description: parseXmlElement(xml)
					.querySelector("Title")!
					.getAttribute("description")!,
			},
		],
	}));
	const parsed = parseRibbonXml(ownMerged, "HomepageGrid", T, labels);
	applyLayerOwnership(parsed.ribbon, ownControlIds(parts));
	return parsed;
}

const fly = (def: RibbonDefinition) => ctl(def, "cbs.Fly");
const section = (def: RibbonDefinition) => fly(def).menu!.sections[0];

async function buildOwn(edit: (def: RibbonDefinition) => void) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const parsed = loadOwn();
	const baseline = loadOwn().ribbon;
	edit(parsed.ribbon);
	const plan = planScope({
		locations: [{ current: parsed.ribbon, baseline }],
		commands: parsed.commands,
		baselineCommands: loadOwn().commands,
		enableRules: parsed.enableRules,
		baselineEnableRules: loadOwn().enableRules,
		displayRules: parsed.displayRules,
		baselineDisplayRules: loadOwn().displayRules,
		locLabels: parsed.locLabels,
		baselineLocLabels: loadOwn().locLabels,
		layer: layerSnapshotFromParts(layerParts()),
	});
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: T, schemaName: T },
		locations: [{ current: parsed.ribbon, baseline }],
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
		plan,
	});
	const d = doc(result.xml);
	const flyCa = d.querySelector('CustomAction[Id="cbs.Fly.CustomAction"]');
	return { plan, d, flyCa, cas: Array.from(d.querySelectorAll("CustomActions > CustomAction")) };
}

const itemIds = (el: Element | null) =>
	Array.from(el?.querySelectorAll("MenuSection > Controls > Button") ?? []).map((b) =>
		b.getAttribute("Id"),
	);

beforeEach(() => {
	ownMerged = MERGED;
	ownRows = LAYER_ROWS;
	layer = layerParts();
});

/** Varies the own-flyout scenario: merged ribbon and layer rows. */
function useOwn(merged: string, rows: typeof LAYER_ROWS) {
	ownMerged = merged;
	ownRows = rows;
	layer = layerParts();
}

describe("#27 your own flyout — merged into the layer", () => {
	it("its menu items are yours (owned through the flyout's CustomAction or their own)", () => {
		const own = ownControlIds(layerParts());
		expect([...own].sort()).toEqual(["cbs.Fly", "cbs.Fly.A", "cbs.Fly.B", "cbs.Fly.C"]);
		const { ribbon } = loadOwn();
		expect(menuItemsOf(fly(ribbon)).map((b) => b.origin)).toEqual([
			"unmanaged",
			"unmanaged",
			"unmanaged",
		]);
		expect(menuItemsOf(fly(ribbon)).map((b) => b.label)).toEqual(["One", "Two", "Three"]);
	});

	it("editing an item replaces it inside the flyout's CustomAction (no second definition)", async () => {
		const { plan, flyCa, cas } = await buildOwn((def) => {
			section(def).controls[0].label = "Uno";
		});
		expect(plan.unsupported).toEqual([]);
		expect(cas.map((c) => c.getAttribute("Location"))).not.toContain("cbs.Fly.A");
		expect(itemIds(flyCa)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
		// The edited label keeps its LocLabel id; the other item is untouched.
		expect(flyCa!.querySelector('Button[Id="cbs.Fly.A"]')!.getAttribute("LabelText")).toBe(
			"$LocLabels:cbs.Fly.A.LabelText",
		);
		const d = flyCa!.ownerDocument;
		expect(
			d
				.querySelector('LocLabel[Id="cbs.Fly.A.LabelText"] Title')!
				.getAttribute("description"),
		).toBe("Uno");
		expect(d.querySelector('CustomAction[Id="cbs.Fly.C.CustomAction"]')).not.toBeNull();
	});

	it("deleting an inline item removes it in place, with its now-unused command and rule", async () => {
		const { plan, flyCa, d } = await buildOwn((def) => {
			section(def).controls = section(def).controls.filter((c) => c.id !== "cbs.Fly.B");
		});
		expect(plan.deletedButtonIds).toEqual(["cbs.Fly.B"]);
		expect(plan.unsupported).toEqual([]);
		expect(itemIds(flyCa)).toEqual(["cbs.Fly.A"]);
		expect(d.querySelector('CommandDefinition[Id="cbs.B.Command"]')).toBeNull();
		expect(d.querySelector('EnableRule[Id="cbs.B.Rule"]')).toBeNull();
		expect(d.querySelector('LocLabel[Id="cbs.Fly.B.LabelText"]')).toBeNull();
		// Still used by A and C.
		expect(d.querySelector('CommandDefinition[Id="cbs.A.Command"]')).not.toBeNull();
	});

	it("deleting an item added by its own CustomAction removes that CustomAction", async () => {
		const { plan, cas, flyCa } = await buildOwn((def) => {
			section(def).controls = section(def).controls.filter((c) => c.id !== "cbs.Fly.C");
		});
		expect(plan.deletedButtonIds).toEqual(["cbs.Fly.C"]);
		expect(cas.map((c) => c.getAttribute("Id"))).not.toContain("cbs.Fly.C.CustomAction");
		expect(itemIds(flyCa)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
	});

	it("a new item is added to the section's Controls", async () => {
		const { plan, cas } = await buildOwn((def) => {
			section(def).controls.push({
				...item("cbs.Fly.D", 40, { label: "Four" }),
				kind: "button",
				templateAlias: "",
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
				origin: "unmanaged",
			});
		});
		expect(plan.unsupported).toEqual([]);
		const added = cas.find((c) => c.getAttribute("Id") === "cbs.Fly.D.CustomAction")!;
		expect(added.getAttribute("Location")).toBe("cbs.Fly.Section.Controls._children");
	});

	it("re-sequencing an inline item updates it in place", async () => {
		const { plan, flyCa } = await buildOwn((def) => {
			section(def).controls[0].sequence = 25;
		});
		expect(plan.movedButtons).toEqual([
			{ id: "cbs.Fly.A", groupId: G, sequence: 25, controlsId: "cbs.Fly.Section.Controls" },
		]);
		expect(flyCa!.querySelector('Button[Id="cbs.Fly.A"]')!.getAttribute("Sequence")).toBe("25");
		expect(flyCa!.getAttribute("Sequence")).toBe("900");
	});

	it("editing the flyout itself keeps its menu", async () => {
		const { plan, flyCa } = await buildOwn((def) => {
			fly(def).label = "Approvals!";
		});
		expect(plan.unsupported).toEqual([]);
		expect(itemIds(flyCa)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
	});

	it("deleting the flyout removes it with every item (inline and its own CustomActions)", async () => {
		const { plan, cas, d } = await buildOwn((def) => {
			const g = group(def, G);
			g.buttons = g.buttons.filter((b) => b.id !== "cbs.Fly");
		});
		expect(plan.unsupported).toEqual([]);
		expect(plan.deletedButtonIds.sort()).toEqual([
			"cbs.Fly",
			"cbs.Fly.A",
			"cbs.Fly.B",
			"cbs.Fly.C",
		]);
		expect(cas).toHaveLength(0);
		expect(d.querySelectorAll("CommandDefinition")).toHaveLength(0);
	});

	it("an inline item moved to another section of the same flyout moves inside the CustomAction", () => {
		const delta = parseRibbonDiffParts("<RibbonDiffXml/>");
		const parts = layerParts();
		const xml = parts.customActions
			.get("ca:cbs.Fly.CustomAction")!
			.replace(
				"</MenuSection></Menu>",
				'</MenuSection><MenuSection Id="cbs.Fly.Section2" Sequence="20" DisplayMode="Menu16"><Controls Id="cbs.Fly.Section2.Controls" /></MenuSection></Menu>',
			);
		parts.customActions.set("ca:cbs.Fly.CustomAction", xml);
		const merged = mergeScopeChanges(parts, delta, {
			movedControls: [
				{
					id: "cbs.Fly.B",
					groupId: G,
					sequence: 10,
					controlsId: "cbs.Fly.Section2.Controls",
				},
			],
		});
		const out = parseXmlElement(merged.customActions.get("ca:cbs.Fly.CustomAction")!);
		expect(itemIds(out.querySelector('MenuSection[Id="cbs.Fly.Section"]'))).toEqual([
			"cbs.Fly.A",
		]);
		expect(itemIds(out.querySelector('MenuSection[Id="cbs.Fly.Section2"]'))).toEqual([
			"cbs.Fly.B",
		]);
	});
});

const FORM_GROUP = `Mscrm.Form.${T}.MainTab.Save`;
const formRibbon = (): RibbonDefinition => ({
	location: "Form",
	entityLogicalName: T,
	tabs: [
		{
			id: `Mscrm.Form.${T}.MainTab`,
			label: "Form",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{ id: FORM_GROUP, label: "Save", sequence: 10, template: "Flexible2", buttons: [] },
			],
		},
	],
});

/** Cuts your own flyout from the home grid and pastes it on the form (#57 move + #27 menu). */
async function moveFlyToForm(edit: (moved: RibbonButton) => void = () => {}) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const parsed = loadOwn();
	const base = loadOwn();
	const from = group(parsed.ribbon, G);
	const moved = from.buttons.find((b) => b.id === "cbs.Fly")!;
	from.buttons = from.buttons.filter((b) => b !== moved);
	edit(moved);
	const form = formRibbon();
	form.tabs[0].groups[0].buttons.push(moved);
	const locations = [
		{ current: parsed.ribbon, baseline: base.ribbon },
		{ current: form, baseline: formRibbon() },
	];
	const plan = planScope({
		locations,
		commands: parsed.commands,
		baselineCommands: base.commands,
		enableRules: parsed.enableRules,
		baselineEnableRules: base.enableRules,
		displayRules: parsed.displayRules,
		baselineDisplayRules: base.displayRules,
		locLabels: parsed.locLabels,
		baselineLocLabels: base.locLabels,
		layer: layerSnapshotFromParts(layerParts()),
	});
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: T, schemaName: T },
		locations,
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
		plan,
		languageCode: 1033,
	});
	return { plan, d: doc(result.xml) };
}

describe("#27 + #57 — moving your own flyout to another location", () => {
	it("is planned as a move of the flyout and its items, with nothing unsupported", async () => {
		const { plan } = await moveFlyToForm();
		expect(plan.unsupported).toEqual([]);
		expect(plan.deletedButtonIds).toEqual([]);
		expect(plan.movedButtons.map((m) => m.id).sort()).toEqual([
			"cbs.Fly",
			"cbs.Fly.A",
			"cbs.Fly.B",
			"cbs.Fly.C",
		]);
		expect(plan.movedButtons.find((m) => m.id === "cbs.Fly")).toEqual({
			id: "cbs.Fly",
			groupId: FORM_GROUP,
			sequence: 900,
		});
		expect(plan.movedButtons.find((m) => m.id === "cbs.Fly.A")?.controlsId).toBe(
			"cbs.Fly.Section.Controls",
		);
	});

	it("keeps exactly one CustomAction for the flyout, with its <Menu>, at the new location", async () => {
		const { d } = await moveFlyToForm();
		const flyouts = d.querySelectorAll('FlyoutAnchor[Id="cbs.Fly"]');
		expect(flyouts).toHaveLength(1);
		const caEl = flyouts[0].closest("CustomAction")!;
		expect(caEl.getAttribute("Id")).toBe("cbs.Fly.CustomAction");
		expect(caEl.getAttribute("Location")).toBe(`${FORM_GROUP}.Controls._children`);
		expect(itemIds(caEl)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
		// The item the layer adds with its own CustomAction stays there, defined once.
		expect(d.querySelectorAll('Button[Id="cbs.Fly.C"]')).toHaveLength(1);
		expect(
			d.querySelector('CustomAction[Id="cbs.Fly.C.CustomAction"]')?.getAttribute("Location"),
		).toBe("cbs.Fly.Section.Controls._children");
		for (const id of ["cbs.Fly.A", "cbs.Fly.B"])
			expect(d.querySelectorAll(`Button[Id="${id}"]`)).toHaveLength(1);
		// Nothing the menu uses is dropped.
		const commands = Array.from(
			d.querySelectorAll("CommandDefinitions > CommandDefinition"),
		).map((c) => c.getAttribute("Id"));
		expect(commands).toEqual(expect.arrayContaining(["cbs.A.Command", "cbs.B.Command"]));
		expect(d.querySelector('EnableRule[Id="cbs.B.Rule"]')).not.toBeNull();
		const labels = Array.from(d.querySelectorAll("LocLabels > LocLabel")).map((l) =>
			l.getAttribute("Id"),
		);
		expect(labels).toEqual(
			expect.arrayContaining([
				"cbs.Fly.LabelText",
				"cbs.Fly.A.LabelText",
				"cbs.Fly.B.LabelText",
			]),
		);
	});

	it("a menu item edited while moving is written in place in the moved flyout", async () => {
		const { d, plan } = await moveFlyToForm((fly) => {
			fly.menu!.sections[0].controls[0].label = "Uno";
		});
		expect(plan.unsupported).toEqual([]);
		const caEl = d.querySelector('CustomAction[Id="cbs.Fly.CustomAction"]')!;
		expect(caEl.getAttribute("Location")).toBe(`${FORM_GROUP}.Controls._children`);
		expect(itemIds(caEl)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
		expect(
			d
				.querySelector('LocLabel[Id="cbs.Fly.A.LabelText"] Title')!
				.getAttribute("description"),
		).toBe("Uno");
	});

	it("after the move merge, an item of a flyout that didn't move is still edited in place", () => {
		const delta = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions>${ca(
				"cbs.Fly.A.Override.CustomAction",
				"cbs.Fly.A",
				10,
				'<Button Id="cbs.Fly.A" Command="cbs.A.Command" Sequence="10" LabelText="$LocLabels:cbs.Fly.A.LabelText" ToolTipTitle="Tip" />',
			)}</CustomActions></RibbonDiffXml>`,
		);
		const merged = mergeScopeChanges(layerParts(), delta);
		expect([...merged.customActions.keys()]).not.toContain(
			"ca:cbs.Fly.A.Override.CustomAction",
		);
		const fly = parseXmlElement(merged.customActions.get("ca:cbs.Fly.CustomAction")!);
		expect(fly.getAttribute("Location")).toBe(`${G}.Controls._children`);
		expect(fly.querySelector('Button[Id="cbs.Fly.A"]')!.getAttribute("ToolTipTitle")).toBe(
			"Tip",
		);
		expect(itemIds(fly)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
	});
});

describe("#27 store — menu items are edited like buttons", () => {
	function load(): { tabId: string; groupId: string } {
		const parsed = loadOwn();
		const ribbons: Record<RibbonLocation, RibbonDefinition> = {
			HomepageGrid: parsed.ribbon,
			SubGrid: { location: "SubGrid", entityLogicalName: T, tabs: [] },
			Form: { location: "Form", entityLogicalName: T, tabs: [] },
			Application: { location: "Application", entityLogicalName: "", tabs: [] },
		};
		useRibbonStore.getState().loadWorkspace({
			ribbons,
			commands: parsed.commands,
			displayRules: [],
			enableRules: [],
			locLabels: parsed.locLabels,
		});
		return { tabId: parsed.ribbon.tabs[0].id, groupId: G };
	}
	const cur = () => useRibbonStore.getState().ribbons.HomepageGrid;
	const grp = (): RibbonGroup => group(cur(), G);

	it("setButtonProp / deleteButton reach a menu item", () => {
		const { tabId, groupId } = load();
		useRibbonStore
			.getState()
			.setButtonProp("HomepageGrid", tabId, groupId, "cbs.Fly.B", { label: "Deux" });
		expect(ctl(cur(), "cbs.Fly.B").label).toBe("Deux");
		useRibbonStore.getState().deleteButton("HomepageGrid", tabId, groupId, "cbs.Fly.B");
		expect(menuItemsOf(fly(cur())).map((b) => b.id)).toEqual(["cbs.Fly.A", "cbs.Fly.C"]);
		expect(grp().buttons.map((b) => b.id)).toEqual([
			"Mscrm.HomepageGrid.contact.NewRecord",
			"cbs.Fly",
		]);
		useRibbonStore.getState().undo();
		expect(menuItemsOf(fly(cur())).map((b) => b.id)).toEqual([
			"cbs.Fly.A",
			"cbs.Fly.B",
			"cbs.Fly.C",
		]);
	});

	it("duplicating a flyout gives its menu and items new ids", () => {
		const { tabId, groupId } = load();
		useRibbonStore.getState().duplicateButton("HomepageGrid", tabId, groupId, "cbs.Fly");
		const copy = grp().buttons.find((b) => b.id.startsWith("cbs.Fly_copy_"))!;
		const ids = [
			copy.menu!.id,
			copy.menu!.sections[0].id,
			copy.menu!.sections[0].controlsId,
			...menuItemsOf(copy).map((b) => b.id),
		];
		for (const id of ids) expect(id.startsWith(copy.id)).toBe(true);
		expect(menuItemsOf(copy).every((b) => b.origin === "unmanaged" && !b.source)).toBe(true);
		// Unique across the ribbon.
		const all = controls(cur()).map((b) => b.id);
		expect(new Set(all).size).toBe(all.length);
	});

	it("sections can be added, changed and removed", () => {
		const { tabId, groupId } = load();
		const s = useRibbonStore.getState();
		s.addMenuSection("HomepageGrid", tabId, groupId, "cbs.Fly", "More");
		expect(fly(cur()).menu!.sections.map((x) => [x.id, x.title, x.controlsId])).toEqual([
			["cbs.Fly.Section", undefined, "cbs.Fly.Section.Controls"],
			["cbs.Fly.MenuSection2", "More", "cbs.Fly.MenuSection2.Controls"],
		]);
		useRibbonStore
			.getState()
			.setMenuSectionProp("HomepageGrid", tabId, groupId, "cbs.Fly", "cbs.Fly.MenuSection2", {
				displayMode: "Menu32",
			});
		expect(fly(cur()).menu!.sections[1].displayMode).toBe("Menu32");
		useRibbonStore
			.getState()
			.deleteMenuSection("HomepageGrid", tabId, groupId, "cbs.Fly", "cbs.Fly.MenuSection2");
		expect(fly(cur()).menu!.sections).toHaveLength(1);
	});
});

// ---------------------------------------------------------------------------
// Adversarial review of PR #62.

const ITEM_B_LINE = /\s*<Button Id="cbs\.Fly\.B"[^>]*\/>/;

describe("#62 review — moving / hiding / deleting inside your own flyout", () => {
	it("M1: moving the flyout keeps an item hidden by a HideCustomAction (not in the merged ribbon)", async () => {
		useOwn(MERGED.replace(ITEM_B_LINE, ""), {
			...LAYER_ROWS,
			diffs: [
				...LAYER_ROWS.diffs,
				{
					difftype: 0,
					rdx: '<HideCustomAction HideActionId="cbs.Fly.B.HideAction" Location="cbs.Fly.B" />',
				},
			],
		});
		const { d, plan } = await moveFlyToForm();
		expect(plan.unsupported).toEqual([]);
		const caEl = d.querySelector('CustomAction[Id="cbs.Fly.CustomAction"]')!;
		expect(caEl.getAttribute("Location")).toBe(`${FORM_GROUP}.Controls._children`);
		expect(itemIds(caEl)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
		expect(d.querySelectorAll('Button[Id="cbs.Fly.B"]')).toHaveLength(1);
		expect(d.querySelector('HideCustomAction[Location="cbs.Fly.B"]')).not.toBeNull();
		expect(d.querySelector('CommandDefinition[Id="cbs.B.Command"]')).not.toBeNull();
		expect(d.querySelector('LocLabel[Id="cbs.Fly.B.LabelText"]')).not.toBeNull();
	});

	it("M2: an item hidden while moving the flyout is kept and hidden, not deleted", async () => {
		const { d, plan } = await moveFlyToForm((fly) => {
			fly.menu!.sections[0].controls[1].hidden = true;
		});
		expect(plan.unsupported).toEqual([]);
		const caEl = d.querySelector('CustomAction[Id="cbs.Fly.CustomAction"]')!;
		expect(itemIds(caEl)).toEqual(["cbs.Fly.A", "cbs.Fly.B"]);
		expect(d.querySelector('HideCustomAction[Location="cbs.Fly.B"]')).not.toBeNull();
		expect(d.querySelector('CommandDefinition[Id="cbs.B.Command"]')).not.toBeNull();
	});

	it("M2: a move the layer can't apply is an error, never a silent no-op", () => {
		expect(() =>
			mergeScopeChanges(layerParts(), parseRibbonDiffParts("<RibbonDiffXml/>"), {
				movedControls: [{ id: "cbs.Nowhere", groupId: G, sequence: 10 }],
			}),
		).toThrow(/cbs\.Nowhere/);
	});

	it("m2: deleting an inline item while moving the flyout removes it with its command, rule and label", async () => {
		const { d, plan } = await moveFlyToForm((fly) => {
			const section = fly.menu!.sections[0];
			section.controls = section.controls.filter((c) => c.id !== "cbs.Fly.B");
		});
		expect(plan.deletedButtonIds).toEqual(["cbs.Fly.B"]);
		expect(plan.unsupported).toEqual([]);
		const caEl = d.querySelector('CustomAction[Id="cbs.Fly.CustomAction"]')!;
		expect(caEl.getAttribute("Location")).toBe(`${FORM_GROUP}.Controls._children`);
		expect(itemIds(caEl)).toEqual(["cbs.Fly.A"]);
		expect(d.querySelector('CommandDefinition[Id="cbs.B.Command"]')).toBeNull();
		expect(d.querySelector('EnableRule[Id="cbs.B.Rule"]')).toBeNull();
		expect(d.querySelector('LocLabel[Id="cbs.Fly.B.LabelText"]')).toBeNull();
		expect(d.querySelector('CommandDefinition[Id="cbs.A.Command"]')).not.toBeNull();
	});

	it("m1: another solution's item in your flyout blocks a move to another location with a clear message", async () => {
		useOwn(
			MERGED.replace(
				'<Button Id="cbs.Fly.C"',
				'<Button Id="isv.Fly.X" Command="isv.X.Command" Sequence="40" LabelText="Partner" /><Button Id="cbs.Fly.C"',
			),
			LAYER_ROWS,
		);
		expect(ctl(loadOwn().ribbon, "isv.Fly.X").origin).toBe("managed");
		const { plan } = await moveFlyToForm();
		expect(plan.unsupported).toEqual([
			expect.stringMatching(
				/^Moving the menu of cbs\.Fly to another location — its item "Partner" \(isv\.Fly\.X\) comes from another solution/,
			),
		]);
	});

	it("m1: re-sequencing your flyout doesn't report the other solution's item as moved", () => {
		useOwn(
			MERGED.replace(
				'<Button Id="cbs.Fly.C"',
				'<Button Id="isv.Fly.X" Command="isv.X.Command" Sequence="40" LabelText="Partner" /><Button Id="cbs.Fly.C"',
			),
			LAYER_ROWS,
		);
		const base = loadOwn().ribbon;
		const cur = loadOwn().ribbon;
		fly(cur).sequence = 950;
		const plan = planOf(cur, base);
		expect(plan.unsupported).toEqual([]);
		expect(plan.movedButtons).toEqual([{ id: "cbs.Fly", groupId: G, sequence: 950 }]);
	});
});

describe("#62 review — new hidden controls, copies, ComboBox menus", () => {
	const newButton = (id: string, extra: Partial<RibbonButton> = {}): RibbonButton => ({
		id,
		label: id,
		kind: "button",
		sequence: 10,
		templateAlias: "",
		commandId: `${id}.Command`,
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		origin: "unmanaged",
		...extra,
	});
	const ribbonWith = (buttons: RibbonButton[]): RibbonDefinition => ({
		location: "HomepageGrid",
		entityLogicalName: "contact",
		tabs: [
			{
				id: "Mscrm.HomepageGrid.contact.MainTab",
				label: "Main",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: G,
						label: "G",
						sequence: 10,
						template: "Mscrm.Templates.Flexible2",
						buttons,
					},
				],
			},
		],
	});

	it("m4: a new hidden item of a new flyout is written and hidden", () => {
		const flyout = newButton("cbs.New.Fly", {
			kind: "flyout",
			menu: {
				id: "cbs.New.Fly.Menu",
				sections: [
					{
						id: "cbs.New.Fly.S",
						sequence: 10,
						displayMode: "Menu16",
						controlsId: "cbs.New.Fly.S.Controls",
						controls: [
							newButton("cbs.New.A"),
							newButton("cbs.New.B", { hidden: true }),
						],
					},
				],
			},
		});
		const xml = generate(ribbonWith([flyout]), ribbonWith([]));
		expect(
			Array.from(doc(xml).querySelectorAll("MenuSection > Controls > Button")).map((b) =>
				b.getAttribute("Id"),
			),
		).toEqual(["cbs.New.A", "cbs.New.B"]);
		expect(
			Array.from(doc(xml).querySelectorAll("HideCustomAction")).map((h) =>
				h.getAttribute("Location"),
			),
		).toEqual(["cbs.New.B"]);
	});

	it("m4: a new hidden button / flyout is written and hidden (not a hide of nothing)", () => {
		const xml = generate(
			ribbonWith([newButton("cbs.New.Btn", { hidden: true })]),
			ribbonWith([]),
		);
		expect(customActions(xml).map((c) => c.getAttribute("Location"))).toEqual([
			`${G}.Controls._children`,
		]);
		expect(doc(xml).querySelector('HideCustomAction[Location="cbs.New.Btn"]')).not.toBeNull();
	});

	it("m3: duplicating a flyout re-bases the ids of raw menu controls", () => {
		const original = newButton("cbs.Fly", {
			kind: "flyout",
			menu: {
				id: "cbs.Fly.Menu",
				sections: [
					{
						id: "cbs.Fly.S",
						sequence: 10,
						controlsId: "cbs.Fly.S.Controls",
						controls: [newButton("cbs.Fly.A")],
						rawControls: [
							{ index: 1, xml: '<ToggleButton Id="cbs.Fly.T" Command="x" />' },
						],
					},
					{
						id: "cbs.Fly.G",
						sequence: 20,
						controlsId: "cbs.Fly.G.Controls",
						controls: [],
						rawContent:
							'<Gallery Id="other.Gallery"><GalleryButton Id="other.G1" /></Gallery>',
					},
				],
			},
		});
		const copy = copyControl(original, "cbs.Fly2");
		const raw = copy.menu!.sections[0].rawControls![0].xml;
		expect(raw).toBe('<ToggleButton Id="cbs.Fly2.T" Command="x" />');
		expect(copy.menu!.sections[1].rawContent).toBe(
			'<Gallery Id="cbs.Fly2.Gallery"><GalleryButton Id="cbs.Fly2.G1" /></Gallery>',
		);
		// Nothing of the copy reuses an id of the original.
		const ids = (b: RibbonButton) =>
			JSON.stringify(b.menu).match(/Id=\\"[^\\]*\\"|"id":"[^"]*"|"controlsId":"[^"]*"/g) ??
			[];
		for (const id of ids(copy)) expect(ids(original)).not.toContain(id);
	});

	it("m6: duplicating a dynamic flyout keeps how its menu is populated", () => {
		const { ribbon } = parseOob();
		const dynamic = ctl(ribbon, "Mscrm.HomepageGrid.contact.Flows.RefreshCommandBar");
		const copy = copyControl(dynamic, "cbs.contact.Flows.Copy");
		// How the menu is populated, plus the icon a copy keeps (#60) — nothing else.
		expect(copy.source?.attributes).toEqual({
			PopulateDynamically: "true",
			PopulateQueryCommand: "Mscrm.DynamicMenu.Grid.Flows.PopulateMenu",
			ModernImage: "Flows",
			Image16by16: "/_imgs/Ribbon/OpenFlows_16.png",
			Image32by32: "/_imgs/Ribbon/OpenFlows_32.png",
		});
		const xml = generate(ribbonWith([copy]), ribbonWith([]));
		const written = doc(xml).querySelector('FlyoutAnchor[Id="cbs.contact.Flows.Copy"]')!;
		expect(written.getAttribute("PopulateDynamically")).toBe("true");
		expect(written.getAttribute("PopulateQueryCommand")).toBe(
			"Mscrm.DynamicMenu.Grid.Flows.PopulateMenu",
		);
		// Not reported as an empty new menu.
		expect(planOf(ribbonWith([copy]), ribbonWith([])).unsupported).toEqual([]);
	});

	it("t2: editing an out-of-the-box ComboBox with a menu is reported, not written without its menu", () => {
		const combo = (label: string) =>
			newButton("Mscrm.Combo", {
				kind: "comboBox",
				label,
				oob: true,
				custom: false,
				origin: "oob",
				menu: {
					id: "Mscrm.Combo.Menu",
					sections: [
						{
							id: "Mscrm.Combo.S",
							sequence: 10,
							controlsId: "Mscrm.Combo.S.Controls",
							controls: [],
						},
					],
				},
			});
		const plan = planOf(ribbonWith([combo("Changed")]), ribbonWith([combo("Combo")]));
		expect(plan.unsupported).toEqual([
			expect.stringMatching(/^Editing the flyout \/ split button "Changed"/),
		]);
	});
});
