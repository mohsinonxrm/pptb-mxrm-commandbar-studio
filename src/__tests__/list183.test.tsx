/**
 * #183: Edit mode's List. A grid as tall as its rows (the canvas scrolls),
 * default columns that fit, ID and Command in a Columns menu, real sorting,
 * friendly kind labels, row selection without radios, and the shared button
 * menu on each row.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { RibbonListView } from "@/components/ribbon-canvas/RibbonListView";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { RibbonButton, RibbonDefinition, RibbonLocation, RibbonTab } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const MAIN = "Mscrm.HomepageGrid.account.MainTab";
const button = (id: string, label: string, sequence: number, extra: Partial<RibbonButton> = {}) =>
	({
		id,
		label,
		kind: "button",
		sequence,
		templateAlias: "o1",
		commandId: `${id}.Command`,
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		...extra,
	}) as RibbonButton;

const TAB: RibbonTab = {
	id: MAIN,
	label: "Account",
	sequence: 10,
	tabDisplayRules: [],
	// Out of Sequence order, as loaded XML can be.
	groups: [
		{
			id: "G.Actions",
			label: "Actions",
			sequence: 20,
			template: "Flexible2",
			buttons: [button("x.Share", "Share", 10)],
		},
		{
			id: "G.Mgmt",
			label: "Management",
			sequence: 10,
			template: "Flexible2",
			buttons: [
				button("x.Delete", "Delete", 30, { kind: "splitButton" }),
				button("x.Assign", "Assign", 20),
			],
		},
	],
};
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;

function render() {
	function List() {
		const tab = useRibbonStore((s) => s.ribbons.HomepageGrid.tabs[0]);
		return <RibbonListView tab={tab} location="HomepageGrid" />;
	}
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<List />
			</FluentProvider>,
		),
	);
}
const rowIds = () =>
	[...container.querySelectorAll<HTMLElement>("[data-list-button]")].map((r) =>
		r.getAttribute("data-list-button"),
	);
const row = (id: string) => container.querySelector<HTMLElement>(`[data-list-button="${id}"]`)!;
const headers = () =>
	[...container.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent?.trim());
const header = (name: string) =>
	[...container.querySelectorAll<HTMLElement>('[role="columnheader"]')].find(
		(h) => h.textContent?.trim() === name,
	)!;
const click = (el: Element | null | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
	act(() => {
		el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
	});

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: { ...empty("HomepageGrid"), tabs: [structuredClone(TAB)] },
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#183 the List", () => {
	it("lists the tab's buttons in the order shown, with columns that fit and friendly kinds", () => {
		render();
		expect(rowIds()).toEqual(["x.Assign", "x.Delete", "x.Share"]);
		expect(headers()).toEqual(["#", "Label", "Kind", "Group", "Visible", ""]);
		expect(row("x.Delete").textContent).toContain("Split button");
		expect(row("x.Delete").textContent).not.toContain("splitButton");
		// No radios: a row is selected like anything else.
		expect(container.querySelector('input[type="radio"]')).toBeNull();
	});

	it("sorts by a column, both ways, and keeps the sort when a column is shown", () => {
		render();
		const sortBy = (name: string) =>
			click(header(name).querySelector("button") ?? header(name));
		// Group: Actions before Management (the shown order has Management first).
		sortBy("Group");
		expect(rowIds()).toEqual(["x.Share", "x.Assign", "x.Delete"]);
		sortBy("Label");
		sortBy("Label");
		expect(rowIds()).toEqual(["x.Share", "x.Delete", "x.Assign"]);
		click([...container.querySelectorAll("button")].find((b) => b.textContent === "Columns"));
		click(
			[...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
				(m) => m.textContent === "Command",
			),
		);
		expect(rowIds()).toEqual(["x.Share", "x.Delete", "x.Assign"]);
	});

	it("filters on the label as loaded too", () => {
		useRibbonStore.setState((s) => {
			const r = structuredClone(s.ribbons);
			r.HomepageGrid.tabs[0].groups[0].buttons[0].label = "$LocLabels:share.Label";
			return { ribbons: r };
		});
		render();
		const search = container.querySelector<HTMLInputElement>(
			'input[aria-label="Filter the buttons"]',
		)!;
		act(() => {
			Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
				search,
				"share.label",
			);
			search.dispatchEvent(new Event("input", { bubbles: true }));
		});
		expect(rowIds()).toEqual(["x.Share"]);
	});

	it("shows ID and Command from the Columns menu", () => {
		render();
		click([...container.querySelectorAll("button")].find((b) => b.textContent === "Columns"));
		click(
			[...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')].find(
				(m) => m.textContent === "ID",
			),
		);
		expect(headers()).toContain("ID");
		expect(row("x.Share").textContent).toContain("x.Share");
		expect(headers()).not.toContain("Command");
	});

	it("selects a row by click or Enter, without the Visible switch selecting it", () => {
		render();
		click(row("x.Share"));
		expect(useSelectionStore.getState()).toMatchObject({
			selectedGroupId: "G.Actions",
			selectedButtonId: "x.Share",
		});
		expect(row("x.Share").getAttribute("aria-selected")).toBe("true");
		key(row("x.Assign"), "Enter");
		expect(useSelectionStore.getState().selectedButtonId).toBe("x.Assign");

		click(row("x.Delete").querySelector('[role="switch"]'));
		expect(useSelectionStore.getState().selectedButtonId).toBe("x.Assign");
		expect(
			useRibbonStore
				.getState()
				.ribbons.HomepageGrid.tabs[0].groups[1].buttons.find((b) => b.id === "x.Delete")
				?.hidden,
		).toBe(true);
	});

	it("each row has the shared button menu: ⋯, right-click, Shift+F10, without selecting it", async () => {
		render();
		const menuLabel = () => document.querySelector('[role="menu"]')?.getAttribute("aria-label");
		click(container.querySelector('button[aria-label="Actions for Share"]'));
		expect(menuLabel()).toBe("Actions for Share");
		key(document.querySelector('[role="menu"]')!, "Escape");
		act(() => {
			row("x.Delete").dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			);
		});
		expect(menuLabel()).toBe("Actions for Delete");
		key(document.querySelector('[role="menu"]')!, "Escape");
		key(row("x.Assign"), "F10", { shiftKey: true });
		expect(menuLabel()).toBe("Actions for Assign");
		// Opening a menu doesn't select: in a narrow window that opens Properties,
		// which takes the focus and closes the menu.
		expect(useSelectionStore.getState().selectedButtonId).toBeNull();
		key(document.querySelector('[role="menu"]')!, "Escape");
		await act(() => new Promise((r) => setTimeout(r)));
		expect(document.activeElement).toBe(row("x.Assign"));
	});
});
