/**
 * #42 — parser fidelity: tabs only from the real tab containers (never from a
 * CustomAction), no invented tab `Template`, tab / group `Description` kept,
 * and the controls CBS didn't model (ToggleButton, Label, DropDown,
 * MRUSplitButton, Spinner, GalleryButton) shown read-only, hideable and
 * written back verbatim — never dropped by an edit.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { importRibbonDiffXml } from "@/services/ribbonDiffImport";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { planScope } from "@/services/publishPlan";
import { mergeScopeChanges, parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { addLayerTabs } from "@/services/dataverse/ribbonService";
import { canonicalXml, parseXmlElement } from "@/services/ribbonXmlCanonical";
import { copyControl } from "@/utils/ribbonMenu";
import { ClassicRibbon } from "@/components/ribbon-canvas/ClassicRibbon";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { DISPLAY_ONLY_RULE_KINDS, ENABLE_ONLY_RULE_KINDS, RULE_KIND_LABELS } from "@/constants/ruleKinds";
import type { CommandDefinition, RibbonButton, RibbonDefinition, RibbonLocation, RibbonTab } from "@/types/ribbon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const E = "mxrm_test";
const TAB = `Mscrm.HomepageGrid.${E}.MainTab`;
const GROUP = `${TAB}.Management`;
const SUB_TAB = `Mscrm.SubGrid.${E}.MainTab`;

const BUTTON = `<Button Id="mxrm.T.Button" Command="mxrm.T.Button.Command" LabelText="Approve" Sequence="10" TemplateAlias="o1" />`;
const TOGGLE = `<ToggleButton Id="mxrm.T.Toggle" Command="mxrm.T.Toggle.Command" QueryCommand="mxrm.T.Toggle.Query" LabelText="Filter" Alt="Filter" Sequence="20" TemplateAlias="o2" Image16by16="/_imgs/ribbon/filter16.png" />`;
const LABEL = `<Label Id="mxrm.T.Label" LabelText="Status" ForId="mxrm.T.Spinner" Sequence="30" TemplateAlias="o2" />`;
const DROPDOWN = `<DropDown Id="mxrm.T.DropDown" Command="mxrm.T.DropDown.Command" Sequence="40" TemplateAlias="o2"><Menu Id="mxrm.T.DropDown.Menu"><MenuSection Id="mxrm.T.DropDown.Section" Sequence="10"><Controls Id="mxrm.T.DropDown.Controls"><Button Id="mxrm.T.DropDown.A" Command="mxrm.T.A" LabelText="A" Sequence="10" /></Controls></MenuSection></Menu></DropDown>`;
const MRU = `<MRUSplitButton Id="mxrm.T.Mru" Command="mxrm.T.Mru.Command" InitialItem="mxrm.T.Mru.A" Sequence="50" TemplateAlias="o2"><Menu Id="mxrm.T.Mru.Menu"><MenuSection Id="mxrm.T.Mru.Section" Sequence="10"><Controls Id="mxrm.T.Mru.Controls"><Button Id="mxrm.T.Mru.A" Command="mxrm.T.A" LabelText="A" Sequence="10" /></Controls></MenuSection></Menu></MRUSplitButton>`;
const SPINNER = `<Spinner Id="mxrm.T.Spinner" Command="mxrm.T.Spinner.Command" DefaultUnit="pt" DefaultValue="10" Sequence="60" TemplateAlias="o2"><Unit Name="pt" MinimumValue="1" MaximumValue="72"><UnitAbbreviation Sequence="10" Value="pt" /></Unit></Spinner>`;
const GALLERY = `<GalleryButton Id="mxrm.T.Gallery" Command="mxrm.T.Gallery.Command" ElementDimensions="Size32by32" Image="/_imgs/gallery.png" Sequence="70" TemplateAlias="o2" />`;

/** Every read-only kind: [element, id, kind]. */
const READ_ONLY: [xml: string, id: string, kind: RibbonButton["kind"]][] = [
	[TOGGLE, "mxrm.T.Toggle", "toggleButton"],
	[LABEL, "mxrm.T.Label", "label"],
	[DROPDOWN, "mxrm.T.DropDown", "dropDown"],
	[MRU, "mxrm.T.Mru", "mruSplitButton"],
	[SPINNER, "mxrm.T.Spinner", "spinner"],
	[GALLERY, "mxrm.T.Gallery", "galleryButton"],
];
const ALL_CONTROLS = [BUTTON, ...READ_ONLY.map(([xml]) => xml)].join("");

