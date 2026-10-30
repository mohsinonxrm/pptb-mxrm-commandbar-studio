/**
 * #181: explanations move behind info buttons; things to act on share one
 * message slot. Properties shows one notice for a button that isn't yours,
 * and the canvas no longer stacks location banners.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { ButtonNotices } from "@/components/properties-pane/ButtonNotices";
import { RibbonCanvas } from "@/components/ribbon-canvas/RibbonCanvas";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { ClassicModernOverride } from "@/types/modernCommand";

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
const button = (over: Partial<RibbonButton>): RibbonButton =>
	({
		id: "Mscrm.HomepageGrid.account.Edit",
		label: "Edit",
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: "Mscrm.EditSelectedRecord",
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		origin: "oob",
		...over,
	}) as RibbonButton;
const def = (location: RibbonLocation, tabs: RibbonDefinition["tabs"] = []): RibbonDefinition => ({
	location,
	entityLogicalName: location === "Application" ? "" : "account",
	tabs,
});

let container: HTMLDivElement;
let root: Root;
function render(ui: React.ReactElement) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
const bars = () => [...document.body.querySelectorAll(".fui-MessageBar")];
const byName = (name: string) =>
	[...document.body.querySelectorAll("button")].find(
		(b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name,
	);

beforeEach(() => {
	localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: def("HomepageGrid", [
				{
					id: MAIN,
					label: "Account",
					sequence: 10,
					tabDisplayRules: [],
					groups: [
						{
							id: `${MAIN}.Management`,
							label: "Management",
							sequence: 10,
							template: "Mscrm.Templates.Flexible2",
							buttons: [button({})],
						},
					],
				},
				{
					id: "cbs.account.Mine",
					label: "Mine",
					sequence: 20,
					tabDisplayRules: [],
					groups: [],
				},
			]),
			SubGrid: def("SubGrid"),
			Form: def("Form"),
			Application: def("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	useSelectionStore.setState({ location: "HomepageGrid", tabId: MAIN });
	useUIStore.setState({ ribbonViewStyle: "list" });
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#181 Properties notices", () => {
	const notices = (b: RibbonButton, overrides: ClassicModernOverride[] = []) => (
		<ButtonNotices
			button={b}
			location="HomepageGrid"
			tabId={MAIN}
			groupId={`${MAIN}.Management`}
			overrides={overrides}
		/>
	);

	it("an out-of-the-box button gets one notice with its actions", () => {
		render(notices(button({})));
		expect(bars()).toHaveLength(1);
		expect(bars()[0].textContent).toContain("Out-of-the-box button");
		expect(byName("Create override")).toBeTruthy();
		// Not dismissible: it's how a built-in button is changed.
		expect(byName("Dismiss: Out-of-the-box button")).toBeUndefined();
	});

	it("a managed button names its solution and offers its layers", () => {
		render(
			notices(
				button({ origin: "managed", solutionName: "Sales", publisherName: "Microsoft" }),
			),
		);
		expect(bars()[0].textContent).toContain("From the managed solution Sales by Microsoft");
		expect(byName("View solution layers")).toBeTruthy();
	});

	it("a read-only kind gets no Customise or override; a managed one keeps its layers", () => {
		render(notices(button({ kind: "toggleButton" })));
		expect(bars()).toHaveLength(0);
		render(notices(button({ kind: "toggleButton", origin: "managed", solutionName: "Sales" })));
		expect(bars()[0].textContent).toContain("From the managed solution Sales");
		expect(byName("Create override")).toBeUndefined();
		expect(byName("Customise button")).toBeUndefined();
		expect(byName("View solution layers")).toBeTruthy();
	});

	it("a modern override that hides the button leads, its source behind +1 more", () => {
		const override = {
			effect: "hidden",
			command: { id: "m1", name: "Edit", appModuleId: null },
		} as unknown as ClassicModernOverride;
		render(notices(button({}), [override]));
		expect(bars()).toHaveLength(1);
		act(() => byName("+1 more")!.click());
		expect(bars()).toHaveLength(2);
		expect(bars()[0].textContent).toContain("Hidden by a modern command");
		expect(bars()[1].textContent).toContain("Out-of-the-box button");
	});

	it("your own button has no notice", () => {
		render(notices(button({ origin: "unmanaged", oob: false, custom: true })));
		expect(bars()).toHaveLength(0);
	});
});

describe("#181 the canvas", () => {
	it("no longer stacks location banners; About this location explains instead", () => {
		for (const loc of ["Form", "SubGrid", "Application"] as RibbonLocation[]) {
			useSelectionStore.setState({ location: loc });
			render(<RibbonCanvas />);
			expect(container.textContent).not.toContain("legacy web client");
			expect(container.textContent).not.toContain("only 3 native controls");
			expect(container.textContent).not.toContain("persistent global command bar");
		}
		expect(byName("About this location")).toBeTruthy();
	});

	it("a custom tab's Unified Interface note is behind an info button", () => {
		useSelectionStore.setState({ tabId: "cbs.account.Mine" });
		render(<RibbonCanvas />);
		expect(bars()).toHaveLength(0);
		expect(byName("How Unified Interface shows this tab")).toBeTruthy();
	});

	it("orphans are a dismissible message with Show, back when the count changes", () => {
		const orphan = (id: string) => ({ id, kind: "button", xml: "" }) as never;
		act(() =>
			useRibbonStore.setState((s) => ({
				orphans: { ...s.orphans, entity: [orphan("a"), orphan("b")] },
			})),
		);
		render(<RibbonCanvas />);
		expect(bars()[0].textContent).toContain("2 of your customizations aren't on the canvas");
		expect(byName("Show")).toBeTruthy();
		act(() => byName("Dismiss: 2 of your customizations aren't on the canvas")!.click());
		expect(bars()).toHaveLength(0);
		act(() =>
			useRibbonStore.setState((s) => ({
				orphans: { ...s.orphans, entity: [orphan("a"), orphan("b"), orphan("c")] },
			})),
		);
		expect(bars()[0].textContent).toContain("3 of your customizations");
	});
});
