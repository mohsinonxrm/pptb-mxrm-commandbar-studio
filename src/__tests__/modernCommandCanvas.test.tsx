import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ModernCommandBar } from "@/components/ribbon-canvas/ModernCommandBar";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { ModernCommandsTable } from "@/components/ribbon-canvas/modern/ModernCommandsTable";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { mapAppActionRows } from "@/services/modernCommands";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const CONTACT_MD = "608861bc-50a4-4c5f-a02c-21fe1943e2cf";
const SALES = "11111111-1111-1111-1111-111111111111";

const button = (id: string, label: string, sequence: number) => ({
	id,
	label,
	kind: "button" as const,
	sequence,
	templateAlias: "o1",
	commandId: `${id}.Command`,
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
				id: "Mscrm.HomepageGrid.contact.MainTab",
				label: "Main",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: "G",
						label: "Management",
						sequence: 10,
						template: "Mscrm.Templates.Flexible2",
						buttons: [
							button("Mscrm.HomepageGrid.contact.NewRecord", "New", 10),
							button("Mscrm.HomepageGrid.contact.RefreshModernButton", "Refresh", 30),
						],
					},
				],
			},
		],
	};
}

const row = (over: Record<string, unknown>) => ({
	context: 1,
	_contextentity_value: CONTACT_MD,
	contextvalue: "contact",
	location: 1,
	type: 0,
	hidden: false,
	isdisabled: false,
	origin: 0,
	...over,
});

let container: HTMLDivElement;
let root: Root;

function render(ui: React.ReactNode) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}

