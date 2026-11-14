/**
 * #186 PR 3: the rule view (numbered steps that move, Rename in the header,
 * the commands that use it) and a tab's display rules as a view of the editor
 * drawer, applied as you edit.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import type { CommandDefinition, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

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

const T = "cbstest_ribbontest";
const MINE = "cbstest.Approve.EnableRule";
const THEIRS = "Mscrm.Enabled";
const TAB = `cbstest.${T}.Tools.Tab`;
const steps = [
	{ kind: "FormStateRule", state: "Existing" },
	{ kind: "SelectionCountRule", minimum: 1 },
];
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs:
		location === "HomepageGrid"
			? [
					{
						id: TAB,
						label: "Tools",
						sequence: 500,
						commandId: `${TAB}.Command`,
						tabDisplayRules: [],
						groups: [],
					},
				]
			: [],
});

const store = () => useRibbonStore.getState();
const ui = () => useUIStore.getState();

let container: HTMLDivElement;
let root: Root;
const until = async (ready: () => boolean) => {
	for (let i = 0; i < 250 && !ready(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 20)));
	expect(ready()).toBe(true);
};
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const buttonNamed = (text: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
	);
const menuItem = (text: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
		(m) => m.textContent?.trim() === text,
	)!;
const loaded = () => !!drawer() && !drawer().textContent?.includes("Loading…");

beforeEach(() => {
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid"),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [
			{
				id: "cbstest.Approve.Command",
				enableRules: [MINE, THEIRS],
				displayRules: [],
				actions: [],
			} as CommandDefinition,
		],
		displayRules: [],
		enableRules: [
			{ id: MINE, steps },
			{ id: THEIRS, steps: [] },
		],
		locLabels: [],
		layers: {
			entity: { controlIds: [], containerIds: [TAB], locLabelIds: [], hides: [] },
			application: null,
		},
	} as never);
	act(() => ui().closeEditor());
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<EditorDrawer />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#186 the rule view", () => {
	it("numbers the steps, moves one from ⋮, and says who uses the rule", async () => {
		act(() => ui().openRuleEditor(MINE, "enable"));
		await until(loaded);
		expect(drawer().textContent).toContain("Used by 1 command");
		expect(drawer().textContent).toContain("Passes when every step below is true.");
		const list = drawer().querySelector('ol[aria-label="Rule steps"]')!;
		expect([...list.children].every((c) => c.tagName === "LI")).toBe(true);
		expect(list.textContent).toMatch(/^1\..*2\./);
		expect(drawer().textContent).not.toMatch(/\bDrag\b|ALL must pass|Apply ID change/);

		act(() => buttonNamed("More for step 1")!.click());
		await until(() => !!menuItem("Move down"));
		act(() => menuItem("Move down").click());
		expect(
			store()
				.enableRules.find((r) => r.id === MINE)!
				.steps.map((s) => s.kind),
		).toEqual(["SelectionCountRule", "FormStateRule"]);
	});

	it("renames your rule from the header; Microsoft's keep their ids", async () => {
		act(() => ui().openRuleEditor(THEIRS, "enable"));
		await until(loaded);
		expect(buttonNamed("Rename rule ID")).toBeUndefined();
		// An empty rule says so, outside the list.
		expect(drawer().querySelector('ol[aria-label="Rule steps"]')).toBeNull();
		expect(drawer().textContent).toContain("No steps yet.");

		act(() => ui().openRuleEditor(MINE, "enable"));
		await until(() => !!buttonNamed("Rename rule ID"));
		act(() => buttonNamed("Rename rule ID")!.click());
		const field = [...drawer().querySelectorAll<HTMLInputElement>("input")].find(
			(i) => i.value === MINE && !i.readOnly,
		)!;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
		act(() => {
			setter.call(field, "cbstest.Approve.Renamed");
			field.dispatchEvent(new Event("input", { bubbles: true }));
		});
		act(() => buttonNamed("Rename")!.click());
		expect(ui().ruleEditorId).toBe("cbstest.Approve.Renamed");
		expect(store().commands[0].enableRules).toContain("cbstest.Approve.Renamed");
	});
});

describe("#186 a tab's display rules in the drawer", () => {
	it("open as a view, apply as you edit, and Done leaves one undo step", async () => {
		const before = store().past.length;
		act(() => ui().openTabDisplayRules("HomepageGrid", TAB));
		await until(() => loaded() && !!buttonNamed("Add step"));
		expect(drawer().textContent).toContain("Tab display rules");
		expect(drawer().querySelector("input")?.value).toBe(TAB);
		expect(ui().tabDisplayRulesOpen).toBe(true);

		act(() => buttonNamed("Add step")!.click());
		act(() => buttonNamed("Add step")!.click());
		expect(store().ribbons.HomepageGrid.tabs[0].tabDisplayRules[0].rules).toHaveLength(2);
		act(() => buttonNamed("Done")!.click());
		await until(() => ui().editorStack.length === 0);
		expect(store().past.length).toBe(before + 1);
		act(() => store().undo());
		expect(store().ribbons.HomepageGrid.tabs[0].tabDisplayRules).toEqual([]);
	});
});
