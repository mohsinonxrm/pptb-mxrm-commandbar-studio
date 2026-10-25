import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { canDeleteControl, canDeleteGroup, canDeleteTab, deleteBlockedReason } from "@/utils/ribbonProvenance";
import { findGroupControl, groupControls } from "@/utils/ribbonMenu";
import { planScope } from "@/services/publishPlan";
import { parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
import type { LayerSnapshot } from "@/services/dataverse/ribbonLayerService";
import type { RibbonButton, RibbonDefinition, RibbonGroup, RibbonLocation, RibbonOrigin } from "@/types/ribbon";

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
					// Your own groups (the layer adds them) in the out-of-the-box tab.
					groupDef("cbs.MyGroup", [control("cbs.MyGroup.Button", "unmanaged")]),
					groupDef("cbs.MixedGroup", [
						control("cbs.MixedGroup.Button", "unmanaged"),
						control("msdyn.MixedGroup.Theirs", "managed", { sequence: 20 }),
					]),
				],
			},
			// Your own tabs: one with only your own controls, one holding another
			// solution's group.
			{
				id: "cbs.MyTab",
				label: "Mine",
				sequence: 20,
				tabDisplayRules: [],
				groups: [groupDef("cbs.MyTab.Group", [control("cbs.MyTab.Button", "unmanaged")])],
			},
			{
				id: "cbs.MixedTab",
				label: "Mixed",
				sequence: 30,
				tabDisplayRules: [],
				groups: [groupDef("msdyn.MixedTab.Group", [control("msdyn.MixedTab.Button", "managed")])],
			},
		],
	};
}

function groupDef(id: string, buttons: RibbonButton[]): RibbonGroup {
	return { id, label: id, sequence: 50, template: "Mscrm.Templates.Flexible2", buttons };
}

/** What the table's unmanaged layer adds: your own controls, tabs and groups. */
const LAYER: LayerSnapshot = {
	controlIds: ["cbs.Mine", "cbs.MyFly", "cbs.MyGroup.Button", "cbs.MixedGroup.Button", "cbs.MyTab.Button"],
	containerIds: ["cbs.MyGroup", "cbs.MixedGroup", "cbs.MyTab", "cbs.MyTab.Group", "cbs.MixedTab"],
	locLabelIds: [],
	hides: [],
};

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
		layers: { entity: LAYER },
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
	useUIStore.setState({ hideInsteadOfDelete: null, commandPaletteOpen: false, bulkPublishOpen: false });
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
		expect(ids().filter((id) => id === "cbs.Mine" || id.includes("cbs.Mine_copy"))).toEqual(["cbs.Mine"]);
		dialog.remove();
		press(document.body, "Delete");
		expect(has("cbs.Mine")).toBe(false);
	});
});