describe("modern commands on the canvas", () => {
	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: ribbon("HomepageGrid"),
				SubGrid: ribbon("SubGrid"),
				Form: ribbon("Form"),
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		useSessionStore.setState({
			activeEntity: {
				metadataId: CONTACT_MD,
				logicalName: "contact",
				displayName: "Contact",
				isCustomEntity: false,
				isIntersect: false,
			},
		});
		useSelectionStore.getState().setLocation("HomepageGrid");
		const s = useModernCommandStore.getState();
		s.reset();
		s.finishLoad(s.beginLoad("contact"), {
			apps: [{ id: SALES, name: "Sales Hub" }],
			commands: mapAppActionRows([
				row({
					appactionid: "aaaaaaaa-0000-0000-0000-000000000001",
					name: "Survey",
					uniquename: "new_Survey",
					buttonlabeltext: "Send survey",
					_appmoduleid_value: SALES,
					sequence: 20,
					visibilitytype: 1,
					visibilityformulafunctionname: "Survey_Visible",
				}),
				row({
					appactionid: "aaaaaaaa-0000-0000-0000-000000000002",
					name: "Tail",
					uniquename: "new_Tail",
					buttonlabeltext: "Tail command",
					sequence: 500,
				}),
				row({
					appactionid: "aaaaaaaa-0000-0000-0000-000000000003",
					name: "RefreshModernButton",
					uniquename:
						"msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.RefreshModernButton!1",
					buttonlabeltext: "Refresh",
					context: 0,
					_contextentity_value: null,
					contextvalue: null,
					origin: 1,
					hidden: true,
					_appmoduleid_value: SALES,
					sequence: 30,
				}),
				// Table-specific migrated copy of the classic New button (live name, #74).
				row({
					appactionid: "aaaaaaaa-0000-0000-0000-000000000004",
					name: "NewRecord",
					uniquename: "msdyn_Mscrm.HomepageGrid.contact.NewRecord!contact!1",
					buttonlabeltext: "New",
					origin: 1,
					sequence: 10,
				}),
				// Disabled migrated copy: the classic button applies, no chip and no flag.
				row({
					appactionid: "aaaaaaaa-0000-0000-0000-000000000005",
					name: "RefreshButton",
					uniquename:
						"msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.RefreshModernButton!2",
					buttonlabeltext: "Refresh (disabled copy)",
					context: 0,
					_contextentity_value: null,
					contextvalue: null,
					origin: 1,
					isdisabled: true,
					sequence: 30,
				}),
			]),
		});
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	const tab = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0];
	const labels = () =>
		[...container.querySelectorAll("button")]
			.map((b) => b.getAttribute("aria-label") ?? "")
			.filter((l) => l && !l.startsWith("Add"));

	it("interleaves read-only modern chips by sequence and flags the classic button a migrated command hides", () => {
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		expect(labels()).toEqual([
			"New — modern (migrated)",
			"Send survey — modern command (read-only), Sales Hub",
			"Refresh — hidden by modern command Refresh in Sales Hub",
			"Tail command — modern command (read-only), All apps",
		]);
		const chip = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Send survey"),
		)!;
		expect(chip.getAttribute("draggable")).toBe("false");
		expect(chip.textContent).toContain("Modern");
		expect(chip.textContent).toContain("Sales Hub");
		expect(
			container.querySelector('[aria-label="Hidden by modern command Refresh in Sales Hub"]'),
		).not.toBeNull();
		// The migrated New is a note on the classic New, not a second "New" chip.
		expect(
			container.querySelector(
				'[aria-label="Rendered as modern command New in all apps (migrated)"]',
			)?.textContent,
		).toBe("Modern (migrated)");
		expect(container.textContent).not.toContain("disabled copy");
	});

	it("hides other apps' commands when an app is picked, and shows the selection read-only", () => {
		useModernCommandStore.getState().setAppFilter("33333333-3333-3333-3333-333333333333");
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		expect(labels()).toEqual([
			"New — modern (migrated)",
			"Refresh",
			"Tail command — modern command (read-only), All apps",
		]);

		useModernCommandStore.getState().setAppFilter("all");
		render(
			<>
				<ModernCommandBar tab={tab()} location="HomepageGrid" />
				<PropertiesPane />
			</>,
		);
		const chip = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Send survey"),
		)!;
		act(() => chip.click());
		const pane = container.querySelector('[aria-label="Modern command properties"]');
		expect(pane?.textContent).toContain("read-only");
		expect(pane?.textContent).toContain("Survey_Visible");
		expect(pane?.querySelector("input, textarea")).toBeNull();
		expect(useRibbonStore.getState().mutationsSincePublish).toBe(0);
	});

	it("draws no chips on the Charts tab and badges a chart control matched from another tab's command", () => {
		const grid = ribbon("HomepageGrid");
		grid.tabs.unshift({
			id: "Mscrm.HomepageGrid.AllEntities.VisualizationTab",
			label: "Charts",
			sequence: 5,
			tabDisplayRules: [],
			groups: [
				{
					id: "Charts",
					label: "Charts",
					sequence: 10,
					template: "Mscrm.Templates.Flexible2",
					buttons: [button("Mscrm.HomepageGrid.contact.Chart.Edit", "Edit Chart", 10)],
				},
			],
		});
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: grid,
				SubGrid: ribbon("SubGrid"),
				Form: ribbon("Form"),
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		const s = useModernCommandStore.getState();
		const loaded = s.commands;
		s.finishLoad(s.beginLoad("contact"), {
			apps: [{ id: SALES, name: "Sales Hub" }],
			commands: [
				...loaded,
				...mapAppActionRows([
					row({
						appactionid: "aaaaaaaa-0000-0000-0000-000000000006",
						name: "Chart.Edit",
						uniquename: "msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.Chart.Edit!1",
						buttonlabeltext: "Edit Chart",
						context: 0,
						_contextentity_value: null,
						contextvalue: null,
						origin: 1,
						sequence: 10,
					}),
				]),
			],
		});
		const [charts, main] = useRibbonStore.getState().ribbons.HomepageGrid.tabs;

		render(<ModernCommandBar tab={charts} location="HomepageGrid" />);
		expect(labels()).toEqual(["Edit Chart — modern (migrated)"]);
		expect(
			container.querySelector(
				'[aria-label="Rendered as modern command Edit Chart in all apps (migrated)"]',
			),
		).not.toBeNull();

		render(<ModernCommandBar tab={main} location="HomepageGrid" />);
		expect(labels()).toEqual([
			"New — modern (migrated)",
			"Send survey — modern command (read-only), Sales Hub",
			"Refresh — hidden by modern command Refresh in Sales Hub",
			"Tail command — modern command (read-only), All apps",
		]);
	});

	it("logs unmatched migrated commands only once the classic ribbon is loaded, and nothing when all match", () => {
		const diagnostics = () =>
			useRuntimeLogStore
				.getState()
				.entries.filter((e) => e.message.includes("without a classic control"))
				.map((e) => e.message);
		useRuntimeLogStore.getState().clear();
		const loadedTab = tab();
		const loadedRibbons = useRibbonStore.getState().ribbons;
		const s = useModernCommandStore.getState();
		const designerAndMatched = s.commands;
		const unmatched = mapAppActionRows([
			row({
				appactionid: "aaaaaaaa-0000-0000-0000-000000000007",
				name: "NotInRibbon",
				uniquename: "msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.NotInRibbon!1",
				context: 0,
				_contextentity_value: null,
				contextvalue: null,
				origin: 1,
			}),
		]);
		s.finishLoad(s.beginLoad("contact"), {
			apps: [],
			commands: [...designerAndMatched, ...unmatched],
		});

		// Classic ribbon not loaded yet (initial empty state): nothing can match, so nothing is logged.
		const empty = (location: RibbonLocation) => ({ location, entityLogicalName: "", tabs: [] });
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: empty("HomepageGrid"),
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		render(<ModernCommandBar tab={loadedTab} location="HomepageGrid" />);
		expect(diagnostics()).toEqual([]);

		// Ribbon loaded: only the command without a classic control is reported, once.
		act(() =>
			useRibbonStore.getState().loadWorkspace({
				ribbons: loadedRibbons,
				commands: [],
				displayRules: [],
				enableRules: [],
				locLabels: [],
			}),
		);
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		expect(diagnostics()).toEqual([
			"Migrated modern commands without a classic control in contact HomepageGrid: msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.NotInRibbon!1",
		]);

		// Every migrated command matched: nothing more is logged.
		useRuntimeLogStore.getState().clear();
		act(() => s.finishLoad(s.beginLoad("contact"), { apps: [], commands: designerAndMatched }));
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		expect(diagnostics()).toEqual([]);
	});

	it("a drop on a modern chip changes nothing (it never reaches the command bar lane)", () => {
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		const before = JSON.stringify(useRibbonStore.getState().ribbons);
		const chip = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.includes("Send survey"),
		)!;
		const dataTransfer = {
			types: ["application/x-rw-btn"],
			dropEffect: "move",
			getData: (type: string) =>
				type === "application/x-rw-btn"
					? JSON.stringify({
							groupId: "G",
							buttonId: "Mscrm.HomepageGrid.contact.NewRecord",
						})
					: "",
		};
		for (const type of ["dragover", "drop"]) {
			const ev = new Event(type, { bubbles: true, cancelable: true });
			Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
			act(() => {
				chip.dispatchEvent(ev);
			});
			expect(ev.defaultPrevented).toBe(true);
		}
		expect(dataTransfer.dropEffect).toBe("none");
		expect(JSON.stringify(useRibbonStore.getState().ribbons)).toBe(before);
		expect(useRibbonStore.getState().mutationsSincePublish).toBe(0);
	});

	it("doesn't match the next table's commands against the previous table's ribbon while it loads", () => {
		// Ribbon store still holds contact; the user has moved on to account.
		useSessionStore.setState({
			activeEntity: {
				metadataId: "70816501-edb9-4740-a16c-6a5efbc05d84",
				logicalName: "account",
				displayName: "Account",
				isCustomEntity: false,
				isIntersect: false,
			},
		});
		const s = useModernCommandStore.getState();
		const loaded = s.commands;
		s.finishLoad(s.beginLoad("account"), { apps: [], commands: loaded });
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		// The global Refresh command would loosely match contact's control; no
		// badge and no chips until account's own ribbon is loaded.
		expect(labels()).toEqual(["New", "Refresh"]);
	});

	it("modern command rows in the list view are keyboard-selectable", () => {
		render(<ModernCommandsTable tab={tab()} location="HomepageGrid" />);
		const row = [...container.querySelectorAll("tr")].find((r) =>
			r.textContent?.includes("Send survey"),
		)!;
		expect(row.getAttribute("tabindex")).toBe("0");
		act(() => {
			row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(useModernCommandStore.getState().selectedCommandId).toBe(
			"aaaaaaaa-0000-0000-0000-000000000001",
		);
	});
});
