/**
 * #191 phase C5: adding and moving commands on Simulate's bar. Insert markers and a command's
 * context menu add a button at a place; dragging, the context menu and Alt+←/→ move one.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { SimulateCanvas } from "@/components/ribbon-canvas/SimulateCanvas";
import { NewButtonModal } from "@/components/modals/NewButtonModal";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSessionStore } from "@/store/sessionStore";
import { DEFAULT_SIMULATION, useUIStore } from "@/store/uiStore";
import { barPlacement, moveGap } from "@/utils/simulation";
import type { SimulatedEntry } from "@/services/uciPreview/bar";
import type {
	CommandDefinition,
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

const button = (id: string, sequence: number, over: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence,
	templateAlias: "o1",
	commandId: `Cmd.${id}`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...over,
});

const MAIN = "Mscrm.HomepageGrid.account.MainTab";
const tab = (): RibbonTab => ({
	id: MAIN,
	label: "Account",
	sequence: 100,
	tabDisplayRules: [],
	groups: [
		{
			id: "G1",
			label: "G1",
			sequence: 10,
			template: "Flexible2",
			buttons: [button("a.One", 10), button("a.Two", 20), button("a.Three", 30)],
		},
		{
			id: "G2",
			label: "G2",
			sequence: 20,
			template: "Flexible2",
			buttons: [
				button("b.One", 10),
				// Microsoft's: moving it moves your copy and hides it.
				button("b.Theirs", 20, { oob: true, custom: false, origin: "managed" }),
			],
		},
	],
});
const commandsOf = (t: RibbonTab): CommandDefinition[] =>
	t.groups.flatMap((g) =>
		g.buttons.map((b) => ({ id: b.commandId, enableRules: [], displayRules: [], actions: [] })),
	);

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
/** The classic commands on the bar, in order. */
const bar = () =>
	[...container.querySelectorAll<HTMLElement>("[data-simulated]")]
		.map((b) => b.dataset.simulated!)
		.filter((id) => /^[ab]\./.test(id) || id.includes("Theirs") || /^new|^cbs/.test(id));
const cmd = (id: string) => container.querySelector<HTMLButtonElement>(`[data-simulated="${id}"]`)!;
const group = (id: string) =>
	useRibbonStore
		.getState()
		.ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === id)!
		.buttons.map((b) => `${b.id}@${b.sequence}${b.hidden ? " hidden" : ""}`);
/** A drag event jsdom can carry a DataTransfer on. */
function dragEvent(type: string, clientX = 0) {
	const data = new Map<string, string>();
	const e = new Event(type, { bubbles: true, cancelable: true });
	Object.assign(e, {
		clientX,
		dataTransfer: {
			setData: (k: string, v: string) => data.set(k, v),
			getData: (k: string) => data.get(k) ?? "",
			effectAllowed: "",
			dropEffect: "",
		},
	});
	return e;
}

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	window.localStorage.clear();
	const t = tab();
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: { ...empty("HomepageGrid"), tabs: [t] },
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: commandsOf(t),
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
	useModernCommandStore.getState().reset();
	useSessionStore.setState({
		activeEntity: {
			metadataId: "70816501-edb9-4740-a16c-6a5efbc05d84",
			logicalName: "account",
			displayName: "Account",
			isCustomEntity: false,
			isIntersect: false,
		},
	});
	useUIStore.setState({
		canvasMode: "simulate",
		simulation: DEFAULT_SIMULATION,
		newButtonGroupId: null,
		newButtonBefore: null,
		announcement: "",
	});
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

const classic = (id: string, groupId: string): SimulatedEntry =>
	({
		kind: "classic",
		id,
		button: button(id, 0),
		tabId: MAIN,
		groupId,
		verdict: { outcome: true, rules: [] },
	}) as SimulatedEntry;
const system = {
	kind: "system",
	id: "ShowChartPane",
	label: "Show Chart",
	verdict: { outcome: true, rules: [] },
} as SimulatedEntry;

describe("#191 C5 where a gap on the bar goes in the ribbon", () => {
	const listed = [system, classic("a.One", "G1"), classic("a.Two", "G1"), classic("b.One", "G2")];
	it("goes before the next classic command, in its group", () => {
		expect(barPlacement(listed, 0)).toEqual({
			tabId: MAIN,
			groupId: "G1",
			beforeButtonId: "a.One",
		});
		expect(barPlacement(listed, 2)).toEqual({
			tabId: MAIN,
			groupId: "G1",
			beforeButtonId: "a.Two",
		});
	});
	it("past a group's last command, at the end of that group", () => {
		expect(barPlacement(listed, 3)).toEqual({ tabId: MAIN, groupId: "G1" });
		expect(barPlacement(listed, 4)).toEqual({ tabId: MAIN, groupId: "G2" });
	});
	it("leaves the moving command out, and keeps it in its group between two groups", () => {
		// b.One moving to between a.Two and itself: it stays in G2, first.
		expect(barPlacement(listed, 3, "b.One")).toEqual({ tabId: MAIN, groupId: "G1" });
		expect(barPlacement([...listed, classic("b.Two", "G2")], 3, "b.Two")).toEqual({
			tabId: MAIN,
			groupId: "G2",
			beforeButtonId: "b.One",
		});
	});
	it("has nowhere to go on a bar with no classic command", () => {
		expect(barPlacement([system], 1)).toBeNull();
	});
	it("moves one place: before the classic command before it, after the one after it", () => {
		expect(moveGap(listed, "a.Two", "earlier")).toBe(1);
		expect(moveGap(listed, "a.Two", "later")).toBe(4);
		expect(moveGap(listed, "a.One", "earlier")).toBeNull();
		expect(moveGap(listed, "b.One", "later")).toBeNull();
	});
});

