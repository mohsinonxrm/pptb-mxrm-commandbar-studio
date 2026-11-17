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
import { mapAppActionRows } from "@/services/modernCommands";

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
const patchButton = (id: string, patch: Partial<RibbonButton>) =>
	act(() =>
		useRibbonStore.setState((s) => ({
			ribbons: {
				...s.ribbons,
				HomepageGrid: {
					...s.ribbons.HomepageGrid,
					tabs: s.ribbons.HomepageGrid.tabs.map((t) => ({
						...t,
						groups: t.groups.map((g) => ({
							...g,
							buttons: g.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)),
						})),
					})),
				},
			},
		})),
	);
const hideButton = (id: string) => patchButton(id, { hidden: true });
const ACCOUNT_MD = "70816501-edb9-4740-a16c-6a5efbc05d84";
const M1 = "aaaaaaaa-0000-0000-0000-000000000001";
const M2 = "aaaaaaaa-0000-0000-0000-000000000002";
/** An appaction row on account's main grid, in all apps. */
const modernRow = (over: Record<string, unknown>) => ({
	context: 1,
	_contextentity_value: ACCOUNT_MD,
	contextvalue: "account",
	location: 1,
	type: 0,
	hidden: false,
	isdisabled: false,
	origin: 0,
	name: String(over.uniquename),
	buttonlabeltext: String(over.uniquename),
	sequence: 900,
	...over,
});
const loadModern = (rows: Record<string, unknown>[]) =>
	act(() => {
		const s = useModernCommandStore.getState();
		s.finishLoad(s.beginLoad("account"), { apps: [], commands: mapAppActionRows(rows) });
	});
