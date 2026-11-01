/**
 * #186 PR 2: the command editor — tabs in the drawer's header, one Add action
 * menu, action cards that move, Pass parameters as a switch, the script as a
 * view of the drawer, and out-of-the-box commands read-only until customised.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { ruleShortName } from "@/utils/ruleLabel";
import type {
	CommandDefinition,
	EnableRule,
	RibbonAction,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
} from "@/types/ribbon";

vi.mock("@/components/shared/MonacoEditor", () => ({
	default: ({ value }: { value: string }) => <pre data-testid="script">{value}</pre>,
}));
vi.mock("@/services/dataverse/webResourceService", () => ({
	loadWebResourceByName: async (name: string) => ({ id: "wr1", name }),
	loadWebResourceContent: async () => btoa("function approve() {}"),
	saveWebResource: async () => ({}),
}));

// jsdom has no ResizeObserver; Fluent's MessageBar uses it for reflow.
if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "cbstest_ribbontest";
const MINE = "cbstest.Approve.Command";
const OOB = "Mscrm.Test.Command";
const RULE = "cbstest.Approve.EnableRule";
const js: RibbonAction = {
	kind: "javascript",
	library: "$webresource:cbstest_/approve.js",
	functionName: "Contoso.approve",
	params: [],
};
const command = (id: string, patch: Partial<CommandDefinition> = {}) =>
	({ id, enableRules: [RULE], displayRules: [], actions: [js], ...patch }) as CommandDefinition;
const button = (id: string, label: string, commandId: string): RibbonButton =>
	({
		id,
		label,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId,
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		origin: "unmanaged",
	}) as RibbonButton;
const ribbon = (location: RibbonLocation, buttons: RibbonButton[] = []): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: buttons.length
		? [
				{
					id: `Mscrm.${location}.${T}.MainTab`,
					label: "Main",
					sequence: 10,
					tabDisplayRules: [],
					groups: [
						{
							id: `Mscrm.${location}.${T}.MainTab.Management`,
							label: "Management",
							sequence: 10,
							template: "Mscrm.Templates.Flexible2",
							buttons,
						},
					],
				},
			]
		: [],
});

const store = () => useRibbonStore.getState();
const ui = () => useUIStore.getState();
const mine = () => store().commands.find((c) => c.id === MINE)!;

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
/** Waits for lazy views and async loads, up to 5 s. */
const until = async (ready: () => boolean) => {
	for (let i = 0; i < 250 && !ready(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 20)));
	expect(ready()).toBe(true);
};
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const buttonNamed = (text: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text,
	);
const tabNamed = (text: string) =>
	[...drawer().querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
		t.textContent?.startsWith(text),
	)!;
const menuItem = (text: string) =>
	[...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
		(m) => m.textContent?.trim() === text,
	)!;
const typeInto = (input: HTMLInputElement, value: string) => {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
	act(() => {
		setter.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
};
async function open(id: string) {
	act(() => ui().openCommandEditor(id));
	await until(() => !!drawer() && !drawer().textContent?.includes("Loading…"));
}

beforeEach(() => {
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid", [
				button("cbstest.Approve", "Approve", MINE),
				button("Mscrm.HomepageGrid.Test", "Test", OOB),
			]),
			SubGrid: ribbon("SubGrid"),
			Form: ribbon("Form"),
			Application: ribbon("Application"),
		},
		commands: [command(MINE), command(OOB)],
		displayRules: [],
		enableRules: [{ id: RULE, steps: [] } as EnableRule],
		locLabels: [],
	} as never);
	act(() => ui().closeEditor());
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

describe("#186 the command editor's tabs", () => {
	it("sit in the header with counts, and keep their place over a rule", async () => {
		await open(MINE);
		const header = drawer().querySelector("header") ?? drawer();
		expect(header.textContent).toContain("Enable rules (1)");
		expect(tabNamed("Used by").textContent).toContain("Used by (1)");
		// No developer words.
		expect(drawer().textContent).not.toMatch(/Monaco|integration path/);

		act(() => tabNamed("Enable rules").click());
		await flush();
		act(() => buttonNamed(ruleShortName(RULE))!.click());
		await flush();
		expect(ui().editorStack.map((v) => v.kind)).toEqual(["command", "rule"]);
		act(() => ui().editorBack());
		await flush();
		expect(tabNamed("Enable rules").getAttribute("aria-selected")).toBe("true");

		// Another command opens on its actions.
		act(() => ui().closeEditor());
		await open(OOB);
		expect(ui().commandEditorTab).toBe("actions");
	});

	it("Used by names the buttons and where they are", async () => {
		await open(MINE);
		act(() => tabNamed("Used by").click());
		await flush();
		const list = drawer().querySelector('[aria-label="Buttons using this command"]')!;
		expect(list.textContent).toContain("Approve");
		expect(list.textContent).toContain("Main grid › Main › Management");
	});
});

