/**
 * #194, step 3: Edit mode's group cards. A card per group with its controls in
 * Sequence order, the group's actions in its ⋮ menu (with Move left / Move
 * right, which publish like a tab's order, #163), and rows dragged to reorder
 * or move. Also moveGroup in the store and the publish.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { GroupCards } from "@/components/ribbon-canvas/GroupCards";
import { canMoveGroup, useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { planScope } from "@/services/publishPlan";
import { mergeScopeChanges, parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { summarizePublish } from "@/services/publishSummary";
import { dropPlace } from "@/utils/groupCards";
import type {
	RibbonButton,
	RibbonDefinition,
	RibbonGroup,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIN = "Mscrm.HomepageGrid.account.MainTab";
const MGMT = `${MAIN}.Management`;
const ACTIONS = `${MAIN}.Actions`;
const OWN = "mxrm.account.Own.Group";

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
		// Loaded from the platform: a move makes your copy (#26).
		origin: "oob",
		...extra,
	}) as RibbonButton;
const group = (id: string, label: string, sequence: number, buttons: RibbonButton[]) =>
	({ id, label, sequence, template: "Mscrm.Templates.Flexible2", buttons }) as RibbonGroup;

function homeGrid(): RibbonDefinition {
	return {
		location: "HomepageGrid",
		entityLogicalName: "account",
		tabs: [
			{
				id: MAIN,
				label: "Account",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					group(MGMT, "Management", 10, [
						// Not in Sequence order, as a customization can leave it.
						button(`${MAIN}.Delete`, "Delete", 20, { hidden: true }),
						button(`${MAIN}.Edit`, "Edit", 10),
					]),
					group(OWN, "Mine", 20, [
						button("mxrm.account.Approve", "Approve", 10, {
							oob: false,
							custom: true,
							origin: "unmanaged",
						}),
					]),
					group(ACTIONS, "Actions", 30, [button(`${MAIN}.Share`, "Share", 10)]),
				],
			} as RibbonTab,
		],
	};
}
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs: [],
});

function load(layer = true) {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: homeGrid(),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
		baseLanguageCode: 1033,
		layers: layer
			? {
					entity: {
						controlIds: ["mxrm.account.Approve"],
						containerIds: [OWN],
						locLabelIds: [],
						hides: [],
					},
				}
			: {},
	} as never);
}
const groups = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups;
const plan = () => {
	const s = useRibbonStore.getState();
	return planScope({
		locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
		commands: [],
		baselineCommands: [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		layer: s.layers.entity
			? { containerIds: s.layers.entity.containerIds ?? [], locLabelIds: [] }
			: undefined,
	});
};

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();

function render() {
	function Cards() {
		const tab = useRibbonStore((s) => s.ribbons.HomepageGrid.tabs[0]);
		return <GroupCards tab={tab} location="HomepageGrid" />;
	}
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<Cards />
			</FluentProvider>,
		),
	);
}
const card = (id: string) => container.querySelector<HTMLElement>(`[data-group-card="${id}"]`)!;
const rows = (id: string) =>
	[...card(id).querySelectorAll<HTMLElement>("[data-card-button]")].map((r) =>
		r.getAttribute("data-card-button"),
	);
const row = (id: string) => container.querySelector<HTMLElement>(`[data-card-button="${id}"]`)!;
const click = (el: Element | null | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
const menuItem = (name: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) =>
		m.textContent?.trim().startsWith(name),
	);
const menuLabel = () => document.querySelector('[role="menu"]')?.getAttribute("aria-label");

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState(initialUI, true);
	load();
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#194 moveGroup and its publish", () => {
	it("your group moves between others with a Sequence between theirs; two others can't swap", () => {
		expect(canMoveGroup(useRibbonStore.getState(), "HomepageGrid", MAIN, OWN, -1)).toBe(true);
		// Management passes Mine (yours): Mine is renumbered.
		expect(canMoveGroup(useRibbonStore.getState(), "HomepageGrid", MAIN, MGMT, 1)).toBe(true);
		// Out of the box, past out of the box: can't publish.
		act(() => useRibbonStore.getState().moveGroup("HomepageGrid", MAIN, OWN, 1));
		expect(groups().map((g) => g.id)).toEqual([MGMT, ACTIONS, OWN]);
		expect(canMoveGroup(useRibbonStore.getState(), "HomepageGrid", MAIN, MGMT, 1)).toBe(false);
		act(() => useRibbonStore.getState().moveGroup("HomepageGrid", MAIN, MGMT, 1));
		expect(groups().map((g) => g.id)).toEqual([MGMT, ACTIONS, OWN]);
		// The edges.
		expect(canMoveGroup(useRibbonStore.getState(), "HomepageGrid", MAIN, MGMT, -1)).toBe(false);
		expect(canMoveGroup(useRibbonStore.getState(), "HomepageGrid", MAIN, OWN, 1)).toBe(false);

		const seq = groups().map((g) => g.sequence);
		expect(seq[0] < seq[1] && seq[1] < seq[2]).toBe(true);
		const p = plan();
		expect(p.unsupported).toEqual([]);
		expect(p.resequencedGroups).toEqual([{ id: OWN, sequence: seq[2] }]);
		// One undo step.
		act(() => useRibbonStore.getState().undo());
		expect(groups().map((g) => g.id)).toEqual([MGMT, OWN, ACTIONS]);
		expect(plan().resequencedGroups).toEqual([]);
	});

	it("the publish summary says the group moved", () => {
		act(() => useRibbonStore.getState().moveGroup("HomepageGrid", MAIN, OWN, -1));
		const s = useRibbonStore.getState();
		const summary = summarizePublish({
			plan: plan(),
			locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
			buttonName: (b: RibbonButton) => b.label,
			baselineCommands: [],
			baselineEnableRuleIds: [],
			baselineDisplayRuleIds: [],
			titleOf: (l: string) => l,
		});
		expect(JSON.stringify(summary)).toContain("Move group");
	});

	it("groups are moved in Sequence order; only the moved one and the one it passes can change", () => {
		// Management passes Mine (yours): Mine is renumbered before it.
		act(() => useRibbonStore.getState().moveGroup("HomepageGrid", MAIN, MGMT, 1));
		const g = () => Object.fromEntries(groups().map((x) => [x.id, x.sequence]));
		expect(g()[MGMT]).toBe(10);
		expect(g()[OWN]).toBeLessThan(10);
		expect(plan().resequencedGroups).toEqual([{ id: OWN, sequence: g()[OWN] }]);

		// A new group added last with a lower Sequence is shown, and left, where
		// its Sequence puts it (review).
		load();
		useRibbonStore.setState((s) => {
			const r = structuredClone(s.ribbons);
			const t = r.HomepageGrid.tabs[0];
			t.groups.find((x) => x.id === OWN)!.sequence = 50;
			t.groups.find((x) => x.id === ACTIONS)!.sequence = 100;
			t.groups.push(group("mxrm.New", "New", 40, []));
			return { ribbons: r };
		});
		act(() => useRibbonStore.getState().moveGroup("HomepageGrid", MAIN, OWN, 1));
		expect(g()["mxrm.New"]).toBe(40);
		expect(g()[OWN]).toBeGreaterThan(100);
		expect(plan().unsupported).toEqual([]);
	});

	it("the merge writes the new Sequence into the layer's group, also inside its own tab", () => {
		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions>` +
				`<CustomAction Id="g.CA" Location="${MAIN}.Groups._children" Sequence="20"><CommandUIDefinition><Group Id="${OWN}" Sequence="20" Template="Mscrm.Templates.Flexible2"><Controls Id="${OWN}.Controls" /></Group></CommandUIDefinition></CustomAction>` +
				`<CustomAction Id="t.CA" Location="Mscrm.Tabs._children" Sequence="90"><CommandUIDefinition><Tab Id="mxrm.Tab" Sequence="90"><Groups Id="mxrm.Tab.Groups"><Group Id="mxrm.Tab.G" Sequence="10" Template="Mscrm.Templates.Flexible2" /></Groups></Tab></CommandUIDefinition></CustomAction>` +
				`</CustomActions></RibbonDiffXml>`,
		);
		const merged = mergeScopeChanges(layer, parseRibbonDiffParts("<RibbonDiffXml />"), {
			resequencedContainers: [
				{ id: OWN, sequence: 5 },
				{ id: "mxrm.Tab.G", sequence: 30 },
			],
		});
		const [own, tab] = [...merged.customActions.values()];
		expect(own).toContain(`Sequence="5"><CommandUIDefinition><Group Id="${OWN}" Sequence="5"`);
		expect(tab).toContain(
			`<CustomAction Id="t.CA" Location="Mscrm.Tabs._children" Sequence="90"`,
		);
		expect(tab).toContain(`<Group Id="mxrm.Tab.G" Sequence="30"`);
	});

	it("a drag that ends in Sequence order's last place moves the button (review)", () => {
		// Management's array is [Delete 20, Edit 10]: Edit dropped on Delete goes last,
		// though it's last in the array.
		const g = groups();
		const place = dropPlace(
			g,
			{ groupId: MGMT, buttonId: `${MAIN}.Edit` },
			{ groupId: MGMT, buttonId: `${MAIN}.Delete` },
		)!;
		expect(place).toEqual({ groupId: MGMT });
		let moved: string | null = null;
		act(() => {
			moved = useRibbonStore
				.getState()
				.moveButton(
					{
						location: "HomepageGrid",
						tabId: MAIN,
						groupId: MGMT,
						buttonId: `${MAIN}.Edit`,
					},
					{ location: "HomepageGrid", tabId: MAIN, groupId: MGMT },
				);
		});
		// Not yours: your copy, after Delete.
		expect(moved).toMatch(/Edit/);
		const mgmt = groups().find((x) => x.id === MGMT)!.buttons;
		expect(mgmt.find((b) => b.id === moved)!.sequence).toBeGreaterThan(20);
	});

	it("a moved button is placed among the destination's controls in Sequence order", () => {
		// Management's array is [Delete 20, Edit 10]: before Delete means between 10 and 20.
		act(() =>
			useRibbonStore.getState().moveButton(
				{
					location: "HomepageGrid",
					tabId: MAIN,
					groupId: OWN,
					buttonId: "mxrm.account.Approve",
				},
				{
					location: "HomepageGrid",
					tabId: MAIN,
					groupId: MGMT,
					beforeButtonId: `${MAIN}.Delete`,
				},
			),
		);
		const mgmt = groups().find((g) => g.id === MGMT)!.buttons;
		const approve = mgmt.find((b) => b.id === "mxrm.account.Approve")!;
		expect(approve.sequence > 10 && approve.sequence < 20).toBe(true);
	});
});

describe("#194 dropPlace", () => {
	const g = homeGrid().tabs[0].groups;
	it("takes the place of the row it's dropped on; after it when moved down its own group", () => {
		// Management in Sequence order: Edit 10, Delete 20.
		expect(
			dropPlace(
				g,
				{ groupId: MGMT, buttonId: `${MAIN}.Edit` },
				{ groupId: MGMT, buttonId: `${MAIN}.Delete` },
			),
		).toEqual({ groupId: MGMT });
		expect(
			dropPlace(
				g,
				{ groupId: MGMT, buttonId: `${MAIN}.Delete` },
				{ groupId: MGMT, buttonId: `${MAIN}.Edit` },
			),
		).toEqual({ groupId: MGMT, before: `${MAIN}.Edit` });
		expect(
			dropPlace(
				g,
				{ groupId: OWN, buttonId: "mxrm.account.Approve" },
				{ groupId: MGMT, buttonId: `${MAIN}.Delete` },
			),
		).toEqual({ groupId: MGMT, before: `${MAIN}.Delete` });
	});
	it("a card's empty space puts it last; dropping in place moves nothing", () => {
		expect(
			dropPlace(g, { groupId: OWN, buttonId: "mxrm.account.Approve" }, { groupId: ACTIONS }),
		).toEqual({ groupId: ACTIONS });
		expect(
			dropPlace(g, { groupId: MGMT, buttonId: `${MAIN}.Delete` }, { groupId: MGMT }),
		).toBeNull();
		expect(
			dropPlace(
				g,
				{ groupId: MGMT, buttonId: `${MAIN}.Edit` },
				{ groupId: MGMT, buttonId: `${MAIN}.Edit` },
			),
		).toBeNull();
	});
});

describe("#194 the group cards", () => {
	it("a card per group in the tab's order, controls in Sequence order with their markers", () => {
		render();
		expect(
			[...container.querySelectorAll("[data-group-card]")].map((c) =>
				c.getAttribute("data-group-card"),
			),
		).toEqual([MGMT, OWN, ACTIONS]);
		expect(card(MGMT).textContent).toContain("Mscrm.Templates.Flexible2");
		expect(rows(MGMT)).toEqual([`${MAIN}.Edit`, `${MAIN}.Delete`]);
		expect(row(`${MAIN}.Delete`).textContent).toContain("Hidden");
		expect(row("mxrm.account.Approve").textContent).toContain("Yours");
		expect(row(`${MAIN}.Edit`).getAttribute("aria-label")).toBe("Edit, Sequence 10");
	});

	it("selects a control or a group, and shows the selection", () => {
		render();
		click(row(`${MAIN}.Edit`));
		expect(useSelectionStore.getState()).toMatchObject({
			selectedGroupId: MGMT,
			selectedButtonId: `${MAIN}.Edit`,
		});
		expect(row(`${MAIN}.Edit`).getAttribute("aria-pressed")).toBe("true");
		click(card(OWN).querySelector("[aria-pressed]"));
		expect(useSelectionStore.getState()).toMatchObject({
			selectedGroupId: OWN,
			selectedButtonId: null,
		});
	});

	it("a card's ⋮ menu has the group's actions, with Move left / Move right where they publish", () => {
		render();
		click(container.querySelector('button[aria-label="Group options: Mine"]'));
		expect(menuLabel()).toBe("Actions for Mine");
		expect(menuItem("Move left")?.getAttribute("aria-disabled")).not.toBe("true");
		click(menuItem("Move left"));
		expect(groups().map((g) => g.id)).toEqual([OWN, MGMT, ACTIONS]);

		// Actions would pass Management: neither is yours.
		click(container.querySelector('button[aria-label="Group options: Actions"]'));
		expect(menuLabel()).toBe("Actions for Actions");
		const left = menuItem("Move left");
		expect(left?.getAttribute("aria-disabled")).toBe("true");
		expect(left?.textContent).toContain("Only groups your customizations add");
		expect(menuItem("Move right")?.getAttribute("aria-disabled")).toBe("true");
		expect(menuItem("Move right")?.textContent).not.toContain("Only groups");
	});

	it("a menu closed with Escape gives focus back to what opened it", async () => {
		render();
		const options = container.querySelector<HTMLElement>(
			'button[aria-label="Group options: Mine"]',
		)!;
		click(options);
		expect(menuLabel()).toBe("Actions for Mine");
		act(() => {
			document
				.querySelector('[role="menu"]')!
				.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		await act(() => new Promise((r) => setTimeout(r)));
		expect(document.querySelector('[role="menu"]')).toBeNull();
		expect(document.activeElement).toBe(options);
	});

	it("a row's menu (right-click, Shift+F10) is the button menu; Add button opens the dialog", () => {
		render();
		act(() =>
			row(`${MAIN}.Edit`).dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			),
		);
		expect(menuLabel()).toBe("Actions for Edit");
		act(() => {
			document
				.querySelector('[role="menu"]')!
				.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});
		act(() => {
			row("mxrm.account.Approve").dispatchEvent(
				new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
			);
		});
		expect(menuLabel()).toBe("Actions for Approve");
		click(container.querySelector('button[aria-label="Add button to Actions"]'));
		expect(useUIStore.getState().newButtonGroupId).toBe(ACTIONS);
	});
});
