/**
 * #194, step 2: the left pane's Structure tab shows the location's ribbon as a
 * tree of tab › group › control, replacing the ribbon tab strip (#180). Nodes
 * choose what the canvas shows and Properties edits, a selection made
 * elsewhere is shown here, the filter keeps a match's ancestors open, and each
 * node's actions are in its menu (right-click, Shift+F10, the Menu key).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { LeftPane } from "@/components/left-pane/LeftPane";
import { StructurePane } from "@/components/left-pane/StructurePane";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import { useDraftStore, draftKeyFor } from "@/store/draftStore";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIN = "Mscrm.HomepageGrid.account.MainTab";
const MGMT = `${MAIN}.Management`;
const OWN = "mxrm.account.Own.Group";
const SECOND = "Mscrm.HomepageGrid.account.Second";
const SEC_GROUP = "mxrm.account.Second.Group";

const button = (id: string, label: string, sequence: number, extra: Partial<RibbonButton> = {}) =>
	({
		id,
		label,
		kind: "button",
		sequence,
		templateAlias: "o1",
		commandId: "Mscrm.EditSelectedRecord",
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		...extra,
	}) as RibbonButton;

const homeGrid: RibbonDefinition = {
	location: "HomepageGrid",
	entityLogicalName: "account",
	tabs: [
		{
			id: MAIN,
			label: "$LocLabels:tab.Title",
			sequence: 10,
			tabDisplayRules: [{ commandId: `${MAIN}.Command`, rules: [{}, {}] } as never],
			groups: [
				{
					id: MGMT,
					label: "Management",
					sequence: 10,
					template: "Mscrm.Templates.Flexible2",
					buttons: [
						// Not in Sequence order, as a customization added after load can be.
						button(`${MAIN}.Delete`, "Delete", 20, { hidden: true }),
						button(`${MAIN}.Edit`, "Edit", 10),
					],
				},
				{
					id: OWN,
					label: "$LocLabels:own.Title",
					sequence: 20,
					template: "Flexible2",
					buttons: [
						button("mxrm.account.Approve", "Approve", 10, {
							oob: false,
							custom: true,
							origin: "unmanaged",
						}),
					],
				},
			],
		},
		{
			id: SECOND,
			label: "Second",
			sequence: 20,
			tabDisplayRules: [],
			groups: [
				{
					id: SEC_GROUP,
					label: "$LocLabels:sec.Title",
					sequence: 10,
					template: "Flexible2",
					buttons: [],
				},
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
const initialUI = useUIStore.getState();

function render(ui: React.ReactElement = <StructurePane />) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
const node = (key: string) =>
	container.querySelector<HTMLElement>(`[role="treeitem"][data-structure-key="${key}"]`);
const tabNode = (id: string) => node(`tab:${id}`);
const groupNode = (tabId: string, id: string) => node(`group:${tabId}:${id}`);
const buttonNode = (tabId: string, groupId: string, id: string) =>
	node(`btn:${tabId}:${groupId}:${id}`);
/** A node's own row text (its layout), not its subtree's. */
const rowText = (el: HTMLElement | null) =>
	el?.querySelector(".fui-TreeItemLayout__main")?.textContent ?? "";
const selectedKeys = () =>
	[...container.querySelectorAll('[role="treeitem"][aria-selected="true"]')].map((n) =>
		n.getAttribute("data-structure-key"),
	);
const click = (el: Element | null | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
const key = (el: Element | null, k: string, init: KeyboardEventInit = {}) => {
	if (!el) throw new Error("not found");
	act(() => {
		el.dispatchEvent(
			new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }),
		);
	});
};
const menuItem = (name: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) =>
		m.textContent?.trim().startsWith(name),
	);
const menuLabel = () => document.querySelector('[role="menu"]')?.getAttribute("aria-label");
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
const dialogButton = (text: string) =>
	[...(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
		(b) => b.textContent?.trim() === text,
	);
function type(input: HTMLInputElement, value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
			input,
			value,
		);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}
