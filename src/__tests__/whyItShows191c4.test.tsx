/**
 * #191 phase C4 (#36): "Why it shows here" in Properties: whether the selected command shows on
 * the simulated page, and which rules and steps decide.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { WhyItShows } from "@/components/properties-pane/WhyItShows";
import { PropertySection, PropertySections } from "@/components/shared/PropertySection";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSessionStore } from "@/store/sessionStore";
import { DEFAULT_SIMULATION, useUIStore, type Simulation } from "@/store/uiStore";
import { commandCheckerUrl, describeContext } from "@/utils/simulation";
import { readPref, writePref } from "@/utils/localPrefs";
import type {
	CommandDefinition,
	DisplayRule,
	EnableRule,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";
import type { ModernCommand } from "@/types/modernCommand";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const button = (id: string, sequence: number, commandId: string): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence,
	templateAlias: "o1",
	commandId,
	hidden: false,
	oob: true,
	custom: false,
	managed: false,
});
const command = (id: string, enableRules: string[], displayRules: string[] = []) =>
	({ id, enableRules, displayRules, actions: [] }) as CommandDefinition;

const MAIN = "Mscrm.HomepageGrid.account.MainTab";
const TAB: RibbonTab = {
	id: MAIN,
	label: "Account",
	sequence: 100,
	tabDisplayRules: [],
	groups: [
		{
			id: "G",
			label: "G",
			sequence: 10,
			template: "Flexible2",
			buttons: [
				button("x.New", 10, "Cmd.New"),
				button("x.Edit", 20, "Cmd.Edit"),
				button("x.Custom", 30, "Cmd.Custom"),
				button("x.Legacy", 40, "Cmd.Legacy"),
				button("x.Either", 50, "Cmd.Either"),
				button("x.Orphan", 60, "Cmd.Missing"),
			],
		},
	],
};
const ENABLE: EnableRule[] = [
	{ id: "One", steps: [{ kind: "SelectionCountRule", minimum: 1, maximum: 1 }] },
	{ id: "Js", steps: [{ kind: "CustomRule", library: "x.js", functionName: "f" }] },
	{
		id: "Either",
		steps: [
			{
				kind: "OrRule",
				groups: [
					[{ kind: "FormStateRule", state: "Create" }],
					[
						{ kind: "CommandClientTypeRule", type: "Modern" },
						{ kind: "SelectionCountRule", minimum: 0 },
					],
				],
			},
		],
	},
];
const DISPLAY: DisplayRule[] = [
	{ id: "LegacyOnly", steps: [{ kind: "CommandClientTypeRule", type: "Legacy" }] },
];
const COMMANDS = [
	command("Cmd.New", []),
	command("Cmd.Edit", ["One"]),
	command("Cmd.Custom", ["Js"]),
	command("Cmd.Legacy", [], ["LegacyOnly"]),
	command("Cmd.Either", ["Either"]),
];

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>));
}
const why = () => container.querySelector<HTMLElement>("[data-why-it-shows]");
const whyText = () => why()?.textContent ?? container.textContent ?? "";
const status = () => container.querySelector('[role="status"]')?.textContent;
const select = (id: string) =>
	act(() => useSelectionStore.getState().selectButtonInContext("HomepageGrid", MAIN, "G", id));
const simulate = (change: Partial<Simulation>) =>
	act(() => useUIStore.getState().setSimulation(change));
const rules = () =>
	[...container.querySelectorAll('[aria-label="Rules"] > li')].map((li) => li.textContent);
const sectionTitles = () =>
	[...container.querySelectorAll(".fui-AccordionHeader__button")].map((b) => b.textContent);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	window.localStorage.clear();
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: { ...empty("HomepageGrid"), tabs: [TAB] },
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: COMMANDS,
		displayRules: DISPLAY,
		enableRules: ENABLE,
		locLabels: [],
	} as never);
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
	useModernCommandStore.setState({ selectedCommandId: null, appFilter: "all", apps: [] });
	useSessionStore.setState({ connectionUrl: "https://org.crm.dynamics.com/" });
	useUIStore.setState({ canvasMode: "edit", simulation: DEFAULT_SIMULATION });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
	delete (window as { toolboxAPI?: unknown }).toolboxAPI;
});

describe("#191 C4 Why it shows here", () => {
	it("says a command with no rules shows, on the page the strip sets", () => {
		select("x.New");
		render(<PropertiesPane />);
		expect(status()).toBe("Shows here");
		expect(whyText()).toContain(
			"Main grid, no records selected, as a System Administrator in Unified Interface.",
		);
		expect(whyText()).toContain("It has no display or enable rules");
	});

	it("names the rule that hides it and the step that fails, and follows the strip", () => {
		select("x.Edit");
		render(<PropertiesPane />);
		expect(status()).toBe("Hidden here");
		expect(rules()).toHaveLength(1);
		expect(rules()[0]).toContain("One");
		expect(rules()[0]).toContain("Enable rule · fails · hides it");
		const step = container.querySelector('[aria-label="Steps of One"] li');
		expect(step?.getAttribute("aria-label")).toBe(
			"Selection count is at least 1 and at most 1: fails",
		);
		simulate({ selection: 1 });
		expect(status()).toBe("Shows here");
		expect(whyText()).toContain("All its rules pass.");
		// A passing rule's steps aren't listed.
		expect(container.querySelector('[aria-label="Steps of One"]')).toBeNull();
	});

	it("says what it can't tell, and opens the page with Command Checker on", () => {
		const open = vi.fn().mockResolvedValue(undefined);
		(window as { toolboxAPI?: unknown }).toolboxAPI = {
			utils: { openInConnectionBrowser: open },
		};
		select("x.Custom");
		render(<PropertiesPane />);
		expect(status()).toBe("Can't tell");
		expect(whyText()).toContain("None of its rules fails, but CBS can't work out all of them.");
		expect(whyText()).toContain("Custom rule: f() from x.js");
		expect(whyText()).toContain("CBS can't tell: it depends on custom JavaScript");
		const link = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("open it in Dynamics 365 with Command Checker"),
		)!;
		act(() => link.click());
		expect(open).toHaveBeenCalledWith(
			"https://org.crm.dynamics.com/main.aspx?pagetype=entitylist&etn=account&ribbondebug=true",
			"primary",
		);
	});

	it("explains a display rule's hide, a missing command and records selected", () => {
		select("x.Legacy");
		render(<PropertiesPane />);
		expect(status()).toBe("Hidden here");
		expect(rules()[0]).toContain("Display rule · fails · hides it");
		expect(whyText()).toContain('Client type is "Legacy"');

		select("x.Orphan");
		expect(whyText()).toContain("Its command isn't in the ribbon");

		select("x.New");
		simulate({ selection: 1 });
		expect(status()).toBe("Hidden here");
		expect(whyText()).toContain("Records are selected, and its command doesn't count them");
	});

	it("shows an OR's groups, each step with its own outcome", () => {
		simulate({ selection: 1 });
		select("x.Either");
		render(<PropertiesPane />);
		// It passes, so its steps aren't listed; force a fail by changing the selection rule.
		expect(status()).toBe("Shows here");
		act(() =>
			useRibbonStore.getState().upsertEnableRule({
				id: "Either",
				steps: [
					{
						kind: "OrRule",
						groups: [
							[{ kind: "FormStateRule", state: "Create" }],
							[
								{ kind: "CommandClientTypeRule", type: "Modern" },
								{ kind: "SelectionCountRule", minimum: 2 },
							],
						],
					},
				],
			}),
		);
		expect(status()).toBe("Hidden here");
		const labels = [
			...container.querySelectorAll('[aria-label="Steps of Either"] li[aria-label]'),
		].map((li) => li.getAttribute("aria-label"));
		expect(labels).toEqual([
			"Any of these: fails",
			'Form state is "Create": fails',
			'Client type is "Modern" (Unified Interface): passes',
			"Selection count is at least 2: fails",
		]);
		expect(whyText()).toContain("All of these");
	});

	it("leads Properties in Simulate; follows Appearance in Edit, with a way to Simulate", () => {
		select("x.Edit");
		render(<PropertiesPane />);
		expect(sectionTitles().slice(0, 2)).toEqual(["Appearance", "Why it shows here"]);
		const change = [...container.querySelectorAll("button")].find(
			(b) => b.textContent === "Change in Simulate",
		)!;
		act(() => change.click());
		expect(useUIStore.getState().canvasMode).toBe("simulate");
		expect(sectionTitles()[0]).toBe("Why it shows here");
		expect(container.textContent).not.toContain("Change in Simulate");
	});

	it("says Simulate doesn't cover a location it has no page for", () => {
		act(() => useSelectionStore.getState().setLocation("Application"));
		render(<WhyItShows target={{ kind: "classic", button: button("a", 1, "Cmd.New") }} />);
		expect(container.textContent).toContain(
			"Simulate covers the main grid, the main form and sub-grids.",
		);
	});

	it("explains a modern command, from the bar's own simulation", () => {
		const modern = {
			id: "m1",
			name: "Formula",
			uniqueName: "new_formula",
			label: "Formula",
			appModuleId: null,
			scope: "entity",
			location: 1,
			type: 0,
			sequence: 10,
			hidden: false,
			disabled: false,
			origin: "custom",
			managed: false,
			parentId: null,
			groupTitleHidden: false,
			action: "javascript",
			visibility: "formula",
			classicRules: [],
		} as unknown as ModernCommand;
		render(<WhyItShows target={{ kind: "modern", command: modern }} />);
		expect(status()).toBe("Can't tell");
		expect(whyText()).toContain("Power Fx formula");
	});

	it("notes a menu item depends on its menu's button", () => {
		render(
			<WhyItShows
				target={{ kind: "classic", button: button("i", 1, "Cmd.New"), inMenu: true }}
			/>,
		);
		expect(whyText()).toContain("only if the menu's own button shows");
	});
});

describe("#191 C4 helpers", () => {
	it("describes the page and its state", () => {
		expect(describeContext("HomePageGrid", { ...DEFAULT_SIMULATION, selection: 2 })).toBe(
			"Main grid, 2 or more records selected",
		);
		expect(describeContext("Form", { ...DEFAULT_SIMULATION, formState: "Create" })).toBe(
			"Main form, new record",
		);
		expect(describeContext("SubGridAssociated", DEFAULT_SIMULATION)).toBe(
			"Associated view, no records selected",
		);
	});

	it("opens a new form for a new record, the list otherwise, in the app chosen", () => {
		expect(
			commandCheckerUrl(
				"https://org.crm.dynamics.com",
				"lead",
				"Form",
				{ ...DEFAULT_SIMULATION, formState: "Create" },
				"app-1",
			),
		).toBe(
			"https://org.crm.dynamics.com/main.aspx?appid=app-1&pagetype=entityrecord&etn=lead&ribbondebug=true",
		);
		expect(
			commandCheckerUrl("https://org.crm.dynamics.com/", "lead", "Form", DEFAULT_SIMULATION),
		).toBe(
			"https://org.crm.dynamics.com/main.aspx?pagetype=entitylist&etn=lead&ribbondebug=true",
		);
	});
});

describe("#191 C4 a section added later opens once", () => {
	const sections = (
		<PropertySections storageKey="t" defaultOpen={["a"]} introduced={["b"]}>
			<PropertySection value="a" title="A">
				a
			</PropertySection>
			<PropertySection value="b" title="B">
				b
			</PropertySection>
		</PropertySections>
	);
	it("opens it for someone whose open sections were remembered before it existed", () => {
		writePref("sections.t", []);
		render(sections);
		expect(container.textContent).toContain("b");
		expect(readPref("sections.t.introduced", [])).toEqual(["b"]);
	});

	it("then leaves it as they left it", () => {
		writePref("sections.t", []);
		writePref("sections.t.introduced", ["b"]);
		render(sections);
		const panel = container.querySelector(".fui-AccordionPanel");
		expect(panel).toBeNull();
	});
});
