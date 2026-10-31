/**
 * #186 PR 4: the XML of your changes and the diffs are views of the editor
 * drawer. XML opens on the location you're on, its actions sit in a Toolbar,
 * and Import takes the drawer's place. A history entry's "View diff" shows what
 * that entry changed, not everything since the last publish.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const diff = vi.hoisted(() => ({ original: "", modified: "" }));
vi.mock("@monaco-editor/react", () => ({
	DiffEditor: ({ original, modified }: { original: string; modified: string }) => {
		diff.original = original;
		diff.modified = modified;
		return <div>DIFF</div>;
	},
}));
vi.mock("@/components/shared/MonacoEditor", () => ({
	default: ({ value }: { value: string }) => <pre data-testid="xml">{value}</pre>,
}));
vi.mock("@/services/dataverse/webResourceService", () => ({
	loadWebResources: async () => [],
}));

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar and Toolbar use it.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs:
		location === "HomepageGrid"
			? [
					{
						id: MAIN,
						label: "Main",
						sequence: 10,
						tabDisplayRules: [],
						groups: [
							{
								id: GROUP,
								label: "Management",
								sequence: 10,
								template: "Mscrm.Templates.Flexible2",
								buttons: [],
							},
						],
					},
				]
			: [],
});
const store = () => useRibbonStore.getState();
const ui = () => useUIStore.getState();
const add = (id: string) =>
	store().createButton({
		location: "HomepageGrid",
		tabId: MAIN,
		groupId: GROUP,
		button: {
			id,
			label: id,
			kind: "button",
			templateAlias: "o1",
			commandId: `${id}.Command`,
			hidden: false,
			oob: false,
			custom: true,
			managed: false,
		},
	});

let container: HTMLDivElement;
let root: Root;
const until = async (ready: () => boolean) => {
	for (let i = 0; i < 250 && !ready(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 20)));
	expect(ready()).toBe(true);
};
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
const text = () => drawer()?.textContent ?? "";

beforeEach(() => {
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid"),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
	} as never);
	act(() => ui().closeEditor());
	act(() => useUIStore.setState({ importXmlOpen: false }));
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<EditorDrawer />
			</FluentProvider>,
		),
	);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#186 the XML view", () => {
	it("opens in the drawer on the location you're on, with its actions in a toolbar", async () => {
		act(() => ui().openXmlDrawer("Form"));
		await until(() => !!document.querySelector('[data-testid="xml"]'));
		expect(ui().xmlDrawerOpen).toBe(true);
		expect(text()).toContain("XML of your changes");
		const selected = drawer()!.querySelector('[role="tab"][aria-selected="true"]');
		expect(selected?.textContent).toContain("Main form");
		const toolbar = drawer()!.querySelector('[role="toolbar"][aria-label="XML actions"]')!;
		expect([...toolbar.querySelectorAll("button")].map((b) => b.textContent?.trim())).toEqual([
			"Copy",
			"Download",
			"Format",
			"Import this XML",
		]);
	});

	it("Import takes the drawer's place instead of opening over it", async () => {
		act(() => ui().openXmlDrawer("HomepageGrid"));
		await until(() => !!document.querySelector('[data-testid="xml"]'));
		const importButton = [...drawer()!.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Import this XML",
		)!;
		act(() => importButton.click());
		expect(ui().editorStack).toEqual([]);
		expect(ui().importXmlOpen).toBe(true);
	});
});

describe("#186 the diffs", () => {
	it("a history entry's diff shows what that entry changed", async () => {
		add("cbs.First");
		add("cbs.Second");
		act(() => ui().openDiffViewer("history", 0));
		await until(() => text().includes("What this change did") && diff.modified !== "");
		expect(diff.original).not.toContain("cbs.First");
		expect(diff.modified).toContain("cbs.First");
		// Named as History names it: what was done, to what.
		expect(text()).toMatch(/cbs\.First.*: the XML before it \(left\) and after it \(right\)\./);
		// The later entry isn't part of this one.
		expect(diff.modified).not.toContain("cbs.Second");
		// A tab repeats its label in a hidden span that reserves its bold width.
		const tabs = [...drawer()!.querySelectorAll('[role="tab"]')];
		expect(tabs).toHaveLength(2);
		expect(tabs[0].textContent).toContain("Side by side");
		expect(tabs[1].textContent).toContain("Unified");
	});

	it("an entry undone while it's shown says so", async () => {
		add("cbs.First");
		act(() => ui().openDiffViewer("history", 0));
		await until(() => text().includes("What this change did"));
		act(() => store().undo());
		await until(() => text().includes("This change was undone"));
	});

	it("Compare with published compares the baseline with now", async () => {
		add("cbs.First");
		act(() => ui().openDiffViewer("compare"));
		await until(() => text().includes("Compare with published") && diff.modified !== "");
		expect(ui().diffViewerMode).toBe("compare");
		expect(diff.original).not.toContain("cbs.First");
		expect(diff.modified).toContain("cbs.First");
	});
});

describe("#187 Translations in the editor drawer", () => {
	it("opens as a view, applies as you type, and Done leaves one undo step", async () => {
		add("cbs.First");
		const before = store().past.length;
		act(() => ui().openLocalizationEditor("cbs.First"));
		const label = () =>
			drawer()?.querySelector<HTMLInputElement>(
				'input[aria-label="Label (English (United States))"]',
			) ?? null;
		await until(() => !!label());
		expect(ui().localizationEditorOpen).toBe(true);
		expect(text()).toContain("Translations");
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
		for (const value of ["Fir", "First one"])
			act(() => {
				setter.call(label()!, value);
				label()!.dispatchEvent(new Event("input", { bubbles: true }));
			});
		const done = [...drawer()!.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Done",
		)!;
		act(() => done.click());
		await until(() => ui().editorStack.length === 0);
		expect(store().past.length).toBe(before + 1);
		expect(ui().localizationEditorOpen).toBe(false);
	});
});
