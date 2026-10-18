/**
 * #22 — properties-pane / state correctness: exact LocLabel matching in the
 * Identity section, a solution switch resetting table-scoped state, and stable
 * React keys for rule steps.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IdentitySection } from "@/components/properties-pane/IdentitySection";
import { RuleEditorPanel } from "@/components/panels/RuleEditorPanel";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { buttonTranslationLcids } from "@/utils/locLabelRef";
import type { LocLabel, RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import type { Solution } from "@/types/solution";
import type { EntityMetadata } from "@/types/entity";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = "account";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const GROUP = `${MAIN}.Management`;

const button = (id: string, extra: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: `${id}.Command`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...extra,
});

const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: T, tabs: [] });

function loadTable(buttons: RibbonButton[], locLabels: LocLabel[] = []) {
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
						groups: [{ id: GROUP, label: "Management", sequence: 10, template: "Mscrm.Templates.Flexible2", buttons }],
					},
				],
			},
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: buttons.map((b) => ({ id: b.commandId, enableRules: [], displayRules: [], actions: [] })),
		enableRules: [],
		displayRules: [{ id: "cbs.Rule", steps: [] }],
		locLabels,
	});
}

const title = (languageCode: number, description: string) => ({ languageCode, description });

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
	useUIStore.getState().closeRuleEditor();
});

describe("#22 — Identity section translations match the button's own labels", () => {
	// `Foo.Button2`'s labels sort first, so a prefix match picks them for `Foo.Button`.
	const labels: LocLabel[] = [
		{ id: "Foo.Button2.LabelText", titles: [title(1033, "Two"), title(1031, "Zwei")] },
		{ id: "Foo.Button.LabelText", titles: [title(1033, "One")] },
	];

	it("ignores labels of a button whose id only starts with this one", () => {
		expect(buttonTranslationLcids(button("Foo.Button"), labels)).toEqual([1033]);
		expect(buttonTranslationLcids(button("Foo.Button2"), labels)).toEqual([1033, 1031]);
		expect(buttonTranslationLcids(button("Foo.Butt"), labels)).toEqual([]);
	});

	it("uses the labels the button references (a Ribbon Workbench label id)", () => {
		const rw = button("Foo.Button", {
			source: {
				labelToken: "$LocLabels:rw.Foo.Label",
				tooltipTitleToken: "$LocLabels:rw.Foo.Tip",
				attributes: {},
			},
		});
		const all: LocLabel[] = [
			...labels,
			{ id: "rw.Foo.Label", titles: [title(1033, "One"), title(1036, "Un")] },
			{ id: "rw.Foo.Tip", titles: [title(1043, "Een")] },
		];
		// The convention tooltip-body id still counts; LabelText's isn't referenced any more.
		expect(buttonTranslationLcids(rw, all)).toEqual([1033, 1036, 1043]);
		expect(buttonTranslationLcids(rw, all, 1036)).toEqual([1036, 1033, 1043]);
	});

	it("shows only the button's own languages in the pane", () => {
		const b = button("Foo.Button");
		loadTable([b, button("Foo.Button2", { sequence: 20 })], labels);
		act(() => root.render(<IdentitySection button={b} location="HomepageGrid" tabId={MAIN} groupId={GROUP} />));
		const chips = container.textContent ?? "";
		expect(chips).toContain("en-US");
		expect(chips).not.toContain("1031");
	});
});

describe("#22 — switching solution resets table-scoped state", () => {
	const solution = (id: string): Solution =>
		({ id, uniqueName: id, friendlyName: id, version: "1.0.0.0", publisherPrefix: "cbs" }) as Solution;
	const entity = { logicalName: T, metadataId: "m1" } as EntityMetadata;

	beforeEach(() => {
		useSessionStore.setState({ activeSolution: null, activeEntity: null, entities: [] });
		useSessionStore.getState().setActiveSolution(solution("A"));
		useSessionStore.getState().setEntities([entity]);
		useSessionStore.getState().setActiveEntity(entity);
		useSessionStore.getState().setSolutionEntityIds(["m1"]);
		loadTable([button("cbs.One")]);
		useRibbonStore.getState().setButtonProp("HomepageGrid", MAIN, GROUP, "cbs.One", { label: "Edited" });
		useSelectionStore.getState().selectButtonInContext("HomepageGrid", MAIN, GROUP, "cbs.One");
	});

	it("clears the table list, the table, its ribbon, history and selection", () => {
		useSessionStore.getState().setActiveSolution(solution("B"));
		const session = useSessionStore.getState();
		expect(session.activeSolution?.id).toBe("B");
		expect(session.entities).toEqual([]);
		expect(session.activeEntity).toBeNull();
		expect(session.solutionEntityIds).toBeNull();
		const ribbon = useRibbonStore.getState();
		expect(ribbon.ribbons.HomepageGrid.tabs).toEqual([]);
		expect(ribbon.baseline.HomepageGrid.tabs).toEqual([]);
		expect(ribbon.commands).toEqual([]);
		expect(ribbon.displayRules).toEqual([]);
		expect(ribbon.past).toEqual([]);
		expect(ribbon.mutationsSincePublish).toBe(0);
		expect(useSelectionStore.getState().selectedButtonId).toBeNull();
	});

	it("keeps everything when the active solution is picked again", () => {
		useSessionStore.getState().setActiveSolution(solution("A"));
		expect(useSessionStore.getState().activeEntity).toBe(entity);
		expect(useSessionStore.getState().entities).toEqual([entity]);
		expect(useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[0].buttons[0].label).toBe("Edited");
		expect(useSelectionStore.getState().selectedButtonId).toBe("cbs.One");
	});
});

describe("#22 — rule steps keep their React keys", () => {
	function openRule() {
		loadTable([button("cbs.One")]);
		useRibbonStore.getState().upsertDisplayRule({
			id: "cbs.Rule",
			steps: [
				{ kind: "FormStateRule", state: "Create" },
				{ kind: "CommandClientTypeRule", type: "Refresh" },
				{ kind: "FormStateRule", state: "Existing" },
			],
		});
		useUIStore.getState().openRuleEditor("cbs.Rule", "display");
		act(() => root.render(<RuleEditorPanel />));
	}
	const items = () => Array.from(document.querySelectorAll('ol[aria-label="Rule steps"] > li'));

	it("removing a step leaves the other steps' elements in place", () => {
		openRule();
		const [, second, third] = items();
		expect(items()).toHaveLength(3);
		const remove = document.querySelector<HTMLButtonElement>('button[aria-label="Remove FormStateRule step"]')!;
		act(() => remove.click());
		expect(useRibbonStore.getState().displayRules.find((r) => r.id === "cbs.Rule")?.steps).toHaveLength(2);
		// With index keys React reused the first two <li>s for the remaining
		// steps (and dropped the last), so each step's inputs moved up one.
		expect(items()).toEqual([second, third]);
	});

	it("editing a step keeps every step's element", () => {
		openRule();
		const before = items();
		const rule = useRibbonStore.getState().displayRules.find((r) => r.id === "cbs.Rule")!;
		// An edit that keeps the number of steps (also an undo of one) keeps the keys.
		act(() =>
			useRibbonStore.getState().upsertDisplayRule({
				...rule,
				steps: [{ kind: "FormStateRule", state: "ReadOnly" }, ...rule.steps.slice(1)],
			}),
		);
		expect(items()).toEqual(before);
	});
});
