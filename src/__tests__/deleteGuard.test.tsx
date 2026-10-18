import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { canDeleteControl } from "@/utils/ribbonProvenance";
import { findGroupControl, groupControls } from "@/utils/ribbonMenu";
import { planScope } from "@/services/publishPlan";
import type { RibbonButton, RibbonDefinition, RibbonLocation, RibbonOrigin } from "@/types/ribbon";

// #17 — Delete / Backspace remove only your own buttons (the rule publish
// applies); the canvas shortcuts stay out of text fields and dialogs.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAB = "Mscrm.HomepageGrid.account.MainTab";
const GROUP = "Mscrm.HomepageGrid.account.MainTab.Management";

function control(id: string, origin: RibbonOrigin, extra: Partial<RibbonButton> = {}): RibbonButton {
	return {
		id,
		label: id,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: `${id}.Command`,
		hidden: false,
		oob: origin === "oob",
		custom: origin === "unmanaged",
		managed: origin === "managed",
		origin,
		...extra,
	};
}

function flyout(id: string, origin: RibbonOrigin, items: RibbonButton[]): RibbonButton {
	return control(id, origin, {
		kind: "flyout",
		menu: {
			id: `${id}.Menu`,
			sections: [
				{ id: `${id}.MenuSection1`, sequence: 10, controlsId: `${id}.MenuSection1.Controls`, controls: items },
			],
		},
	});
}

function homepage(): RibbonDefinition {
	return {
		location: "HomepageGrid",
		entityLogicalName: "account",
		tabs: [
			{
				id: TAB,
				label: "Main",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: GROUP,
						label: "Management",
						sequence: 10,
						template: "Mscrm.Templates.Flexible2",
						buttons: [
							control("cbs.Mine", "unmanaged", { sequence: 10 }),
							control("Mscrm.HomepageGrid.account.Edit", "oob", { sequence: 20 }),
							control("msdyn.account.Managed", "managed", { sequence: 30, solutionName: "Field Service" }),
							flyout("Mscrm.HomepageGrid.account.Oob.Flyout", "oob", [
								control("cbs.OobFly.MyItem", "unmanaged"),
								control("Mscrm.HomepageGrid.account.Oob.Item", "oob", { sequence: 20 }),
							]),
							flyout("cbs.MyFly", "unmanaged", [control("msdyn.MyFly.TheirItem", "managed")]),
						],
					},
				],
			},
		],
	};
}

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

function load() {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: homepage(),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		enableRules: [],
		displayRules: [],
		locLabels: [],
	});
}

const group = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0];
const ids = () => groupControls(group()).map((b) => b.id);
const has = (id: string) => ids().includes(id);

function Shortcuts() {
	useKeyboardShortcuts();
	return null;
}

let container: HTMLDivElement;
let root: Root;

const press = (target: EventTarget, key: string, ctrlKey = false) =>
	act(() => {
		target.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey, bubbles: true }));
	});

function select(id: string) {
	act(() => useSelectionStore.getState().selectButtonInContext("HomepageGrid", TAB, GROUP, id));
}