describe("#186 the command's actions", () => {
	it("one Add action menu; cards move from ⋮; Pass parameters is a switch", async () => {
		act(() => store().upsertCommand(command(MINE, { actions: [] })));
		await open(MINE);
		expect(drawer().textContent).toContain("No actions yet");
		for (const item of ["Open a URL", "Run JavaScript"]) {
			act(() => buttonNamed("Add action")!.click());
			await flush();
			act(() => menuItem(item).click());
			await flush();
		}
		expect(mine().actions.map((a) => a.kind)).toEqual(["url", "javascript"]);

		act(() => buttonNamed("More for this action")!.click());
		await flush();
		act(() => menuItem("Move down").click());
		await flush();
		expect(mine().actions.map((a) => a.kind)).toEqual(["javascript", "url"]);

		const passParams = drawer().querySelector<HTMLInputElement>('input[role="switch"]')!;
		expect(passParams.checked).toBe(false);
		act(() => passParams.click());
		expect(mine().actions[1]).toMatchObject({ kind: "url", passParams: true });

		act(() => buttonNamed("Remove action")!.click());
		expect(mine().actions.map((a) => a.kind)).toEqual(["url"]);
	});

	it("View script opens the script in the drawer, and Back returns to the command", async () => {
		await open(MINE);
		act(() => buttonNamed("View script")!.click());
		await flush();
		expect(ui().editorStack.at(-1)).toEqual({
			kind: "script",
			id: "cbstest_/approve.js",
			editable: false,
		});
		// Back names the command; one level down there's no trail as well (#229).
		expect(drawer().textContent).toContain("Edit commandView script");
		expect(drawer().textContent).not.toContain("›");
		await until(() => !!document.querySelector('[data-testid="script"]'));
		expect(document.querySelector('[data-testid="script"]')?.textContent).toBe(
			"function approve() {}",
		);
		act(() => buttonNamed("Edit command")!.click());
		await flush();
		expect(ui().editorStack.map((v) => v.kind)).toEqual(["command"]);
	});
});

describe("#186 whose command it is", () => {
	it("an out-of-the-box command is read-only until customised; its script and rules still open", async () => {
		await open(OOB);
		expect(drawer().textContent).toContain("Read-only");
		expect(buttonNamed("Customise command")).toBeTruthy();
		expect(buttonNamed("Add action")).toBeUndefined();
		expect(buttonNamed("Remove action")).toBeUndefined();
		expect(buttonNamed("Edit script")).toBeUndefined();
		expect(buttonNamed("Rename command ID")).toBeUndefined();
		const fn = [...drawer().querySelectorAll<HTMLInputElement>("input")].find(
			(i) => i.value === "Contoso.approve",
		)!;
		expect(fn.closest("fieldset")?.disabled).toBe(true);
		expect(buttonNamed("View script")!.disabled).toBe(false);

		act(() => tabNamed("Enable rules").click());
		await flush();
		// No unbind on a read-only command, but the rule opens.
		expect(drawer().querySelector('[aria-label^="Unbind"]')).toBeNull();
		act(() => buttonNamed(ruleShortName(RULE))!.click());
		await flush();
		expect(ui().editorStack.at(-1)?.kind).toBe("rule");
	});

	it("your own command renames from the header", async () => {
		await open(MINE);
		act(() => buttonNamed("Rename command ID")!.click());
		await flush();
		const field = [...drawer().querySelectorAll<HTMLInputElement>("input")].find(
			(i) => i.value === MINE && !i.readOnly,
		)!;
		typeInto(field, OOB);
		expect(drawer().textContent).toContain("Another command already has this ID.");
		typeInto(field, "cbstest.Approve2.Command");
		act(() => buttonNamed("Rename")!.click());
		await flush();
		expect(store().commands.some((c) => c.id === "cbstest.Approve2.Command")).toBe(true);
		expect(ui().commandEditorId).toBe("cbstest.Approve2.Command");
	});
});
