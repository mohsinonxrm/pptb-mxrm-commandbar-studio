/**
 * #37 review follow-ups: TextBox and ComboBox are published as loaded, Import XML treats them as
 * read-only, the warning and the notice are for group controls (the live check's scope), and a
 * draft's edits from before they were read-only can be taken back.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ButtonNotices } from "@/components/properties-pane/ButtonNotices";
import { ReadOnlyControlSection } from "@/components/properties-pane/ReadOnlyControlSection";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { importRibbonDiffXml } from "@/services/ribbonDiffImport";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const E = "account";
const TAB = `Mscrm.HomepageGrid.${E}.MainTab`;
const GROUP = `${TAB}.Management`;
const TEXTBOX = `<TextBox Id="mxrm.R.Text" Command="mxrm.R.Text.Command" MaxLength="40" ImeEnabled="true" Sequence="10" TemplateAlias="o1" />`;
const COMBO = `<ComboBox Id="mxrm.R.Combo" Command="mxrm.R.Combo.Command" Sequence="20" TemplateAlias="o1"><Menu Id="mxrm.R.Combo.Menu"><MenuSection Id="mxrm.R.Combo.S" Sequence="10"><Controls Id="mxrm.R.Combo.Controls"><Button Id="mxrm.R.Combo.A" Command="mxrm.R.A" LabelText="A" Sequence="10" /></Controls></MenuSection></Menu></ComboBox>`;
const doc = (
	controls: string,
) => `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs Id="Mscrm.Tabs">
<Tab Id="${TAB}" Command="${TAB}" Title="Main" Sequence="100"><Groups Id="${TAB}.Groups">
<Group Id="${GROUP}" Command="${GROUP}" Title="Management" Sequence="10" Template="Mscrm.Templates.Flexible2">
<Controls Id="${GROUP}.Controls">${controls}</Controls></Group></Groups></Tab></Tabs>
<ContextualTabs Id="Mscrm.ContextualTabs" /></Ribbon></UI>
<CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;
const loaded = (controls: string) => parseRibbonXml(doc(controls), "HomepageGrid", E).ribbon;
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : E,
	tabs: [],
});

describe("#37 review: TextBox and ComboBox are published as loaded", () => {
	it("a copy keeps the attributes and the menu CBS doesn't model", () => {
		const baseline = loaded(TEXTBOX + COMBO);
		const current = JSON.parse(JSON.stringify(baseline)) as RibbonDefinition;
		const group = current.tabs[0].groups[0];
		for (const b of [...group.buttons])
			group.buttons.push({
				...b,
				id: `${b.id}.Copy`,
				sequence: b.sequence + 100,
				custom: true,
				oob: false,
			});
		const rdx = generateRibbonDiffXml({
			current,
			baseline,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: E,
			location: "HomepageGrid",
		});
		expect(rdx).toMatch(/<TextBox [^>]*Id="mxrm\.R\.Text\.Copy"/);
		expect(rdx).toMatch(/MaxLength="40"/);
		expect(rdx).toMatch(/ImeEnabled="true"/);
		expect(rdx).toMatch(/<ComboBox [^>]*Id="mxrm\.R\.Combo\.Copy"[\s\S]*?<Menu /);
	});
});

describe("#37 review: Import XML treats them as read-only", () => {
	it("refuses adding one to a group, or overriding one, and says why", () => {
		const result = importRibbonDiffXml({
			xml: `<RibbonDiffXml><CustomActions><CustomAction Id="cbs.Add.CustomAction" Location="${GROUP}.Controls._children" Sequence="90"><CommandUIDefinition><CheckBox Id="cbs.Check" Command="cbs.C" Sequence="90" TemplateAlias="o1" /></CommandUIDefinition></CustomAction><CustomAction Id="cbs.Over.CustomAction" Location="mxrm.R.Text" Sequence="10"><CommandUIDefinition><TextBox Id="mxrm.R.Text" Command="cbs.Other" Sequence="10" TemplateAlias="o1" /></CommandUIDefinition></CustomAction></CustomActions><CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions></RibbonDiffXml>`,
			ribbons: {
				HomepageGrid: loaded(TEXTBOX),
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: E,
			activeLocation: "HomepageGrid",
		});
		expect(result.notApplied).toEqual(
			expect.arrayContaining([
				"cbs.Check: adding a <CheckBox> isn't supported — Command Bar Studio shows it read-only.",
				"CustomAction cbs.Over.CustomAction: overriding the <TextBox> mxrm.R.Text isn't supported — Command Bar Studio shows it read-only.",
			]),
		);
		const buttons = result.ribbons.HomepageGrid.tabs[0].groups[0].buttons;
		expect(buttons.find((b) => b.id === "mxrm.R.Text")?.commandId).toBe("mxrm.R.Text.Command");
		expect(buttons.some((b) => b.id === "cbs.Check")).toBe(false);
	});
});

describe("#37 review: the warning is for group controls", () => {
	const diff = (customActions: string) =>
		`<RibbonDiffXml><CustomActions>${customActions}</CustomActions><Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates><CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions><LocLabels/></RibbonDiffXml>`;
	const into = (location: string, control: string, id: string) =>
		`<CustomAction Id="${id}.CustomAction" Location="${location}._children" Sequence="10"><CommandUIDefinition>${control}</CommandUIDefinition></CustomAction>`;
	const unrendered = (xml: string, context = {}) =>
		validatePublishRibbonDiff(xml, context).filter((f) => f.code === "uci-unrendered");
	const groups = { groupTemplates: { [GROUP]: "Mscrm.Templates.Flexible2" } };

	it("not for a menu section's Controls when the groups are known", () => {
		const xml = diff(
			into(
				"mxrm.F.Menu.S.Controls",
				`<ToggleButton Id="cbs.T" Command="cbs.T" Sequence="10" />`,
				"cbs.T",
			),
		);
		expect(unrendered(xml, groups)).toEqual([]);
		// Without the loaded groups, every target counts.
		expect(unrendered(xml)).toHaveLength(1);
	});

	it("for a known group's Controls", () => {
		const xml = diff(
			into(
				`${GROUP}.Controls`,
				`<CheckBox Id="cbs.C" Command="cbs.C" Sequence="10" TemplateAlias="o1" />`,
				"cbs.C",
			),
		);
		expect(unrendered(xml, groups).map((f) => f.elementId)).toEqual(["cbs.C"]);
	});

	it("controls without an Id aren't merged into one finding", () => {
		const xml = diff(
			into(`${GROUP}.Controls`, `<Label LabelText="A" Sequence="10" />`, "cbs.L1") +
				into(`${GROUP}.Controls`, `<Label LabelText="B" Sequence="20" />`, "cbs.L2"),
		);
		expect(unrendered(xml, groups)).toHaveLength(2);
	});
});

describe("#37 review: Properties", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});
	const show = (ui: React.ReactElement) =>
		act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
	const bars = () =>
		[...container.querySelectorAll(".fui-MessageBar")].map((b) => b.textContent ?? "");
	const buttonNamed = (name: string) =>
		[...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

	const managedToggle = {
		id: "Mscrm.HomepageGrid.account.MainFilters",
		label: "Filters",
		kind: "toggleButton",
		sequence: 60,
		templateAlias: "o1",
		commandId: "Mscrm.Filters",
		hidden: false,
		oob: true,
		custom: false,
		managed: true,
		origin: "managed",
		solutionName: "Sales",
	} as RibbonButton;
	const notices = (inMenu?: boolean) => (
		<ButtonNotices
			button={managedToggle}
			location="HomepageGrid"
			tabId={TAB}
			groupId={GROUP}
			overrides={[]}
			inMenu={inMenu}
		/>
	);

	it("a managed control names its solution and says it isn't rendered, with no Customise or override", () => {
		show(notices());
		// One bar at a time, the warning first; the source is behind "+1 more".
		expect(bars()[0]).toContain("Not rendered in Unified Interface");
		act(() => buttonNamed("+1 more")!.click());
		expect(bars().some((t) => t.includes("From the managed solution Sales"))).toBe(true);
		expect(buttonNamed("Customise button")).toBeUndefined();
		expect(buttonNamed("Create override")).toBeUndefined();
	});

	it("a menu item gets no 'not rendered' notice: the live check was on group controls", () => {
		show(notices(true));
		expect(bars().some((t) => t.includes("Not rendered"))).toBe(false);
	});

	it("a draft's edit from before it was read-only can be taken back", () => {
		const ribbon = loaded(TEXTBOX);
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: ribbon,
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		} as never);
		const { setButtonProp } = useRibbonStore.getState();
		setButtonProp("HomepageGrid", TAB, GROUP, "mxrm.R.Text", { label: "Renamed" });
		const current = () =>
			useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0].buttons[0];
		show(
			<ReadOnlyControlSection
				button={current()}
				location="HomepageGrid"
				tabId={TAB}
				groupId={GROUP}
			/>,
		);
		expect(bars().some((t) => t.includes("can't be published"))).toBe(true);
		act(() => buttonNamed("Undo those edits")!.click());
		expect(current().label).toBe(ribbon.tabs[0].groups[0].buttons[0].label);
		expect(current().source?.xml).toContain("MaxLength");
	});
});
