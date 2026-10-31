/**
 * #180: the location row is a Fluent TabList in Unified Interface terms with
 * About this location and compact App / View menus (no second XML button). The
 * ribbon tab strip became the Structure tree (#194, structure194.test.tsx).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { LocationRow } from "@/components/ribbon-canvas/CanvasHeader";
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
