/**
 * #191 phase C1: the Edit ⇄ Simulate switch, the simulation context and the simulated bar.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { SimulateCanvas } from "@/components/ribbon-canvas/SimulateCanvas";
import { LocationRow } from "@/components/ribbon-canvas/CanvasHeader";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { DEFAULT_SIMULATION, useUIStore } from "@/store/uiStore";
import { simulationContext, uciLocation } from "@/utils/simulation";
import type {
	CommandDefinition,
	DisplayRule,
	EnableRule,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";

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
				button("x.Delete", 20, "Cmd.Delete"),
				button("x.Legacy", 30, "Cmd.Legacy"),
				button("x.Custom", 40, "Cmd.Custom"),
			],
		},
	],
};
const COMMANDS = [
	command("Cmd.New", []),
	command("Cmd.Delete", ["Any"]),
	command("Cmd.Legacy", [], ["LegacyOnly"]),
	command("Cmd.Custom", ["Js"]),
];
const ENABLE: EnableRule[] = [
	{ id: "Any", steps: [{ kind: "SelectionCountRule" }] },
	{ id: "Js", steps: [{ kind: "CustomRule", library: "x.js", functionName: "f" }] },
];
const DISPLAY: DisplayRule[] = [
	{ id: "LegacyOnly", steps: [{ kind: "CommandClientTypeRule", type: "Legacy" }] },
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
const simulated = () =>
	[...container.querySelectorAll<HTMLElement>("[data-simulated]")].map(
		(b) => b.dataset.simulated,
	);
const item = (id: string) => container.querySelector<HTMLElement>(`[data-simulated="${id}"]`);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
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
	useModernCommandStore.setState({ selectedCommandId: null });
	useUIStore.setState({ canvasMode: "edit", simulation: DEFAULT_SIMULATION });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#191 C1 simulation context", () => {
	it("names the page Unified Interface shows: the Sub-grid location's sub-grid or associated view", () => {
		expect(uciLocation("HomepageGrid", DEFAULT_SIMULATION)).toBe("HomePageGrid");
		expect(uciLocation("Form", DEFAULT_SIMULATION)).toBe("Form");
		expect(uciLocation("SubGrid", DEFAULT_SIMULATION)).toBe("SubGridStandard");
		expect(
			uciLocation("SubGrid", { ...DEFAULT_SIMULATION, subGridPage: "SubGridAssociated" }),
		).toBe("SubGridAssociated");
		expect(uciLocation("Application", DEFAULT_SIMULATION)).toBeNull();
	});

	it("simulates a System Administrator with the recorded outcomes; a form selects nothing", () => {
		const grid = simulationContext("HomePageGrid", "account", {
			...DEFAULT_SIMULATION,
			selection: 2,
		});
		expect(grid).toMatchObject({ selectedCount: 2, privileges: "all" });
		expect(grid.recorded?.rules).toBeDefined();
		const form = simulationContext("Form", "account", {
			...DEFAULT_SIMULATION,
			selection: 2,
			formState: "Disabled",
		});
		expect(form).toMatchObject({ selectedCount: 0, formState: "Disabled" });
	});

	it("remembers the mode and the simulation", () => {
		const options = useUIStore.persist.getOptions();
		const saved = options.partialize!({
			...useUIStore.getState(),
			canvasMode: "simulate",
			simulation: { ...DEFAULT_SIMULATION, selection: 1 },
		});
		expect(saved).toMatchObject({ canvasMode: "simulate", simulation: { selection: 1 } });
	});
});

describe("#191 C1 Simulate canvas", () => {
	it("shows what users get, marks what it can't tell, and adds Unified Interface's own items", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(simulated()).toEqual([
			"ShowChartPane",
			"x.New",
			"x.Delete",
			"x.Custom",
			"OpenEntityDashboard",
		]);
		expect(item("x.Custom")!.getAttribute("aria-description")).toMatch(
			/^Can't tell: it depends on custom JavaScript/,
		);
		expect(container.textContent).toContain("2 shown · 1 can't tell · 1 hidden");
	});

	it("follows the rows selected, and lists the hidden commands with why when asked", () => {
		useUIStore.getState().setSimulation({ selection: 1, showHidden: true });
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(item("x.New")!.getAttribute("aria-description")).toBe(
			"Rows are selected, and its command doesn't count them",
		);
		// Selection hides first; with none selected, its rule does.
		expect(item("x.Legacy")!.getAttribute("aria-description")).toBe(
			"Rows are selected, and its command doesn't count them",
		);
		// Shown: nothing to explain.
		expect(item("x.Delete")!.getAttribute("aria-description")).toBeNull();
		act(() => useUIStore.getState().setSimulation({ selection: 0 }));
		expect(item("x.Legacy")!.getAttribute("aria-description")).toBe("Hidden by LegacyOnly");
		act(() => useUIStore.getState().setSimulation({ selection: 1, showHidden: false }));
		expect(simulated()).not.toContain("x.New");
		expect(simulated()).toContain("x.Delete");
	});

	it("changes the simulation from its own controls", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		const radios = () => [
			...container.querySelectorAll<HTMLElement>(
				'[aria-label="Selected records"] [role="radio"]',
			),
		];
		const one = radios().find((r) => r.textContent === "1")!;
		act(() => one.click());
		expect(useUIStore.getState().simulation.selection).toBe(1);
		expect(
			radios()
				.find((r) => r.textContent === "1")!
				.getAttribute("aria-checked"),
		).toBe("true");
		expect(simulated()).not.toContain("x.New");
	});

	it("asks for the record's state on a form, and the page on a sub-grid", () => {
		render(<SimulateCanvas location="Form" />);
		expect(container.querySelector('[aria-label="Form state"]')?.textContent).toBe(
			"NewExistingInactive",
		);
		// A form has no rows to select.
		expect(container.querySelector('[aria-label="Selected records"]')).toBeNull();
		render(<SimulateCanvas location="SubGrid" />);
		expect(container.textContent).toContain("Associated view");
		expect(container.querySelector('[aria-label="Selected records"]')).not.toBeNull();
	});

	it("draws the Dynamics 365 page at the chosen width, the bar a toolbar on it", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		const page = () =>
			container.querySelector<HTMLElement>('[aria-label^="Dynamics 365 page"]')!;
		expect(page().getAttribute("aria-label")).toBe("Dynamics 365 page (simulated): main grid");
		expect(page().style.width).toBe("100%");
		expect(container.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe(
			"account Commands",
		);
		act(() => useUIStore.getState().setSimulation({ width: "phone" }));
		expect(page().style.width).toBe("390px");
		// A simulation remembered without a width gets the default.
		act(() =>
			useUIStore.setState({
				simulation: { ...DEFAULT_SIMULATION, width: undefined } as never,
			}),
		);
		expect(page().style.width).toBe("100%");
	});

	it("selects a command in Edit's place too", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		act(() => item("x.Delete")!.click());
		expect(useSelectionStore.getState()).toMatchObject({
			selectedGroupId: "G",
			selectedButtonId: "x.Delete",
		});
		expect(item("x.Delete")!.getAttribute("aria-current")).toBe("true");
	});

	it("says the Application ribbon isn't a page of its own", () => {
		render(<SimulateCanvas location="Application" />);
		expect(container.textContent).toContain("Simulate shows an entity's pages");
		expect(simulated()).toEqual([]);
	});
});

describe("#191 C1 Edit ⇄ Simulate switch", () => {
	it("switches from the location row, which drops the View menu in Simulate", () => {
		render(<LocationRow />);
		expect(container.querySelector('[aria-label^="View as"]')).not.toBeNull();
		const simulate = [
			...container.querySelectorAll<HTMLElement>(
				'[aria-label="Mode (Ctrl+Shift+M)"] [role="radio"]',
			),
		].find((t) => t.textContent === "Simulate")!;
		expect(simulate.getAttribute("aria-checked")).toBe("false");
		act(() => simulate.click());
		expect(useUIStore.getState().canvasMode).toBe("simulate");
		expect(container.querySelector('[aria-label^="View as"]')).toBeNull();
		// The location is kept.
		expect(useSelectionStore.getState().location).toBe("HomepageGrid");
	});

	it("toggles with Ctrl+Shift+M", () => {
		function Keys() {
			useKeyboardShortcuts();
			return null;
		}
		render(<Keys />);
		const press = () =>
			act(() => {
				document.body.dispatchEvent(
					new KeyboardEvent("keydown", {
						key: "M",
						code: "KeyM",
						ctrlKey: true,
						shiftKey: true,
						bubbles: true,
					}),
				);
			});
		press();
		expect(useUIStore.getState().canvasMode).toBe("simulate");
		press();
		expect(useUIStore.getState().canvasMode).toBe("edit");
	});
});
