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
import { moveGap, placementGoal } from "@/utils/simulation";
import { barOrder, planPlacement, type SimulatedEntry } from "@/services/uciPreview/bar";
import { D365CommandBar } from "@/components/ribbon-canvas/simulate/D365CommandBar";
import type { ModernCommand } from "@/types/modernCommand";
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
		newButtonPlace: null,
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

/** A control where the loaded ribbon had it: its XML index in the group. */
const loaded = (id: string, sequence: number, index: number, groupId = "G"): RibbonButton =>
	button(id, sequence, {
		source: {
			position: { groupId, index },
			attributes: { Id: id, Sequence: String(sequence) },
		},
	} as Partial<RibbonButton>);
const oneGroup = (buttons: RibbonButton[]): RibbonTab[] => [
	{
		id: MAIN,
		label: "Account",
		sequence: 100,
		tabDisplayRules: [],
		groups: [{ id: "G", label: "G", sequence: 10, template: "Flexible2", buttons }],
	},
];
const goal = (
	after: string | undefined,
	before: string | undefined,
	shown: string[],
	moving?: string,
) => ({
	after,
	before,
	shown: new Set(shown),
	groups: [{ tabId: MAIN, groupId: "G" }],
	...(moving ? { moving: { tabId: MAIN, groupId: "G", buttonId: moving } } : {}),
});
const drawn = (tabs: RibbonTab[]) => barOrder({ tabs }).map((e) => e.id);
const withSequence = (tabs: RibbonTab[], id: string, sequence: number) =>
	tabs.map((t) => ({
		...t,
		groups: t.groups.map((g) => ({
			...g,
			buttons: g.buttons.map((b) => (b.id === id ? { ...b, sequence } : b)),
		})),
	}));

describe("#191 C5 where a gap on the bar goes in the ribbon", () => {
	const listed = [system, classic("a.One", "G1"), classic("a.Two", "G1"), classic("b.One", "G2")];
	const tabOf = () => MAIN;
	it("asks for a place between the entries either side, Unified Interface's own stepped over", () => {
		expect(placementGoal(listed, 0, tabOf)).toMatchObject({
			after: undefined,
			before: "a.One",
			groups: [{ tabId: MAIN, groupId: "G1" }],
		});
		expect(placementGoal(listed, 3, tabOf)).toMatchObject({
			after: "a.Two",
			before: "b.One",
			groups: [
				{ tabId: MAIN, groupId: "G1" },
				{ tabId: MAIN, groupId: "G2" },
			],
		});
	});
	it("leaves the moving command out, and tries its own group first", () => {
		expect(placementGoal(listed, 2, tabOf, "b.One")).toMatchObject({
			after: "a.One",
			before: "a.Two",
			groups: [
				{ tabId: MAIN, groupId: "G2" },
				{ tabId: MAIN, groupId: "G1" },
			],
			moving: { tabId: MAIN, groupId: "G2", buttonId: "b.One" },
		});
	});
	it("moves one place: before the command before it, after the one after it", () => {
		expect(moveGap(listed, "a.Two", "earlier")).toBe(1);
		expect(moveGap(listed, "a.Two", "later")).toBe(4);
		expect(moveGap(listed, "a.One", "earlier")).toBeNull();
		expect(moveGap(listed, "b.One", "later")).toBeNull();
	});
});

