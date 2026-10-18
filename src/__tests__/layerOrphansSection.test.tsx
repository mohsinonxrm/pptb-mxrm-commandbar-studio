/**
 * #64: the "Orphaned customizations" list in the Properties pane — shown with
 * nothing selected, one row per orphan with its location and why; Delete marks
 * it for the next publish (undoable), Keep takes that back.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { LayerOrphan } from "@/services/layerOrphans";
import type { RibbonLocation } from "@/types/ribbon";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORPHAN: LayerOrphan = {
	id: "cbs.Chart.Button",
	element: "Button",
	label: "Chart it",
	location: "Mscrm.HomepageGrid.AllEntities.VisualizationTab.Save.Controls._children",
	customActionId: "cbs.Chart.CustomAction",
	reason: "hidden-tab",
	why: "It is on the tab Mscrm.HomepageGrid.AllEntities.VisualizationTab, which Unified Interface doesn't show.",
	deleteControlIds: ["cbs.Chart.Button"],
	deleteContainerIds: [],
};

let container: HTMLDivElement;
let root: Root;

const empty = (location: RibbonLocation) => ({ location, entityLogicalName: "contact", tabs: [] });

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	useSelectionStore.setState({ location: "HomepageGrid", tabId: "", selectedButtonId: null, selectedGroupId: null });
	useRibbonStore.getState().loadWorkspace({
		ribbons: { HomepageGrid: empty("HomepageGrid"), SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
		orphans: { entity: [ORPHAN] },
	});
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("Orphaned customizations section", () => {
	it("lists the orphan with its location and reason, and Delete / Keep toggle the pending delete", () => {
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<PropertiesPane />
				</FluentProvider>,
			),
		);
		const section = container.querySelector('section[aria-label="Orphaned customizations"]')!;
		expect(section).not.toBeNull();
		expect(section.textContent).toContain("“Chart it” cbs.Chart.Button");
		expect(section.textContent).toContain(ORPHAN.location);
		expect(section.textContent).toContain("Unified Interface doesn't show");

		const action = () => section.querySelector("button")!;
		expect(action().textContent).toBe("Delete");
		act(() => action().click());
		expect(useRibbonStore.getState().pendingOrphanDeletes.entity).toEqual(["cbs.Chart.Button"]);
		expect(action().textContent).toBe("Keep");
		act(() => action().click());
		expect(useRibbonStore.getState().pendingOrphanDeletes.entity).toEqual([]);
	});

	it("review 4: just published from here → Delete isn't offered; published recently → Delete asks first", () => {
		const just: LayerOrphan = { ...ORPHAN, recentPublish: { minutesAgo: 2, published: true } };
		const recent: LayerOrphan = { ...ORPHAN, id: "cbs.Other.Button", customActionId: "cbs.Other", recentPublish: { minutesAgo: 2, published: false } };
		useRibbonStore.setState({ orphans: { entity: [just, recent], application: [] } });
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<PropertiesPane />
				</FluentProvider>,
			),
		);
		const section = container.querySelector('section[aria-label="Orphaned customizations"]')!;
		const buttons = () => Array.from(section.querySelectorAll("button"));
		const [justDelete, recentDelete] = buttons();
		expect(justDelete.getAttribute("aria-disabled")).toBe("true");
		act(() => justDelete.click());
		expect(useRibbonStore.getState().pendingOrphanDeletes.entity).toEqual([]);
		// The store refuses it too.
		useRibbonStore.getState().setOrphanDeleted("entity", ORPHAN.id, true);
		expect(useRibbonStore.getState().pendingOrphanDeletes.entity).toEqual([]);

		expect(recentDelete.textContent).toBe("Delete…");
		act(() => recentDelete.click());
		expect(useRibbonStore.getState().pendingOrphanDeletes.entity).toEqual([]);
		const confirm = buttons()[1];
		expect(confirm.textContent).toBe("Delete anyway");
		act(() => confirm.click());
		expect(useRibbonStore.getState().pendingOrphanDeletes.entity).toEqual(["cbs.Other.Button"]);
	});

	it("isn't shown when the layer has no orphans", () => {
		useRibbonStore.setState({ orphans: { entity: [], application: [] } });
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<PropertiesPane />
				</FluentProvider>,
			),
		);
		expect(container.querySelector('section[aria-label="Orphaned customizations"]')).toBeNull();
	});
});
