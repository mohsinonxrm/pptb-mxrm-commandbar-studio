/**
 * #185: the bottom panel's Commands and rules are grids (virtualized, a fixed
 * header, ids truncated with a tooltip, one target per row and an Edit
 * button) whose rule tags tell rules apart; its tabs count with badges and a
 * tab opens a collapsed panel; filters are SearchBoxes; usage is counted once,
 * the same way everywhere; and the Solution tab makes either kind of rule.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { BottomPanel } from "@/components/bottom-panel/BottomPanel";
import { SolutionElementsPane } from "@/components/left-pane/SolutionElementsPane";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { ribbonUsage } from "@/utils/usage";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

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
const button = (id: string, commandId: string) =>
	({
		id,
		label: id,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId,
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
	}) as RibbonButton;

const homeGrid = (): RibbonDefinition => ({
	location: "HomepageGrid",
	entityLogicalName: "account",
	tabs: [
		{
			id: MAIN,
			label: "Account",
			sequence: 10,
			commandId: "mxrm.Tab.Command",
			tabDisplayRules: [],
			groups: [
				{
					id: "G",
					label: "G",
					sequence: 10,
					template: "Flexible2",
					buttons: [
						button("x.A", "mxrm.Approve.Command"),
						button("x.B", "mxrm.Approve.Command"),
					],
				},
			],
		},
	],
});
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();

function render(ui: React.ReactElement) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
const click = (el: Element | null | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
const tab = (name: string) =>
	[...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
		t.textContent?.startsWith(name),
	)!;
const elementRow = (id: string) =>
	container.querySelector<HTMLElement>(`[data-element-row="${id}"]`)!;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState({ ...initialUI, bottomPanelHeight: 600 }, true);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: homeGrid(),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [
			{
				id: "mxrm.Approve.Command",
				enableRules: [
					"Mscrm.EnableRule.ExactlyOneSelected",
					"mxrm.account.IsActive.EnableRule",
				],
				displayRules: ["mxrm.account.ShowOnForm.DisplayRule"],
				actions: [{ kind: "javascript" } as never],
			},
			{ id: "mxrm.Tab.Command", enableRules: [], displayRules: [], actions: [] },
		],
		displayRules: [{ id: "mxrm.account.ShowOnForm.DisplayRule", steps: [] }],
		enableRules: [
			{ id: "Mscrm.EnableRule.ExactlyOneSelected", steps: [] },
			{ id: "mxrm.account.IsActive.EnableRule", steps: [] },
		],
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

describe("#185 ribbonUsage", () => {
	it("counts a command's tabs, groups and controls, and a rule's commands per kind", () => {
		const s = useRibbonStore.getState();
		const ribbons = structuredClone(s.ribbons);
		const g = ribbons.HomepageGrid.tabs[0].groups[0];
		// A group's own Command, a menu item, and a control's PopulateQueryCommand.
		g.source = { attributes: { Command: "mxrm.Approve.Command" } };
		g.buttons[0].kind = "flyout";
		g.buttons[0].menu = {
			id: "m",
			sections: [
				{
					id: "s",
					sequence: 10,
					controlsId: "s.Controls",
					controls: [button("x.Item", "mxrm.Approve.Command")],
				},
			],
		};
		g.buttons[1].source = {
			attributes: { PopulateQueryCommand: "mxrm.Populate.Command" },
		};
		const u = ribbonUsage(ribbons, [
			...s.commands,
			{ id: "twice", enableRules: ["R", "R"], displayRules: ["R"], actions: [] },
		]);
		// Two controls, the group and the menu item.
		expect(u.byCommand.get("mxrm.Approve.Command")).toBe(4);
		expect(u.byCommand.get("mxrm.Populate.Command")).toBe(1);
		expect(u.byCommand.get("mxrm.Tab.Command")).toBe(1);
		expect(u.byEnable.get("R")).toBe(1);
		expect(u.byDisplay.get("R")).toBe(1);
	});
});

describe("#185 the bottom panel", () => {
	it("counts in badges on its tabs, and a tab opens the collapsed panel", () => {
		useUIStore.setState({ bottomCollapsed: true });
		render(<BottomPanel />);
		expect(tab("Commands").querySelector(".fui-CounterBadge")?.textContent).toBe("2");
		expect(tab("Enable rules").querySelector(".fui-CounterBadge")?.textContent).toBe("2");
		click(tab("Display rules"));
		expect(useUIStore.getState().bottomCollapsed).toBe(false);
		expect(useUIStore.getState().activeBottomTab).toBe("displayRules");
	});

	it("lists commands in a grid; rule tags tell rules apart and open them", () => {
		const openRuleEditor = vi.fn();
		const openCommandEditor = vi.fn();
		useUIStore.setState({
			bottomCollapsed: false,
			activeBottomTab: "commands",
			openRuleEditor,
			openCommandEditor,
		});
		render(<BottomPanel />);
		expect(container.querySelector('[role="grid"][aria-label="Commands"]')).toBeTruthy();
		expect(container.querySelector('input[aria-label="Filter the commands"]')).toBeTruthy();
		const row = elementRow("mxrm.Approve.Command");
		expect(row.textContent).toContain("JS");
		expect(row.textContent).toContain("2 controls");
		const tags = [...row.querySelectorAll("button")].map((b) => b.textContent);
		expect(tags).toEqual(
			expect.arrayContaining(["ExactlyOneSelected", "IsActive", "ShowOnForm"]),
		);
		expect(tags).not.toContain("EnableRule");
		click([...row.querySelectorAll("button")].find((b) => b.textContent === "IsActive"));
		expect(openRuleEditor).toHaveBeenCalledWith("mxrm.account.IsActive.EnableRule", "enable");

		// The row selects; Edit, Enter or a double-click opens.
		// Marking a row keeps it the same element, so the focus stays on it (review).
		const marked = elementRow("mxrm.Approve.Command");
		marked.focus();
		act(() => {
			marked.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		});
		expect(marked.isConnected).toBe(true);
		expect(marked.getAttribute("aria-current")).toBe("true");
		expect(document.activeElement).toBe(marked);
		expect(openCommandEditor).not.toHaveBeenCalled();
		click(
			elementRow("mxrm.Approve.Command").querySelector(
				'button[aria-label="Edit mxrm.Approve.Command"]',
			),
		);
		expect(openCommandEditor).toHaveBeenCalledWith("mxrm.Approve.Command");
		act(() => {
			elementRow("mxrm.Tab.Command").dispatchEvent(
				new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
			);
		});
		expect(openCommandEditor).toHaveBeenLastCalledWith("mxrm.Tab.Command");
	});

	it("lists rules without the constant Type column, used per kind", () => {
		useUIStore.setState({ bottomCollapsed: false, activeBottomTab: "enableRules" });
		render(<BottomPanel />);
		const headers = [...container.querySelectorAll('[role="columnheader"]')].map((h) =>
			h.textContent?.trim(),
		);
		expect(headers).toEqual(["Rule", "Steps", "Used by", ""]);
		expect(elementRow("Mscrm.EnableRule.ExactlyOneSelected").textContent).toContain(
			"1 command",
		);
	});
});

describe("#185 the Solution tab", () => {
	it("makes an enable rule or a display rule, as chosen", () => {
		const openRuleEditor = vi.fn();
		useUIStore.setState({ openRuleEditor });
		render(<SolutionElementsPane />);
		const openNew = () =>
			click(container.querySelector('button[aria-label="New command or rule"]'));
		const item = (name: string) =>
			[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
				(m) => m.textContent === name,
			);
		openNew();
		click(item("New display rule"));
		expect(openRuleEditor).toHaveBeenLastCalledWith(expect.any(String), "display");
		const id = openRuleEditor.mock.calls.at(-1)![0] as string;
		expect(useRibbonStore.getState().displayRules.some((r) => r.id === id)).toBe(true);
		openNew();
		click(item("New enable rule"));
		expect(openRuleEditor).toHaveBeenLastCalledWith(expect.any(String), "enable");
	});
});