/** A RetrieveEntityRibbon-shaped document (UI > Ribbon > Tabs / ContextualTabs). */
function ribbonDoc(controls: string, opts: { customActions?: string; contextual?: string } = {}) {
	return `<RibbonDefinitions><RibbonDefinition><UI><Ribbon>
<Tabs Id="Mscrm.Tabs">
  <Tab Id="${TAB}" Command="${TAB}" Title="Main" Description="Main tab of the table" Sequence="100">
    <Scaling Id="${TAB}.Scaling"><MaxSize Id="${GROUP}.MaxSize" GroupId="${GROUP}" Sequence="10" Size="Large" /></Scaling>
    <Groups Id="${TAB}.Groups">
      <Group Id="${GROUP}" Command="${GROUP}" Title="Management" Description="Record management" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${GROUP}.Controls">${controls}</Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs>
<ContextualTabs Id="Mscrm.ContextualTabs">${opts.contextual ?? ""}</ContextualTabs>
</Ribbon></UI>
${opts.customActions ?? ""}
<CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;
}

const parse = (xml: string, location: RibbonLocation = "HomepageGrid") => parseRibbonXml(xml, location, E);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const controlsOf = (def: RibbonDefinition) => def.tabs.flatMap((t) => t.groups.flatMap((g) => g.buttons));
const control = (def: RibbonDefinition, id: string) => controlsOf(def).find((b) => b.id === id)!;

function generate(
	current: RibbonDefinition,
	baseline: RibbonDefinition,
	location: RibbonLocation = "HomepageGrid",
	commands: CommandDefinition[] = [],
) {
	return generateRibbonDiffXml({
		current,
		baseline,
		commands,
		enableRules: [],
		displayRules: [],
		locLabels: [],
		entityLogicalName: E,
		location,
	});
}

function plan(current: RibbonDefinition, baseline: RibbonDefinition) {
	return planScope({
		locations: [{ current, baseline }],
		commands: [],
		baselineCommands: [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
	});
}

/** The element under each CustomAction's CommandUIDefinition, by CustomAction Location. */
function customActionContent(rdx: string): { location: string; el: Element }[] {
	const root = parseXmlElement(rdx);
	return Array.from(root.getElementsByTagName("CustomAction")).map((ca) => ({
		location: ca.getAttribute("Location") ?? "",
		el: ca.getElementsByTagName("CommandUIDefinition")[0].firstElementChild!,
	}));
}

const sameElement = (a: Element | string, b: Element | string) =>
	canonicalXml(typeof a === "string" ? parseXmlElement(a) : a) === canonicalXml(typeof b === "string" ? parseXmlElement(b) : b);

// ---------------------------------------------------------------------------

describe("#42 tabs come only from Ribbon > Tabs and Ribbon > ContextualTabs", () => {
	const PHANTOM = "mxrm.Phantom.Tab";
	const phantomCa = `<CustomActions><CustomAction Id="${PHANTOM}.CustomAction" Location="Mscrm.Tabs._children" Sequence="500"><CommandUIDefinition>
  <Tab Id="${PHANTOM}" Command="${PHANTOM}.Command" Title="Phantom" Sequence="500"><Scaling Id="${PHANTOM}.Scaling"><MaxSize Id="${PHANTOM}.G.MaxSize" GroupId="${PHANTOM}.G" Sequence="10" Size="Large" /></Scaling>
  <Groups Id="${PHANTOM}.Groups"><Group Id="${PHANTOM}.G" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${PHANTOM}.G.Controls">${BUTTON.replace("mxrm.T.Button", "mxrm.Phantom.B")}</Controls></Group></Groups></Tab>
</CommandUIDefinition></CustomAction></CustomActions>`;
	const contextual = `<ContextualGroup Id="Mscrm.SubGrid.${E}.ContextualTabs" Command="Mscrm.SubGrid.${E}.ContextualTabs" Color="Orange" Sequence="10">
  <Tab Id="${SUB_TAB}" Command="${SUB_TAB}" Title="Sub" Sequence="10"><Scaling Id="${SUB_TAB}.Scaling" /><Groups Id="${SUB_TAB}.Groups" /></Tab>
</ContextualGroup>`;

	it("ignores a <Tab> inside a CustomAction of the document (no phantom tab, no phantom scaling)", () => {
		const { ribbon } = parse(ribbonDoc(BUTTON, { customActions: phantomCa, contextual }));
		expect(ribbon.tabs.map((t) => t.id).sort()).toEqual([TAB, SUB_TAB].sort());
		expect(Object.keys(ribbon.scalingByTab ?? {}).sort()).toEqual([TAB, SUB_TAB].sort());
		expect(controlsOf(ribbon).map((b) => b.id)).not.toContain("mxrm.Phantom.B");
	});

	it("a RibbonDiffXml (a layer or an import) has no tabs of its own", () => {
		const { ribbon } = parse(`<RibbonDiffXml>${phantomCa}<CommandDefinitions /></RibbonDiffXml>`);
		expect(ribbon.tabs).toEqual([]);
		expect(ribbon.scalingByTab).toBeUndefined();
	});

	it("still rebuilds a tab the unmanaged layer adds (addLayerTabs), with its scaling and Description", () => {
		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml>${phantomCa.replace('Title="Phantom"', 'Title="Phantom" Description="From the layer"')}<RuleDefinitions><TabDisplayRules><TabDisplayRule TabCommand="${PHANTOM}.Command"><EntityRule EntityName="${E}" Context="HomePageGrid" AppliesTo="PrimaryEntity" /></TabDisplayRule></TabDisplayRules><DisplayRules /><EnableRules /></RuleDefinitions></RibbonDiffXml>`,
		);
		const ribbons = { HomepageGrid: parse(ribbonDoc(BUTTON)).ribbon };
		expect(addLayerTabs(ribbons, layer, E, [])).toEqual([PHANTOM]);
		const tab = ribbons.HomepageGrid.tabs.find((t) => t.id === PHANTOM)!;
		expect(tab.description).toBe("From the layer");
		expect(tab.groups[0].buttons.map((b) => b.id)).toEqual(["mxrm.Phantom.B"]);
		expect(ribbons.HomepageGrid.scalingByTab?.[PHANTOM]?.maxSizes).toHaveLength(1);
	});

	it("still imports a tab from a RibbonDiffXml CustomAction, with its display rules", () => {
		const loaded = parse(ribbonDoc(BUTTON)).ribbon;
		const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
		const result = importRibbonDiffXml({
			xml: `<RibbonDiffXml>${phantomCa}<CommandDefinitions /><RuleDefinitions><TabDisplayRules><TabDisplayRule TabCommand="${PHANTOM}.Command"><EntityRule EntityName="${E}" Context="Form" AppliesTo="PrimaryEntity" /></TabDisplayRule></TabDisplayRules><DisplayRules /><EnableRules /></RuleDefinitions></RibbonDiffXml>`,
			ribbons: { HomepageGrid: loaded, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: E,
			activeLocation: "HomepageGrid",
		});
		const tab = result.ribbons.Form.tabs.find((t) => t.id === PHANTOM);
		expect(tab).toBeDefined();
		expect(tab!.tabDisplayRules).toHaveLength(1);
		expect(tab!.groups[0].buttons.map((b) => b.id)).toEqual(["mxrm.Phantom.B"]);
	});
});

