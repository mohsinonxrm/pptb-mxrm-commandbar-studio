/**
 * #180: the location row is a Fluent TabList in Unified Interface terms with
 * About this location and compact App / View menus (no second XML button), and
 * the ribbon tab strip shows labels only, with Move left / Move right, Add tab
 * and Tab rules always reachable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { LocationRow, RibbonTabStrip } from "@/components/ribbon-canvas/CanvasHeader";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonDefinition, RibbonLocation, RibbonTab } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const tab = (id: string, label: string, sequence: number, rules = 0): RibbonTab => ({
	id,
	label,
	sequence,
	groups: [],
	tabDisplayRules: rules
		? [
				{
					commandId: `${id}.Command`,
					rules: Array.from(
						{ length: rules },
						() => ({ kind: "FormStateRule" }) as never,
					),
				} as never,
			]
		: [],
});
const def = (location: RibbonLocation, tabs: RibbonTab[] = []): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs,
});

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();

function render(ui: React.ReactElement) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
/** A Fluent Tab repeats its label in a hidden span that reserves the bold width. */
const textOf = (el: Element) =>
	(el.querySelector(".fui-Tab__content") ?? el).textContent?.trim() ?? "";
const byName = (name: string) =>
	[...document.body.querySelectorAll("button, [role=tab]")].find(
		(b) => b.getAttribute("aria-label") === name || textOf(b) === name,
	) as HTMLElement | undefined;
const menuItem = (name: string) =>
	[...document.body.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((m) =>
		m.textContent?.trim().startsWith(name),
	);
const click = (el: Element | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
const tabIds = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs.map((t) => t.id);

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState(initialUI, true);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: def("HomepageGrid", [
				tab("Mscrm.HomepageGrid.account.MainTab", "Account", 10, 2),
				tab("cbs.account.Tab2", "Second", 20),
				tab("cbs.account.Tab3", "Third", 30),
			]),
			SubGrid: def("SubGrid"),
			Form: def("Form", [tab("Mscrm.Form.account.MainTab", "Account form", 10)]),
			Application: def("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	useSelectionStore.setState({ location: "HomepageGrid", tabId: "cbs.account.Tab2" });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#180 the location row", () => {
	it("names the locations as Unified Interface does, in its order", () => {
		render(<LocationRow />);
		const tabs = [...container.querySelectorAll('[role="tablist"] [role="tab"]')].map(textOf);
		expect(tabs).toEqual(["Main grid", "Main form", "Sub-grid", "Application"]);
		expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
			"Where the command bar appears",
		);
	});

	it("switches location and opens that ribbon's default tab", () => {
		render(<LocationRow />);
		click(byName("Main form"));
		expect(useSelectionStore.getState().location).toBe("Form");
		expect(useSelectionStore.getState().tabId).toBe("Mscrm.Form.account.MainTab");
	});

	it("has About this location, a View menu and no second XML button", () => {
		render(<LocationRow />);
		expect(byName("About this location")).toBeTruthy();
		expect(byName("XML")).toBeUndefined();
		click(byName(`View as: ${"Classic ribbon"}`) ?? byName("View as: Modern command bar"));
		click(menuItem("List"));
		expect(useUIStore.getState().ribbonViewStyle).toBe("list");
	});
});

describe("#180 the ribbon tab strip", () => {
	const strip = () => {
		const current = useRibbonStore
			.getState()
			.ribbons.HomepageGrid.tabs.find((t) => t.id === useSelectionStore.getState().tabId);
		return <RibbonTabStrip currentTab={current} />;
	};

	it("shows labels only, the id on the element, not in the text", () => {
		render(strip());
		const t = container.querySelector<HTMLElement>('[data-tab-id="cbs.account.Tab2"]')!;
		expect(t.getAttribute("role")).toBe("tab");
		expect(textOf(t)).toBe("Second");
		expect(t.textContent).not.toContain("cbs.account.Tab2");
	});

	it("moves the current tab left and right from Tab options", () => {
		render(strip());
		click(byName("Tab options"));
		click(menuItem("Move right"));
		expect(tabIds()).toEqual([
			"Mscrm.HomepageGrid.account.MainTab",
			"cbs.account.Tab3",
			"cbs.account.Tab2",
		]);
		click(byName("Tab options"));
		click(menuItem("Move left"));
		click(byName("Tab options"));
		click(menuItem("Move left"));
		expect(tabIds()[0]).toBe("cbs.account.Tab2");
	});

	it("keeps Add tab and Tab rules reachable, with the rule count", () => {
		useSelectionStore.setState({ tabId: "Mscrm.HomepageGrid.account.MainTab" });
		render(strip());
		click(byName("Add tab"));
		expect(useUIStore.getState().newTabOpen).toBe(true);
		const rules = [...container.querySelectorAll("button")].find((b) =>
			b.textContent?.startsWith("Tab rules"),
		)!;
		expect(rules.textContent).toBe("Tab rules2");
		click(rules);
		expect(useUIStore.getState().tabDisplayRulesOpen).toBe(true);
	});
});
