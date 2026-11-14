/**
 * #194, step 4: "How users see it", the tab's commands as the Unified Interface
 * command bar lists them (before rules), above the group cards.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { UsersBar } from "@/components/ribbon-canvas/UsersBar";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { usersBar } from "@/utils/usersBar";
import type {
	RibbonButton,
	RibbonDefinition,
	RibbonGroup,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";
import type {
	ClassicModernOverride,
	ModernCommand,
	ModernCommandNode,
} from "@/types/modernCommand";

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
const button = (id: string, sequence: number, extra: Partial<RibbonButton> = {}) =>
	({
		id,
		label: id.split(".").at(-1),
		kind: "button",
		sequence,
		templateAlias: "o1",
		commandId: "Mscrm.X",
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		...extra,
	}) as RibbonButton;
const group = (id: string, sequence: number, buttons: RibbonButton[]) =>
	({ id, label: id, sequence, template: "Flexible2", buttons }) as RibbonGroup;
const modern = (
	id: string,
	sequence: number,
	extra: Partial<ModernCommand> = {},
): ModernCommandNode => ({
	command: {
		id,
		label: `M ${id}`,
		uniqueName: id,
		sequence,
		hidden: false,
		disabled: false,
		...extra,
	} as ModernCommand,
	children: [],
});

// Groups and buttons out of Sequence order, as loaded XML can be.
const TAB: RibbonTab = {
	id: MAIN,
	label: "Account",
	sequence: 10,
	tabDisplayRules: [],
	groups: [
		group("G.Actions", 20, [button("x.Share", 10)]),
		group("G.Mgmt", 10, [
			button("x.Delete", 30),
			button("x.Edit", 20),
			button("x.New", 10),
			button("x.Hidden", 15, { hidden: true }),
		]),
	],
};

describe("#194 usersBar", () => {
	it("lists groups and their buttons in Sequence order, without hidden ones", () => {
		expect(usersBar(TAB, [], new Map()).map((i) => i.id)).toEqual([
			"x.New",
			"x.Edit",
			"x.Delete",
			"x.Share",
		]);
	});

	it("places a modern command before a button, and keeps a button another app's command doesn't hide", () => {
		const items = usersBar(
			TAB,
			[modern("m0", 5)],
			new Map([
				[
					"x.Edit",
					[
						{
							buttonId: "x.Edit",
							effect: "hidden",
							command: { id: "a" } as ModernCommand,
						},
						{
							buttonId: "x.Edit",
							effect: "hidden",
							command: { id: "b" } as ModernCommand,
						},
					],
				],
				[
					"x.Delete",
					[
						{
							buttonId: "x.Delete",
							effect: "hidden",
							command: { id: "c" } as ModernCommand,
						},
						{
							buttonId: "x.Delete",
							effect: "replaced",
							command: { id: "d", label: "Del" } as ModernCommand,
						},
					],
				],
			]),
		);
		expect(items.map((i) => i.id)).toEqual(["modern:m0", "x.New", "x.Delete", "x.Share"]);
	});

	it("shows a migrated command in its button's place, leaves out hidden ones, places modern commands by Sequence", () => {
		const migrated = { id: "mEdit", label: "Edit (modern)" } as ModernCommand;
		const overrides = new Map<string, ClassicModernOverride[]>([
			["x.Edit", [{ buttonId: "x.Edit", effect: "replaced", command: migrated }]],
			[
				"x.Delete",
				[{ buttonId: "x.Delete", effect: "hidden", command: {} as ModernCommand }],
			],
		]);
		const items = usersBar(
			TAB,
			[
				modern("m1", 25),
				modern("m2", 5, { hidden: true }),
				modern("m3", 5, { disabled: true }),
				modern("m4", 99),
			],
			overrides,
		);
		expect(items.map((i) => i.id)).toEqual([
			"x.New",
			"x.Edit",
			// Placed among all the buttons, the hidden Delete (30) too, as on the
			// Modern command bar view: before the first with a higher Sequence.
			"modern:m1",
			"x.Share",
			"modern:m4",
		]);
		const edit = items.find((i) => i.id === "x.Edit");
		expect(edit?.kind === "classic" && edit.replacedBy).toBe(migrated);
	});
});

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

let container: HTMLDivElement;
let root: Root;

function render(tab: RibbonTab = TAB) {
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<UsersBar tab={tab} location="HomepageGrid" />
			</FluentProvider>,
		),
	);
}
const cmd = (id: string) => container.querySelector<HTMLElement>(`[data-users-bar="${id}"]`);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: { ...empty("HomepageGrid"), tabs: [TAB] },
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
	useModernCommandStore.setState({ selectedCommandId: null });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#194 the How users see it strip", () => {
	it("is a toolbar of the tab's commands, labelled as a preview without rules", () => {
		render();
		const bar = container.querySelector('[role="toolbar"]')!;
		expect(bar.getAttribute("aria-label")).toBe("Command bar preview: Account");
		expect([...bar.querySelectorAll("[data-users-bar]")].map((b) => b.textContent)).toEqual([
			"New",
			"Edit",
			"Delete",
			"Share",
		]);
		expect(container.textContent).toContain("Preview: rules not applied");
		expect(container.textContent).toContain("Account · 4 commands");
	});

	it("choosing a command selects it everywhere, and the selection is marked", () => {
		render();
		act(() => cmd("x.Edit")!.click());
		expect(useSelectionStore.getState()).toMatchObject({
			tabId: MAIN,
			selectedGroupId: "G.Mgmt",
			selectedButtonId: "x.Edit",
		});
		expect(cmd("x.Edit")!.getAttribute("aria-current")).toBe("true");
		act(() => useSelectionStore.getState().selectButton("G.Actions", "x.Share"));
		expect(cmd("x.Share")!.getAttribute("aria-current")).toBe("true");
		expect(cmd("x.Edit")!.getAttribute("aria-current")).toBeNull();
	});

	it("the bar is one Tab stop, moved through with the arrow keys", () => {
		render();
		// The bar is one arrow-key group (tabster's attribute).
		expect(container.querySelector('[role="toolbar"]')!.getAttribute("data-tabster")).toContain(
			"mover",
		);
	});

	it("says when the tab shows nothing, or Unified Interface doesn't show it", () => {
		render({ ...TAB, groups: [group("G", 10, [button("x.H", 10, { hidden: true })])] });
		expect(container.textContent).toContain("No commands on this tab are shown.");
		render({ ...TAB, id: "Mscrm.HomepageGrid.account.Charts.Tab" });
		expect(container.textContent).not.toContain("Unified Interface doesn't show");
		render({ ...TAB, id: "Mscrm.HomepageGrid.AllEntities.VisualizationTab" });
		expect(container.textContent).toContain(
			"Unified Interface doesn't show this tab's commands.",
		);
	});
});
