/**
 * #179: the top bar holds what the sub-header had (XML, compare, open in app,
 * the Properties mode), Publish says how many changes it publishes and is never
 * hidden, tool-wide messages sit in flow under the bar, and below 1200 px the
 * side panes become a rail and overlay drawers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { TopBar } from "@/components/shell/TopBar";
import { Layout } from "@/components/shell/Layout";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useDraftStore } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useContext } from "react";
import { PropertiesHostContext } from "@/components/properties-pane/propertiesHost";

/** Stands in for Properties: like its header, it shows the host's close button (#184). */
function FakeProperties() {
	const { onClose } = useContext(PropertiesHostContext);
	return (
		<div>
			PROPERTIES
			{onClose && <button type="button" aria-label="Close properties" onClick={onClose} />}
		</div>
	);
}

// Layout lazy-loads every panel and modal; they aren't under test here, and
// loading them for real outlives the test.
vi.mock("@/components/panels/XmlView", () => ({ default: () => null }));
vi.mock("@/components/panels/CommandEditorPanel", () => ({ default: () => null }));
vi.mock("@/components/panels/RuleEditorPanel", () => ({ default: () => null }));
vi.mock("@/components/modals/BulkPublishModal", () => ({ default: () => null }));
// The changes Publish counts (#188); publish188 tests the real plan.
const publishPlan = vi.hoisted(() => ({ changes: [] as unknown[] }));
vi.mock("@/hooks/usePublishPlan", () => ({
	usePublishPlan: () => ({ changes: publishPlan.changes, unsupported: [] }),
}));
vi.mock("@/components/modals/NewButtonModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NewGroupModal", () => ({ default: () => null }));
vi.mock("@/components/modals/NewTabModal", () => ({ default: () => null }));
vi.mock("@/components/modals/ImportXmlModal", () => ({ default: () => null }));
vi.mock("@/components/command-palette/CommandPalette", () => ({ default: () => null }));
vi.mock("@/components/panels/TranslationsView", () => ({ default: () => null }));
vi.mock("@/components/modals/IconPickerModal", () => ({ default: () => null }));
vi.mock("@/components/panels/WebResourceBrowser", () => ({ default: () => null }));
vi.mock("@/components/panels/UrlComposerModal", () => ({ default: () => null }));
vi.mock("@/components/panels/CompareView", () => ({ default: () => null }));
vi.mock("@/components/modals/HideInsteadOfDeleteModal", () => ({ default: () => null }));

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();

function render(ui: React.ReactElement) {
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
}
const buttons = () => [...document.body.querySelectorAll("button")];
const byName = (name: string) =>
	buttons().find((b) => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
const menuItem = (name: string) =>
	[...document.body.querySelectorAll('[role^="menuitem"]')].find(
		(m) => m.textContent?.trim() === name,
	) as HTMLElement | undefined;
const click = (el: Element | undefined) => {
	if (!el) throw new Error("not found");
	act(() => (el as HTMLElement).click());
};
const setWidth = (w: number) => {
	Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
	act(() => {
		window.dispatchEvent(new Event("resize"));
	});
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useUIStore.setState(initialUI, true);
	useDraftStore.setState({ target: null });
	useRibbonStore.setState({ mutationsSincePublish: 0 });
	publishPlan.changes = [];
	useSessionStore.setState({ connectionNotice: null });
	useSelectionStore.setState({ selectedButtonId: null, selectedGroupId: null });
	setWidth(1600);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#179 Publish", () => {
	it("says how many changes it publishes and opens the publish dialog", () => {
		useDraftStore.setState({
			target: { connectionUrl: "u", solutionId: "s", entity: "account" },
		} as never);
		useRibbonStore.setState({ mutationsSincePublish: 5 });
		// Five edits, two changes: it counts what it publishes.
		publishPlan.changes = [{}, {}];
		render(<TopBar />);
		click(byName("Publish 2 changes"));
		expect(useUIStore.getState().bulkPublishOpen).toBe(true);
	});

	it("is disabled with a reason when there's nothing to publish, and doesn't open", () => {
		render(<TopBar />);
		const publish = byName("Publish")!;
		expect(publish.getAttribute("aria-disabled")).toBe("true");
		expect(publish.getAttribute("aria-describedby")).toBeTruthy();
		click(publish);
		expect(useUIStore.getState().bulkPublishOpen).toBe(false);
	});
});

describe("#179 the sub-header's actions moved to the top bar", () => {
	it("has one XML menu: view, import and compare", () => {
		render(<TopBar />);
		click(byName("XML"));
		click(menuItem("View XML"));
		expect(useUIStore.getState().xmlDrawerOpen).toBe(true);
		click(byName("XML"));
		click(menuItem("Import XML…"));
		expect(useUIStore.getState().importXmlOpen).toBe(true);
		click(byName("XML"));
		click(menuItem("Compare with published"));
		expect(useUIStore.getState().diffViewerOpen).toBe(true);
		expect(useUIStore.getState().diffViewerMode).toBe("compare");
	});

	it("sets the Properties mode and the bottom panel from the View menu", () => {
		render(<TopBar />);
		click(byName("View"));
		click(menuItem("Hidden"));
		expect(useUIStore.getState().rightPaneMode).toBe("hidden");
		click(byName("View"));
		click(menuItem("Show the bottom panel"));
		expect(useUIStore.getState().bottomCollapsed).toBe(!initialUI.bottomCollapsed);
	});

	it("keeps Open in Dynamics 365 disabled until a table is open", () => {
		render(<TopBar />);
		// Still focusable, so its tooltip names it.
		expect(byName("Open this table in Dynamics 365")?.getAttribute("aria-disabled")).toBe(
			"true",
		);
	});
});