describe("#42 tab Template and tab / group Description", () => {
	it("doesn't read a Template on a tab (not in RibbonCore TabType)", () => {
		const { ribbon } = parse(ribbonDoc(BUTTON).replace('Title="Main"', 'Title="Main" Template="Mscrm.Templates.Ribbon.Flexible2"'));
		expect(ribbon.tabs[0]).not.toHaveProperty("template");
	});

	it("reads Description of tabs and groups, and invents none", () => {
		const { ribbon } = parse(ribbonDoc(BUTTON));
		expect(ribbon.tabs[0].description).toBe("Main tab of the table");
		expect(ribbon.tabs[0].groups[0].description).toBe("Record management");
		const bare = parse(ribbonDoc(BUTTON).replace(/ Description="[^"]*"/g, "")).ribbon;
		expect(bare.tabs[0]).not.toHaveProperty("description");
		expect(bare.tabs[0].groups[0]).not.toHaveProperty("description");
	});

	it("parse → generate → parse keeps Description of a new tab and its group, and writes no Template on the tab", () => {
		const loaded = parse(ribbonDoc(BUTTON).replace('Title="Main"', 'Title="Main" Template="Mscrm.Templates.Ribbon.Flexible2"')).ribbon;
		const baseline: RibbonDefinition = { ...clone(loaded), tabs: [] };
		const rdx = generate(loaded, baseline);
		const [tabCa] = customActionContent(rdx).filter((c) => c.el.tagName === "Tab");
		expect(tabCa.el.getAttribute("Description")).toBe("Main tab of the table");
		expect(tabCa.el.hasAttribute("Template")).toBe(false);
		const reparsed = parse(
			`<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs Id="Mscrm.Tabs">${new XMLSerializer().serializeToString(tabCa.el)}</Tabs><ContextualTabs Id="Mscrm.ContextualTabs" /></Ribbon></UI></RibbonDefinition></RibbonDefinitions>`,
		).ribbon;
		expect(reparsed.tabs[0].description).toBe("Main tab of the table");
		expect(reparsed.tabs[0].groups[0].description).toBe("Record management");
	});

	it("a Description that is a $LocLabels: token is written with its LocLabel", () => {
		const baseline = parse(ribbonDoc(BUTTON)).ribbon;
		const current = clone(baseline);
		current.tabs[0].groups.push({
			id: "mxrm.G.Localized",
			label: "Localized",
			description: "$LocLabels:mxrm.G.Localized.Description",
			sequence: 20,
			template: "Flexible2",
			buttons: [],
		});
		const rdx = generateRibbonDiffXml({
			current,
			baseline,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [{ id: "mxrm.G.Localized.Description", titles: [{ languageCode: 1033, description: "Approvals" }] }],
			entityLogicalName: E,
			location: "HomepageGrid",
		});
		const labels = Array.from(parseXmlElement(rdx).getElementsByTagName("LocLabel")).map((l) => l.getAttribute("Id"));
		expect(labels).toContain("mxrm.G.Localized.Description");
	});

	it("a new group in an existing tab keeps its Description; one without gets none", () => {
		const baseline = parse(ribbonDoc(BUTTON)).ribbon;
		const current = clone(baseline);
		current.tabs[0].groups.push(
			{ id: "mxrm.G.Described", label: "Described", description: "Has one", sequence: 20, template: "Flexible2", buttons: [] },
			{ id: "mxrm.G.Plain", label: "Plain", sequence: 30, template: "Flexible2", buttons: [] },
		);
		const groups = customActionContent(generate(current, baseline)).filter((c) => c.el.tagName === "Group");
		expect(groups.find((g) => g.el.getAttribute("Id") === "mxrm.G.Described")!.el.getAttribute("Description")).toBe("Has one");
		expect(groups.find((g) => g.el.getAttribute("Id") === "mxrm.G.Plain")!.el.hasAttribute("Description")).toBe(false);
	});
});

describe("#42 ToggleButton, Label, DropDown, MRUSplitButton, Spinner and GalleryButton", () => {
	it("are parsed in document order with their kind, label and verbatim XML", () => {
		const { ribbon } = parse(ribbonDoc(ALL_CONTROLS));
		const buttons = ribbon.tabs[0].groups[0].buttons;
		expect(buttons.map((b) => [b.id, b.kind])).toEqual([
			["mxrm.T.Button", "button"],
			...READ_ONLY.map(([, id, kind]) => [id, kind]),
		]);
		expect(control(ribbon, "mxrm.T.Toggle").label).toBe("Filter");
		expect(control(ribbon, "mxrm.T.Label").label).toBe("Status");
		for (const [xml, id] of READ_ONLY) {
			const b = control(ribbon, id);
			expect(sameElement(b.source!.xml!, xml)).toBe(true);
			// Their <Menu> stays inside the verbatim XML; it isn't modelled.
			expect(b.menu).toBeUndefined();
		}
	});

	it("the MainFilters ToggleButton of the real contact grid ribbon is on the canvas", () => {
		const xml = readFileSync(resolve(__dirname, "../__fixtures__/ribbon/contact-homepage-menus.xml"), "utf-8");
		const { ribbon } = parseRibbonXml(xml, "HomepageGrid", "contact");
		const toggle = control(ribbon, "Mscrm.HomepageGrid.contact.MainFilters");
		expect(toggle.kind).toBe("toggleButton");
		expect(toggle.source?.xml).toContain('QueryCommand="Mscrm.Filters.Query"');
	});

	it("can be hidden: one HideCustomAction each, and nothing else is written", () => {
		const baseline = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const current = clone(baseline);
		for (const [, id] of READ_ONLY) control(current, id).hidden = true;
		const rdx = generate(current, baseline);
		const hides = Array.from(parseXmlElement(rdx).getElementsByTagName("HideCustomAction")).map((h) => h.getAttribute("Location"));
		expect(hides).toEqual(READ_ONLY.map(([, id]) => id));
		expect(customActionContent(rdx)).toEqual([]);
		expect(plan(current, baseline).unsupported).toEqual([]);
	});

	it("can be unhidden: the plan lists them and the merge drops the layer's HideCustomActions", () => {
		const shown = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const baseline = clone(shown);
		for (const [, id] of READ_ONLY) control(baseline, id).hidden = true;
		const p = plan(shown, baseline);
		expect(p.unhiddenButtonIds.sort()).toEqual(READ_ONLY.map(([, id]) => id).sort());
		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions>${READ_ONLY.map(([, id]) => `<HideCustomAction HideActionId="${id}.HideAction" Location="${id}" />`).join("")}</CustomActions></RibbonDiffXml>`,
		);
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts(generate(shown, baseline)), {
			unhiddenControlIds: p.unhiddenButtonIds,
		});
		expect(merged.customActions.size).toBe(0);
	});

	it("an edit of another control doesn't touch them, and the layer keeps their XML verbatim", () => {
		const baseline = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const current = clone(baseline);
		control(current, "mxrm.T.Button").label = "Approve all";
		const rdx = generate(current, baseline);
		const written = customActionContent(rdx).map((c) => c.el.getAttribute("Id"));
		expect(written).toEqual(["mxrm.T.Button"]);
		// Your layer adds the read-only controls: the publish leaves their CustomActions as they are.
		const layerXml = `<RibbonDiffXml><CustomActions>${READ_ONLY.map(
			([xml, id]) =>
				`<CustomAction Id="${id}.CustomAction" Location="${GROUP}.Controls._children" Sequence="20"><CommandUIDefinition>${xml}</CommandUIDefinition></CustomAction>`,
		).join("")}</CustomActions></RibbonDiffXml>`;
		const layer = parseRibbonDiffParts(layerXml);
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts(rdx));
		for (const [key, xml] of layer.customActions) expect(merged.customActions.get(key)).toBe(xml);
	});

	it("your own: moved (CustomAction relocated, XML kept) and deleted (CustomAction removed)", () => {
		const twoGroups = ribbonDoc(ALL_CONTROLS).replace(
			"</Groups>",
			`<Group Id="${TAB}.Other" Sequence="20" Template="Mscrm.Templates.Flexible2"><Controls Id="${TAB}.Other.Controls" /></Group></Groups>`,
		);
		const baseline = parse(twoGroups).ribbon;
		const current = clone(baseline);
		const [main, other] = current.tabs[0].groups;
		const toggle = main.buttons.find((b) => b.id === "mxrm.T.Toggle")!;
		main.buttons = main.buttons.filter((b) => b !== toggle && b.id !== "mxrm.T.Spinner");
		other.buttons.push({ ...toggle, sequence: 10 });
		const p = plan(current, baseline);
		expect(p.unsupported).toEqual([]);
		expect(p.movedButtons).toEqual([{ id: "mxrm.T.Toggle", groupId: `${TAB}.Other`, sequence: 10 }]);
		expect(p.deletedButtonIds).toEqual(["mxrm.T.Spinner"]);

		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions>${[TOGGLE, SPINNER]
				.map((xml, i) => {
					const id = parseXmlElement(xml).getAttribute("Id");
					return `<CustomAction Id="${id}.CustomAction" Location="${GROUP}.Controls._children" Sequence="${20 + i}"><CommandUIDefinition>${xml}</CommandUIDefinition></CustomAction>`;
				})
				.join("")}</CustomActions></RibbonDiffXml>`,
		);
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts(generate(current, baseline)), {
			movedControls: p.movedButtons,
			deletedControlIds: p.deletedButtonIds,
		});
		expect(merged.customActions.has("ca:mxrm.T.Spinner.CustomAction")).toBe(false);
		const moved = parseXmlElement(merged.customActions.get("ca:mxrm.T.Toggle.CustomAction")!);
		expect(moved.getAttribute("Location")).toBe(`${TAB}.Other.Controls._children`);
		const el = moved.getElementsByTagName("ToggleButton")[0];
		expect(el.getAttribute("QueryCommand")).toBe("mxrm.T.Toggle.Query");
		expect(el.getAttribute("Image16by16")).toBe("/_imgs/ribbon/filter16.png");
	});

	it("out-of-the-box ones can't be moved or deleted", () => {
		const oob = ribbonDoc(ALL_CONTROLS.replace(/mxrm\.T\./g, `Mscrm.HomepageGrid.${E}.`));
		const baseline = parse(oob).ribbon;
		const current = clone(baseline);
		const buttons = current.tabs[0].groups[0].buttons;
		const dropDown = buttons.find((b) => b.kind === "dropDown")!;
		dropDown.sequence = 5;
		current.tabs[0].groups[0].buttons = buttons.filter((b) => b.kind !== "label");
		const p = plan(current, baseline);
		expect(p.movedButtons).toEqual([]);
		expect(p.deletedButtonIds).toEqual([]);
		expect(p.unsupported.some((u) => u.includes(dropDown.id) && u.startsWith("Moving"))).toBe(true);
		expect(p.unsupported.some((u) => u.includes(`Mscrm.HomepageGrid.${E}.Label`) && u.startsWith("Removing"))).toBe(true);
	});

	it("placed where the loaded ribbon doesn't have them (e.g. pasted onto the form), they are written verbatim", () => {
		const grid = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const formBaseline = parse(ribbonDoc(""), "Form").ribbon;
		const form = clone(formBaseline);
		for (const [, id] of READ_ONLY) form.tabs[0].groups[0].buttons.push(clone(control(grid, id)));
		const rdx = generate(form, formBaseline, "Form");
		const written = customActionContent(rdx);
		for (const [xml, id] of READ_ONLY) {
			const ca = written.find((c) => c.el.getAttribute("Id") === id)!;
			expect(ca.location).toBe(`${GROUP}.Controls._children`);
			expect(sameElement(ca.el, xml)).toBe(true);
		}
		expect(validatePublishRibbonDiff(rdx).filter((f) => f.severity === "error")).toEqual([]);
	});

	it("a group imported with them keeps them (not dropped) and publishes them verbatim, with their commands", () => {
		const loaded = parse(ribbonDoc(BUTTON)).ribbon;
		const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
		const G = "mxrm.Imported.Group";
		const result = importRibbonDiffXml({
			xml: `<RibbonDiffXml><CustomActions><CustomAction Id="${G}.CustomAction" Location="${TAB}.Groups._children" Sequence="30"><CommandUIDefinition><Group Id="${G}" Title="Imported" Sequence="30" Template="Mscrm.Templates.Flexible2"><Controls Id="${G}.Controls">${TOGGLE}${SPINNER}</Controls></Group></CommandUIDefinition></CustomAction></CustomActions><CommandDefinitions>${["mxrm.T.Toggle.Command", "mxrm.T.Toggle.Query"]
				.map((id) => `<CommandDefinition Id="${id}"><EnableRules /><DisplayRules /><Actions /></CommandDefinition>`)
				.join("")}</CommandDefinitions></RibbonDiffXml>`,
			ribbons: { HomepageGrid: loaded, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: E,
			activeLocation: "HomepageGrid",
		});
		const group = result.ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === G)!;
		expect(group.buttons.map((b) => b.kind)).toEqual(["toggleButton", "spinner"]);
		const rdx = generate(result.ribbons.HomepageGrid, loaded, "HomepageGrid", result.commands);
		const [ca] = customActionContent(rdx).filter((c) => c.el.tagName === "Group");
		const inline = Array.from(ca.el.getElementsByTagName("Controls")[0].children);
		expect(sameElement(inline[0], TOGGLE)).toBe(true);
		expect(sameElement(inline[1], SPINNER)).toBe(true);
		// Its QueryCommand is written with it, not only its Command.
		const commands = Array.from(parseXmlElement(rdx).getElementsByTagName("CommandDefinition")).map((c) => c.getAttribute("Id"));
		expect(commands.sort()).toEqual(["mxrm.T.Toggle.Command", "mxrm.T.Toggle.Query"]);
		// …and the publish plan (whose edited commands are what the publish keeps) has both.
		const p = planScope({
			locations: [{ current: result.ribbons.HomepageGrid, baseline: loaded }],
			commands: result.commands,
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
		});
		expect(p.editedCommandIds.sort()).toEqual(["mxrm.T.Toggle.Command", "mxrm.T.Toggle.Query"]);
		expect(result.notApplied.filter((n) => n.includes("mxrm.T.Toggle.Query"))).toEqual([]);
	});

	it("adding one to an existing group by import is reported, not silently skipped", () => {
		const loaded = parse(ribbonDoc(BUTTON)).ribbon;
		const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
		const result = importRibbonDiffXml({
			xml: `<RibbonDiffXml><CustomActions><CustomAction Id="x.CustomAction" Location="${TAB}.Groups._children" Sequence="30"><CommandUIDefinition><Group Id="${GROUP}" Sequence="10"><Controls Id="${GROUP}.Controls">${TOGGLE}</Controls></Group></CommandUIDefinition></CustomAction></CustomActions></RibbonDiffXml>`,
			ribbons: { HomepageGrid: loaded, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: E,
			activeLocation: "HomepageGrid",
		});
		expect(result.notApplied.some((n) => n.startsWith("mxrm.T.Toggle:") && n.includes("<ToggleButton>"))).toBe(true);
	});

	it("a copy (duplicate) carries the XML with its own ids, its MRU InitialItem included", () => {
		const loaded = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const copy = copyControl(control(loaded, "mxrm.T.DropDown"), "mxrm.T.DropDown2");
		const el = parseXmlElement(copy.source!.xml!);
		expect(el.getAttribute("Id")).toBe("mxrm.T.DropDown2");
		expect(el.getElementsByTagName("Menu")[0].getAttribute("Id")).toBe("mxrm.T.DropDown2.Menu");
		expect(el.getElementsByTagName("Button")[0].getAttribute("Id")).toBe("mxrm.T.DropDown2.A");
		expect(el.getAttribute("Command")).toBe("mxrm.T.DropDown.Command");
		const mru = parseXmlElement(copyControl(control(loaded, "mxrm.T.Mru"), "mxrm.T.Mru2").source!.xml!);
		expect(mru.getAttribute("InitialItem")).toBe("mxrm.T.Mru2.A");
		expect(mru.getElementsByTagName("Button")[0].getAttribute("Id")).toBe("mxrm.T.Mru2.A");
	});

	it("duplicating one, or its group, in the store keeps its XML (with new ids) and its label", () => {
		const grid = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
		const store = useRibbonStore.getState();
		store.loadWorkspace({
			ribbons: { HomepageGrid: grid, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		store.duplicateGroup("HomepageGrid", TAB, GROUP);
		store.duplicateButton("HomepageGrid", TAB, GROUP, "mxrm.T.Spinner");
		const groups = useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups;
		const spinnerCopy = groups[0].buttons.find((b) => b.id.includes("mxrm.T.Spinner_copy_"))!;
		expect(spinnerCopy.label).toBe("mxrm.T.Spinner");
		expect(parseXmlElement(spinnerCopy.source!.xml!).getAttribute("Id")).toBe(spinnerCopy.id);
		expect(parseXmlElement(spinnerCopy.source!.xml!).getElementsByTagName("Unit")).toHaveLength(1);
		const groupCopy = groups.find((g) => g.id.includes(`${GROUP}_copy_`))!;
		for (const b of groupCopy.buttons.filter((x) => x.kind !== "button")) {
			expect(parseXmlElement(b.source!.xml!).getAttribute("Id")).toBe(b.id);
		}
		const rdx = generate(useRibbonStore.getState().ribbons.HomepageGrid, grid);
		const copyGroup = customActionContent(rdx).find((c) => c.el.getAttribute("Id") === groupCopy.id)!;
		const kinds = Array.from(copyGroup.el.getElementsByTagName("Controls")[0].children).map((c) => c.tagName);
		expect(kinds).toEqual(["Button", "ToggleButton", "Label", "DropDown", "MRUSplitButton", "Spinner", "GalleryButton"]);
	});

	it("moving your own one with a <Menu> to another location is reported; one without moves", () => {
		const own = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const formBaseline = parse(ribbonDoc(""), "Form").ribbon;
		const grid = clone(own);
		const form = clone(formBaseline);
		for (const id of ["mxrm.T.DropDown", "mxrm.T.Toggle"]) {
			form.tabs[0].groups[0].buttons.push(clone(control(grid, id)));
			grid.tabs[0].groups[0].buttons = grid.tabs[0].groups[0].buttons.filter((b) => b.id !== id);
		}
		const p = planScope({
			locations: [
				{ current: grid, baseline: own },
				{ current: form, baseline: formBaseline },
			],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
		});
		expect(p.unsupported.filter((u) => u.includes("mxrm.T.DropDown"))).toHaveLength(1);
		expect(p.unsupported.filter((u) => u.includes("mxrm.T.Toggle"))).toEqual([]);
	});

	it("renaming a command updates the XML of a read-only control that names it", () => {
		const grid = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
		const store = useRibbonStore.getState();
		store.loadWorkspace({
			ribbons: { HomepageGrid: grid, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [{ id: "mxrm.T.Toggle.Query", enableRules: [], displayRules: [], actions: [] }],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		expect(store.renameCommandId("mxrm.T.Toggle.Query", "mxrm.T.Toggle.State")).toBe(true);
		const toggle = control(useRibbonStore.getState().ribbons.HomepageGrid, "mxrm.T.Toggle");
		expect(parseXmlElement(toggle.source!.xml!).getAttribute("QueryCommand")).toBe("mxrm.T.Toggle.State");
		expect(parseXmlElement(toggle.source!.xml!).getAttribute("Command")).toBe("mxrm.T.Toggle.Command");
	});

	it("deleting your own one drops the commands only it used, QueryCommand included", () => {
		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions><CustomAction Id="mxrm.T.Toggle.CustomAction" Location="${GROUP}.Controls._children" Sequence="20"><CommandUIDefinition>${TOGGLE}</CommandUIDefinition></CustomAction></CustomActions><CommandDefinitions>${[
				"mxrm.T.Toggle.Command",
				"mxrm.T.Toggle.Query",
			]
				.map((id) => `<CommandDefinition Id="${id}"><EnableRules /><DisplayRules /><Actions /></CommandDefinition>`)
				.join("")}</CommandDefinitions></RibbonDiffXml>`,
		);
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts("<RibbonDiffXml/>"), { deletedControlIds: ["mxrm.T.Toggle"] });
		expect(merged.customActions.size).toBe(0);
		expect([...merged.commandDefinitions.keys()]).toEqual([]);
	});

	it("editing one isn't published (they are read-only)", () => {
		const baseline = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const current = clone(baseline);
		control(current, "mxrm.T.Toggle").label = "Changed";
		expect(plan(current, baseline).unsupported.some((u) => u.includes("mxrm.T.Toggle"))).toBe(true);
	});
});

describe("#42 canvas: read-only control kinds", () => {
	let container: HTMLDivElement;
	let root: Root;
	const render = (ui: React.ReactNode) =>
		act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		const grid = parse(ribbonDoc(ALL_CONTROLS)).ribbon;
		const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
		useRibbonStore.getState().loadWorkspace({
			ribbons: { HomepageGrid: grid, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		useSelectionStore.getState().setLocation("HomepageGrid");
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	const tab = (): RibbonTab => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0];

	it("shows each one on the classic canvas with its kind and label", () => {
		render(<ClassicRibbon tab={tab()} location="HomepageGrid" />);
		const kinds: Record<string, string> = {
			"mxrm.T.Toggle": "Toggle button",
			"mxrm.T.Label": "Label",
			"mxrm.T.DropDown": "Drop-down",
			"mxrm.T.Mru": "MRU split button",
			"mxrm.T.Spinner": "Spinner",
			"mxrm.T.Gallery": "Gallery button",
		};
		for (const [id, kind] of Object.entries(kinds)) {
			const tile = container.querySelector(`[data-ribbon-btn-id="${id}"]`);
			expect(tile, id).not.toBeNull();
			expect(tile!.getAttribute("aria-label")).toContain(`${kind}, read-only`);
			expect(tile!.textContent).toContain(kind);
		}
		expect(container.querySelector('[data-ribbon-btn-id="mxrm.T.Toggle"]')!.textContent).toContain("Filter");
	});

	it("the properties pane shows them read-only, with Hide / Unhide", () => {
		useSelectionStore.getState().selectButtonInContext("HomepageGrid", TAB, GROUP, "mxrm.T.Toggle");
		render(<PropertiesPane />);
		expect(container.textContent).toContain("Toggle button");
		expect(container.textContent).toContain("QueryCommand");
		// No editable label field (IdentitySection isn't shown for it).
		expect(container.querySelector('input[value="Filter"]')).toBeNull();
		const hide = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Hide")!;
		act(() => hide.click());
		expect(control(useRibbonStore.getState().ribbons.HomepageGrid, "mxrm.T.Toggle").hidden).toBe(true);
		const unhide = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Unhide")!;
		act(() => unhide.click());
		expect(control(useRibbonStore.getState().ribbons.HomepageGrid, "mxrm.T.Toggle").hidden).toBe(false);
	});
});

describe("#42 synthetic fixtures are schema-valid (RibbonCore.xsd / RibbonWSS.xsd)", () => {
	// RibbonWSS.xsd TabType / GroupType / ControlsType attributes and content.
	const TAB_ATTRIBUTES = new Set(["Command", "CssClass", "Description", "Id", "Sequence", "Title"]);
	const GROUP_ATTRIBUTES = new Set([
		"Command",
		"Description",
		"Id",
		"Image32by32Popup",
		"Image32by32PopupClass",
		"Image32by32PopupLeft",
		"Image32by32PopupTop",
		"PopupWidth",
		"Sequence",
		"Template",
		"Title",
	]);
	const MODELLED_RULES = new Set(Object.keys(RULE_KIND_LABELS).filter((k) => k !== "RawRule"));
	const kids = (el: Element) => Array.from(el.children);

	for (const name of ["account-full.xml", "all-rule-kinds.xml", "app-ribbon.xml", "contact-full.xml"]) {
		describe(name, () => {
			const doc = new DOMParser().parseFromString(
				readFileSync(resolve(__dirname, "../__fixtures__/ribbon", name), "utf-8"),
				"application/xml",
			);
			const all = (tag: string) => Array.from(doc.getElementsByTagName(tag));

			it("tabs: TabType attributes only, <Scaling Id> then <Groups Id>, inside UI > Ribbon > Tabs", () => {
				expect(all("Tab").length).toBeGreaterThan(0);
				for (const tab of all("Tab")) {
					for (const a of Array.from(tab.attributes)) expect(TAB_ATTRIBUTES, `${tab.getAttribute("Id")} @${a.name}`).toContain(a.name);
					expect(kids(tab).map((c) => c.tagName)).toEqual(["Scaling", "Groups"]);
					for (const c of kids(tab)) expect(c.getAttribute("Id")).toBeTruthy();
					expect(tab.parentElement?.tagName).toBe("Tabs");
					expect(tab.parentElement?.parentElement?.tagName).toBe("Ribbon");
				}
			});

			it("groups: GroupType attributes only, <Controls Id> with no unknown attributes", () => {
				for (const group of all("Group")) {
					for (const a of Array.from(group.attributes)) expect(GROUP_ATTRIBUTES, `${group.getAttribute("Id")} @${a.name}`).toContain(a.name);
					const controls = kids(group);
					expect(controls.map((c) => c.tagName)).toEqual(["Controls"]);
					expect(Array.from(controls[0].attributes).map((a) => a.name)).toEqual(["Id"]);
				}
			});

			it("rules: TabDisplayRules / DisplayRules / EnableRules in order, schema rule elements in their allowed container", () => {
				for (const defs of all("RuleDefinitions")) {
					expect(kids(defs).map((c) => c.tagName)).toEqual(["TabDisplayRules", "DisplayRules", "EnableRules"]);
				}
				const steps = (rule: Element): Element[] =>
					kids(rule).flatMap((s) => (s.tagName === "OrRule" ? kids(s).flatMap((or) => kids(or)) : [s]));
				for (const rule of all("RuleDefinitions").flatMap((d) => kids(d).filter((c) => c.tagName === "EnableRules").flatMap(kids))) {
					for (const s of steps(rule)) {
						expect(MODELLED_RULES, s.tagName).toContain(s.tagName);
						expect(DISPLAY_ONLY_RULE_KINDS.has(s.tagName as never), `${s.tagName} in an EnableRule`).toBe(false);
					}
				}
				for (const rule of all("RuleDefinitions").flatMap((d) => kids(d).filter((c) => c.tagName === "DisplayRules").flatMap(kids))) {
					for (const s of steps(rule)) {
						expect(MODELLED_RULES, s.tagName).toContain(s.tagName);
						expect(ENABLE_ONLY_RULE_KINDS.has(s.tagName as never), `${s.tagName} in a DisplayRule`).toBe(false);
					}
				}
			});
		});
	}
});
