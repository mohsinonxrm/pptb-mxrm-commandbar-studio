/**
 * #152: Unified Interface evaluates CommandClientTypeRule as "Modern" (Microsoft's
 * Mscrm.HideOnModern, Type="Modern" InvertResult, hides buttons there), so the
 * quick filter for Unified Interface adds Type="Modern", and never binds an
 * inverted rule of that type.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { AdvancedSection } from "@/components/properties-pane/AdvancedSection";
import { RuleStepEditor } from "@/components/shared/RuleStepEditor";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { DisplayRule, RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;
const HIDE_ON_MODERN: DisplayRule = {
	id: "Mscrm.HideOnModern",
	steps: [{ kind: "CommandClientTypeRule", type: "Modern", invertResult: true }],
};
const SHOW_ONLY_ON_MODERN: DisplayRule = {
	id: "Mscrm.ShowOnlyOnModern",
	steps: [{ kind: "CommandClientTypeRule", type: "Modern" }],
};

const btn: RibbonButton = {
	id: "cbs.One",
	label: "One",
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: "cbs.One.Command",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
};
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

function load(displayRules: DisplayRule[]) {
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: {
				location: "HomepageGrid",
				entityLogicalName: T,
				tabs: [
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
								buttons: [btn],
							},
						],
					},
				],
			},
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [{ id: btn.commandId, enableRules: [], displayRules: [], actions: [] }],
		enableRules: [],
		displayRules,
		locLabels: [],
	});
	useSelectionStore.getState().setLocation("HomepageGrid");
	useSelectionStore.getState().setTabId(MAIN);
	useSelectionStore.getState().selectButton(GROUP, btn.id);
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = (ui: React.ReactNode) =>
	act(() => root.render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>));
const badge = (text: string) =>
	[...container.querySelectorAll<HTMLElement>(".fui-Badge")].find((b) => b.textContent === text);
const commandRules = () =>
	useRibbonStore.getState().commands.find((c) => c.id === btn.commandId)!.displayRules;

describe("#152 client type filters", () => {
	it('the Unified Interface filter adds Type="Modern"', () => {
		load([]);
		render(<AdvancedSection />);
		expect(badge("Show on Unified Interface (Refresh)")).toBeUndefined();
		act(() => badge("Show on Unified Interface (Modern)")!.click());
		const [id] = commandRules();
		const rule = useRibbonStore.getState().displayRules.find((r) => r.id === id)!;
		expect(rule.steps).toEqual([{ kind: "CommandClientTypeRule", type: "Modern" }]);
	});

	it("never binds Mscrm.HideOnModern (inverted) for the Unified Interface filter", () => {
		// HideOnModern listed first, as the loaded ribbon can order it.
		load([HIDE_ON_MODERN, SHOW_ONLY_ON_MODERN]);
		render(<AdvancedSection />);
		act(() => badge("Show on Unified Interface (Modern)")!.click());
		expect(commandRules()).toEqual(["Mscrm.ShowOnlyOnModern"]);
	});

	it("creates a plain rule when only the inverted one exists", () => {
		load([HIDE_ON_MODERN]);
		render(<AdvancedSection />);
		act(() => badge("Show on Unified Interface (Modern)")!.click());
		expect(commandRules()).not.toContain("Mscrm.HideOnModern");
		const rule = useRibbonStore
			.getState()
			.displayRules.find((r) => r.id === commandRules()[0])!;
		expect(rule.steps).toEqual([{ kind: "CommandClientTypeRule", type: "Modern" }]);
	});

	it("replaces a filter of another type left on the command (an old Refresh rule), so the rules don't hide the button everywhere", () => {
		const oldRefresh: DisplayRule = {
			id: "cbs.One.Command.Refresh.DisplayRule",
			steps: [{ kind: "CommandClientTypeRule", type: "Refresh" }],
		};
		load([oldRefresh, SHOW_ONLY_ON_MODERN, HIDE_ON_MODERN]);
		const cmd = useRibbonStore.getState().commands[0];
		act(() =>
			useRibbonStore
				.getState()
				.upsertCommand({ ...cmd, displayRules: [oldRefresh.id, "Mscrm.HideOnModern"] }),
		);
		render(<AdvancedSection />);
		act(() => badge("Show on Unified Interface (Modern)")!.click());
		// The old filter is unbound (not deleted); an inverted rule isn't a filter and stays.
		expect(commandRules()).toEqual(["Mscrm.HideOnModern", "Mscrm.ShowOnlyOnModern"]);
		expect(useRibbonStore.getState().displayRules.some((r) => r.id === oldRefresh.id)).toBe(
			true,
		);
		// One undo step.
		act(() => useRibbonStore.getState().undo());
		expect(commandRules()).toEqual([oldRefresh.id, "Mscrm.HideOnModern"]);
	});

	it("doesn't reuse a rule with Default set", () => {
		load([
			{
				id: "isv.ModernDefault",
				steps: [{ kind: "CommandClientTypeRule", type: "Modern", default: false }],
			},
		]);
		render(<AdvancedSection />);
		act(() => badge("Show on Unified Interface (Modern)")!.click());
		expect(commandRules()).not.toContain("isv.ModernDefault");
	});

	it("the rule editor names Modern as Unified Interface and Refresh as the legacy web client", () => {
		render(
			<RuleStepEditor
				step={{ kind: "CommandClientTypeRule", type: "Modern" }}
				onChange={() => {}}
				onRemove={() => {}}
			/>,
		);
		const options = [...container.querySelectorAll("option")].map(
			(o) => `${o.value}: ${o.textContent}`,
		);
		expect(options).toContain("Modern: Modern (Unified Interface: web, tablets and phones)");
		expect(options).toContain("Refresh: Refresh (legacy updated web client)");
	});
});