const tabIds = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs.map((t) => t.id);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState({ ...initialUI, announcement: "" }, true);
	useSessionStore.setState({ activeEntity: { logicalName: "account" } } as never);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: structuredClone(homeGrid),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [
			{ id: "tab.Title", titles: [{ languageCode: 1033, description: "Account" }] },
			{ id: "own.Title", titles: [{ languageCode: 1033, description: "Mine" }] },
			{ id: "sec.Title", titles: [{ languageCode: 1033, description: "Extra" }] },
		],
		baseLanguageCode: 1033,
		// The layer adds OWN, its title and its button: the group can be renamed (#33).
		layers: {
			entity: {
				controlIds: ["mxrm.account.Approve"],
				containerIds: [OWN, SEC_GROUP],
				locLabelIds: ["own.Title", "sec.Title"],
				hides: [],
			},
		},
	} as never);
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
	// The table's workspace is loaded (App says so to the draft store).
	useDraftStore.setState({ target: draftKeyFor("account") });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#194 the Structure tree", () => {
	it("shows tab › group › control with resolved labels, the ids as descriptions", () => {
		render();
		expect(container.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe(
			"Ribbon structure",
		);
		// The open tab is open and chosen; another tab is closed.
		expect(rowText(tabNode(MAIN))).toContain("Account");
		expect(tabNode(MAIN)?.getAttribute("aria-description")).toBe(MAIN);
		expect(tabNode(MAIN)?.getAttribute("aria-expanded")).toBe("true");
		expect(tabNode(SECOND)?.getAttribute("aria-expanded")).toBe("false");
		expect(selectedKeys()).toEqual([`tab:${MAIN}`]);
		expect(rowText(groupNode(MAIN, MGMT))).toContain("Management");
	});

	it("marks hidden controls, your own, and shows each control's Sequence", () => {
		render();
		click(groupNode(MAIN, MGMT));
		click(groupNode(MAIN, OWN));
		const edit = buttonNode(MAIN, MGMT, `${MAIN}.Edit`)!;
		expect(edit.querySelector(".fui-TreeItemLayout__aside")?.textContent).toBe("10");
		const del = buttonNode(MAIN, MGMT, `${MAIN}.Delete`)!;
		expect(del.querySelector(".fui-TreeItemLayout__aside")?.textContent).toBe("Hidden");
		// In Sequence order.
		const mgmt = [
			...groupNode(MAIN, MGMT)!.querySelectorAll<HTMLElement>('[role="treeitem"]'),
		].map((n) => rowText(n));
		expect(mgmt).toEqual(["Edit", "Delete"]);
		const own = buttonNode(MAIN, OWN, "mxrm.account.Approve")!;
		expect(own.querySelector('[aria-label^="Yours"]')).toBeTruthy();
		expect(edit.querySelector(".fui-Badge")).toBeNull();
	});

	it("choosing a node selects it everywhere; a selection made elsewhere shows here", () => {
		render();
		click(tabNode(SECOND));
		expect(useSelectionStore.getState().tabId).toBe(SECOND);
		expect(selectedKeys()).toEqual([`tab:${SECOND}`]);

		click(tabNode(MAIN));
		click(groupNode(MAIN, MGMT));
		expect(useSelectionStore.getState()).toMatchObject({
			tabId: MAIN,
			selectedGroupId: MGMT,
			selectedButtonId: null,
		});
		click(buttonNode(MAIN, MGMT, `${MAIN}.Edit`));
		expect(useSelectionStore.getState().selectedButtonId).toBe(`${MAIN}.Edit`);
		expect(selectedKeys()).toEqual([`btn:${MAIN}:${MGMT}:${MAIN}.Edit`]);

		// Chosen on the canvas: its group opens and the node is marked.
		act(() =>
			useSelectionStore
				.getState()
				.selectButtonInContext("HomepageGrid", MAIN, OWN, "mxrm.account.Approve"),
		);
		expect(groupNode(MAIN, OWN)?.getAttribute("aria-expanded")).toBe("true");
		expect(selectedKeys()).toEqual([`btn:${MAIN}:${OWN}:mxrm.account.Approve`]);
	});

	it("a click that chooses a node opens it; a click on the chosen node toggles it", () => {
		render();
		// The open tab isn't chosen while a group is: choosing it keeps it open.
		click(groupNode(MAIN, MGMT));
		click(tabNode(MAIN));
		expect(tabNode(MAIN)?.getAttribute("aria-expanded")).toBe("true");
		click(tabNode(MAIN));
		expect(tabNode(MAIN)?.getAttribute("aria-expanded")).toBe("false");
		// Enter chooses, as a click does.
		key(tabNode(SECOND), "Enter");
		expect(useSelectionStore.getState().tabId).toBe(SECOND);
	});

	it("filters by label or id, keeping a match's ancestors open", () => {
		render();
		const search = container.querySelector<HTMLInputElement>(
			'input[aria-label="Filter the structure"]',
		)!;
		type(search, "approve");
		expect(groupNode(MAIN, OWN)?.getAttribute("aria-expanded")).toBe("true");
		expect(buttonNode(MAIN, OWN, "mxrm.account.Approve")).toBeTruthy();
		expect(groupNode(MAIN, MGMT)).toBeNull();
		expect(tabNode(SECOND)).toBeNull();
		// By id too.
		type(search, ".delete");
		expect(buttonNode(MAIN, MGMT, `${MAIN}.Delete`)).toBeTruthy();
		expect(buttonNode(MAIN, MGMT, `${MAIN}.Edit`)).toBeNull();
		type(search, "zzz");
		expect(container.textContent).toContain("Nothing matches “zzz”.");
		type(search, "");
		expect(tabNode(SECOND)).toBeTruthy();
	});

	it("a tab's menu (Shift+F10): rule count, display rules, add group, move", () => {
		render();
		key(tabNode(MAIN), "F10", { shiftKey: true });
		expect(menuLabel()).toBe("Actions for Account");
		expect(menuItem("Tab display rules")?.textContent).toContain("2");
		click(menuItem("Tab display rules"));
		expect(useUIStore.getState().tabDisplayRulesOpen).toBe(true);

		key(tabNode(MAIN), "ContextMenu");
		click(menuItem("Add group"));
		expect(useUIStore.getState().newGroupOpen).toBe(true);

		key(tabNode(MAIN), "ContextMenu");
		expect(menuItem("Move up")?.getAttribute("aria-disabled")).toBe("true");
		click(menuItem("Move down"));
		expect(tabIds()).toEqual([SECOND, MAIN]);
	});

	it("renames and deletes only the tabs that can be published, and asks first", () => {
		act(() =>
			useRibbonStore
				.getState()
				.createTab("HomepageGrid", { id: "mxrm.account.NewTab", label: "Fresh" }),
		);
		render();
		// Out of the box: Rename and Delete are disabled, and F2 says why.
		key(tabNode(MAIN), "ContextMenu");
		expect(menuItem("Rename")?.getAttribute("aria-disabled")).toBe("true");
		expect(menuItem("Delete tab")?.getAttribute("aria-disabled")).toBe("true");
		key(document.querySelector('[role="menu"]'), "Escape");
		key(tabNode(MAIN), "F2");
		expect(dialog()).toBeNull();
		expect(useUIStore.getState().announcement).toMatch(/can't be renamed/);

		// A tab created this session.
		key(tabNode("mxrm.account.NewTab"), "F2");
		const input = dialog()?.querySelector("input");
		expect(dialog()?.textContent).toContain("Rename tab");
		expect(input?.value).toBe("Fresh");
		type(input!, "Renamed");
		click(dialogButton("Rename"));
		expect(
			useRibbonStore
				.getState()
				.ribbons.HomepageGrid.tabs.find((t) => t.id === "mxrm.account.NewTab")?.label,
		).toBe("Renamed");

		act(() =>
			tabNode("mxrm.account.NewTab")!.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			),
		);
		click(menuItem("Delete tab"));
		expect(dialog()?.textContent).toContain("Renamed");
		click(dialogButton("Cancel"));
		expect(tabIds()).toContain("mxrm.account.NewTab");
		key(tabNode("mxrm.account.NewTab"), "ContextMenu");
		click(menuItem("Delete tab"));
		click(dialogButton("Delete tab"));
		expect(tabIds()).not.toContain("mxrm.account.NewTab");
	});

	it("a group's menu is the shared one, and F2 renames your own group", () => {
		render();
		click(groupNode(MAIN, OWN));
		// Right-click on a control opens its menu, not its group's.
		act(() =>
			buttonNode(MAIN, OWN, "mxrm.account.Approve")!.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			),
		);
		expect(menuLabel()).toBe("Actions for Approve");
		expect(useSelectionStore.getState().selectedButtonId).toBe("mxrm.account.Approve");
		key(document.querySelector('[role="menu"]'), "Escape");

		key(groupNode(MAIN, MGMT), "ContextMenu");
		expect(menuLabel()).toBe("Actions for Management");
		expect(
			[...document.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent?.trim()),
		).toEqual(expect.arrayContaining(["Add button…", "Duplicate group", "Change template…"]));
		click(menuItem("Add button"));
		expect(useUIStore.getState().newButtonGroupId).toBe(MGMT);

		key(groupNode(MAIN, OWN), "F2");
		expect(dialog()?.textContent).toContain("Rename group");
		type(dialog()!.querySelector("input")!, "Approvals");
		click(dialogButton("Rename"));
		expect(
			useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === OWN)
				?.label,
		).toBe("Approvals");
	});

	it("a menu closed with Escape gives focus back to its node", async () => {
		render();
		key(tabNode(SECOND), "ContextMenu");
		expect(menuLabel()).toBe("Actions for Second");
		key(document.querySelector('[role="menu"]'), "Escape");
		await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
		expect(document.querySelector('[role="menu"]')).toBeNull();
		expect(document.activeElement).toBe(tabNode(SECOND));
	});

	it("a node's menus act on its own tab, not the one shown (review)", () => {
		render();
		click(tabNode(SECOND));
		click(tabNode(MAIN));
		const secGroups = () =>
			useRibbonStore.getState().ribbons.HomepageGrid.tabs.find((t) => t.id === SECOND)!
				.groups;
		// ⋯ on another tab's group chooses it, and its menu acts on that tab.
		act(() => groupNode(SECOND, SEC_GROUP)!.focus());
		click(container.querySelector('button[aria-label="Actions for Extra"]'));
		expect(useSelectionStore.getState()).toMatchObject({
			tabId: SECOND,
			selectedGroupId: SEC_GROUP,
		});
		click(menuItem("Duplicate group"));
		expect(secGroups()).toHaveLength(2);

		// F2 on another tab's group (reached with the arrow keys) renames it there.
		act(() => useSelectionStore.getState().setTabId(MAIN));
		key(groupNode(SECOND, SEC_GROUP), "F2");
		type(dialog()!.querySelector("input")!, "Renamed");
		click(dialogButton("Rename"));
		expect(secGroups().find((g) => g.id === SEC_GROUP)?.label).toBe("Renamed");
		expect(useSelectionStore.getState().tabId).toBe(SECOND);
	});

	it("a control's menu closed with Escape gives focus back to the control", async () => {
		render();
		click(groupNode(MAIN, MGMT));
		key(buttonNode(MAIN, MGMT, `${MAIN}.Edit`), "ContextMenu");
		expect(menuLabel()).toBe("Actions for Edit");
		key(document.querySelector('[role="menu"]'), "Escape");
		await act(() => new Promise((r) => requestAnimationFrame(() => r(undefined))));
		expect(document.activeElement).toBe(buttonNode(MAIN, MGMT, `${MAIN}.Edit`));
	});

	it("says the tree comes once the table's ribbon is loaded", () => {
		useDraftStore.setState({ target: null });
		render();
		expect(container.textContent).toContain("Shown once the table's ribbon is loaded.");
		expect(container.querySelector('[role="tree"]')).toBeNull();
	});

	it("keys of a control don't reach its group or tab", () => {
		render();
		// OWN can be renamed: F2 on its control mustn't reach it.
		click(groupNode(MAIN, OWN));
		key(buttonNode(MAIN, OWN, "mxrm.account.Approve"), "F2");
		expect(dialog()).toBeNull();
		click(groupNode(MAIN, MGMT));
		key(buttonNode(MAIN, MGMT, `${MAIN}.Edit`), "ContextMenu");
		expect(menuLabel()).toBe("Actions for Edit");
	});

	it("without a table: says so, and Add tab and the filter are off", () => {
		useSessionStore.setState({ activeEntity: null } as never);
		render();
		expect(container.textContent).toContain(
			"Choose a table to see its tabs, groups and buttons.",
		);
		expect(
			container.querySelector<HTMLInputElement>('input[aria-label="Filter the structure"]')
				?.disabled,
		).toBe(true);
	});

	it("Add tab opens the new tab dialog", () => {
		render();
		click(container.querySelector('button[aria-label="Add tab"]'));
		expect(useUIStore.getState().newTabOpen).toBe(true);
	});
});

describe("#194 the left pane's tabs", () => {
	it("shows Structure first, and remembers Solution", () => {
		render(<LeftPane />);
		const tab = (name: string) =>
			[...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
				t.textContent?.includes(name),
			);
		expect(tab("Structure")?.getAttribute("aria-selected")).toBe("true");
		expect(container.querySelector('[role="tree"]')).toBeTruthy();
		click(tab("Solution"));
		expect(useUIStore.getState().leftPaneTab).toBe("solution");
		expect(container.querySelector('[role="tree"][aria-label="Ribbon structure"]')).toBeNull();
	});
});
