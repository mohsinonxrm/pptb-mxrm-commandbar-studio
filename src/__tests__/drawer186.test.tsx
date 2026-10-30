/**
 * #186 PR 1: one editor drawer that navigates (a rule opened from the command
 * editor is a view on top of it, with Back), Done, and an edit session that
 * makes the drawer one undo step.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { ruleShortName } from "@/utils/ruleLabel";
import type { CommandDefinition, EnableRule, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CMD = "cbstest.Cmd";
const RULE = "cbstest.Rule";
const command = (patch: Partial<CommandDefinition> = {}) =>
	({
		id: CMD,
		enableRules: [RULE],
		displayRules: [],
		actions: [],
		...patch,
	}) as CommandDefinition;
const rule = (patch: Partial<EnableRule> = {}) => ({ id: RULE, steps: [], ...patch }) as EnableRule;
const empty = (location: RibbonLocation) => ({ location, entityLogicalName: "x", tabs: [] });

function load() {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: empty("HomepageGrid"),
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [command()],
		displayRules: [],
		enableRules: [rule()],
		locLabels: [],
	} as never);
}
const store = () => useRibbonStore.getState();
const ui = () => useUIStore.getState();

beforeEach(() => {
	load();
	act(() => ui().closeEditor());
});

describe("#186 an edit session is one undo step", () => {
	it("joins every change until it ends, a batch included, and Undo reverts them all", () => {
		const before = store().past.length;
		store().beginEditSession();
		store().upsertCommand(command({ isolated: true } as never));
		store().upsertEnableRule(
			rule({ steps: [{ kind: "CrmClientTypeRule", type: "Web" }] } as never),
		);
		store().batch(() => store().upsertCommand(command({ enableRules: [] })));
		store().endEditSession();
		expect(store().past.length).toBe(before + 1);
		store().undo();
		expect(store().commands.find((c) => c.id === CMD)).toEqual(command());
		expect(store().enableRules.find((r) => r.id === RULE)).toEqual(rule());
	});

	it("doesn't join the next session, nor changes after it ends", () => {
		const before = store().past.length;
		store().beginEditSession();
		store().upsertCommand(command({ enableRules: [] }));
		store().endEditSession();
		store().beginEditSession();
		store().upsertCommand(command({ enableRules: [RULE] }));
		store().endEditSession();
		store().upsertEnableRule(
			rule({ steps: [{ kind: "CrmClientTypeRule", type: "Web" }] } as never),
		);
		expect(store().past.length).toBe(before + 3);
	});
});

describe("#186 the drawer's views", () => {
	it("a rule opened from the command goes on top; Back returns; closing the command closes all", () => {
		act(() => ui().openCommandEditor(CMD));
		act(() => ui().openRuleEditor(RULE, "enable"));
		expect(ui().editorStack.map((v) => v.kind)).toEqual(["command", "rule"]);
		expect(ui()).toMatchObject({
			commandEditorOpen: true,
			commandEditorId: CMD,
			ruleEditorOpen: true,
			ruleEditorId: RULE,
		});
		// Another rule replaces the one shown, it doesn't pile up.
		act(() => ui().openRuleEditor("other", "display"));
		expect(ui().editorStack).toHaveLength(2);
		act(() => ui().closeRuleEditor());
		expect(ui()).toMatchObject({ commandEditorOpen: true, ruleEditorOpen: false });
		act(() => ui().openRuleEditor(RULE, "enable"));
		act(() => ui().closeCommandEditor());
		expect(ui().editorStack).toEqual([]);
		expect(ui().ruleEditorOpen).toBe(false);
	});
});

describe("#186 the editor drawer", () => {
	let container: HTMLDivElement;
	let root: Root;
	const flush = async () => {
		for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
	};
	const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
	const button = (text: string) =>
		[...document.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent?.trim() === text,
		);
	beforeEach(() => {
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

	it("says what it edits, navigates back from a rule, and Done closes it", async () => {
		act(() => ui().openCommandEditor(CMD));
		await flush();
		expect(drawer()?.textContent).toContain("Edit command");
		expect(drawer()?.querySelector("input")?.value).toBe(CMD);
		expect(button("Done")).toBeTruthy();
		expect(drawer()?.textContent).toContain("Changes apply as you edit · Ctrl Z to undo");

		act(() => ui().openRuleEditor(RULE, "enable"));
		await flush();
		expect(drawer()?.textContent).toContain("Edit command ›Edit enable rule");
		// One drawer, never two.
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
		act(() => button("Edit command")!.click());
		await flush();
		expect(ui().editorStack.map((v) => v.kind)).toEqual(["command"]);

		act(() => button("Done")!.click());
		await flush();
		expect(ui().editorStack).toEqual([]);
	});

	it("a rule opened from the command's rule list is a view on top, even when the command is read-only", async () => {
		act(() => ui().openCommandEditor(CMD));
		await flush();
		const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) =>
			t.textContent?.startsWith("Enable rules"),
		)!;
		act(() => tab.click());
		await flush();
		const chip = button(ruleShortName(RULE))!;
		act(() => chip.click());
		await flush();
		expect(ui().editorStack.map((v) => v.kind)).toEqual(["command", "rule"]);
		expect(drawer()?.textContent).toContain("Edit enable rule");
	});

	it("everything done between opening and Done is one undo step", async () => {
		const before = store().past.length;
		act(() => ui().openCommandEditor(CMD));
		await flush();
		act(() => store().upsertCommand(command({ enableRules: [] })));
		act(() => ui().openRuleEditor(RULE, "enable"));
		await flush();
		act(() =>
			store().upsertEnableRule(
				rule({ steps: [{ kind: "CrmClientTypeRule", type: "Web" }] } as never),
			),
		);
		act(() => button("Done")!.click());
		await flush();
		expect(store().past.length).toBe(before + 1);
		// After Done, a change is a step of its own.
		act(() => store().upsertCommand(command()));
		expect(store().past.length).toBe(before + 2);
	});
});
