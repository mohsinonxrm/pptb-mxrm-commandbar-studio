/**
 * #155: a tab has one TabDisplayRule. The layer keeps one per TabCommand, so
 * a second rule replaced the first and the tab disappeared from where the
 * first rule showed it. The panel edits one rule's steps (any step shows the
 * tab); several rules, loaded or saved before, are written as one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { TabDisplayRulesPanel } from "@/components/panels/TabDisplayRulesPanel";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateTabDisplayRulesForTab } from "@/services/xmlGenerator";
import { parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonDefinition, RibbonLocation, RibbonTab, TabDisplayRule } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const T = "account";
const TAB = "cbs.account.HomepageGrid.Tools.Tab";
const CMD = `${TAB}.Command`;

const homeGrid = {
	kind: "EntityRule",
	entityName: T,
	context: "HomePageGrid",
	appliesTo: "PrimaryEntity",
} as const;
const form = { kind: "EntityRule", context: "Form" } as const;

const tab = (tabDisplayRules: TabDisplayRule[]): RibbonTab => ({
	id: TAB,
	label: "Tools",
	sequence: 500,
	commandId: CMD,
	tabDisplayRules,
	groups: [],
});

describe("#155 several rules for one tab are one rule", () => {
	it("the generator writes one TabDisplayRule with every step", () => {
		const xml = generateTabDisplayRulesForTab(
			tab([
				{ tabCommand: CMD, rules: [homeGrid] },
				{ tabCommand: CMD, rules: [form] },
			]),
			false,
		);
		expect(xml.match(/<TabDisplayRule /g)).toHaveLength(1);
		const parts = parseRibbonDiffParts(
			`<RibbonDiffXml><RuleDefinitions><TabDisplayRules>${xml}</TabDisplayRules></RuleDefinitions></RibbonDiffXml>`,
		);
		// The home-grid step is still there: the tab keeps showing on the home grid.
		expect(parts.tabDisplayRules.get(CMD)).toContain('Context="HomePageGrid"');
		expect(parts.tabDisplayRules.get(CMD)).toContain('Context="Form"');
	});

	it("the parser reads several TabDisplayRules of one tab as one rule, steps in document order", () => {
		const xml = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${TAB}" Command="${CMD}" Sequence="500"><Groups Id="${TAB}.Groups" /></Tab>
</Tabs></Ribbon></UI><CommandDefinitions /><RuleDefinitions><TabDisplayRules>
  <TabDisplayRule TabCommand="${CMD}"><EntityRule Context="Form" /><PageRule Address="/main.aspx" /><EntityRule Context="HomePageGrid" /></TabDisplayRule>
  <TabDisplayRule TabCommand="${CMD}"><EntityRule Context="SubGridStandard" /></TabDisplayRule>
</TabDisplayRules><DisplayRules /><EnableRules /></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
		const parsed = parseRibbonXml(xml, "HomepageGrid", T);
		const rules = parsed.ribbon.tabs.find((t) => t.id === TAB)!.tabDisplayRules;
		expect(rules).toHaveLength(1);
		expect(rules[0].rules.map((s) => (s.kind === "EntityRule" ? s.context : s.kind))).toEqual([
			"Form",
			"PageRule",
			"HomePageGrid",
			"SubGridStandard",
		]);
	});
});

describe("#155 the Tab rules panel", () => {
	const empty = (location: RibbonLocation): RibbonDefinition => ({
		location,
		entityLogicalName: T,
		tabs: [],
	});
	let container: HTMLDivElement;
	let root: Root;

	function load(rules: TabDisplayRule[], options: { layerTabs?: string[] } = {}) {
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: {
					location: "HomepageGrid",
					entityLogicalName: T,
					tabs: [tab(rules)],
				},
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			layers: {
				entity: {
					controlIds: [],
					containerIds: options.layerTabs ?? [TAB],
					locLabelIds: [],
					hides: [],
				},
				application: null,
			},
		});
		useSelectionStore.getState().setLocation("HomepageGrid");
		useSelectionStore.getState().setTabId(TAB);
	}

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		useUIStore.setState({ tabDisplayRulesOpen: false });
	});

	const open = () => {
		act(() => useUIStore.setState({ tabDisplayRulesOpen: true }));
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<TabDisplayRulesPanel />
				</FluentProvider>,
			),
		);
	};
	const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>("button")];
	const button = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
	const selects = () => [...document.body.querySelectorAll<HTMLSelectElement>("select")];
	const savedRules = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].tabDisplayRules;

	it("shows one rule whose steps come from every loaded rule, and saves it as one", () => {
		load([
			{ tabCommand: CMD, rules: [homeGrid] },
			{ tabCommand: CMD, rules: [form] },
		]);
		open();
		expect(button("Add display rule")).toBeUndefined();
		expect(document.body.textContent).toContain("The tab shows where any step matches.");
		act(() => button("Add step")!.click());
		act(() => button("Save rules")!.click());
		expect(savedRules()).toHaveLength(1);
		expect(savedRules()[0].tabCommand).toBe(CMD);
		expect(savedRules()[0].rules).toHaveLength(3);
		expect(savedRules()[0].rules.slice(0, 2)).toEqual([homeGrid, form]);
	});

	it("a step without Applies to / Context shows Any, and Any clears them", () => {
		load([{ tabCommand: CMD, rules: [form, homeGrid] }]);
		open();
		// [type, applies to, context, table] per step
		const [, appliesTo, context, table] = selects();
		expect(appliesTo.value).toBe("");
		expect(context.value).toBe("Form");
		// The table picker offers this table or any; another table's name isn't typed in.
		expect([...table.options].map((o) => o.value)).toEqual(["", T]);
		const second = selects().slice(4);
		act(() => {
			second[1].value = "";
			second[1].dispatchEvent(new Event("change", { bubbles: true }));
		});
		act(() => button("Save rules")!.click());
		expect(savedRules()[0].rules[1]).toEqual({ ...homeGrid, appliesTo: undefined });
	});

	it("a tab another solution adds is read-only", () => {
		load([{ tabCommand: CMD, rules: [homeGrid] }], { layerTabs: [] });
		open();
		expect(document.body.textContent).toContain("isn't added by your customizations");
		expect(button("Save rules")!.disabled).toBe(true);
		expect(button("Add step")!.disabled).toBe(true);
	});

	it("an out-of-the-box tab without a rule isn't said to be hidden", () => {
		load([], { layerTabs: [] });
		open();
		expect(document.body.textContent).toContain("This tab has no display rule of its own.");
		expect(document.body.textContent).not.toContain("this tab will be hidden");
	});

	it("a tab is editable when the layer couldn't be read, and saving without a change changes nothing", () => {
		load([{ tabCommand: CMD, rules: [homeGrid] }]);
		useRibbonStore.setState((st) => ({ layers: { ...st.layers, entity: null } }));
		open();
		expect(button("Save rules")!.disabled).toBe(false);
		const before = savedRules();
		act(() => button("Save rules")!.click());
		expect(savedRules()).toEqual(before);
	});
});
