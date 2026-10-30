/**
 * #184 (structure): Properties has a sticky header saying what is selected,
 * whose it is and its kind; one style of collapsible section; the button and
 * command ids read-only with copy; and one close button whatever hosts it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { PropertiesHostContext } from "@/components/properties-pane/propertiesHost";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
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

const MAIN = "Mscrm.HomepageGrid.contact.MainTab";
const OWN = "mxrm.contact.Own.Group";
const MGMT = `${MAIN}.Management`;

const button = (id: string, over: Partial<RibbonButton>): RibbonButton =>
	({
		id,
		label: "$LocLabels:btn.Label",
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: "mxrm.contact.Run.Command",
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		origin: "unmanaged",
		...over,
	}) as RibbonButton;

const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: "contact",
	tabs:
		location === "HomepageGrid"
			? [
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
								template: "Mscrm.Templates.Flexible2",
								buttons: [button("mxrm.Own.Button", {})],
							},
							{
								id: MGMT,
								label: "Management",
								sequence: 20,
								template: "Mscrm.Templates.Flexible2",
								buttons: [
									button("Mscrm.HomepageGrid.contact.Edit", {
										label: "Edit",
										oob: true,
										custom: false,
										origin: "oob",
										commandId: "Mscrm.EditSelectedRecord",
									}),
								],
							},
						],
					},
				]
			: [],
});

let container: HTMLDivElement;
let root: Root;
const render = (ui: React.ReactElement) =>
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
const select = (groupId: string, buttonId: string) =>
	act(() =>
		useSelectionStore.getState().selectButtonInContext("HomepageGrid", MAIN, groupId, buttonId),
	);
const header = () => container.querySelector('[aria-label="Properties"] > div')!;
const sectionTitles = () =>
	[...container.querySelectorAll(".fui-AccordionHeader")].map((h) => h.textContent?.trim());

beforeEach(() => {
	localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid"),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [
			{
				id: "mxrm.contact.Run.Command",
				enableRules: ["mxrm.contact.One.EnableRule"],
				displayRules: [],
				actions: [],
			},
			{ id: "Mscrm.EditSelectedRecord", enableRules: [], displayRules: [], actions: [] },
		],
		displayRules: [],
		enableRules: [{ id: "mxrm.contact.One.EnableRule", steps: [] }],
		locLabels: [
			{ id: "btn.Label", titles: [{ languageCode: 1033, description: "Run report" }] },
			{ id: "tab.Title", titles: [{ languageCode: 1033, description: "Contacts" }] },
			{ id: "grp.Title", titles: [{ languageCode: 1033, description: "My Group" }] },
		],
		layers: {
			entity: {
				controlIds: ["mxrm.Own.Button"],
				containerIds: [OWN],
				locLabelIds: [],
				hides: [],
			},
		},
	} as never);
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#184 the Properties header", () => {
	it("names the selected button, whose it is and its kind", () => {
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		const text = header().textContent ?? "";
		expect(text).toContain("Run report");
		expect(text).toContain("Yours");
		expect(text).toContain("Button");
		expect(container.textContent).not.toMatch(/\$LocLabels:/);
	});

	it("says Out of the box for a Microsoft button", () => {
		select(MGMT, "Mscrm.HomepageGrid.contact.Edit");
		render(<PropertiesPane />);
		expect(header().textContent).toContain("Out of the box");
	});

	it("clears the selection when docked, and closes the drawer when a host can", () => {
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		const clear = container.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!;
		act(() => clear.click());
		expect(useSelectionStore.getState().selectedButtonId).toBeNull();

		select(OWN, "mxrm.Own.Button");
		const onClose = vi.fn();
		render(
			<PropertiesHostContext.Provider value={{ onClose }}>
				<PropertiesPane />
			</PropertiesHostContext.Provider>,
		);
		expect(container.querySelector('[aria-label="Clear selection"]')).toBeNull();
		act(() =>
			container.querySelector<HTMLButtonElement>('[aria-label="Close properties"]')!.click(),
		);
		expect(onClose).toHaveBeenCalledOnce();
	});
});

describe("#184 one style of section", () => {
	it("groups the fields into the same collapsible sections, rule counts in the titles", () => {
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		expect(sectionTitles()).toEqual([
			"Appearance",
			"Position",
			"Command",
			"Display rules",
			"Enable rules1",
			"Scaling",
			"Advanced",
		]);
		// The old uppercase "Identity" and "Command" labels are gone.
		expect(container.textContent).not.toContain("Identity");
	});

	it("shows the button and command ids read-only, with copy and Edit command", () => {
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		const ids = [...container.querySelectorAll<HTMLInputElement>("input[readonly]")].map(
			(i) => i.value,
		);
		expect(ids).toContain("mxrm.Own.Button");
		expect(ids).toContain("mxrm.contact.Run.Command");
		expect(container.querySelector('[aria-label="Copy button id"]')).not.toBeNull();
		const edit = [...container.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Edit command",
		);
		expect(edit).toBeTruthy();
	});

	it("puts the group read-only and the order with a hint under Position", () => {
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		const groupField = [
			...container.querySelectorAll<HTMLInputElement>("input[readonly]"),
		].find((i) => i.value === "My Group");
		expect(groupField).toBeTruthy();
		expect(container.textContent).toContain("Lower numbers show first within the group.");
	});
});

describe("#184 controls", () => {
	const radio = (text: string) =>
		[...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) =>
			document.querySelector(`label[for="${r.id}"]`)?.textContent?.startsWith(text),
		);
	const rulesOf = (id: string) => useRibbonStore.getState().commands.find((c) => c.id === id)!;

	it("Show on is read-only on Microsoft's command, and says why", () => {
		select(MGMT, "Mscrm.HomepageGrid.contact.Edit");
		render(<PropertiesPane />);
		expect(radio("All clients")!.disabled).toBe(true);
		expect(container.textContent).toContain("Customise the command to change where it shows.");
	});

	it("Show on writes and clears a client-type filter on your command, naming buttons that share it", () => {
		// A second button on the same command.
		const ribbons = useRibbonStore.getState().ribbons;
		const own = ribbons.HomepageGrid.tabs[0].groups[0];
		act(() =>
			useRibbonStore.setState({
				ribbons: {
					...ribbons,
					HomepageGrid: {
						...ribbons.HomepageGrid,
						tabs: [
							{
								...ribbons.HomepageGrid.tabs[0],
								groups: [
									{
										...own,
										buttons: [
											...own.buttons,
											button("mxrm.Own.Second", { label: "Second" }),
										],
									},
									ribbons.HomepageGrid.tabs[0].groups[1],
								],
							},
						],
					},
				},
			}),
		);
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		expect(container.textContent).toContain(
			"Also changes 1 other button that uses this command: Second.",
		);
		expect(radio("All clients")!.checked).toBe(true);

		act(() => radio("Classic web client only")!.click());
		const ids = rulesOf("mxrm.contact.Run.Command").displayRules;
		const rule = useRibbonStore.getState().displayRules.find((r) => r.id === ids[0])!;
		expect(rule.steps).toEqual([{ kind: "CommandClientTypeRule", type: "Refresh" }]);
		expect(radio("Classic web client only")!.checked).toBe(true);

		act(() => radio("All clients")!.click());
		expect(rulesOf("mxrm.contact.Run.Command").displayRules).toEqual([]);
	});

	it("shows bound rules as tags that open or unbind, and binds only a rule picked from the list", () => {
		act(() =>
			useRibbonStore.setState((s) => ({
				enableRules: [...s.enableRules, { id: "mxrm.contact.Two.EnableRule", steps: [] }],
			})),
		);
		select(OWN, "mxrm.Own.Button");
		render(<PropertiesPane />);
		const tags = container.querySelector('[aria-label="Bound enable rules"]')!;
		expect(tags.textContent).toContain("One");
		const bind = () =>
			[...container.querySelectorAll<HTMLButtonElement>("button")].find(
				(b) => b.textContent?.trim() === "Bind",
			)!;
		// Two pickers (display and enable); the enable one is the second.
		expect(bind().disabled).toBe(true);

		// Pick from the enable-rule list, then Bind.
		const enablePicker = [
			...container.querySelectorAll<HTMLInputElement>('[role="combobox"]'),
		].find((c) =>
			document.querySelector(`label[for="${c.id}"]`)?.textContent?.includes("enable rule"),
		)!;
		act(() => enablePicker.click());
		const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
			(o) => o.textContent === "mxrm.contact.Two.EnableRule",
		)!;
		act(() => option.click());
		const enableBind = [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
			(b) => b.textContent?.trim() === "Bind",
		)[1];
		expect(enableBind.disabled).toBe(false);
		act(() => enableBind.click());
		expect(rulesOf("mxrm.contact.Run.Command").enableRules).toEqual([
			"mxrm.contact.One.EnableRule",
			"mxrm.contact.Two.EnableRule",
		]);

		const unbind = container.querySelector<HTMLButtonElement>(
			'[aria-label="Unbind enable rule One"]',
		)!;
		act(() => unbind.click());
		expect(rulesOf("mxrm.contact.Run.Command").enableRules).toEqual([
			"mxrm.contact.Two.EnableRule",
		]);
	});
});
