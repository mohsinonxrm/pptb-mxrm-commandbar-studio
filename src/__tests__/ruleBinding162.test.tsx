/**
 * #162: Microsoft's grid and quick action enable rules (Mscrm.ShowOnGrid and the others) can be
 * bound although a table's ribbon doesn't list them, and their tag has nothing to open; a
 * display rule that a sub-grid button uses warns about a column value step.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { EditorDrawer } from "@/components/panels/EditorDrawer";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { hasRuleStepKind } from "@/constants/ruleKinds";
import { CommandsGrid } from "@/components/bottom-panel/ElementGrids";
import type {
	CommandDefinition,
	DisplayRule,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
} from "@/types/ribbon";

vi.mock("@/components/shared/MonacoEditor", () => ({ default: () => null }));
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
const CMD = "cbstest.Open.Command";
const RULE = "cbstest.Open.DisplayRule";
const button = (location: RibbonLocation): RibbonButton =>
	({
		id: `cbstest.${location}.Open`,
		label: "Open",
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId: CMD,
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		origin: "unmanaged",
	}) as RibbonButton;
const ribbon = (location: RibbonLocation, withButton: boolean): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: withButton
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
							buttons: [button(location)],
						},
					],
				},
			]
		: [],
});
const store = () => useRibbonStore.getState();
const ui = () => useUIStore.getState();

function load(location: RibbonLocation) {
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: ribbon("HomepageGrid", location === "HomepageGrid"),
			SubGrid: ribbon("SubGrid", location === "SubGrid"),
			Form: ribbon("Form", false),
			Application: ribbon("Application", false),
		},
		commands: [
			{ id: CMD, enableRules: [], displayRules: [RULE], actions: [] } as CommandDefinition,
		],
		displayRules: [
			{
				id: RULE,
				steps: [
					{
						kind: "OrRule",
						groups: [
							[{ kind: "ValueRule", field: "statecode", value: "0" }],
							[{ kind: "FormStateRule", state: "Create" }],
						],
					},
				],
			} as DisplayRule,
		],
		enableRules: [],
		locLabels: [],
	} as never);
}

let container: HTMLDivElement;
let root: Root;
const flush = async () => {
	for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const drawer = () => document.querySelector<HTMLElement>('[role="dialog"]');
const until = async (ready: () => boolean) => {
	for (let i = 0; i < 250 && !ready(); i++)
		await act(async () => new Promise((r) => setTimeout(r, 20)));
	expect(ready()).toBe(true);
};
const buttonNamed = (text: string) =>
	[...document.querySelectorAll<HTMLButtonElement>("button")].find(
		(b) => b.textContent?.trim() === text,
	);

beforeEach(() => {
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

describe("#162 Microsoft's grid rules", () => {
	it("can be bound from the command editor, and their tag has nothing to open", async () => {
		load("HomepageGrid");
		act(() => {
			ui().openCommandEditor(CMD);
			ui().setCommandEditorTab("enable");
		});
		await until(() => !!buttonNamed("New enable rule"));
		const select = [...drawer()!.querySelectorAll("select")].find((s) =>
			[...s.options].some((o) => o.value === "Mscrm.ShowOnGrid"),
		)!;
		expect(select.querySelector("optgroup")?.label).toBe("Microsoft's grid rules");
		expect([...select.querySelectorAll("optgroup option")].map((o) => o.textContent)).toEqual([
			"Show on the grid and as a quick action (Mscrm.ShowOnGridAndQuickAction)",
			"Show only on the grid (Mscrm.ShowOnGrid)",
			"Show only as a quick action (Mscrm.ShowOnQuickAction)",
		]);
		act(() => {
			select.value = "Mscrm.ShowOnGrid";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		act(() => buttonNamed("Add")!.click());
		await flush();
		expect(store().commands[0].enableRules).toEqual(["Mscrm.ShowOnGrid"]);
		// Bound now: not offered again
		expect(
			[...drawer()!.querySelectorAll("option")].some((o) => o.value === "Mscrm.ShowOnGrid"),
		).toBe(false);

		// Its tag doesn't open an editor that would close at once
		const tag = [...drawer()!.querySelectorAll<HTMLButtonElement>("button")].find(
			(b) => b.textContent?.trim() === "ShowOnGrid",
		)!;
		const views: string[] = [];
		const stop = useUIStore.subscribe((s) => views.push(s.editorStack.at(-1)?.kind ?? ""));
		act(() => tag.click());
		await flush();
		stop();
		expect(views).not.toContain("rule");
		expect(ui().editorStack.at(-1)?.kind).toBe("command");
	});
});

describe("#162 a column value in a sub-grid display rule", () => {
	const warning = "A sub-grid button uses this rule";
	it("warns when a sub-grid button uses the rule", async () => {
		load("SubGrid");
		act(() => ui().openRuleEditor(RULE, "display"));
		await until(() => !!drawer()?.textContent?.includes("Passes when"));
		expect(drawer()!.textContent).toContain(warning);
	});
	it("doesn't on a grid", async () => {
		load("HomepageGrid");
		act(() => ui().openRuleEditor(RULE, "display"));
		await until(() => !!drawer()?.textContent?.includes("Passes when"));
		expect(drawer()!.textContent).not.toContain(warning);
	});
});

describe("#162 review", () => {
	it("doesn't offer the grid rules for a command only a sub-grid button uses", async () => {
		load("SubGrid");
		act(() => {
			ui().openCommandEditor(CMD);
			ui().setCommandEditorTab("enable");
		});
		await until(() => !!buttonNamed("New enable rule"));
		expect(drawer()!.querySelector("optgroup")).toBeNull();
	});

	it("finds a column value kept as raw XML", () => {
		expect(
			hasRuleStepKind(
				[
					{
						kind: "RawRule",
						tagName: "ValueRule",
						xml: '<ValueRule Field="a" Value="b" />',
					},
				],
				"ValueRule",
			),
		).toBe(true);
		expect(
			hasRuleStepKind(
				[
					{
						kind: "RawRule",
						tagName: "OrRule",
						xml: '<OrRule><Or><ValueRule Field="a" Value="b" /></Or></OrRule>',
					},
				],
				"ValueRule",
			),
		).toBe(true);
		expect(
			hasRuleStepKind(
				[
					{
						kind: "RawRule",
						tagName: "OrRule",
						xml: "<OrRule><Or><ValueRuleX /></Or></OrRule>",
					},
				],
				"ValueRule",
			),
		).toBe(false);
	});

	it("the bottom panel's tag for a rule that isn't loaded opens nothing", () => {
		const onOpenRule = vi.fn();
		act(() =>
			root.render(
				<FluentProvider theme={webLightTheme}>
					<CommandsGrid
						commands={[
							{
								id: CMD,
								enableRules: ["Mscrm.ShowOnGrid", "cbstest.Loaded"],
								displayRules: [],
								actions: [],
							} as CommandDefinition,
						]}
						usage={new Map()}
						height={400}
						onOpen={() => {}}
						onOpenRule={onOpenRule}
						isRuleLoaded={(id) => id === "cbstest.Loaded"}
						emptyText=""
					/>
				</FluentProvider>,
			),
		);
		const tag = (text: string) =>
			[...document.querySelectorAll<HTMLButtonElement>("button")].find(
				(b) => b.textContent?.trim() === text,
			);
		act(() => tag("ShowOnGrid")?.click());
		expect(onOpenRule).not.toHaveBeenCalled();
		act(() => tag("Loaded")?.click());
		expect(onOpenRule).toHaveBeenCalledWith("cbstest.Loaded", "enable");
	});
});