describe("#191 C5 moving on the bar", () => {
	it("Alt+→ and Alt+← move a command, Sequence between its new neighbours", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(bar()).toEqual(["a.One", "a.Two", "a.Three", "b.One", "b.Theirs"]);
		act(() => {
			cmd("a.One").dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }),
			);
		});
		expect(bar()).toEqual(["a.Two", "a.One", "a.Three", "b.One", "b.Theirs"]);
		expect(group("G1")).toEqual(["a.Two@20", "a.One@25", "a.Three@30"]);
		expect(useSelectionStore.getState().selectedButtonId).toBe("a.One");
		expect(useUIStore.getState().announcement).toBe("Moved a.One before a.Three.");
		act(() => {
			cmd("a.One").dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true }),
			);
		});
		expect(bar()).toEqual(["a.One", "a.Two", "a.Three", "b.One", "b.Theirs"]);
		// One undo step per move.
		act(() => useRibbonStore.getState().undo());
		expect(bar()).toEqual(["a.Two", "a.One", "a.Three", "b.One", "b.Theirs"]);
	});

	it("moves past the end of its group into the next one's place", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		act(() => {
			cmd("a.Three").dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }),
			);
		});
		expect(bar()).toEqual(["a.One", "a.Two", "b.One", "a.Three", "b.Theirs"]);
		expect(group("G2")).toContain("a.Three@15");
	});

	it("drags a command to a gap, with a line where it will go", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		const slotOf = (id: string) => cmd(id).parentElement!;
		act(() => {
			cmd("a.Three").dispatchEvent(dragEvent("dragstart"));
		});
		// jsdom's boxes are empty: left of the middle is the gap before.
		act(() => {
			slotOf("a.One").dispatchEvent(dragEvent("dragover", -1));
		});
		expect(container.querySelector("[data-drop-gap]")?.getAttribute("data-drop-gap")).toBe(
			String(
				[...container.querySelectorAll("[data-simulated]")].findIndex(
					(b) => b === cmd("a.One"),
				),
			),
		);
		act(() => {
			slotOf("a.One").dispatchEvent(dragEvent("drop", -1));
		});
		expect(bar()).toEqual(["a.Three", "a.One", "a.Two", "b.One", "b.Theirs"]);
		expect(container.querySelector("[data-drop-gap]")).toBeNull();
	});

	it("moves your copy of a button that isn't yours, and says so", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		act(() => {
			cmd("b.Theirs").dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true }),
			);
		});
		const g2 = group("G2");
		expect(g2).toContain("b.Theirs@20 hidden");
		const copy = useSelectionStore.getState().selectedButtonId!;
		expect(copy).not.toBe("b.Theirs");
		expect(bar().slice(-2)).toEqual([copy, "b.One"]);
		expect(useUIStore.getState().announcement).toMatch(/before b\.One, as your copy\.$/);
	});

	it("offers moves and adds in a command's context menu", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		act(() => {
			cmd("a.One").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		});
		const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
		expect(items.map((i) => i.textContent)).toEqual([
			"Add a button before",
			"Add a button after",
			"Move earlierAlt+←",
			"Move laterAlt+→",
		]);
		expect(items[2].getAttribute("aria-disabled")).toBe("true");
		act(() => items[1].click());
		expect(useUIStore.getState()).toMatchObject({
			newButtonGroupId: "G1",
			newButtonBefore: "a.Two",
		});
	});
});

describe("#191 C5 adding on the bar", () => {
	it("an insert marker opens New button for that place, and the button lands there", () => {
		render(
			<>
				<SimulateCanvas location="HomepageGrid" />
				<NewButtonModal />
			</>,
		);
		const marker = (gap: number) =>
			container.querySelector<HTMLElement>(`[data-insert-gap="${gap}"]`)!;
		// The gap before b.One: past G1's last command, so at the end of G1.
		const gap = [...container.querySelectorAll("[data-simulated]")].findIndex(
			(b) => b === cmd("b.One"),
		);
		act(() => marker(gap).click());
		expect(useUIStore.getState()).toMatchObject({
			newButtonGroupId: "G1",
			newButtonBefore: null,
		});
		act(() => useUIStore.getState().closeNewButton());
		// The gap before a.Two: in G1, before it.
		act(() => marker(gap - 2).click());
		expect(useUIStore.getState()).toMatchObject({
			newButtonGroupId: "G1",
			newButtonBefore: "a.Two",
		});
		expect(document.body.textContent).toContain("It goes before “a.Two”.");
		const create = [...document.querySelectorAll("button")].find(
			(b) => b.textContent === "Create button",
		)!;
		act(() => create.click());
		const added = useSelectionStore.getState().selectedButtonId!;
		expect(bar().slice(0, 3)).toEqual(["a.One", added, "a.Two"]);
		expect(group("G1")).toEqual(["a.One@10", `${added}@15`, "a.Two@20", "a.Three@30"]);
		// The button and its place are one undo step.
		act(() => useRibbonStore.getState().undo());
		expect(group("G1")).toEqual(["a.One@10", "a.Two@20", "a.Three@30"]);
	});

	it("doesn't draw editing on a bar drawn outside Simulate", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(container.querySelectorAll("[data-insert-gap]").length).toBeGreaterThan(0);
		expect(cmd("a.One").getAttribute("draggable")).toBe("true");
		expect(cmd("a.One").getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowLeft Alt+ArrowRight");
		// Unified Interface's own items don't move.
		const showChart = container.querySelector<HTMLElement>('[data-simulated="ShowChartPane"]');
		expect(showChart?.getAttribute("draggable")).toBeNull();
	});
});
