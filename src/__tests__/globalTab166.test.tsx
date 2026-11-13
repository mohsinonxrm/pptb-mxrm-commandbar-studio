/**
 * #166: the global command bar shows your buttons only in its New group
 * (Mscrm.GlobalTab.New.Controls._children, Unified Interface). Groups can't be
 * added to GlobalTab, buttons can't be added to or moved into its other groups,
 * and the publish dialog says so for anything that got there anyway.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { planScope } from "@/services/publishPlan";
import { NewButtonModal } from "@/components/modals/NewButtonModal";
import { NewGroupModal } from "@/components/modals/NewGroupModal";
import {
	GLOBAL_NEW_GROUP_ID,
	GLOBAL_TAB_ID,
	newButtonBlockedReason,
	newGroupBlockedReason,
} from "@/utils/globalTab";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const OTHER = "Mscrm.GlobalTab.Other";
const button = (id: string): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: "cbs.Command",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
});

const application = (
	newButtons: RibbonButton[],
	otherButtons: RibbonButton[],
): RibbonDefinition => ({
	location: "Application",
	entityLogicalName: "",
	tabs: [
		{
			id: GLOBAL_TAB_ID,
			label: "Global",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{
					id: GLOBAL_NEW_GROUP_ID,
					label: "New",
					sequence: 10,
					template: "Flexible2",
					buttons: newButtons,
				},
				{
					id: OTHER,
					label: "Other",
					sequence: 20,
					template: "Flexible2",
					buttons: otherButtons,
				},
			],
		},
	],
});
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: "account",
	tabs: [],
});
const groups = () => useRibbonStore.getState().ribbons.Application.tabs[0].groups;
const ids = (groupId: string) =>
	groups()
		.find((g) => g.id === groupId)!
		.buttons.map((b) => b.id);
const lastWarning = () => useRuntimeLogStore.getState().entries.at(-1)?.message ?? "";

beforeEach(() => {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: empty("HomepageGrid"),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: application([button("cbs.InNew")], [button("cbs.InOther")]),
		},
		commands: [{ id: "cbs.Command", enableRules: [], displayRules: [], actions: [] }],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	useSelectionStore.getState().setLocation("Application");
	useSelectionStore.getState().setTabId(GLOBAL_TAB_ID);
	useRuntimeLogStore.getState().clear();
});

describe("#166 the rule", () => {
	it("allows buttons only in the New group, and no new groups, on GlobalTab only", () => {
		expect(
			newButtonBlockedReason("Application", GLOBAL_TAB_ID, GLOBAL_NEW_GROUP_ID),
		).toBeUndefined();
		expect(newButtonBlockedReason("Application", GLOBAL_TAB_ID, OTHER)).toContain("New group");
		expect(newGroupBlockedReason("Application", GLOBAL_TAB_ID)).toContain("New group");
		// Other tabs and the table ribbons are unaffected
		expect(newButtonBlockedReason("Application", "Mscrm.BasicHomeTab", "X")).toBeUndefined();
		expect(newButtonBlockedReason("HomepageGrid", GLOBAL_TAB_ID, OTHER)).toBeUndefined();
		expect(newGroupBlockedReason("Application", "Mscrm.BasicHomeTab")).toBeUndefined();
	});
});

describe("#166 the store refuses, and says why", () => {
	it("adds a button to the New group, not to another GlobalTab group", () => {
		const s = useRibbonStore.getState();
		s.createButton({
			location: "Application",
			tabId: GLOBAL_TAB_ID,
			groupId: GLOBAL_NEW_GROUP_ID,
			button: { ...button("cbs.Added"), label: "Added" },
		});
		expect(ids(GLOBAL_NEW_GROUP_ID)).toContain("cbs.Added");
		s.createButton({
			location: "Application",
			tabId: GLOBAL_TAB_ID,
			groupId: OTHER,
			button: { ...button("cbs.Refused"), label: "Refused" },
		});
		expect(ids(OTHER)).not.toContain("cbs.Refused");
		expect(lastWarning()).toContain(`Can't add "Refused" to ${OTHER}`);
	});

	it("adds no group to GlobalTab, by creating or duplicating", () => {
		const s = useRibbonStore.getState();
		s.createGroup({
			location: "Application",
			tabId: GLOBAL_TAB_ID,
			group: { label: "Mine", template: "Flexible2", buttons: [] },
		});
		s.duplicateGroup("Application", GLOBAL_TAB_ID, GLOBAL_NEW_GROUP_ID);
		expect(groups().map((g) => g.id)).toEqual([GLOBAL_NEW_GROUP_ID, OTHER]);
		expect(lastWarning()).toContain(`Can't duplicate ${GLOBAL_NEW_GROUP_ID}`);
	});

	it("moves a button within the New group, but not out to another GlobalTab group", () => {
		const s = useRibbonStore.getState();
		s.createButton({
			location: "Application",
			tabId: GLOBAL_TAB_ID,
			groupId: GLOBAL_NEW_GROUP_ID,
			button: { ...button("cbs.Second"), label: "Second" },
		});
		const src = {
			location: "Application" as const,
			tabId: GLOBAL_TAB_ID,
			groupId: GLOBAL_NEW_GROUP_ID,
			buttonId: "cbs.Second",
		};
		expect(s.moveButton(src, { ...src, beforeButtonId: "cbs.InNew" } as never)).not.toBeNull();
		expect(ids(GLOBAL_NEW_GROUP_ID)[0]).toBe("cbs.Second");
		expect(
			s.moveButton(src, { location: "Application", tabId: GLOBAL_TAB_ID, groupId: OTHER }),
		).toBeNull();
		expect(ids(OTHER)).toEqual(["cbs.InOther"]);
		expect(lastWarning()).toContain(`Can't move cbs.Second to ${OTHER}`);
	});
});

describe("#166 the publish dialog", () => {
	const plan = (current: RibbonDefinition, baseline: RibbonDefinition) =>
		planScope({
			locations: [{ current, baseline }],
			commands: [],
			baselineCommands: [],
			enableRules: [],
			baselineEnableRules: [],
			displayRules: [],
			baselineDisplayRules: [],
		});

	it("warns about a button added to another GlobalTab group, not one in New or already there", () => {
		const baseline = application([], [button("cbs.InOther")]);
		const added = plan(
			application([button("cbs.InNew")], [button("cbs.InOther"), button("cbs.Imported")]),
			baseline,
		);
		expect(added.warnings.filter((w) => w.includes("Mscrm.GlobalTab.New"))).toEqual([
			`"cbs.Imported" (cbs.Imported) in ${OTHER}: the global command bar shows your buttons only in its New group (Mscrm.GlobalTab.New), in Unified Interface`,
		]);
	});

	it("warns about a new group on GlobalTab", () => {
		const current = application([], []);
		current.tabs[0].groups.push({
			id: "cbs.Global.Mine.Group",
			label: "Mine",
			sequence: 30,
			template: "Flexible2",
			buttons: [],
		});
		expect(plan(current, application([], [])).warnings.join("\n")).toContain(
			'New group "Mine" (cbs.Global.Mine.Group) on GlobalTab',
		);
	});
});

describe("#166 the dialogs", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		useUIStore.setState({ newButtonGroupId: null, newGroupOpen: false } as never);
	});
	const createButtonIn = (text: string) =>
		[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
			(b) => b.textContent?.trim() === text,
		)!;

	it("New button says why and won't create in another GlobalTab group", () => {
		act(() => useUIStore.setState({ newButtonGroupId: OTHER } as never));
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<NewButtonModal />
				</FluentProvider>,
			),
		);
		expect(document.querySelector('[role="dialog"]')!.textContent).toContain("New group");
		expect(createButtonIn("Create button").disabled).toBe(true);
	});

	it("New group says why and won't create on GlobalTab", () => {
		act(() => useUIStore.setState({ newGroupOpen: true } as never));
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<NewGroupModal />
				</FluentProvider>,
			),
		);
		expect(createButtonIn("Create group").disabled).toBe(true);
	});
});