describe("#191 C5 the Sequence the platform's merge draws there (review)", () => {
	// The XML has C (30) before B (20): the bar draws A C B X, not Sequence order.
	const tabs = oneGroup([
		loaded("A", 10, 0),
		loaded("C", 30, 1),
		loaded("B", 20, 2),
		loaded("X", 40, 3),
	]);
	const shown = ["A", "C", "B", "X"];
	it("checks every plan against the bar itself", () => {
		expect(drawn(tabs)).toEqual(["A", "C", "B", "X"]);
		const plan = planPlacement({ tabs }, goal("A", "C", shown))!;
		expect(plan).toMatchObject({ groupId: "G" });
		const probe = oneGroup([...tabs[0].groups[0].buttons, button("new", plan.sequence)]);
		expect(drawn(probe)).toEqual(["A", "new", "C", "B", "X"]);
	});
	it("finds no Sequence where the merge can't put it, rather than moving it elsewhere", () => {
		// Anything moved or new goes before the first control with a greater Sequence: never
		// between C (30) and B (20).
		expect(planPlacement({ tabs }, goal("C", "B", shown, "X"))).toBeNull();
		expect(planPlacement({ tabs }, goal("C", "B", shown, "A"))).toBeNull();
		expect(planPlacement({ tabs }, goal("C", "B", shown))).toBeNull();
	});
	it("moves past a modern command by the slot its sequence names", () => {
		// Modern M names control slot 15 of this group (tab 100, group 10): A M B.
		const m = {
			id: "m",
			sequence: 1_000_000_000 + 10 * 10_000 + 15,
			hidden: false,
			disabled: false,
		} as ModernCommand;
		const two = oneGroup([loaded("A", 10, 0), loaded("B", 20, 1)]);
		expect(barOrder({ tabs: two, modern: [m] }).map((e) => e.id)).toEqual([
			"A",
			"modern:m",
			"B",
		]);
		const plan = planPlacement(
			{ tabs: two, modern: [m] },
			goal("modern:m", "B", ["A", "modern:m", "B"], "A"),
		)!;
		expect(plan.sequence).toBeGreaterThan(15);
		expect(plan.sequence).toBeLessThan(20);
		expect(
			barOrder({ tabs: withSequence(two, "A", plan.sequence), modern: [m] }).map((e) => e.id),
		).toEqual(["modern:m", "A", "B"]);
	});
	it("never takes a Sequence another control of the group has", () => {
		const plan = planPlacement({ tabs }, goal("A", "C", shown))!;
		expect([10, 20, 30, 40]).not.toContain(plan.sequence);
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

	it("says so, and changes nothing, where no Sequence puts it", () => {
		// G1's XML has a.Three (30) before a.Two (20): nothing can go between them.
		act(() =>
			useRibbonStore.setState((s) => {
				const t = s.ribbons.HomepageGrid.tabs[0];
				const g1 = t.groups[0];
				const at = (id: string, sequence: number, index: number) => ({
					...g1.buttons.find((b) => b.id === id)!,
					sequence,
					source: {
						position: { groupId: "G1", index },
						attributes: { Id: id, Sequence: String(sequence) },
					},
				});
				return {
					ribbons: {
						...s.ribbons,
						HomepageGrid: {
							...s.ribbons.HomepageGrid,
							tabs: [
								{
									...t,
									groups: [
										{
											...g1,
											buttons: [
												at("a.One", 10, 0),
												at("a.Three", 30, 1),
												at("a.Two", 20, 2),
											],
										},
										t.groups[1],
									],
								},
							],
						},
					},
				};
			}),
		);
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(bar().slice(0, 3)).toEqual(["a.One", "a.Three", "a.Two"]);
		const history = useRibbonStore.getState().past.length;
		act(() => {
			cmd("a.One").dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }),
			);
		});
		expect(bar().slice(0, 3)).toEqual(["a.One", "a.Three", "a.Two"]);
		expect(useRibbonStore.getState().past.length).toBe(history);
		expect(useUIStore.getState().announcement).toMatch(
			/^Can't move a\.One between a\.Three and a\.Two: no Sequence puts it there/,
		);
	});

	it("drags a command to a gap, with a line where it will go", async () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		const slotOf = (id: string) => cmd(id).parentElement!;
		await act(async () => {
			cmd("a.Three").dispatchEvent(dragEvent("dragstart"));
			// The drag state follows dragstart (Chromium can end a drag the page changes during).
			await new Promise((r) => setTimeout(r, 0));
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

	it("drops where the pointer is, even before a drop line was drawn", async () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		await act(async () => {
			cmd("a.Three").dispatchEvent(dragEvent("dragstart"));
			await new Promise((r) => setTimeout(r, 0));
		});
		act(() => {
			cmd("a.One").parentElement!.dispatchEvent(dragEvent("drop", -1));
		});
		expect(bar().slice(0, 2)).toEqual(["a.Three", "a.One"]);
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

	it("doesn't offer to move a menu that isn't yours (publish can't move it)", () => {
		act(() =>
			useRibbonStore.setState((s) => {
				const t = s.ribbons.HomepageGrid.tabs[0];
				const g2 = t.groups[1];
				return {
					ribbons: {
						...s.ribbons,
						HomepageGrid: {
							...s.ribbons.HomepageGrid,
							tabs: [
								{
									...t,
									groups: [
										t.groups[0],
										{
											...g2,
											buttons: g2.buttons.map((b) =>
												b.id === "b.Theirs"
													? { ...b, kind: "flyout" as const }
													: b,
											),
										},
									],
								},
							],
						},
					},
				};
			}),
		);
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(cmd("b.Theirs").getAttribute("draggable")).toBeNull();
		act(() => {
			cmd("b.Theirs").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		});
		const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
			(i) => i.textContent,
		);
		expect(items).toEqual(["Add a button before", "Add a button after"]);
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
			newButtonPlace: { sequence: 15, where: "before “a.Two”" },
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
			newButtonPlace: { sequence: 40, where: "before “b.One”" },
		});
		act(() => useUIStore.getState().closeNewButton());
		// The gap before a.Two: in G1, before it.
		act(() => marker(gap - 2).click());
		expect(document.body.textContent).toContain("It goes before “a.Two”.");
		const create = [...document.querySelectorAll("button")].find(
			(b) => b.textContent === "Create button",
		)!;
		act(() => create.click());
		const added = useSelectionStore.getState().selectedButtonId!;
		expect(bar().slice(0, 3)).toEqual(["a.One", added, "a.Two"]);
		// In Sequence order, as the group views list them (the store appends a new one).
		expect(
			[...group("G1")].sort((x, y) => Number(x.split("@")[1]) - Number(y.split("@")[1])),
		).toEqual(["a.One@10", `${added}@15`, "a.Two@20", "a.Three@30"]);
		// The button and its place are one undo step.
		act(() => useRibbonStore.getState().undo());
		expect(group("G1")).toEqual(["a.One@10", "a.Two@20", "a.Three@30"]);
	});

	it("offers editing on Simulate's classic commands only, and on no bar drawn without it", () => {
		render(<SimulateCanvas location="HomepageGrid" />);
		expect(container.querySelectorAll("[data-insert-gap]").length).toBeGreaterThan(0);
		expect(cmd("a.One").getAttribute("draggable")).toBe("true");
		expect(cmd("a.One").getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowLeft Alt+ArrowRight");
		// Unified Interface's own items don't move.
		const showChart = container.querySelector<HTMLElement>('[data-simulated="ShowChartPane"]');
		expect(showChart?.getAttribute("draggable")).toBeNull();
		// The same bar without Simulate's editing: nothing to add or drag.
		render(
			<D365CommandBar
				label="Commands"
				commands={[
					{
						entry: classic("a.One", "G1"),
						text: "a.One",
						selected: false,
						mine: true,
						onChoose: () => {},
					},
				]}
			/>,
		);
		expect(container.querySelectorAll("[data-insert-gap]")).toHaveLength(0);
		expect(cmd("a.One").getAttribute("draggable")).toBeNull();
	});
});
