import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ModernCommandBar } from "@/components/ribbon-canvas/ModernCommandBar";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
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
			"New",
			"Send survey — modern command (read-only)",
			"Refresh",
			"Tail command — modern command (read-only)",
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
	});

	it("hides other apps' commands when an app is picked, and shows the selection read-only", () => {
		useModernCommandStore.getState().setAppFilter("33333333-3333-3333-3333-333333333333");
		render(<ModernCommandBar tab={tab()} location="HomepageGrid" />);
		expect(labels()).toEqual(["New", "Refresh", "Tail command — modern command (read-only)"]);

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
});