describe("#179 the solution picker", () => {
	it("gives focus back to the picker after a solution is chosen", async () => {
		const sol = {
			id: "s1",
			uniqueName: "CBSLiveTest",
			friendlyName: "CBS Live Test",
			version: "1.0.0.0",
			isManaged: false,
		};
		useSessionStore.setState({ solutions: [sol], activeSolution: null } as never);
		render(<TopBar />);
		act(() => useUIStore.getState().setSolutionPickerOpen(true));
		const input = document.body.querySelector<HTMLInputElement>(
			'[role="combobox"]:not([aria-label="Table"])',
		)!;
		click(input);
		const option = document.body.querySelector<HTMLElement>('[role="option"]')!;
		click(option);
		expect(useUIStore.getState().solutionPickerOpen).toBe(false);
		(document.activeElement as HTMLElement | null)?.blur();
		await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
		expect(document.activeElement?.getAttribute("aria-label")).toBe("Solution: CBS Live Test");
	});
});

describe("#179 tool-wide messages and the narrow layout", () => {
	const shell = () => (
		<Layout leftPane={<div>LEFT PANE</div>} rightPane={<FakeProperties />} bottomPanel={null}>
			<main>CANVAS</main>
		</Layout>
	);

	it("shows the connection notice in flow, and its dismiss clears it", () => {
		useSessionStore.setState({
			connectionNotice: {
				from: { name: "Dev", url: "https://a", environment: "Sandbox" },
				to: { name: "Test", url: "https://b", environment: "Sandbox" },
				draftKept: false,
				draftLost: false,
			},
		} as never);
		render(shell());
		const bar = [...document.body.querySelectorAll(".fui-MessageBar")].find((m) =>
			m.textContent?.includes("Connection changed to Test (Sandbox)"),
		) as HTMLElement;
		expect(bar).toBeTruthy();
		expect(bar.style.position).toBe("");
		click(byName("Dismiss: Connection changed to Test (Sandbox)"));
		expect(useSessionStore.getState().connectionNotice).toBeNull();
	});

	it("keeps the side panes inline on a wide window", () => {
		render(shell());
		expect(container.textContent).toContain("LEFT PANE");
		expect(container.textContent).toContain("PROPERTIES");
		expect(byName("Structure")).toBeUndefined();
	});

	it("turns them into a rail and overlay drawers below 1200 px", () => {
		setWidth(1024);
		render(shell());
		expect(container.textContent).not.toContain("LEFT PANE");
		expect(container.textContent).not.toContain("PROPERTIES");
		click(byName("Structure"));
		expect(document.body.textContent).toContain("LEFT PANE");

		// Opening a table closes the left drawer; selecting a button opens Properties.
		act(() => useSessionStore.setState({ activeEntity: { logicalName: "account" } } as never));
		expect(document.body.textContent).not.toContain("LEFT PANE");
		act(() => useSelectionStore.getState().selectButton("G", "B"));
		expect(document.body.textContent).toContain("PROPERTIES");
		click(byName("Close properties"));

		// Opening a node's menu in the Structure drawer selects it but keeps the
		// drawer (and the menu) open, without Properties taking the focus;
		// choosing a node closes it and opens Properties (#194).
		click(byName("Structure"));
		expect(document.body.textContent).toContain("LEFT PANE");
		act(() => useSelectionStore.getState().selectButton("G", "B2"));
		expect(document.body.textContent).toContain("LEFT PANE");
		expect(document.body.textContent).not.toContain("PROPERTIES");
		act(() => {
			useSelectionStore.getState().selectButton("G", "B3");
			useUIStore.getState().noteStructureChoice();
		});
		expect(document.body.textContent).not.toContain("LEFT PANE");
		expect(document.body.textContent).toContain("PROPERTIES");
		click(byName("Close properties"));
		expect(document.body.textContent).not.toContain("PROPERTIES");
	});

	it("reaches Properties from the rail, a modern command, or a request", () => {
		setWidth(1024);
		render(shell());
		const toggle = () =>
			buttons().find(
				(b) => b.getAttribute("aria-label") === "Properties" && b.closest("nav"),
			);
		click(toggle());
		expect(document.body.textContent).toContain("PROPERTIES");
		expect(toggle()?.getAttribute("aria-pressed")).toBe("true");
		click(toggle());
		expect(document.body.textContent).not.toContain("PROPERTIES");

		act(() => useModernCommandStore.getState().selectCommand("m1"));
		expect(document.body.textContent).toContain("PROPERTIES");
		click(byName("Close properties"));

		// Show orphans asks for it with nothing selected.
		act(() => useUIStore.getState().setPropertiesRequested(true));
		expect(document.body.textContent).toContain("PROPERTIES");
		click(byName("Close properties"));
		expect(document.body.textContent).not.toContain("PROPERTIES");
		expect(useUIStore.getState().propertiesRequested).toBe(false);
	});

	it("has a rail button for each left pane tab, opening the drawer on it (#194)", () => {
		setWidth(1024);
		render(shell());
		click(byName("Solution"));
		expect(useUIStore.getState().leftPaneTab).toBe("solution");
		expect(document.body.textContent).toContain("LEFT PANE");
		expect(byName("Solution")?.getAttribute("aria-pressed")).toBe("true");
		expect(byName("Structure")?.getAttribute("aria-pressed")).toBe("false");
	});

	it("closes the drawers when the window crosses the narrow width", () => {
		setWidth(1024);
		render(shell());
		click(byName("Structure"));
		expect(document.body.textContent).toContain("LEFT PANE");
		setWidth(1600);
		setWidth(1024);
		expect(document.body.textContent).not.toContain("LEFT PANE");
	});
});
