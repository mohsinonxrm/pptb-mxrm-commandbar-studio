/**
 * #22 — properties-pane / state correctness: exact LocLabel matching in the
 * Identity section, a solution switch resetting table-scoped state, and stable
 * React keys for rule steps.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IdentitySection } from "@/components/properties-pane/IdentitySection";
import { RuleEditorPanel } from "@/components/panels/RuleEditorPanel";
import { CommandEditorPanel } from "@/components/panels/CommandEditorPanel";
import { useStableKeys } from "@/hooks/useStableKeys";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { buttonTranslationLcids } from "@/utils/locLabelRef";
import type { LocLabel, RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { Solution } from "@/types/solution";
import type { EntityMetadata } from "@/types/entity";

// The first render of a Fluent drawer takes seconds when the full suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's drawer (the Command Editor) uses one.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;

const button = (id: string, extra: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: `${id}.Command`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...extra,
});

const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: T, tabs: [] });

function loadTable(buttons: RibbonButton[], locLabels: LocLabel[] = []) {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: {
				location: "HomepageGrid",
				entityLogicalName: T,
				tabs: [
					{
						id: MAIN,
						label: "Main",
						sequence: 10,
						tabDisplayRules: [],
						groups: [{ id: GROUP, label: "Management", sequence: 10, template: "Mscrm.Templates.Flexible2", buttons }],
					},
				],
			},
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: buttons.map((b) => ({ id: b.commandId, enableRules: [], displayRules: [], actions: [] })),
		enableRules: [],
		displayRules: [{ id: "cbs.Rule", steps: [] }],
		locLabels,
	});
}

const title = (languageCode: number, description: string) => ({ languageCode, description });

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
	useUIStore.getState().closeRuleEditor();
	useUIStore.getState().closeCommandEditor();
});

describe("#22 — Identity section translations match the button's own labels", () => {
	// `Foo.Button2`'s labels sort first, so a prefix match picks them for `Foo.Button`.
	const labels: LocLabel[] = [
		{ id: "Foo.Button2.LabelText", titles: [title(1033, "Two"), title(1031, "Zwei")] },
		{ id: "Foo.Button.LabelText", titles: [title(1033, "One")] },
	];

	it("ignores labels of a button whose id only starts with this one", () => {
		expect(buttonTranslationLcids(button("Foo.Button"), labels)).toEqual([1033]);
		expect(buttonTranslationLcids(button("Foo.Button2"), labels)).toEqual([1033, 1031]);
		expect(buttonTranslationLcids(button("Foo.Butt"), labels)).toEqual([]);
	});

	it("uses the labels the button references (a Ribbon Workbench label id)", () => {
		const rw = button("Foo.Button", {
			source: {
				labelToken: "$LocLabels:rw.Foo.Label",
				tooltipTitleToken: "$LocLabels:rw.Foo.Tip",
				attributes: {},
			},
		});
		const all: LocLabel[] = [
			...labels,
			{ id: "rw.Foo.Label", titles: [title(1033, "One"), title(1036, "Un")] },
			{ id: "rw.Foo.Tip", titles: [title(1043, "Een")] },
		];
		// The convention tooltip-body id still counts; LabelText's isn't referenced any more.
		expect(buttonTranslationLcids(rw, all)).toEqual([1033, 1036, 1043]);
		expect(buttonTranslationLcids(rw, all, 1036)).toEqual([1036, 1033, 1043]);
	});

	it("shows only the button's own languages in the pane", () => {
		const b = button("Foo.Button");
		loadTable([b, button("Foo.Button2", { sequence: 20 })], labels);
		act(() => root.render(<IdentitySection button={b} location="HomepageGrid" tabId={MAIN} groupId={GROUP} />));
		const chips = container.textContent ?? "";
		expect(chips).toContain("en-US");
		expect(chips).not.toContain("1031");
	});
});

describe("#22 — switching solution resets table-scoped state", () => {
	const solution = (id: string): Solution =>
		({ id, uniqueName: id, friendlyName: id, version: "1.0.0.0", publisherPrefix: "cbs" }) as Solution;
	const entity = { logicalName: T, metadataId: "m1" } as EntityMetadata;

	beforeEach(() => {
		useSessionStore.setState({ activeSolution: null, activeEntity: null, entities: [] });
		useSessionStore.getState().setActiveSolution(solution("A"));
		useSessionStore.getState().setEntities([entity]);
		useSessionStore.getState().setActiveEntity(entity);
		useSessionStore.getState().setSolutionEntityIds(["m1"]);
		loadTable([button("cbs.One")]);
		useRibbonStore.getState().setButtonProp("HomepageGrid", MAIN, GROUP, "cbs.One", { label: "Edited" });
		useSelectionStore.getState().selectButtonInContext("HomepageGrid", MAIN, GROUP, "cbs.One");
	});

	it("clears the table list, the table, its ribbon, history and selection", () => {
		useSessionStore.getState().setActiveSolution(solution("B"));
		const session = useSessionStore.getState();
		expect(session.activeSolution?.id).toBe("B");
		expect(session.entities).toEqual([]);
		expect(session.activeEntity).toBeNull();
		expect(session.solutionEntityIds).toBeNull();
		const ribbon = useRibbonStore.getState();
		expect(ribbon.ribbons.HomepageGrid.tabs).toEqual([]);
		expect(ribbon.baseline.HomepageGrid.tabs).toEqual([]);
		expect(ribbon.commands).toEqual([]);
		expect(ribbon.displayRules).toEqual([]);
		expect(ribbon.past).toEqual([]);
		expect(ribbon.mutationsSincePublish).toBe(0);
		expect(useSelectionStore.getState().selectedButtonId).toBeNull();
	});

	it("keeps everything when the active solution is picked again", () => {
		useSessionStore.getState().setActiveSolution(solution("A"));
		expect(useSessionStore.getState().activeEntity).toBe(entity);
		expect(useSessionStore.getState().entities).toEqual([entity]);
		expect(useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0].buttons[0].label).toBe("Edited");
		expect(useSelectionStore.getState().selectedButtonId).toBe("cbs.One");
	});
});

describe("#22 — rule steps keep their React keys", () => {
	function openRule() {
		loadTable([button("cbs.One")]);
		useRibbonStore.getState().upsertDisplayRule({
			id: "cbs.Rule",
			steps: [
				{ kind: "FormStateRule", state: "Create" },
				{ kind: "CommandClientTypeRule", type: "Refresh" },
				{ kind: "FormStateRule", state: "Existing" },
			],
		});
		useUIStore.getState().openRuleEditor("cbs.Rule", "display");
		act(() => root.render(<RuleEditorPanel />));
	}
	const items = () => Array.from(document.querySelectorAll('ol[aria-label="Rule steps"] > li'));

	it("removing a step leaves the other steps' elements in place", () => {
		openRule();
		const [, second, third] = items();
		expect(items()).toHaveLength(3);
		const remove = document.querySelector<HTMLButtonElement>('button[aria-label="Remove FormStateRule step"]')!;
		act(() => remove.click());
		expect(useRibbonStore.getState().displayRules.find((r) => r.id === "cbs.Rule")?.steps).toHaveLength(2);
		// With index keys React reused the first two <li>s for the remaining
		// steps (and dropped the last), so each step's inputs moved up one.
		expect(items()).toEqual([second, third]);
	});

	it("steps changed from elsewhere (an undo of a move) get new elements, not stale ones", () => {
		openRule();
		const before = items();
		const rule = useRibbonStore.getState().displayRules.find((r) => r.id === "cbs.Rule")!;
		// Same number of steps, other order: as an undo / redo of a move leaves it.
		act(() =>
			useRibbonStore.getState().upsertDisplayRule({
				...rule,
				steps: [rule.steps[1], rule.steps[0], rule.steps[2]],
			}),
		);
		expect(items()).toHaveLength(3);
		for (const li of items()) expect(before).not.toContain(li);
	});
});

describe("#22 review — useStableKeys", () => {
	type Api = ReturnType<typeof useStableKeys>;
	let api: Api;
	function Harness({ items }: { items: readonly string[] }) {
		api = useStableKeys("scope", items);
		return null;
	}
	const render = (items: readonly string[]) => act(() => root.render(<Harness items={items} />));
	/** Our change and the list the store makes of it, in one update (as in the panel's event handlers). */
	const change = (op: () => void, items: readonly string[]) =>
		act(() => {
			op();
			root.render(<Harness items={items} />);
		});

	it("keys follow a move, and are made anew when the list is replaced from elsewhere (undo)", () => {
		const original = ["A", "B", "C"];
		render(original);
		const [kA, kB, kC] = api.keys;
		change(() => api.move(0, 1), ["B", "A", "C"]);
		expect(api.keys).toEqual([kB, kA, kC]);
		// Undo restores the original list: no key may stay on the wrong item.
		render(original);
		expect(api.keys).toHaveLength(3);
		expect(api.keys[0]).not.toBe(kB);
		expect(api.keys[1]).not.toBe(kA);
		for (const k of api.keys) expect([kA, kB, kC]).not.toContain(k);
	});

	it("an edit in place keeps every key", () => {
		render(["A", "B"]);
		const keys = api.keys;
		change(() => api.update(), ["A2", "B"]);
		expect(api.keys).toEqual(keys);
	});

	it("an edit the store ignores doesn't let the next list from elsewhere keep the keys", () => {
		// e.g. a non-digit typed in a version field (no change), then Ctrl+Z of a move.
		const list = ["A", "B"];
		render(list);
		const [kA, kB] = api.keys;
		change(() => api.update(), list);
		expect(api.keys).toEqual([kA, kB]);
		render(["B", "A"]);
		expect(api.keys[0]).not.toBe(kA);
		expect(api.keys[1]).not.toBe(kB);
		for (const k of api.keys) expect([kA, kB]).not.toContain(k);
	});

	it("re-rendering the same list keeps the keys", () => {
		const list = ["A", "B"];
		render(list);
		const keys = api.keys;
		render(list);
		expect(api.keys).toEqual(keys);
	});
});

describe("#22 review — the Command Editor after an undo", () => {
	it("closes when the command it shows is undone away", () => {
		loadTable([button("cbs.One")]);
		act(() => root.render(<CommandEditorPanel />));
		act(() => {
			useRibbonStore.getState().setOpenRecordOverride("HomepageGrid", true, "cbs");
			useUIStore.getState().openCommandEditor("Mscrm.OpenRecordItem");
		});
		expect(useUIStore.getState().commandEditorOpen).toBe(true);
		act(() => useRibbonStore.getState().undo());
		expect(useRibbonStore.getState().commands.some((c) => c.id === "Mscrm.OpenRecordItem")).toBe(false);
		expect(useUIStore.getState().commandEditorOpen).toBe(false);
		// A redo doesn't pop the editor up again.
		act(() => useRibbonStore.getState().redo());
		expect(useUIStore.getState().commandEditorOpen).toBe(false);
	});
});