beforeEach(() => {
	load();
	useUIStore.setState({ hideInsteadOfDelete: null, commandPaletteOpen: false });
	useRuntimeLogStore.getState().clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => root.render(<Shortcuts />));
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("canDeleteControl — the rule publish applies", () => {
	const baseline = () => useRibbonStore.getState().baseline.HomepageGrid;
	const ctl = (id: string) => findGroupControl(group(), id)!;

	it("allows your own buttons and menu items only", () => {
		expect(canDeleteControl(ctl("cbs.Mine"), baseline())).toBe(true);
		expect(canDeleteControl(ctl("cbs.OobFly.MyItem"), baseline())).toBe(true);
		expect(canDeleteControl(ctl("Mscrm.HomepageGrid.account.Edit"), baseline())).toBe(false);
		expect(canDeleteControl(ctl("msdyn.account.Managed"), baseline())).toBe(false);
		expect(canDeleteControl(ctl("Mscrm.HomepageGrid.account.Oob.Item"), baseline())).toBe(false);
	});

	it("refuses your own flyout whose menu holds another solution's item", () => {
		expect(canDeleteControl(ctl("cbs.MyFly"), baseline())).toBe(false);
	});

	it("goes by the loaded origin: an override made this session doesn't make the original yours", () => {
		act(() =>
			useRibbonStore.getState().customizeOobButton("HomepageGrid", TAB, GROUP, "Mscrm.HomepageGrid.account.Edit"),
		);
		expect(ctl("Mscrm.HomepageGrid.account.Edit").origin).toBe("unmanaged");
		expect(canDeleteControl(ctl("Mscrm.HomepageGrid.account.Edit"), baseline())).toBe(false);
	});

	it("allows buttons created this session", () => {
		act(() =>
			useRibbonStore.getState().createButton({
				location: "HomepageGrid",
				tabId: TAB,
				groupId: GROUP,
				button: { ...control("cbs.New", "unmanaged"), label: "New" },
			}),
		);
		expect(canDeleteControl(ctl("cbs.New"), baseline())).toBe(true);
	});

	it("agrees with publish: it deletes what publish removes, and refuses what publish refuses", () => {
		const baselineDef = useRibbonStore.getState().baseline.HomepageGrid;
		const without = (id: string) => {
			const current = homepage();
			const g = current.tabs[0].groups[0];
			g.buttons = g.buttons.filter((b) => b.id !== id);
			return planScope({
				locations: [{ current, baseline: baselineDef }],
				commands: [],
				baselineCommands: [],
				enableRules: [],
				baselineEnableRules: [],
				displayRules: [],
				baselineDisplayRules: [],
			});
		};
		for (const b of homepage().tabs[0].groups[0].buttons) {
			const plan = without(b.id);
			const removed = plan.deletedButtonIds.includes(b.id);
			expect(removed && !plan.unsupported.some((u) => u.includes(`only your own unmanaged buttons can be deleted`))).toBe(
				canDeleteControl(b, baselineDef),
			);
		}
	});
});

describe("store guard — deleteButton", () => {
	it("deletes your own button as one undo step", () => {
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", TAB, GROUP, "cbs.Mine"));
		expect(has("cbs.Mine")).toBe(false);
		expect(useRibbonStore.getState().past).toHaveLength(1);
		act(() => useRibbonStore.getState().undo());
		expect(has("cbs.Mine")).toBe(true);
	});

	it("refuses an out-of-the-box, a managed button and another solution's menu item, with a warning", () => {
		for (const id of [
			"Mscrm.HomepageGrid.account.Edit",
			"msdyn.account.Managed",
			"Mscrm.HomepageGrid.account.Oob.Item",
			"cbs.MyFly",
		]) {
			act(() => useRibbonStore.getState().deleteButton("HomepageGrid", TAB, GROUP, id));
			expect(has(id)).toBe(true);
		}
		const state = useRibbonStore.getState();
		expect(state.past).toHaveLength(0);
		expect(state.mutationsSincePublish).toBe(0);
		const warnings = useRuntimeLogStore.getState().entries.filter((e) => e.level === "warn");
		expect(warnings).toHaveLength(4);
		expect(warnings[0].message).toMatch(/only your own buttons can be deleted/);
	});

	it("deletes your own item from an out-of-the-box flyout", () => {
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", TAB, GROUP, "cbs.OobFly.MyItem"));
		expect(has("cbs.OobFly.MyItem")).toBe(false);
		expect(has("Mscrm.HomepageGrid.account.Oob.Item")).toBe(true);
	});
});

describe("Delete / Backspace on the canvas", () => {
	it("deletes your own button", () => {
		select("cbs.Mine");
		press(document.body, "Delete");
		expect(has("cbs.Mine")).toBe(false);
		expect(useUIStore.getState().hideInsteadOfDelete).toBeNull();
	});

	it("offers a hide instead for an out-of-the-box button", () => {
		select("Mscrm.HomepageGrid.account.Edit");
		press(document.body, "Delete");
		expect(has("Mscrm.HomepageGrid.account.Edit")).toBe(true);
		expect(useUIStore.getState().hideInsteadOfDelete).toEqual({
			location: "HomepageGrid",
			tabId: TAB,
			groupId: GROUP,
			buttonId: "Mscrm.HomepageGrid.account.Edit",
		});
		expect(useRibbonStore.getState().past).toHaveLength(0);
	});

	it("offers a hide instead for a managed button (Backspace too)", () => {
		select("msdyn.account.Managed");
		press(document.body, "Backspace");
		expect(has("msdyn.account.Managed")).toBe(true);
		expect(useUIStore.getState().hideInsteadOfDelete?.buttonId).toBe("msdyn.account.Managed");
	});

	it("follows the same rule for menu items", () => {
		select("Mscrm.HomepageGrid.account.Oob.Item");
		press(document.body, "Delete");
		expect(has("Mscrm.HomepageGrid.account.Oob.Item")).toBe(true);
		expect(useUIStore.getState().hideInsteadOfDelete?.buttonId).toBe("Mscrm.HomepageGrid.account.Oob.Item");

		act(() => useUIStore.getState().closeHideInsteadOfDelete());
		select("cbs.OobFly.MyItem");
		press(document.body, "Delete");
		expect(has("cbs.OobFly.MyItem")).toBe(false);
		expect(useUIStore.getState().hideInsteadOfDelete).toBeNull();
	});

	it("does nothing in an input, a textarea, a select or contenteditable", () => {
		select("cbs.Mine");
		const input = document.createElement("input");
		const textarea = document.createElement("textarea");
		const selectEl = document.createElement("select");
		const editable = document.createElement("div");
		editable.setAttribute("contenteditable", "true");
		document.body.append(input, textarea, selectEl, editable);
		for (const target of [input, textarea, selectEl, editable]) {
			press(target, "Delete");
			press(target, "Backspace");
		}
		expect(has("cbs.Mine")).toBe(true);
		expect(useRibbonStore.getState().past).toHaveLength(0);
	});

	it("does nothing while a dialog, popover or menu has focus", () => {
		select("cbs.Mine");
		for (const role of ["dialog", "alertdialog", "menu"]) {
			const overlay = document.createElement("div");
			overlay.setAttribute("role", role);
			const inside = document.createElement("button");
			overlay.appendChild(inside);
			document.body.appendChild(overlay);
			press(inside, "Delete");
			overlay.remove();
		}
		const popover = document.createElement("div");
		popover.className = "fui-PopoverSurface";
		const inPopover = document.createElement("button");
		popover.appendChild(inPopover);
		document.body.appendChild(popover);
		press(inPopover, "Delete");
		popover.remove();
		expect(has("cbs.Mine")).toBe(true);
	});

	it("does nothing behind an open modal dialog", () => {
		select("cbs.Mine");
		const dialog = document.createElement("div");
		dialog.setAttribute("aria-modal", "true");
		document.body.appendChild(dialog);
		press(document.body, "Delete");
		press(document.body, "d", true);
		expect(ids().filter((id) => id === "cbs.Mine" || id.startsWith("cbs.Mine_copy"))).toEqual(["cbs.Mine"]);
		dialog.remove();
		press(document.body, "Delete");
		expect(has("cbs.Mine")).toBe(false);
	});
});

describe("other shortcuts in text fields and dialogs", () => {
	const copies = () => ids().filter((id) => id.startsWith("cbs.Mine_copy"));

	it("Ctrl+D duplicates on the canvas but not in a text field", () => {
		select("cbs.Mine");
		const input = document.createElement("input");
		const textarea = document.createElement("textarea");
		const monaco = document.createElement("div");
		monaco.className = "monaco-editor";
		const inMonaco = document.createElement("span");
		monaco.appendChild(inMonaco);
		document.body.append(input, textarea, monaco);
		for (const target of [input, textarea, inMonaco]) press(target, "d", true);
		expect(copies()).toHaveLength(0);

		press(document.body, "d", true);
		expect(copies()).toHaveLength(1);
	});

	it("Ctrl+D, Ctrl+Z and Ctrl+S don't fire in a dialog", () => {
		select("cbs.Mine");
		act(() => useRibbonStore.getState().setButtonProp("HomepageGrid", TAB, GROUP, "cbs.Mine", { label: "Renamed" }));
		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		const inside = document.createElement("button");
		dialog.appendChild(inside);
		document.body.appendChild(dialog);

		press(inside, "d", true);
		press(inside, "z", true);
		press(inside, "s", true);
		expect(copies()).toHaveLength(0);
		expect(findGroupControl(group(), "cbs.Mine")!.label).toBe("Renamed");
		expect(useUIStore.getState().bulkPublishOpen).toBe(false);
	});
});
