/**
 * #194, step 1: the table picker moves from the left pane's Tables tab to a
 * combobox in the top bar. Custom and Standard groups, filtered by display or
 * logical name, a marker on tables with a saved draft, and switching still
 * goes through the unsaved-changes check.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { TablePicker } from "@/components/shell/TablePicker";
import { CanvasEmptyState } from "@/components/ribbon-canvas/CanvasStates";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore, draftKeyFor } from "@/store/draftStore";
import { useUIStore } from "@/store/uiStore";
import { DRAFT_FORMAT, draftStorageKey, normaliseDraftKey } from "@/services/ribbonDraft";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTITIES = [
	{
		logicalName: "account",
		displayName: "Account",
		metadataId: "a",
		isCustomEntity: false,
		isManaged: true,
	},
	{ logicalName: "contact", displayName: "Contact", metadataId: "c", isCustomEntity: false },
	{
		logicalName: "cbstest_ribbontest",
		displayName: "Ribbon Test",
		metadataId: "r",
		isCustomEntity: true,
	},
] as EntityMetadata[];
const SOLUTION = {
	id: "sol-1",
	friendlyName: "CBS Live Test",
	uniqueName: "CBSLiveTest",
} as Solution;

let container: HTMLDivElement;
let root: Root;
const initialUI = useUIStore.getState();
const initialDraft = useDraftStore.getState();
const requestEntitySwitch = vi.fn();

const input = () => container.querySelector<HTMLInputElement>('input[aria-label="Table"]')!;
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const groups = () =>
	[...document.querySelectorAll<HTMLElement>('[role="group"]')].map(
		(g) => g.querySelector('[role="presentation"]')?.textContent,
	);
function type(value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
			input(),
			value,
		);
		input().dispatchEvent(new Event("input", { bubbles: true }));
	});
}
function render() {
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<CanvasEmptyState kind="noTable" />
				<TablePicker />
			</FluentProvider>,
		),
	);
}
const openList = () => act(() => useUIStore.getState().setTablePickerOpen(true));

beforeEach(() => {
	localStorage.clear();
	requestEntitySwitch.mockReset();
	useUIStore.setState(initialUI, true);
	useDraftStore.setState({ ...initialDraft, requestEntitySwitch });
	useSessionStore.setState({
		connectionUrl: "https://org.crm.dynamics.com",
		activeSolution: SOLUTION,
		solutionEntityIds: ["a", "c", "r"],
		entities: ENTITIES,
		activeEntity: ENTITIES[0],
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
	document.body.innerHTML = "";
});

describe("#194 the table picker in the top bar", () => {
	it("shows the open table, and lists Custom and Standard tables with logical names", () => {
		const contactKey = draftKeyFor("contact");
		localStorage.setItem(
			draftStorageKey(contactKey),
			JSON.stringify({ format: DRAFT_FORMAT, key: normaliseDraftKey(contactKey), data: "x" }),
		);
		// A draft readDraft would throw away (another format) isn't marked.
		localStorage.setItem(draftStorageKey(draftKeyFor("cbstest_ribbontest")), "{}");
		render();
		expect(input().value).toBe("Account");
		openList();
		expect(document.activeElement).toBe(input());
		expect(groups()).toEqual(["Custom (1)", "Standard (2)"]);
		const contact = options().find((o) => o.textContent?.includes("Contact"))!;
		expect(contact.textContent).toContain("contact");
		// A draft saved for another table is marked; the managed table has a lock.
		expect(contact.textContent).toContain("Draft");
		expect(
			options().find((o) => o.textContent?.includes("Ribbon Test"))!.textContent,
		).not.toContain("Draft");
		const account = options().find((o) => o.textContent?.includes("Account"))!;
		expect(account.getAttribute("aria-selected")).toBe("true");
		expect(account.querySelector('[aria-label="Managed table"]')).toBeTruthy();
	});

	it("filters by display or logical name, and says when nothing matches", () => {
		render();
		openList();
		type("ribbontest");
		expect(options().map((o) => o.textContent)).toEqual([
			expect.stringContaining("Ribbon Test"),
		]);
		type("zzz");
		expect(options().map((o) => o.textContent)).toEqual(["No tables match."]);
	});

	it("choosing a table asks the draft store to switch (the unsaved-changes check)", () => {
		render();
		openList();
		act(() =>
			options()
				.find((o) => o.textContent?.includes("Contact"))!
				.click(),
		);
		expect(requestEntitySwitch).toHaveBeenCalledWith(ENTITIES[1]);
		// Choosing the open table again isn't a switch.
		openList();
		act(() =>
			options()
				.find((o) => o.textContent?.includes("Account"))!
				.click(),
		);
		expect(requestEntitySwitch).toHaveBeenCalledTimes(1);
	});

	it("Tab leaves the box without choosing the active table (review)", () => {
		render();
		openList();
		type("con");
		act(() => {
			input().dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
		});
		expect(requestEntitySwitch).not.toHaveBeenCalled();
	});

	it("Choose table while the tables load opens the list, focused, once they're in (review)", () => {
		useSessionStore.setState({ activeEntity: null, solutionEntityIds: null });
		render();
		act(() =>
			[...container.querySelectorAll("button")]
				.find((b) => b.textContent === "Choose table")!
				.click(),
		);
		expect(options().length).toBe(0);
		act(() => useSessionStore.setState({ solutionEntityIds: ["a", "c", "r"] }));
		expect(document.activeElement).toBe(input());
		expect(options().length).toBe(3);
	});

	it("Choose table on the empty canvas opens the list", () => {
		useSessionStore.setState({ activeEntity: null });
		render();
		expect(input().placeholder).toBe("Choose table");
		act(() =>
			[...container.querySelectorAll("button")]
				.find((b) => b.textContent === "Choose table")!
				.click(),
		);
		expect(useUIStore.getState().tablePickerOpen).toBe(true);
		expect(document.activeElement).toBe(input());
		expect(options().length).toBe(3);
	});

	it("is disabled until a solution's tables are loaded, and says why", () => {
		useSessionStore.setState({ activeSolution: null, activeEntity: null });
		render();
		expect(input().disabled).toBe(true);
		expect(input().placeholder).toBe("Choose a solution first");
		act(() => useSessionStore.setState({ activeSolution: SOLUTION, solutionEntityIds: null }));
		expect(input().placeholder).toBe("Loading tables…");
	});

	it("a solution without tables says how to add one", () => {
		useSessionStore.setState({ entities: [], activeEntity: null });
		render();
		openList();
		expect(options()[0].textContent).toContain(
			"No tables in CBS Live Test. Add one in the maker portal",
		);
	});
});
