/**
 * #37: Label, ToggleButton, DropDown, CheckBox, Spinner, ComboBox and TextBox are valid
 * RibbonXML, but Unified Interface draws each as an empty, zero-size item (checked live on
 * 2026-10-28). CBS keeps them read-only, marks them "Not rendered in Unified Interface",
 * leaves them out of "How users see it", and warns before a publish adds or changes one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ButtonNotices } from "@/components/properties-pane/ButtonNotices";
import { parseRibbonXml } from "@/services/xmlParser";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { usersBar } from "@/utils/usersBar";
import {
	isReadOnlyControlKind,
	isUnrenderedInUci,
	UNRENDERED_IN_UCI_KINDS,
	UNRENDERED_IN_UCI_TAGS,
} from "@/utils/controlKinds";
import type { RibbonButton, RibbonGroup, RibbonTab } from "@/types/ribbon";
import type { ClassicModernOverride, ModernCommand } from "@/types/modernCommand";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const E = "account";
const TAB = `Mscrm.HomepageGrid.${E}.MainTab`;
const GROUP = `${TAB}.Management`;

describe("#37 which controls Unified Interface doesn't draw", () => {
	it("are the seven checked live, and all of them are read-only", () => {
		expect([...UNRENDERED_IN_UCI_KINDS].sort()).toEqual(
			[
				"checkBox",
				"comboBox",
				"dropDown",
				"label",
				"spinner",
				"textBox",
				"toggleButton",
			].sort(),
		);
		for (const kind of UNRENDERED_IN_UCI_KINDS) expect(isReadOnlyControlKind(kind)).toBe(true);
		expect([...UNRENDERED_IN_UCI_TAGS].sort()).toEqual(
			[
				"CheckBox",
				"ComboBox",
				"DropDown",
				"Label",
				"Spinner",
				"TextBox",
				"ToggleButton",
			].sort(),
		);
	});

	it("leave out the controls Unified Interface does draw, and the two not checked live", () => {
		for (const kind of ["button", "flyout", "splitButton", "mruSplitButton", "galleryButton"])
			expect(isUnrenderedInUci(kind)).toBe(false);
		expect(isUnrenderedInUci(undefined)).toBe(false);
	});
});

describe("#37 TextBox, ComboBox and CheckBox are read-only now", () => {
	const TEXTBOX = `<TextBox Id="mxrm.T.Text" Command="mxrm.T.Text.Command" QueryCommand="mxrm.T.Text.Query" MaxLength="40" Sequence="10" TemplateAlias="o1" />`;
	const COMBO = `<ComboBox Id="mxrm.T.Combo" Command="mxrm.T.Combo.Command" InitialItem="mxrm.T.Combo.A" Sequence="20" TemplateAlias="o1"><Menu Id="mxrm.T.Combo.Menu"><MenuSection Id="mxrm.T.Combo.S" Sequence="10"><Controls Id="mxrm.T.Combo.Controls"><Button Id="mxrm.T.Combo.A" Command="mxrm.T.A" LabelText="A" Sequence="10" /></Controls></MenuSection></Menu></ComboBox>`;
	const CHECK = `<CheckBox Id="mxrm.T.Check" Command="mxrm.T.Check.Command" QueryCommand="mxrm.T.Check.Query" LabelText="Only mine" Sequence="30" TemplateAlias="o1" />`;
	const doc = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs Id="Mscrm.Tabs">
<Tab Id="${TAB}" Command="${TAB}" Title="Main" Sequence="100"><Groups Id="${TAB}.Groups">
<Group Id="${GROUP}" Command="${GROUP}" Title="Management" Sequence="10" Template="Mscrm.Templates.Flexible2">
<Controls Id="${GROUP}.Controls">${TEXTBOX}${COMBO}${CHECK}</Controls></Group></Groups></Tab></Tabs>
<ContextualTabs Id="Mscrm.ContextualTabs" /></Ribbon></UI>
<CommandDefinitions /><RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules /></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

	it("are parsed with their XML kept whole, menu included, so they're written back as loaded", () => {
		const { ribbon } = parseRibbonXml(doc, "HomepageGrid", E);
		const buttons = ribbon.tabs[0].groups[0].buttons;
		expect(buttons.map((b) => [b.id, b.kind])).toEqual([
			["mxrm.T.Text", "textBox"],
			["mxrm.T.Combo", "comboBox"],
			["mxrm.T.Check", "checkBox"],
		]);
		for (const b of buttons) {
			expect(b.source?.xml).toContain(`Id="${b.id}"`);
			expect(b.menu).toBeUndefined();
		}
		expect(buttons[1].source?.xml).toContain("<Menu");
	});
});

describe("#37 How users see it", () => {
	const button = (id: string, sequence: number, extra: Partial<RibbonButton> = {}) =>
		({
			id,
			label: id,
			kind: "button",
			sequence,
			templateAlias: "o1",
			commandId: "Mscrm.X",
			hidden: false,
			oob: true,
			custom: false,
			managed: false,
			...extra,
		}) as RibbonButton;
	const tab = (buttons: RibbonButton[]): RibbonTab =>
		({
			id: TAB,
			label: "Main",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{
					id: GROUP,
					label: "M",
					sequence: 10,
					template: "Flexible2",
					buttons,
				} as RibbonGroup,
			],
		}) as RibbonTab;

	it("leaves out the controls Unified Interface doesn't draw", () => {
		const items = usersBar(
			tab([
				button("A", 10),
				button("Toggle", 20, { kind: "toggleButton" }),
				button("Label", 30, { kind: "label" }),
				button("Mru", 40, { kind: "mruSplitButton" }),
				button("B", 50),
			]),
			[],
			new Map(),
		);
		expect(items.map((i) => i.id)).toEqual(["A", "Mru", "B"]);
	});

	it("still shows the modern command that replaces one", () => {
		const command = { id: "m1", uniqueName: "new_Toggle", label: "Filter" } as ModernCommand;
		const overrides = new Map<string, ClassicModernOverride[]>([
			["Toggle", [{ effect: "replaced", command } as ClassicModernOverride]],
		]);
		const items = usersBar(
			tab([button("A", 10), button("Toggle", 20, { kind: "toggleButton" })]),
			[],
			overrides,
		);
		expect(items.map((i) => i.id)).toEqual(["A", "Toggle"]);
	});
});

describe("#37 the pre-publish warning", () => {
	const diff = (customActions: string) => `<RibbonDiffXml>
  <CustomActions>${customActions}</CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates" /></Templates>
  <CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions><LocLabels/>
</RibbonDiffXml>`;
	const intoGroup = (id: string, control: string) =>
		`<CustomAction Id="${id}.CustomAction" Location="${GROUP}.Controls._children" Sequence="10"><CommandUIDefinition>${control}</CommandUIDefinition></CustomAction>`;
	const newGroup = `<CustomAction Id="cbs.G.CustomAction" Location="${TAB}.Groups._children" Sequence="90"><CommandUIDefinition><Group Id="cbs.G" Sequence="90" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.G.Controls"><Button Id="cbs.G.B" Command="cbs.B" Sequence="10" TemplateAlias="o1" /><Spinner Id="cbs.G.S" Command="cbs.S" Sequence="20" TemplateAlias="o1" /></Controls></Group></CommandUIDefinition></CustomAction>`;
	const findings = (xml: string, changedKeys?: string[]) =>
		validatePublishRibbonDiff(xml, changedKeys ? { changedKeys } : {}).filter(
			(f) => f.code === "uci-unrendered",
		);

	it("warns, never blocks, when the publish adds one to a group", () => {
		const [f, ...rest] = findings(
			diff(
				intoGroup(
					"cbs.L",
					`<Label Id="cbs.L" LabelText="Status" Sequence="10" TemplateAlias="o1" />`,
				),
			),
		);
		expect(rest).toEqual([]);
		expect(f.severity).toBe("warning");
		expect(f.elementId).toBe("cbs.L");
		expect(f.message).toBe(
			"Label cbs.L: Unified Interface doesn't draw a Label. It shows an empty, zero-size item, so users can't see or click it; use a Button, FlyoutAnchor or SplitButton instead, or hide it",
		);
	});

	it("finds one inside a new group, and not its Button", () => {
		const found = findings(diff(newGroup));
		expect(found.map((f) => f.elementId)).toEqual(["cbs.G.S"]);
	});

	it("says nothing for one that's already published and unchanged", () => {
		const xml = diff(
			intoGroup(
				"cbs.T",
				`<ToggleButton Id="cbs.T" Command="cbs.T" Sequence="10" TemplateAlias="o1" />`,
			) +
				intoGroup(
					"cbs.B",
					`<Button Id="cbs.B" Command="cbs.B" Sequence="20" TemplateAlias="o1" />`,
				),
		);
		expect(findings(xml, ["customActions:ca:cbs.B.CustomAction"])).toEqual([]);
		expect(findings(xml, ["customActions:ca:cbs.T.CustomAction"])).toHaveLength(1);
	});

	it("says nothing for a hide, or for the controls Unified Interface draws", () => {
		const xml = diff(
			`<HideCustomAction HideActionId="cbs.H" Location="Mscrm.HomepageGrid.account.Toggle" />` +
				intoGroup(
					"cbs.F",
					`<FlyoutAnchor Id="cbs.F" Command="cbs.F" Sequence="10" TemplateAlias="o1" />`,
				) +
				intoGroup(
					"cbs.M",
					`<MRUSplitButton Id="cbs.M" Command="cbs.M" Sequence="20" TemplateAlias="o1" />`,
				),
		);
		expect(findings(xml)).toEqual([]);
	});
});

describe("#37 Properties says so", () => {
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
	const render = (b: RibbonButton) =>
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<ButtonNotices
						button={b}
						location="HomepageGrid"
						tabId={TAB}
						groupId={GROUP}
						overrides={[]}
					/>
				</FluentProvider>,
			),
		);
	const bars = () => [...container.querySelectorAll(".fui-MessageBar")].map((b) => b.textContent);
	const control = (kind: RibbonButton["kind"]) =>
		({
			id: "mxrm.T.X",
			label: "X",
			kind,
			sequence: 10,
			templateAlias: "o1",
			commandId: "",
			hidden: false,
			oob: false,
			custom: true,
			managed: false,
			origin: "unmanaged",
		}) as RibbonButton;

	it("a ComboBox gets the warning", () => {
		render(control("comboBox"));
		expect(bars()).toHaveLength(1);
		expect(bars()[0]).toContain("Not rendered in Unified Interface");
		expect(bars()[0]).toContain("empty, zero-size item");
	});

	it("a Button or an MRUSplitButton doesn't", () => {
		render(control("button"));
		expect(bars()).toEqual([]);
		render(control("mruSplitButton"));
		expect(bars()).toEqual([]);
	});
});