describe("other shortcuts in text fields and dialogs", () => {
	const copies = () => ids().filter((id) => id.includes("cbs.Mine_copy"));

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

// #17 review — a tab or group goes with every control in it, so it is deleted
// only when it is yours and so is everything in it (the publish rule).
describe("tabs and groups", () => {
	const state = () => useRibbonStore.getState();
	const tabIds = () => state().ribbons.HomepageGrid.tabs.map((t) => t.id);
	const groupIds = () => state().ribbons.HomepageGrid.tabs.flatMap((t) => t.groups.map((g) => g.id));
	const tabOf = (id: string) => state().ribbons.HomepageGrid.tabs.find((t) => t.id === id)!;
	const groupOf = (id: string) => state().ribbons.HomepageGrid.tabs.flatMap((t) => t.groups).find((g) => g.id === id)!;
	const base = () => state().baseline.HomepageGrid;
	const warnings = () => useRuntimeLogStore.getState().entries.filter((e) => e.level === "warn");

	it("canDeleteGroup / canDeleteTab: yours, with only your own controls", () => {
		expect(canDeleteGroup(groupOf("cbs.MyGroup"), base(), LAYER.containerIds)).toBe(true);
		expect(canDeleteGroup(groupOf(GROUP), base(), LAYER.containerIds)).toBe(false);
		expect(canDeleteGroup(groupOf("cbs.MixedGroup"), base(), LAYER.containerIds)).toBe(false);
		expect(canDeleteTab(tabOf("cbs.MyTab"), base(), LAYER.containerIds)).toBe(true);
		expect(canDeleteTab(tabOf(TAB), base(), LAYER.containerIds)).toBe(false);
		expect(canDeleteTab(tabOf("cbs.MixedTab"), base(), LAYER.containerIds)).toBe(false);
		// Without the layer, nothing loaded is known to be yours.
		expect(canDeleteGroup(groupOf("cbs.MyGroup"), base(), undefined)).toBe(false);
	});

	it("the store refuses an out-of-the-box group, and your own group holding another solution's button", () => {
		for (const id of [GROUP, "cbs.MixedGroup"]) {
			act(() => state().deleteGroup("HomepageGrid", TAB, id));
			expect(groupIds()).toContain(id);
		}
		expect(state().past).toHaveLength(0);
		expect(state().mutationsSincePublish).toBe(0);
		expect(warnings()).toHaveLength(2);
		expect(warnings()[0].message).toMatch(/only your own/);
	});

	it("the store deletes your own group as one undo step", () => {
		act(() => state().deleteGroup("HomepageGrid", TAB, "cbs.MyGroup"));
		expect(groupIds()).not.toContain("cbs.MyGroup");
		expect(state().past).toHaveLength(1);
		act(() => state().undo());
		expect(groupIds()).toContain("cbs.MyGroup");
	});

	it("the store refuses an out-of-the-box tab, and your own tab holding another solution's group", () => {
		for (const id of [TAB, "cbs.MixedTab"]) {
			act(() => state().deleteTab("HomepageGrid", id));
			expect(tabIds()).toContain(id);
		}
		expect(state().past).toHaveLength(0);
		expect(warnings()).toHaveLength(2);
	});

	it("the store deletes your own tab, and a tab or group created this session", () => {
		act(() => state().deleteTab("HomepageGrid", "cbs.MyTab"));
		expect(tabIds()).not.toContain("cbs.MyTab");
		act(() => state().createTab("HomepageGrid", { id: "cbs.NewTab", label: "New" }));
		act(() =>
			state().createGroup({ location: "HomepageGrid", tabId: "cbs.NewTab", group: groupDef("cbs.NewGroup", []) }),
		);
		act(() => state().deleteGroup("HomepageGrid", "cbs.NewTab", "cbs.NewGroup"));
		expect(groupIds()).not.toContain("cbs.NewGroup");
		act(() => state().deleteTab("HomepageGrid", "cbs.NewTab"));
		expect(tabIds()).not.toContain("cbs.NewTab");
		expect(warnings()).toHaveLength(0);
	});

	it("agrees with publish: what it refuses, publish refuses too", () => {
		const plan = (edit: (def: RibbonDefinition) => void) => {
			const current = homepage();
			edit(current);
			return planScope({
				locations: [{ current, baseline: base() }],
				commands: [],
				baselineCommands: [],
				enableRules: [],
				baselineEnableRules: [],
				displayRules: [],
				baselineDisplayRules: [],
				layer: { containerIds: LAYER.containerIds, locLabelIds: [] },
			});
		};
		const withoutGroup = (id: string) =>
			plan((def) => def.tabs.forEach((t) => (t.groups = t.groups.filter((g) => g.id !== id))));
		const withoutTab = (id: string) => plan((def) => (def.tabs = def.tabs.filter((t) => t.id !== id)));
		const clean = (p: ReturnType<typeof plan>) => p.unsupported.length === 0;

		expect(clean(withoutGroup("cbs.MyGroup"))).toBe(true);
		expect(clean(withoutGroup(GROUP))).toBe(false);
		expect(clean(withoutGroup("cbs.MixedGroup"))).toBe(false);
		expect(clean(withoutTab("cbs.MyTab"))).toBe(true);
		expect(clean(withoutTab(TAB))).toBe(false);
		// Your own tab with another solution's group in it: the group's
		// CustomAction would point at a tab that no longer exists.
		expect(clean(withoutTab("cbs.MixedTab"))).toBe(false);
	});
});

describe("deleteBlockedReason", () => {
	const base = () => useRibbonStore.getState().baseline.HomepageGrid;
	const ctl = (id: string) => findGroupControl(group(), id)!;

	it("names where the button comes from", () => {
		expect(deleteBlockedReason(ctl("Mscrm.HomepageGrid.account.Edit"), base())).toMatch(/out-of-the-box/);
		expect(deleteBlockedReason(ctl("msdyn.account.Managed"), base())).toMatch(/managed solution "Field Service"/);
		expect(deleteBlockedReason(ctl("cbs.MyFly"), base())).toMatch(/menu holds items from another solution/);
	});

	it("says an override made this session is an override, not another solution's button", () => {
		act(() =>
			useRibbonStore.getState().customizeOobButton("HomepageGrid", TAB, GROUP, "Mscrm.HomepageGrid.account.Edit"),
		);
		const reason = deleteBlockedReason(ctl("Mscrm.HomepageGrid.account.Edit"), base());
		expect(reason).toMatch(/override/);
		expect(reason).toMatch(/out-of-the-box/);
		expect(reason).not.toMatch(/another solution/);
	});

	it("explains a repeated application-ribbon id whose other occurrence isn't yours", () => {
		const shared = (origin: RibbonOrigin) => control("cbs.Shared", origin);
		const app: RibbonDefinition = {
			location: "Application",
			entityLogicalName: "",
			tabs: [
				{ id: "cbs.T1", label: "T1", sequence: 10, tabDisplayRules: [], groups: [groupDef("cbs.G1", [shared("unmanaged")])] },
				{ id: "Mscrm.T2", label: "T2", sequence: 20, tabDisplayRules: [], groups: [groupDef("Mscrm.G2", [shared("oob")])] },
			],
		};
		const mine = app.tabs[0].groups[0].buttons[0];
		expect(canDeleteControl(mine, app)).toBe(false);
		const reason = deleteBlockedReason(mine, app);
		expect(reason).toMatch(/also/);
		expect(reason).toMatch(/out-of-the-box/);
		expect(reason).not.toMatch(/menu/);
		expect(reason).not.toMatch(/override/);
	});
});

// #17 final review — a group published this session is yours right away, not
// only once the layer has been re-read (or for good when that read fails).
describe("after a publish", () => {
	it("a just-published own group can be deleted before the layer is re-read", () => {
		const state = () => useRibbonStore.getState();
		act(() => state().createGroup({ location: "HomepageGrid", tabId: TAB, group: groupDef("cbs.PubGroup", []) }));
		const parts = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions><CustomAction Id="cbs.PubGroup.CustomAction" Location="${TAB}.Groups._children" Sequence="50"><CommandUIDefinition><Group Id="cbs.PubGroup" Sequence="50" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.PubGroup.Controls" /></Group></CommandUIDefinition></CustomAction></CustomActions></RibbonDiffXml>`,
		);
		act(() => state().markPublished(undefined, { entity: parts }));
		expect(state().baseline.HomepageGrid.tabs[0].groups.some((g) => g.id === "cbs.PubGroup")).toBe(true);
		expect(state().layers.entity?.containerIds).toContain("cbs.PubGroup");

		act(() => state().deleteGroup("HomepageGrid", TAB, "cbs.PubGroup"));
		expect(state().ribbons.HomepageGrid.tabs[0].groups.some((g) => g.id === "cbs.PubGroup")).toBe(false);
	});
});

// #17 review — editor drawers (OverlayDrawer, aria-modal) keep workspace
// undo / redo / save outside their text fields, as before; dialogs, menus and
// popovers block every shortcut; Ctrl+S never reaches the browser.
describe("shortcuts in editor drawers", () => {
	function drawer(): HTMLButtonElement {
		const surface = document.createElement("div");
		surface.className = "fui-OverlayDrawer";
		surface.setAttribute("role", "dialog");
		surface.setAttribute("aria-modal", "true");
		const inside = document.createElement("button");
		surface.appendChild(inside);
		document.body.appendChild(surface);
		return inside;
	}
	const label = () => findGroupControl(group(), "cbs.Mine")!.label;

	it("Ctrl+Z / Ctrl+Y undo and redo the workspace outside text fields", () => {
		act(() => useRibbonStore.getState().setButtonProp("HomepageGrid", TAB, GROUP, "cbs.Mine", { label: "Renamed" }));
		const inside = drawer();
		press(inside, "z", true);
		expect(label()).toBe("cbs.Mine");
		press(inside, "y", true);
		expect(label()).toBe("Renamed");
	});

	it("Ctrl+S opens publish", () => {
		press(drawer(), "s", true);
		expect(useUIStore.getState().bulkPublishOpen).toBe(true);
	});

	it("Delete and Ctrl+D don't touch the canvas", () => {
		select("cbs.Mine");
		const inside = drawer();
		press(inside, "Delete");
		press(inside, "d", true);
		expect(ids().filter((id) => id.startsWith("cbs.Mine"))).toEqual(["cbs.Mine"]);
	});

	it("a dialog still blocks them, and Ctrl+S never reaches the browser there", () => {
		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		dialog.setAttribute("aria-modal", "true");
		const inside = document.createElement("button");
		dialog.appendChild(inside);
		document.body.appendChild(dialog);
		const save = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
		act(() => {
			inside.dispatchEvent(save);
		});
		expect(save.defaultPrevented).toBe(true);
		expect(useUIStore.getState().bulkPublishOpen).toBe(false);
	});
});
