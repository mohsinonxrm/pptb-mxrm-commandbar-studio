import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ClassicRibbon } from "@/components/ribbon-canvas/ClassicRibbon";
import { RibbonListView } from "@/components/ribbon-canvas/RibbonListView";
import { ModernCommandBar } from "@/components/ribbon-canvas/ModernCommandBar";
import { RibbonCanvas } from "@/components/ribbon-canvas/RibbonCanvas";
import { CommandProvenanceBar } from "@/components/shared/CommandProvenanceBar";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

// #75 — accessible names / tooltips show resolved group titles, never
// `$Resources:` / `$LocLabels:` tokens. #18 — rename, template and confirm
// dialogs instead of window.prompt / window.confirm (no-ops in PPTB's Electron).

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const MAIN = "Mscrm.HomepageGrid.contact.MainTab";
const OWN = "mxrm.contact.Own.Group";
const MGMT = `${MAIN}.Management`;

const button = (id: string, label: string, sequence: number) => ({
	id,
	label,
	kind: "button" as const,
	sequence,
	templateAlias: "o1",
	commandId: "Mscrm.EditSelectedRecord",
	hidden: false,
	oob: true,
	custom: false,
	managed: false,
});

function ribbon(location: RibbonLocation): RibbonDefinition {
	return {
		location,
		entityLogicalName: "contact",
		tabs: [
			{
				id: MAIN,
				label: "$LocLabels:tab.Title",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: OWN,
						label: "$LocLabels:grp.Title",
						sequence: 10,
						template: "Flexible2",
						// Your own group and button (#17: only those can be deleted).
						buttons: [{ ...button("mxrm.Own.Button", "$LocLabels:btn.Label", 10), oob: false, custom: true, origin: "unmanaged" as const }],
					},
					{
						id: MGMT,
						label: "$Resources:Ribbon.HomepageGrid.MainTab.Management",
						sequence: 20,
						template: "Mscrm.Templates.Flexible2",
						buttons: [button("Mscrm.HomepageGrid.contact.Edit", "$Resources:Ribbon.HomepageGrid.Edit", 10)],
					},
				],
			},
		],
	};
}

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "contact",
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactNode) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}

/** The canvas re-reads its tab from the store, as RibbonCanvas does. */
function Classic() {
	const tab = useRibbonStore((s) => s.ribbons.HomepageGrid.tabs[0]);
	return tab ? <ClassicRibbon tab={tab} location="HomepageGrid" /> : null;
}

const groups = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups;
const group = (id: string) => groups().find((g) => g.id === id);

function openGroupMenu(groupId: string) {
	const el = container.querySelector(`[role="rowgroup"][data-ribbon-group-id="${groupId}"]`);
	if (!el) throw new Error(`group ${groupId} not rendered`);
	act(() => {
		el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
	});
}

function clickMenuItem(text: string) {
	const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
		el.textContent?.includes(text),
	);
	if (!item) throw new Error(`menu item "${text}" not found`);
	act(() => item.click());
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');

