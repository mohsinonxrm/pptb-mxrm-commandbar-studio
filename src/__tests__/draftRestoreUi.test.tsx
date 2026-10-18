/**
 * #16 — the restore banner and the unpublished-changes dialog.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { DraftSaveWarning } from "@/components/shell/DraftSaveWarning";
import { DraftRestoreDialog } from "@/components/modals/DraftRestoreDialog";
import { UnsavedChangesDialog } from "@/components/modals/UnsavedChangesDialog";
import { useRibbonStore } from "@/store/ribbonStore";
import { useDraftStore, installDraftAutosave } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";
import { readDraft, type DraftKey } from "@/services/ribbonDraft";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}

const T = "account";
const ORG = "https://contoso.crm.dynamics.com";
const KEY: DraftKey = { orgUrl: ORG, solutionId: "sol-a", entityLogicalName: T };

const button: RibbonButton = {
	id: "cbs.Mine",
	label: "Mine",
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: "",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
};
const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs:
		location === "HomepageGrid"
			? [{ id: "Tab", label: "Tab", sequence: 10, tabDisplayRules: [], groups: [{ id: "G", label: "G", sequence: 10, template: "Flexible2", buttons: [button] }] }]
			: [],
});
const entity = (logicalName: string): EntityMetadata => ({
	metadataId: logicalName,
	logicalName,
	displayName: logicalName === T ? "Account" : "Contact",
	isCustomEntity: false,
	isIntersect: false,
});

function load() {
	useDraftStore.getState().beginLoad();
	useRibbonStore.getState().loadWorkspace({
		ribbons: { HomepageGrid: ribbon("HomepageGrid"), SubGrid: ribbon("SubGrid"), Form: ribbon("Form"), Application: ribbon("Application") },
		commands: [],
		enableRules: [],
		displayRules: [],
		locLabels: [],
	});
	useDraftStore.getState().workspaceLoaded(KEY);
}

const buttonsNow = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0].buttons.map((b) => b.id);
const findButton = (text: string) =>
	Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);
const click = (text: string) =>
	act(() => {
		const b = findButton(text);
		if (!b) throw new Error(`No "${text}" button`);
		b.click();
	});

let container: HTMLDivElement;
let root: Root;
let unsubscribe: () => void;

beforeEach(() => {
	localStorage.clear();
	useDraftStore.setState({ target: null, pending: null, pendingBaselineChanged: false, pendingSwitch: null, saveFailed: false, lastSavedAt: null, restoreError: null });
	useSessionStore.setState({
		connectionUrl: ORG,
		activeSolution: { id: "sol-a", uniqueName: "SolutionA", friendlyName: "Solution A" } as Solution,
		activeEntity: entity(T),
	});
	unsubscribe = installDraftAutosave();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() =>
		root.render(
			<FluentProvider theme={webLightTheme}>
				<DraftSaveWarning />
				<DraftRestoreDialog />
				<UnsavedChangesDialog />
			</FluentProvider>,
		),
	);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	unsubscribe();
});

describe("#16 — restore dialog", () => {
	it("is offered only once the table has loaded, and Restore brings the changes back", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));

		// A new session: while the table loads there is nothing to click.
		act(() => useDraftStore.getState().beginLoad());
		expect(findButton("Restore")).toBeUndefined();

		act(() => load());
		expect(document.body.textContent).toContain("unpublished changes to this table from a previous session");
		expect(buttonsNow()).toEqual(["cbs.Mine"]);
		click("Restore");
		expect(buttonsNow()).toEqual([]);
		expect(findButton("Restore")).toBeUndefined();
		expect(useRibbonStore.getState().baseline.HomepageGrid.tabs[0].groups[0].buttons.map((b) => b.id)).toEqual([
			"cbs.Mine",
		]);
	});

	it("Discard deletes the draft", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
		act(() => load());
		click("Discard");
		expect(findButton("Restore")).toBeUndefined();
		expect(readDraft(KEY)).toBeNull();
		expect(buttonsNow()).toEqual(["cbs.Mine"]);
	});
});

describe("#16 — switching with unpublished changes", () => {
	it("asks before switching table; Cancel stays, Keep as draft switches and keeps the draft", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));

		act(() => useDraftStore.getState().requestEntitySwitch(entity("contact")));
		expect(document.body.textContent).toContain("Account has changes that aren't published. Switch to table Contact?");
		click("Cancel");
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);
		expect(buttonsNow()).toEqual([]);

		act(() => useDraftStore.getState().requestEntitySwitch(entity("contact")));
		click("Keep as draft");
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe("contact");
		expect(findButton("Keep as draft")).toBeUndefined();
		expect(readDraft(KEY)).not.toBeNull();
	});

	it("asks before switching solution; Discard switches and deletes the draft", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
		act(() =>
			useDraftStore.getState().requestSolutionSwitch({ id: "sol-b", uniqueName: "SolutionB", friendlyName: "Solution B" } as Solution),
		);
		expect(document.body.textContent).toContain("Switch to solution Solution B?");
		click("Discard");
		expect(useSessionStore.getState().activeSolution?.id).toBe("sol-b");
		expect(readDraft(KEY)).toBeNull();
	});
});

describe("#16 — restore blocks editing until answered", () => {
	it("is a modal dialog", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
		act(() => load());
		const dialog = document.body.querySelector('[aria-modal="true"]');
		expect(dialog?.textContent).toContain("from a previous session");
		click("Restore");
		expect(document.body.querySelector('[aria-modal="true"]')).toBeNull();
		expect(buttonsNow()).toEqual([]);
	});
});

describe("#16 — a draft that fails to restore", () => {
	it("keeps the dialog open with the error; Restore is disabled, Discard works", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
		act(() => load());
		const pending = useDraftStore.getState().pending!;
		act(() =>
			useDraftStore.setState({
				pending: { ...pending, delta: { ...pending.delta, lists: { ...pending.delta.lists, commands: { set: [null], drop: [], add: [] } } } },
			}),
		);
		click("Restore");
		expect(document.body.querySelector('[aria-modal="true"]')?.textContent).toContain("couldn't be restored");
		expect(findButton("Restore")?.disabled).toBe(true);
		click("Discard");
		expect(document.body.querySelector('[aria-modal="true"]')).toBeNull();
		expect(readDraft(KEY)).toBeNull();
	});
});

describe("#16 — a full browser storage", () => {
	it("says which draft is still saved", () => {
		act(() => load());
		act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
		});
		try {
			act(() => useRibbonStore.getState().hideOobButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
			expect(document.body.textContent).toContain("The last saved draft is from");
		} finally {
			setItem.mockRestore();
		}
	});

	it("warns, and Keep as draft is disabled", () => {
		act(() => load());
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
		});
		try {
			act(() => useRibbonStore.getState().deleteButton("HomepageGrid", "Tab", "G", "cbs.Mine"));
			expect(document.body.textContent).toContain("can't be saved as a draft: the browser storage is full");
			act(() => useDraftStore.getState().requestEntitySwitch(entity("contact")));
			expect(findButton("Keep as draft")?.disabled).toBe(true);
			click("Cancel");
			expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);
			expect(buttonsNow()).toEqual([]);
		} finally {
			setItem.mockRestore();
		}
	});
});