const modernById = (id: string) =>
	useModernCommandStore.getState().commands.find((c) => c.id === id)!;
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
	useModernCommandStore.getState().reset();
	useModernCommandStore.setState({ selectedCommandId: null, appFilter: "all", apps: [] });
	useSessionStore.setState({
		connectionUrl: "https://org.crm.dynamics.com/",
		activeEntity: {
			metadataId: ACCOUNT_MD,
			logicalName: "account",
			displayName: "Account",
			isCustomEntity: false,
			isIntersect: false,
		},
	});
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
		expect(whyText()).toContain("One fails, so Unified Interface hides it.");
		const step = container.querySelector<HTMLElement>('[aria-label="Steps of One"] li');
		expect(step?.dataset.step).toBe("Selection count is at least 1 and at most 1");
		expect(step?.dataset.outcome).toBe("fails");
		// A screen reader hears the outcome with the step, not instead of it.
		expect(step?.textContent).toBe("fails: Selection count is at least 1 and at most 1");
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
			b.textContent?.includes("open the list in Dynamics 365 with Command Checker"),
		)!;
		expect(whyText()).toContain("then choose Command checker on the command bar.");
		act(() => link.click());
		expect(open).toHaveBeenCalledWith(
			"https://org.crm.dynamics.com/main.aspx?pagetype=entitylist&etn=account&ribbondebug=true",
			"primary",
		);
	});

	it("offers no Command Checker link without PPTB, and says when the list is only a start", () => {
		select("x.Custom");
		render(<PropertiesPane />);
		expect(whyText()).not.toContain("Command Checker");
		(window as { toolboxAPI?: unknown }).toolboxAPI = {
			utils: { openInConnectionBrowser: vi.fn().mockRejectedValue(new Error("no")) },
		};
		// A sub-grid is reached from the list, not opened directly.
		act(() => useSelectionStore.getState().setLocation("SubGrid"));
		render(
			<WhyItShows
				target={{
					kind: "classic",
					button: button("x.Custom", 1, "Cmd.Custom"),
					tabId: MAIN,
				}}
			/>,
		);
		expect(whyText()).toContain("open the list in Dynamics 365 with Command Checker");
		expect(whyText()).toContain("go from there to the page simulated");
		const link = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("open the list"),
		)!;
		// A rejected open is caught, not left unhandled.
		act(() => link.click());
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
			...container.querySelectorAll<HTMLElement>(
				'[aria-label="Steps of Either"] li[data-step]',
			),
		].map((li) => `${li.dataset.step}: ${li.dataset.outcome}`);
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
		render(
			<WhyItShows
				target={{ kind: "classic", button: button("a", 1, "Cmd.New"), tabId: MAIN }}
			/>,
		);
		expect(container.textContent).toContain(
			"Simulate covers the main grid, the main form and sub-grids.",
		);
	});

	it("agrees with the bar on a control it leaves out: a HideCustomAction, the chart designer's tab", () => {
		hideButton("x.New");
		select("x.New");
		render(<PropertiesPane />);
		expect(status()).toBe("Hidden here");
		expect(whyText()).toContain("A HideCustomAction hides it, so it isn't on the bar.");
		render(
			<WhyItShows
				target={{
					kind: "classic",
					button: button("v", 1, "Cmd.New"),
					tabId: "Mscrm.HomepageGrid.account.VisualizationTab",
				}}
			/>,
		);
		expect(whyText()).toContain("It's on the chart designer's tab");
	});

	it("explains a control kind Properties shows read-only, as the bar does", () => {
		patchButton("x.New", { kind: "toggleButton" });
		select("x.New");
		render(<PropertiesPane />);
		expect(status()).toBe("Hidden here");
		expect(whyText()).toContain("Unified Interface doesn't draw this kind of control.");
	});

	it("judges a menu item with its menu's button", () => {
		const item = button("x.Item", 1, "Cmd.New");
		const menuOf = (parentId: string) => ({
			kind: "classic" as const,
			button: item,
			tabId: MAIN,
			parent: TAB.groups[0].buttons.find((b) => b.id === parentId)!,
		});
		render(<WhyItShows target={menuOf("x.Edit")} />);
		// Its own rules pass, but Edit is hidden with no records selected.
		expect(status()).toBe("Hidden here");
		expect(whyText()).toContain("Its menu's button, “x.Edit”, is hidden here");
		render(<WhyItShows target={menuOf("x.Custom")} />);
		expect(status()).toBe("Can't tell");
		expect(whyText()).toContain("CBS can't tell whether that shows here");
		render(<WhyItShows target={menuOf("x.Either")} />);
		expect(status()).toBe("Shows here");
		expect(whyText()).toContain("It's an item of “x.Either”'s menu, which shows here.");
	});

	it("explains a modern command, from the bar's own simulation", () => {
		loadModern([modernRow({ appactionid: M1, uniquename: "new_formula", visibilitytype: 1 })]);
		render(<WhyItShows target={{ kind: "modern", command: modernById(M1) }} />);
		expect(status()).toBe("Can't tell");
		expect(whyText()).toContain("Power Fx formula");
	});

	it("says a modern command the bar leaves out is hidden or switched off", () => {
		loadModern([
			modernRow({ appactionid: M1, uniquename: "new_hidden", hidden: true }),
			modernRow({ appactionid: M2, uniquename: "new_off", isdisabled: true }),
		]);
		render(<WhyItShows target={{ kind: "modern", command: modernById(M1) }} />);
		expect(status()).toBe("Hidden here");
		expect(whyText()).toContain("It's hidden in the command designer");
		render(<WhyItShows target={{ kind: "modern", command: modernById(M2) }} />);
		expect(whyText()).toContain("It's switched off");
	});

	it("keeps a stand-in modern command's own reason", () => {
		// A migrated command named after the classic button stands in for it.
		loadModern([
			modernRow({ appactionid: M1, uniquename: "x.New", buttonlabeltext: "New+", origin: 1 }),
		]);
		simulate({ selection: 1 });
		select("x.New");
		render(<PropertiesPane />);
		expect(status()).toBe("Hidden here");
		expect(whyText()).toContain("The modern command “New+” takes its place on the bar");
		expect(whyText()).toContain("Records are selected, and its command doesn't count them");
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
		// Properties remounts its sections for each command chosen: it stays open (PPTB check).
		act(() => root.unmount());
		root = createRoot(container);
		render(sections);
		expect(container.textContent).toContain("b");
	});

	it("stays open from one Properties command to the next, for someone who used CBS before", () => {
		writePref("sections.properties.button", ["appearance"]);
		select("x.Edit");
		render(<PropertiesPane />);
		const whyOpen = () =>
			!!container.querySelector("[data-why-it-shows]") ||
			container.textContent!.includes("Hidden here");
		expect(whyOpen()).toBe(true);
		select("x.New");
		expect(status()).toBe("Shows here");
	});

	it("reads anything stored that isn't a list as nothing remembered", () => {
		window.localStorage.setItem("cbs.ui.sections.t", "null");
		window.localStorage.setItem("cbs.ui.sections.t.introduced", '{"b":1}');
		render(sections);
		expect(container.textContent).toContain("a");
		expect(container.textContent).toContain("b");
	});

	it("then leaves it as they left it", () => {
		writePref("sections.t", []);
		writePref("sections.t.introduced", ["b"]);
		render(sections);
		const panel = container.querySelector(".fui-AccordionPanel");
		expect(panel).toBeNull();
	});
});
