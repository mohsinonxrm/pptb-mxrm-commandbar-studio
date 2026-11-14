/**
 * #194, step 5: the left pane's Solution tab as one tree (Buttons, Commands,
 * Rules, Templates, each with a count), searched together; rows show the
 * distinguishing part of the id and how much it's used; a button is reused
 * with Add to group.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { SolutionElementsPane } from "@/components/left-pane/SolutionElementsPane";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { distinguishingSegment } from "@/utils/idSegment";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIN = "Mscrm.HomepageGrid.account.MainTab";
const button = (id: string, label: string, sequence: number, extra: Partial<RibbonButton> = {}) =>
	({
		id,
		label,
		kind: "button",
		sequence,
		templateAlias: "o1",
		commandId: "mxrm.account.Approve.Command",
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		...extra,
	}) as RibbonButton;

const homeGrid = (): RibbonDefinition => ({
	location: "HomepageGrid",
	entityLogicalName: "account",
	tabs: [
		{
			id: MAIN,
			label: "Account",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{
					id: `${MAIN}.Management`,
					label: "Management",
					sequence: 10,
					template: "Flexible2",
					buttons: [
						button("mxrm.account.Approve", "Approve", 10),
						button(`${MAIN}.Edit`, "Edit", 20, {
							custom: false,
							oob: true,
							commandId: "Mscrm.EditSelectedRecord",
						}),
					],
				},
				{
					id: "mxrm.account.Other",
					label: "Other",
					sequence: 20,
					template: "Flexible2",
					buttons: [],
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

function render() {
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<SolutionElementsPane />
			</FluentProvider>,
		),
	);
}
const branchRow = (name: string) =>
	[...container.querySelectorAll<HTMLElement>('[role="treeitem"][aria-level="1"]')].find((n) =>
		n.querySelector(".fui-TreeItemLayout__main")?.textContent?.startsWith(name),
	)!;
const leaves = () =>
	[...container.querySelectorAll<HTMLElement>('[role="treeitem"][aria-level="2"]')].map(
		(n) => n.querySelector(".fui-TreeItemLayout__main")?.textContent,
	);
const click = (el: Element | null | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
function type(input: HTMLInputElement, value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
			input,
			value,
		);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
const menuItem = (name: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) =>
		m.textContent?.trim().startsWith(name),
	);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState({ ...initialUI, announcement: "" }, true);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: homeGrid(),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [
			{
				id: "mxrm.account.Approve.Command",
				enableRules: ["Mscrm.EnableRule.ExactlyOneSelected"],
				displayRules: ["mxrm.account.ShowOnForm.DisplayRule"],
				actions: [],
			},
			{ id: "Mscrm.EditSelectedRecord", enableRules: [], displayRules: [], actions: [] },
			{ id: "mxrm.Unused.Command", enableRules: [], displayRules: [], actions: [] },
		],
		displayRules: [{ id: "mxrm.account.ShowOnForm.DisplayRule", steps: [] }],
		enableRules: [{ id: "Mscrm.EnableRule.ExactlyOneSelected", steps: [] }],
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

describe("#194 distinguishingSegment", () => {
	it("is the last part that isn't a generic word", () => {
		expect(distinguishingSegment("Mscrm.EnableRule.ExactlyOneSelected")).toBe(
			"ExactlyOneSelected",
		);
		expect(distinguishingSegment("mxrm.account.Approve.Command")).toBe("Approve");
		expect(distinguishingSegment("mxrm.account.ShowOnForm.DisplayRule")).toBe("ShowOnForm");
		expect(distinguishingSegment("Mscrm.EditSelectedRecord")).toBe("EditSelectedRecord");
		expect(distinguishingSegment("Command")).toBe("Command");
	});
});

describe("#194 the Solution tab", () => {
	it("is one tree with a branch and a count each; your buttons are open", () => {
		render();
		expect(container.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe(
			"Solution elements",
		);
		const branches = [...container.querySelectorAll('[role="treeitem"][aria-level="1"]')].map(
			(n) => n.querySelector(":scope > .fui-TreeItemLayout")?.textContent,
		);
		expect(branches).toEqual(["Buttons1", "Commands3", "Rules2", "Templates0"]);
		expect(branchRow("Buttons").getAttribute("aria-expanded")).toBe("true");
		expect(leaves()).toEqual(["Approve"]);
	});

	it("commands and rules show the part of the id that tells them apart, and how much they're used", () => {
		render();
		click(branchRow("Commands"));
		click(branchRow("Rules"));
		const text = container.textContent ?? "";
		expect(leaves()).toEqual(
			expect.arrayContaining([
				"Approve",
				"EditSelectedRecord",
				"Unused",
				"ExactlyOneSelected",
				"ShowOnForm",
			]),
		);
		const cmd = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
			(n) => n.getAttribute("aria-description") === "mxrm.account.Approve.Command",
		)!;
		expect(cmd.textContent).toContain("used 1×");
		expect(text).toContain("not used");
		const rule = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
			(n) => n.getAttribute("aria-description") === "Mscrm.EnableRule.ExactlyOneSelected",
		)!;
		expect(rule.textContent).toContain("used 1×");
		expect(rule.textContent).toContain("Enable");
	});

	it("choosing a command or a rule opens its editor", () => {
		const openCommandEditor = vi.fn();
		const openRuleEditor = vi.fn();
		useUIStore.setState({ openCommandEditor, openRuleEditor });
		render();
		click(branchRow("Commands"));
		click(branchRow("Rules"));
		const byId = (id: string) =>
			[...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
				(n) => n.getAttribute("aria-description") === id,
			);
		click(byId("Mscrm.EditSelectedRecord"));
		expect(openCommandEditor).toHaveBeenCalledWith("Mscrm.EditSelectedRecord");
		click(byId("mxrm.account.ShowOnForm.DisplayRule"));
		expect(openRuleEditor).toHaveBeenCalledWith(
			"mxrm.account.ShowOnForm.DisplayRule",
			"display",
		);
	});

	it("searches every branch at once and opens the ones with matches", () => {
		render();
		type(
			container.querySelector<HTMLInputElement>(
				'input[aria-label="Search the solution\'s elements"]',
			)!,
			"selected",
		);
		expect(branchRow("Commands").getAttribute("aria-expanded")).toBe("true");
		expect(branchRow("Rules").getAttribute("aria-expanded")).toBe("true");
		expect(leaves()).toEqual(["EditSelectedRecord", "ExactlyOneSelected"]);
		// A branch without a match stays closed, with its count.
		expect(branchRow("Buttons").getAttribute("aria-expanded")).toBe("false");
		expect(
			branchRow("Buttons").querySelector(":scope > .fui-TreeItemLayout")?.textContent,
		).toBe("Buttons0");
	});

	it("a button is chosen, and copied into a group of the open tab with its menu (Shift+F10)", () => {
		render();
		const approve = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
			(n) => n.getAttribute("aria-description")?.startsWith("mxrm.account.Approve ·"),
		)!;
		click(approve);
		expect(useSelectionStore.getState().selectedButtonId).toBe("mxrm.account.Approve");
		act(() => {
			approve.dispatchEvent(
				new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
			);
		});
		expect(menuItem("Go to button")).toBeTruthy();
		click(menuItem("Add to Other"));
		const other = useRibbonStore
			.getState()
			.ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === "mxrm.account.Other")!;
		expect(other.buttons).toHaveLength(1);
		expect(other.buttons[0].id).toMatch(/^mxrm\.account\.Approve_copy_/);
		expect(other.buttons[0].commandId).toBe("mxrm.account.Approve.Command");
		expect(useUIStore.getState().announcement).toContain("added to Other");
	});

	it("renders a branch's rows only while it's open, a page at a time", () => {
		useRibbonStore.setState({
			commands: Array.from({ length: 150 }, (_, n) => ({
				id: `mxrm.C${String(n).padStart(3, "0")}.Command`,
				enableRules: [],
				displayRules: [],
				actions: [],
			})),
		});
		render();
		// Closed: no rows in the page.
		expect(leaves()).toEqual(["Approve"]);
		click(branchRow("Commands"));
		const commandRows = () =>
			[
				...container.querySelectorAll<HTMLElement>('[role="treeitem"][aria-level="2"]'),
			].filter((n) => n.getAttribute("aria-description")?.startsWith("mxrm.C"));
		expect(commandRows()).toHaveLength(100);
		const more = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((n) =>
			n.textContent?.startsWith("Show 50 more of 50"),
		);
		click(more);
		expect(commandRows()).toHaveLength(150);
	});

	it("counts rule use per kind and per command, and a tab's own command as used (review)", () => {
		useRibbonStore.setState((st) => {
			const r = structuredClone(st.ribbons);
			r.HomepageGrid.tabs[0].commandId = "mxrm.Unused.Command";
			return {
				ribbons: r,
				commands: [
					...st.commands,
					// The same rule twice in one command, and the enable rule's id as a display rule.
					{
						id: "mxrm.Twice.Command",
						enableRules: [
							"Mscrm.EnableRule.ExactlyOneSelected",
							"Mscrm.EnableRule.ExactlyOneSelected",
						],
						displayRules: [],
						actions: [],
					},
				],
				displayRules: [
					...st.displayRules,
					{ id: "Mscrm.EnableRule.ExactlyOneSelected", steps: [] },
				],
			};
		});
		render();
		click(branchRow("Commands"));
		click(branchRow("Rules"));
		const rows = (id: string) =>
			[...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter(
				(n) => n.getAttribute("aria-description") === id,
			);
		expect(rows("mxrm.Unused.Command")[0].textContent).toContain("used 1×");
		const [enable, display] = rows("Mscrm.EnableRule.ExactlyOneSelected");
		expect(enable.textContent).toContain("used 2×");
		expect(enable.textContent).toContain("Enable");
		expect(display.textContent).toContain("not used");
		expect(display.textContent).toContain("Display");
	});

	it("branches can be closed while searching, and the open state from before comes back (review)", () => {
		render();
		const search = container.querySelector<HTMLInputElement>(
			'input[aria-label="Search the solution\'s elements"]',
		)!;
		type(search, "selected");
		expect(branchRow("Rules").getAttribute("aria-expanded")).toBe("true");
		click(branchRow("Rules").querySelector(":scope > .fui-TreeItemLayout"));
		expect(branchRow("Rules").getAttribute("aria-expanded")).toBe("false");
		type(search, "");
		expect(branchRow("Buttons").getAttribute("aria-expanded")).toBe("true");
		expect(branchRow("Commands").getAttribute("aria-expanded")).toBe("false");
	});

	it("choosing a button tells the narrow drawer to close (review)", () => {
		render();
		const before = useUIStore.getState().structureChoice;
		click(
			[...container.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((n) =>
				n.getAttribute("aria-description")?.startsWith("mxrm.account.Approve ·"),
			),
		);
		expect(useUIStore.getState().structureChoice).toBe(before + 1);
	});
});