function dialogButton(text: string): HTMLButtonElement {
	const b = [...(dialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
		(el) => el.textContent?.trim() === text,
	);
	if (!b) throw new Error(`dialog button "${text}" not found`);
	return b;
}

function typeInto(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
	act(() => {
		setter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

function selectOption(select: HTMLSelectElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
	act(() => {
		setter.call(select, value);
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

const press = (target: Element, key: string) =>
	act(() => {
		target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
	});

/** Every accessible name and tooltip under the canvas. */
const namesAndTitles = (el: ParentNode) =>
	[...el.querySelectorAll("[aria-label], [title]")].flatMap((n) =>
		[n.getAttribute("aria-label"), n.getAttribute("title")].filter((v): v is string => !!v),
	);

describe("canvas labels and dialogs (#75, #18)", () => {
	let prompt: { mock: { calls: unknown[] } };
	let confirm: { mock: { calls: unknown[] } };

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: ribbon("HomepageGrid"),
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [{ id: "Mscrm.EditSelectedRecord", enableRules: [], displayRules: [], actions: [] }],
			displayRules: [],
			enableRules: [],
			locLabels: [
				{
					id: "grp.Title",
					titles: [
						{ languageCode: 1033, description: "My Group" },
						{ languageCode: 1031, description: "Meine Gruppe" },
					],
				},
				{ id: "tab.Title", titles: [{ languageCode: 1031, description: "Mein Tab" }] },
				{ id: "btn.Label", titles: [{ languageCode: 1033, description: "My Button" }] },
			],
			// The canvas shows group titles in the organisation's base language.
			baseLanguageCode: 1031,
			// The layer adds OWN and defines its title label: renaming it publishes (#33).
			layers: {
				entity: { controlIds: ["mxrm.Own.Button"], containerIds: [OWN], locLabelIds: ["grp.Title"], hides: [] },
			},
		});
		useSelectionStore.getState().setLocation("HomepageGrid");
		useSelectionStore.getState().setTabId(MAIN);
		// The old code called these; PPTB's Electron host doesn't implement them.
		prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
		confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		expect(prompt).not.toHaveBeenCalled();
		expect(confirm).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	describe("#75 resolved labels", () => {
		it("per-group Add buttons and group regions use the resolved title", () => {
			render(<Classic />);
			const add = container.querySelector<HTMLButtonElement>(`[data-add-btn-group-id="${OWN}"]`)!;
			expect(add.getAttribute("aria-label")).toBe("Add button to Meine Gruppe");
			expect(add.getAttribute("title")).toBe("Add button to Meine Gruppe");
			const mgmtAdd = container.querySelector<HTMLButtonElement>(`[data-add-btn-group-id="${MGMT}"]`)!;
			expect(mgmtAdd.getAttribute("aria-label")).toBe("Add button to Ribbon.HomepageGrid.MainTab.Management");
			expect(
				container.querySelector(`[role="rowgroup"][data-ribbon-group-id="${OWN}"]`)?.getAttribute("aria-label"),
			).toBe("Meine Gruppe");
			for (const v of namesAndTitles(container)) expect(v).not.toMatch(/\$(Resources|LocLabels):/);
		});

		it("Move to menu items name the resolved group and leave out the button's own", () => {
			render(<Classic />);
			const tile = container.querySelector<HTMLElement>('[data-ribbon-btn-id="mxrm.Own.Button"]')!;
			act(() => {
				tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
			});
			const items = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent ?? "");
			const moves = items.filter((t) => t.startsWith("Move to:"));
			expect(moves).toEqual(["Move to: Ribbon.HomepageGrid.MainTab.Management"]);
			expect(items.join("\n")).not.toMatch(/\$(Resources|LocLabels):/);
		});

		it("the modern bar's Move to items are resolved and leave out the button's own group", () => {
			render(<ModernCommandBar tab={useRibbonStore.getState().ribbons.HomepageGrid.tabs[0]} location="HomepageGrid" />);
			const tile = container.querySelector<HTMLElement>('[aria-label^="Ribbon.HomepageGrid.Edit"]');
			expect(tile).not.toBeNull();
			act(() => {
				tile!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
			});
			const moves = [...document.querySelectorAll('[role="menuitem"]')]
				.map((el) => el.textContent ?? "")
				.filter((t) => t.startsWith("Move to:"));
			expect(moves).toEqual(["Move to: Meine Gruppe"]);
		});

		it("the list view's tooltips and switch names are resolved", () => {
			render(<RibbonListView tab={useRibbonStore.getState().ribbons.HomepageGrid.tabs[0]} location="HomepageGrid" />);
			const names = namesAndTitles(container);
			expect(names).toContain("Toggle visibility of My Button");
			expect(names).toContain("Meine Gruppe");
			for (const v of names) expect(v).not.toMatch(/\$(Resources|LocLabels):/);
		});

		it("the modern bar's accessible names are resolved", () => {
			render(<ModernCommandBar tab={useRibbonStore.getState().ribbons.HomepageGrid.tabs[0]} location="HomepageGrid" />);
			for (const v of namesAndTitles(container)) expect(v).not.toMatch(/\$(Resources|LocLabels):/);
		});
	});

	describe("#18 rename group", () => {
		it("opens with the displayed title, Enter renames through the store as one undo step", () => {
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Rename");
			const input = dialog()?.querySelector("input");
			expect(input?.value).toBe("Meine Gruppe");

			typeInto(input!, "  Renamed  ");
			press(input!, "Enter");
			expect(dialog()).toBeNull();
			expect(group(OWN)?.label).toBe("Renamed");
			expect(useRibbonStore.getState().mutationsSincePublish).toBe(1);

			act(() => useRibbonStore.getState().undo());
			expect(group(OWN)?.label).toBe("$LocLabels:grp.Title");
		});

		it("the Rename button renames; an unchanged title keeps the label token", () => {
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Rename");
			expect(dialog()?.querySelector("input")?.value).toBe("Meine Gruppe");
			act(() => dialogButton("Rename").click());
			expect(dialog()).toBeNull();
			expect(group(OWN)?.label).toBe("$LocLabels:grp.Title");
			expect(useRibbonStore.getState().past).toHaveLength(0);

			openGroupMenu(OWN);
			clickMenuItem("Rename");
			typeInto(dialog()!.querySelector("input")!, "Manage");
			act(() => dialogButton("Rename").click());
			expect(group(OWN)?.label).toBe("Manage");
		});

		it("an out-of-the-box group's Rename… is disabled and says why: it can't be published (#33)", () => {
			render(<Classic />);
			openGroupMenu(MGMT);
			const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
				el.textContent?.includes("Rename"),
			)!;
			expect(item.getAttribute("aria-disabled")).toBe("true");
			expect(item.getAttribute("title")).toMatch(/Only tabs and groups your unmanaged customizations add/);
			act(() => item.click());
			expect(dialog()).toBeNull();
			expect(group(MGMT)?.label).toBe("$Resources:Ribbon.HomepageGrid.MainTab.Management");
		});

		it("Cancel and Escape change nothing", () => {
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Rename");
			typeInto(dialog()!.querySelector("input")!, "Nope");
			act(() => dialogButton("Cancel").click());
			expect(dialog()).toBeNull();

			openGroupMenu(OWN);
			clickMenuItem("Rename");
			const input = dialog()!.querySelector("input")!;
			expect(input.value).toBe("Meine Gruppe");
			typeInto(input, "Nope");
			press(input, "Escape");
			expect(dialog()).toBeNull();

			expect(group(OWN)?.label).toBe("$LocLabels:grp.Title");
			expect(useRibbonStore.getState().past).toHaveLength(0);
		});

		it("an empty title can't be submitted", () => {
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Rename");
			const input = dialog()!.querySelector("input")!;
			typeInto(input, "   ");
			expect(dialogButton("Rename").disabled).toBe(true);
			expect(dialog()?.textContent).toContain("Enter a title for the group.");
			press(input, "Enter");
			expect(dialog()).not.toBeNull();
			expect(group(OWN)?.label).toBe("$LocLabels:grp.Title");
		});
	});

	describe("#18 change template", () => {
		it("offers the known templates and sets the chosen one", () => {
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Change template");
			const select = dialog()!.querySelector("select")!;
			const values = [...select.options].map((o) => o.value);
			expect(select.value).toBe("Mscrm.Templates.Flexible2");
			expect(values).toEqual(
				expect.arrayContaining(["Mscrm.Templates.Flexible2", "Mscrm.Templates.Flexible", "Mscrm.Templates.OneLargeTwoMedium"]),
			);
			// Unchanged: nothing to apply.
			expect(dialogButton("Change template").disabled).toBe(true);

			selectOption(select, "Mscrm.Templates.OneLargeTwoMedium");
			act(() => dialogButton("Change template").click());
			expect(dialog()).toBeNull();
			expect(group(OWN)?.template).toBe("Mscrm.Templates.OneLargeTwoMedium");
		});

		it("keeps an unknown current template selectable; Cancel changes nothing", () => {
			act(() =>
				useRibbonStore.getState().setGroupTemplate("HomepageGrid", MAIN, OWN, "mxrm.Templates.Custom"),
			);
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Change template");
			const select = dialog()!.querySelector("select")!;
			expect(select.value).toBe("mxrm.Templates.Custom");
			selectOption(select, "Mscrm.Templates.Flexible");
			act(() => dialogButton("Cancel").click());
			expect(dialog()).toBeNull();
			expect(group(OWN)?.template).toBe("mxrm.Templates.Custom");
		});
	});

	describe("#18 confirm dialogs", () => {
		it("delete group asks first, naming the resolved title", () => {
			render(<Classic />);
			openGroupMenu(OWN);
			clickMenuItem("Delete group");
			expect(dialog()?.getAttribute("role")).toBe("alertdialog");
			expect(dialog()?.textContent).toContain("Meine Gruppe");
			act(() => dialogButton("Cancel").click());
			expect(group(OWN)).toBeDefined();

			openGroupMenu(OWN);
			clickMenuItem("Delete group");
			act(() => dialogButton("Delete group").click());
			expect(dialog()).toBeNull();
			expect(group(OWN)).toBeUndefined();
		});

		it("delete tab asks first", () => {
			act(() => useRibbonStore.getState().createTab("HomepageGrid", { id: "mxrm.contact.NewTab", label: "Fresh" }));
			useSelectionStore.getState().setTabId("mxrm.contact.NewTab");
			useUIStore.setState({ ribbonViewStyle: "classic" });
			render(<RibbonCanvas />);
			const del = container.querySelector<HTMLButtonElement>('[aria-label="Delete tab Fresh"]');
			expect(del).not.toBeNull();
			act(() => del!.click());
			expect(dialog()?.textContent).toContain("Fresh");
			act(() => dialogButton("Cancel").click());
			const tabs = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs.map((t) => t.id);
			expect(tabs()).toContain("mxrm.contact.NewTab");

			act(() => container.querySelector<HTMLButtonElement>('[aria-label="Delete tab Fresh"]')!.click());
			act(() => dialogButton("Delete tab").click());
			expect(tabs()).not.toContain("mxrm.contact.NewTab");
		});

		it("an unread unmanaged layer is said on the canvas, with Retry (#110)", () => {
			const retry = vi.fn();
			render(<RibbonCanvas layerReadError="the contact table's customizations: 503" onRetryRibbonLoad={retry} />);
			const bar = [...container.querySelectorAll<HTMLElement>(".fui-MessageBar")].find((b) =>
				b.textContent?.includes("Couldn't read your unmanaged ribbon customizations"),
			);
			expect(bar?.textContent).toContain("the contact table's customizations: 503");
			act(() => [...bar!.querySelectorAll("button")].find((b) => b.textContent === "Retry")!.click());
			expect(retry).toHaveBeenCalledTimes(1);

			// Not while loading, nor on top of a load that failed outright.
			render(<RibbonCanvas isLoadingRibbon layerReadError="x" onRetryRibbonLoad={retry} />);
			expect(container.textContent).not.toContain("Couldn't read your unmanaged");
			render(<RibbonCanvas ribbonLoadError="boom" layerReadError="x" onRetryRibbonLoad={retry} />);
			expect(container.textContent).not.toContain("Couldn't read your unmanaged");
		});

		it("a tab is renamed in place only where the rename can be published (#33)", () => {
			act(() => useRibbonStore.getState().createTab("HomepageGrid", { id: "mxrm.contact.NewTab", label: "Fresh" }));
			useUIStore.setState({ ribbonViewStyle: "classic" });
			render(<RibbonCanvas />);
			const tabEl = (id: string) =>
				[...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.includes(id))!;
			const renameInput = () => container.querySelector<HTMLInputElement>('[aria-label="Rename tab"]');

			// The out-of-the-box main tab: no editor, and the tooltip says why.
			act(() => tabEl(MAIN).dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
			expect(renameInput()).toBeNull();
			press(tabEl(MAIN), "F2");
			expect(renameInput()).toBeNull();
			expect(tabEl(MAIN).getAttribute("title")).toMatch(/Only tabs and groups your unmanaged customizations add/);

			// A tab created this session: renamed in place.
			const fresh = tabEl("mxrm.contact.NewTab");
			expect(fresh.getAttribute("title")).toBeNull();
			act(() => fresh.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
			expect(renameInput()?.value).toBe("Fresh");
		});

		it("discarding a customisation with unpublished edits asks first", () => {
			const cmd = "Mscrm.EditSelectedRecord";
			act(() =>
				useRibbonStore.getState().upsertCommand({
					id: cmd,
					enableRules: ["Mscrm.SelectionCountAtLeastOne"],
					displayRules: [],
					actions: [],
				}),
			);
			const rules = () => useRibbonStore.getState().commands.find((c) => c.id === cmd)?.enableRules;
			render(<CommandProvenanceBar commandId={cmd} />);
			const discard = () =>
				[...container.querySelectorAll("button")].find((b) => b.textContent === "Discard customisation")!;
			act(() => discard().click());
			expect(dialog()?.textContent).toContain("discards your unpublished changes");
			act(() => dialogButton("Cancel").click());
			expect(rules()).toEqual(["Mscrm.SelectionCountAtLeastOne"]);

			act(() => discard().click());
			act(() => dialogButton("Discard customisation").click());
			expect(dialog()).toBeNull();
			expect(rules()).toEqual([]);
		});
	});
});
