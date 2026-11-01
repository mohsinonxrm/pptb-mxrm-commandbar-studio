/**
 * #189: the command palette is a real dialog with a search box whose active
 * result follows the arrow keys (aria-activedescendant). Choosing a button
 * selects it on the canvas; `/` keeps actions, `@` tables; actions that can't
 * run aren't offered, and the theme toggle is gone (the theme is PPTB's).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { EntityMetadata } from "@/types/entity";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "account";
const tabOf = (location: RibbonLocation) => `Mscrm.${location}.${T}.MainTab`;
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [
		{
			id: tabOf(location),
			label: "Main",
			sequence: 10,
			tabDisplayRules: [],
			groups: [
				{
					id: `${tabOf(location)}.Management`,
					label: "Management",
					sequence: 10,
					template: "Mscrm.Templates.Flexible2",
					buttons:
						location === "Form"
							? [
									{
										id: "cbs.Approve",
										label: "Approve",
										kind: "button",
										sequence: 10,
										templateAlias: "o1",
										commandId: "cbs.Approve.Command",
										hidden: false,
										oob: false,
										custom: true,
										managed: false,
										origin: "unmanaged",
									},
								]
							: [],
				},
			],
		},
	],
});

let container: HTMLDivElement;
let root: Root;
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const input = () => dialog().querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [...dialog().querySelectorAll<HTMLElement>('[role="option"]')];
const optionText = () => options().map((o) => o.textContent);
function type(value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
			input(),
			value,
		);
		input().dispatchEvent(new Event("input", { bubbles: true }));
	});
}
const key = (k: string) =>
	act(() => {
		input().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	});

beforeEach(() => {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid"),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [{ id: "cbs.Approve.Command", enableRules: [], displayRules: [], actions: [] }],
		displayRules: [],
		enableRules: [{ id: "cbs.Approve.EnableRule", steps: [] }],
		locLabels: [],
	} as never);
	useSessionStore.setState({
		entities: [
			{ logicalName: "contact", displayName: "Contact", metadataId: "c" },
		] as EntityMetadata[],
	});
	useSelectionStore.setState({
		location: "HomepageGrid",
		tabId: tabOf("HomepageGrid"),
		selectedButtonId: null,
		selectedGroupId: null,
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<CommandPalette />
			</FluentProvider>,
		),
	);
	act(() => useUIStore.getState().setCommandPaletteOpen(true));
});
afterEach(() => {
	act(() => useUIStore.getState().setCommandPaletteOpen(false));
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#189 the command palette", () => {
	it("is a dialog with a combobox search, grouped results, and no theme toggle", () => {
		expect(dialog().getAttribute("aria-label")).toBe("Command palette");
		expect(input().getAttribute("aria-controls")).toBe("palette-results");
		const groups = [...dialog().querySelectorAll('[role="group"]')].map((g) =>
			g.getAttribute("aria-label"),
		);
		expect(groups).toEqual(["Actions", "Buttons", "Commands", "Rules", "Tables"]);
		expect(dialog().textContent).not.toMatch(/theme/i);
		// Nothing to undo, nothing selected: those actions aren't offered.
		expect(dialog().textContent).not.toMatch(/\bUndo\b|Translations…/);
	});

	it("the arrow keys move the active option, and the input points at it", () => {
		const first = options()[0];
		expect(input().getAttribute("aria-activedescendant")).toBe(first.id);
		key("ArrowDown");
		expect(input().getAttribute("aria-activedescendant")).toBe(options()[1].id);
		expect(options()[1].getAttribute("aria-selected")).toBe("true");
		key("End");
		expect(input().getAttribute("aria-activedescendant")).toBe(options().at(-1)!.id);
	});

	it("choosing a button selects it on the canvas, where it is", () => {
		type("approve");
		const button = options().find((o) => o.textContent?.startsWith("Button"))!;
		expect(button.textContent).toContain("Main form › Main › Management");
		act(() => button.click());
		expect(useSelectionStore.getState()).toMatchObject({
			location: "Form",
			tabId: tabOf("Form"),
			selectedButtonId: "cbs.Approve",
		});
		expect(useUIStore.getState().commandPaletteOpen).toBe(false);
	});

	it("/ keeps actions only, @ keeps tables only", () => {
		type("/");
		expect(optionText().every((t) => t?.startsWith("Action"))).toBe(true);
		type("@cont");
		expect(optionText()).toEqual(["TableContactcontact"]);
		type("zzz");
		expect(dialog().textContent).toContain("Nothing matches “zzz”.");
	});

	it("offers Undo and Translations once they can run", () => {
		act(() => useUIStore.getState().setCommandPaletteOpen(false));
		act(() =>
			useRibbonStore
				.getState()
				.upsertCommand({ id: "cbs.Other", enableRules: [], displayRules: [], actions: [] }),
		);
		act(() =>
			useSelectionStore
				.getState()
				.selectButtonInContext(
					"Form",
					tabOf("Form"),
					`${tabOf("Form")}.Management`,
					"cbs.Approve",
				),
		);
		act(() => useUIStore.getState().setCommandPaletteOpen(true));
		type("/");
		expect(optionText()).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Undo"),
				expect.stringContaining("Translations…"),
			]),
		);
		const translations = options().find((o) => o.textContent?.includes("Translations…"))!;
		act(() => translations.click());
		expect(useUIStore.getState().localizationEditorButtonId).toBe("cbs.Approve");
	});
});
