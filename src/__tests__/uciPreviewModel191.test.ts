/**
 * #191 phase B: the Unified Interface preview model. The rule evaluator (rules.ts) and the bar
 * model (bar.ts) are checked by hand-built cases and against what Dynamics 365 did on CRM279420:
 * the recorded bars (#192, 2026-10-29), the probe of your own commands (2026-11-15) and Command
 * Checker's rule outcomes (2026-11-15).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRibbonXml } from "@/services/xmlParser";
import { splitTabsByLocation } from "@/services/dataverse/ribbonService";
import {
	barOrder,
	classicRuleId,
	decodeModernSequence,
	hiddenBySelection,
	ribbonRules,
	simulateBar,
	systemItems,
	type RibbonRules,
	type SimulatedEntry,
} from "@/services/uciPreview/bar";
import {
	evaluateCommand,
	evaluateRule,
	evaluateStep,
	recordedContextKey,
	type FormState,
	type RecordedRules,
	type SimulationContext,
	type UciLocation,
} from "@/services/uciPreview/rules";
import { RECORDED_RULES } from "@/services/uciPreview/recordedRules";
import { groupControls } from "@/utils/ribbonMenu";
import type {
	CommandDefinition,
	EntityProperty,
	RibbonButton,
	RibbonGroup,
	RibbonTab,
	RuleStep,
} from "@/types/ribbon";
import type { ModernCommand } from "@/types/modernCommand";

const dir = resolve(__dirname, "../__fixtures__/uci-preview");
const read = (path: string) => readFileSync(resolve(dir, path), "utf-8");

// ---------------------------------------------------------------- helpers

const ctx = (over: Partial<SimulationContext> = {}): SimulationContext => ({
	location: "HomePageGrid",
	entity: "contact",
	selectedCount: 0,
	...over,
});
const step = (s: RuleStep, c: Partial<SimulationContext> = {}) => evaluateStep(s, ctx(c)).outcome;

const button = (id: string, sequence: number, over: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence,
	templateAlias: "o1",
	commandId: `${id}.Command`,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	...over,
});
const group = (id: string, sequence: number, buttons: RibbonButton[]): RibbonGroup => ({
	id,
	label: id,
	sequence,
	template: "Mscrm.Templates.Flexible",
	buttons,
});
const tab = (id: string, sequence: number, groups: RibbonGroup[]): RibbonTab => ({
	id,
	label: id,
	sequence,
	tabDisplayRules: [],
	groups,
});
const modern = (
	id: string,
	sequence: number,
	over: Partial<ModernCommand> = {},
): ModernCommand => ({
	id,
	name: id,
	uniqueName: id,
	label: id,
	appModuleId: null,
	scope: "entity",
	location: 1,
	type: "button",
	sequence,
	hidden: false,
	disabled: false,
	origin: "default",
	managed: false,
	parentId: null,
	groupTitleHidden: false,
	action: "javascript",
	visibility: "none",
	classicRules: [],
	...over,
});
const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
/** Buttons as loaded from a merged ribbon: each with its place in the group (`source.position`). */
const loadedAs = (groupId: string, buttons: RibbonButton[]): RibbonButton[] =>
	buttons.map((b, index) => ({
		...b,
		source: {
			attributes: { Id: b.id, Sequence: String(b.sequence) },
			position: { groupId, index },
		},
	}));

// ---------------------------------------------------------------- B1: rules

describe("#191 B1 rule evaluator", () => {
	it("counts the selection: no Minimum or Maximum is any selection, none included", () => {
		const any: RuleStep = { kind: "SelectionCountRule", appliesTo: "SelectedEntity" };
		const one: RuleStep = { kind: "SelectionCountRule", minimum: 1, maximum: 1 };
		const none: RuleStep = { kind: "SelectionCountRule", minimum: 1, invertResult: true };
		expect([0, 1, 5].map((n) => step(any, { selectedCount: n }))).toEqual([true, true, true]);
		expect([0, 1, 2].map((n) => step(one, { selectedCount: n }))).toEqual([false, true, false]);
		expect([0, 1].map((n) => step(none, { selectedCount: n }))).toEqual([true, false]);
		// A form's PrimaryEntity is the record itself: one, unless it's new.
		const primary: RuleStep = {
			kind: "SelectionCountRule",
			minimum: 1,
			appliesTo: "PrimaryEntity",
		};
		expect(step(primary, { location: "Form", formState: "Existing" })).toBe(true);
		expect(step(primary, { location: "Form", formState: "Create" })).toBe(false);
	});

	it("matches EntityRule's entity and context, and a sub-grid's PrimaryEntity is the form's", () => {
		const sub = { location: "SubGridStandard" as const, primaryEntity: "account" };
		expect(step({ kind: "EntityRule", context: "HomePageGrid" })).toBe(true);
		expect(step({ kind: "EntityRule", context: "Form" })).toBe(false);
		expect(step({ kind: "EntityRule", entityName: "contact" }, sub)).toBe(true);
		expect(
			step({ kind: "EntityRule", entityName: "account", appliesTo: "PrimaryEntity" }, sub),
		).toBe(true);
		expect(step({ kind: "FormEntityContextRule", entityName: "list" })).toBe(false);
		expect(step({ kind: "FormEntityContextRule", entityName: "account" }, sub)).toBe(true);
	});

	it("knows Unified Interface on the web: Modern, Web, online, not Outlook, no legacy page", () => {
		expect(step({ kind: "CommandClientTypeRule", type: "Modern" })).toBe(true);
		expect(step({ kind: "CommandClientTypeRule", type: "Modern", invertResult: true })).toBe(
			false,
		);
		expect(step({ kind: "CommandClientTypeRule", type: "Legacy" })).toBe(false);
		expect(step({ kind: "CrmClientTypeRule", type: "Outlook" })).toBe(false);
		expect(step({ kind: "CrmOfflineAccessStateRule", state: "Offline" })).toBe(false);
		expect(step({ kind: "DeviceTypeRule", type: "Phone" })).toBe(false);
		expect(step({ kind: "DeviceTypeRule", type: "InteractionCentric" })).toBe("unknown");
		expect(step({ kind: "HideForTabletExperienceRule" })).toBe(true);
		expect(step({ kind: "PageRule", address: "/_root/homepage.aspx" })).toBe(false);
		expect(step({ kind: "SkuRule", sku: "Online" })).toBe(true);
		expect(step({ kind: "OutlookRenderTypeRule", type: "Outlook" })).toBe(false);
	});

	it("reads a form's state and type, and is false for both on a grid", () => {
		const form = { location: "Form" as const, formState: "Existing" as FormState };
		expect(step({ kind: "FormStateRule", state: "Existing" }, form)).toBe(true);
		expect(step({ kind: "FormStateRule", state: "Create" }, form)).toBe(false);
		expect(step({ kind: "FormStateRule", state: "Existing" })).toBe(false);
		expect(step({ kind: "FormTypeRule", type: "Main" }, form)).toBe(true);
		expect(step({ kind: "FormTypeRule", type: "Main" })).toBe(false);
	});

	it("uses three-valued logic: false wins an AND, true wins an OR, and an unknown stays unknown when inverted", () => {
		const custom: RuleStep = { kind: "CustomRule", library: "x.js", functionName: "f" };
		const legacy: RuleStep = { kind: "CommandClientTypeRule", type: "Legacy" };
		const modernRule: RuleStep = { kind: "CommandClientTypeRule", type: "Modern" };
		expect(step(custom)).toBe("unknown");
		expect(step({ ...custom, invertResult: true })).toBe("unknown");
		expect(step({ kind: "OrRule", groups: [[custom], [modernRule]] })).toBe(true);
		expect(step({ kind: "OrRule", groups: [[custom], [legacy]] })).toBe("unknown");
		expect(step({ kind: "OrRule", groups: [[custom, legacy], [legacy]] })).toBe(false);
		const rule = { id: "r", steps: [custom, legacy] };
		expect(evaluateRule(rule, ctx()).outcome).toBe(false);
	});

	it("can't simulate custom JavaScript, features, settings, record values or unmodelled rules, and says why", () => {
		const cases: [RuleStep, string][] = [
			[{ kind: "CustomRule", library: "x.js", functionName: "f" }, "custom JavaScript"],
			[
				{ kind: "FeatureControlRule", featureControlBit: "FCB.X", expectedValue: true },
				"the organization's features",
			],
			[
				{ kind: "OrganizationSettingRule", setting: "IsSharepointEnabled" },
				"the organization's settings",
			],
			[{ kind: "ValueRule", field: "statecode", value: "0" }, "the record's data"],
			[{ kind: "RawRule", tagName: "ContextTypeRule", xml: "" }, "a rule CBS doesn't model"],
			[
				{
					kind: "RelationshipTypeRule",
					appliesTo: "SelectedEntity",
					relationshipType: "OneToMany",
				},
				"the sub-grid's relationship",
			],
		];
		for (const [s, reason] of cases) {
			const v = evaluateStep(s, ctx({ location: "SubGridStandard" }));
			expect(v.outcome, s.kind).toBe("unknown");
			expect(v.notes[0]).toMatchObject({ basis: "cannot-simulate", reason });
		}
	});

	it("takes privileges as held only for a System Administrator, and says it assumed them", () => {
		const priv: RuleStep = {
			kind: "EntityPrivilegeRule",
			privilegeType: "Create",
			privilegeDepth: "Basic",
			entityName: "report",
		};
		expect(evaluateStep(priv, ctx()).outcome).toBe("unknown");
		const v = evaluateStep(priv, ctx({ privileges: "all" }));
		expect(v.outcome).toBe(true);
		expect(v.notes[0]).toMatchObject({ basis: "assumed", reason: "a System Administrator" });
	});

	it("reads entity metadata flags when it has them", () => {
		const childless: RuleStep = {
			kind: "EntityPropertyRule",
			propertyName: "IsChildEntity",
			propertyValue: false,
			appliesTo: "SelectedEntity",
		};
		expect(step(childless)).toBe("unknown");
		expect(step(childless, { entityProperties: { contact: { IsChildEntity: false } } })).toBe(
			true,
		);
	});

	it("uses a rule's recorded outcome where it can't evaluate it or assumed a privilege, not where it can", () => {
		const recorded: RecordedRules = {
			source: "test",
			contexts: { "HomePageGrid.sel1": ["account"] },
			rules: {
				Custom: { "HomePageGrid.sel1": true },
				Priv: { "HomePageGrid.sel1": { account: false } },
				Modern: { "HomePageGrid.sel1": false },
			},
		};
		const admin = ctx({ entity: "account", selectedCount: 1, privileges: "all", recorded });
		const custom = {
			id: "Custom",
			steps: [{ kind: "CustomRule", library: "x", functionName: "f" }] as RuleStep[],
		};
		const priv = {
			id: "Priv",
			steps: [
				{
					kind: "EntityPrivilegeRule",
					privilegeType: "Read",
					privilegeDepth: "Basic",
					entityName: "relationshiprole",
				},
			] as RuleStep[],
		};
		const evaluable = {
			id: "Modern",
			steps: [{ kind: "CommandClientTypeRule", type: "Modern" }] as RuleStep[],
		};
		expect(evaluateRule(custom, admin)).toMatchObject({
			outcome: true,
			notes: [{ basis: "recorded" }],
		});
		expect(evaluateRule(priv, admin).outcome).toBe(false);
		expect(evaluateRule(priv, { ...admin, entity: "contact" }).outcome).toBe(true);
		expect(evaluateRule(evaluable, admin).outcome).toBe(true);
		// Recorded at one row selected, so not used with none.
		expect(evaluateRule(custom, { ...admin, selectedCount: 0 }).outcome).toBe("unknown");
		// Recorded for a System Administrator only.
		expect(evaluateRule(custom, { ...admin, privileges: undefined }).outcome).toBe("unknown");
		expect(recordedContextKey(ctx({ selectedCount: 7 }))).toBe("HomePageGrid.sel2");
		expect(recordedContextKey(ctx({ location: "Form", formState: "Disabled" }))).toBe(
			"Form.Disabled",
		);
	});
	it("keeps a rule False when a step it evaluated is False, whatever was recorded elsewhere", () => {
		const recorded: RecordedRules = {
			source: "test",
			contexts: { "Form.Existing": ["contact"] },
			rules: { R: { "Form.Existing": true } },
		};
		const rule = {
			id: "R",
			steps: [
				{ kind: "FormStateRule", state: "Existing" },
				{ kind: "EntityPrivilegeRule", privilegeType: "Write", privilegeDepth: "Basic" },
			] as RuleStep[],
		};
		const form = { location: "Form" as const, privileges: "all" as const, recorded };
		expect(evaluateRule(rule, ctx({ ...form, formState: "Existing" })).outcome).toBe(true);
		expect(evaluateRule(rule, ctx({ ...form, formState: "Disabled" })).outcome).toBe(false);
	});

	it("carries a recording to another state only for a rule no step of which depends on it", () => {
		const recorded: RecordedRules = {
			source: "test",
			contexts: { "HomePageGrid.sel0": ["contact"] },
			rules: { Mixed: { "HomePageGrid.sel0": false }, Priv: { "HomePageGrid.sel0": false } },
		};
		const priv: RuleStep = {
			kind: "EntityPrivilegeRule",
			privilegeType: "Delete",
			privilegeDepth: "Basic",
		};
		const mixed = {
			id: "Mixed",
			steps: [{ kind: "SelectionCountRule", minimum: 1 }, priv] as RuleStep[],
		};
		const admin = ctx({ selectedCount: 1, privileges: "all", recorded });
		// False with no row selected came from the count; with one selected, nothing says False.
		expect(evaluateRule(mixed, admin).outcome).toBe(true);
		// Privileges alone don't depend on the selection.
		expect(evaluateRule({ id: "Priv", steps: [priv] }, admin).outcome).toBe(false);
	});

	it("doesn't assume a record's own privileges: an inactive record denies Write", () => {
		const write: RuleStep = { kind: "RecordPrivilegeRule", privilegeType: "Write" };
		const v = evaluateStep(write, ctx({ location: "Form", privileges: "all" }));
		expect(v.outcome).toBe("unknown");
		expect(v.notes[0]).toMatchObject({ reason: "the record's access" });
	});

	it("counts the form's record as PrimaryEntity on a sub-grid", () => {
		const primary: RuleStep = {
			kind: "SelectionCountRule",
			minimum: 1,
			maximum: 1,
			appliesTo: "PrimaryEntity",
		};
		expect(step(primary, { location: "SubGridStandard", selectedCount: 0 })).toBe(true);
		expect(step(primary, { location: "SubGridAssociated", selectedCount: 3 })).toBe(true);
		expect(step(primary, { location: "HomePageGrid", selectedCount: 0 })).toBe(false);
	});
});

// ---------------------------------------------------------------- B2: order

describe("#191 B2 bar order", () => {
	it("keeps the loaded order of a group's controls, not Sequence; groups and tabs by Sequence", () => {
		const t = [
			tab("T.Related", 120, [
				group("G.Related", 10, loadedAs("G.Related", [button("R", 10)])),
			]),
			tab("T.Main", 100, [
				group("G.B", 20, loadedAs("G.B", [button("B1", 30), button("B2", 10)])),
				group("G.A", 10, loadedAs("G.A", [button("A1", 5)])),
			]),
		];
		expect(ids(barOrder({ tabs: t }))).toEqual(["A1", "B1", "B2", "R"]);
		// The store's own order doesn't matter (a move sorts the group by Sequence).
		const sorted = t.map((x) => ({
			...x,
			groups: x.groups.map((g) => ({ ...g, buttons: [...g.buttons].reverse() })),
		}));
		expect(ids(barOrder({ tabs: sorted }))).toEqual(["A1", "B1", "B2", "R"]);
	});

	it("leaves out the chart designer's contextual tab, hidden buttons and controls Unified Interface doesn't draw", () => {
		const t = [
			tab("Mscrm.HomepageGrid.AllEntities.VisualizationTab", 10, [
				group("V", 10, [button("V1", 10)]),
			]),
			tab("T", 100, [
				group("G", 10, [
					button("Shown", 10),
					button("Hidden", 20, { hidden: true }),
					button("Label", 30, { kind: "label" }),
				]),
			]),
		];
		expect(ids(barOrder({ tabs: t }))).toEqual(["Shown"]);
	});

	it("puts a new, moved or re-sequenced control where the merge will: before the first sibling with a greater Sequence", () => {
		// As contact's ExportData: Import from Excel (21) comes last in the loaded ribbon.
		const [report, selected, imported] = loadedAs("G", [
			button("Report", 30),
			button("Selected", 230),
			button("Import", 21),
		]);
		const [moved] = loadedAs("Other", [button("Moved", 25)]);
		const now = [
			tab("T", 100, [
				group("G", 10, [
					// New, appended by the store.
					button("New22", 22),
					report,
					selected,
					// Re-sequenced from 21.
					{ ...imported, sequence: 500 },
					// Moved here from another group.
					moved,
					button("New1000", 1000),
				]),
			]),
		];
		expect(ids(barOrder({ tabs: now }))).toEqual([
			"New22",
			"Moved",
			"Report",
			"Selected",
			"Import",
			"New1000",
		]);
		// Unchanged, Import from Excel stays last.
		expect(
			ids(
				barOrder({ tabs: [tab("T", 100, [group("G", 10, [imported, report, selected])])] }),
			),
		).toEqual(["Report", "Selected", "Import"]);
		// A copy keeps its original's source but not its Id: it goes by the rule, before Selected (230).
		const copy = {
			...report,
			id: "Copy",
			source: { ...report.source!, attributes: { Sequence: "30" } },
		};
		expect(
			ids(barOrder({ tabs: [tab("T", 100, [group("G", 10, [report, copy, selected])])] })),
		).toEqual(["Report", "Copy", "Selected"]);
	});

	it("decodes a modern command's sequence into its tab, group and control", () => {
		expect(decodeModernSequence(1_000_500_100)).toEqual({ tab: 100, group: 50, control: 100 });
		expect(decodeModernSequence(1_002_010_005)).toEqual({ tab: 102, group: 1, control: 5 });
		// A form's main tab (Sequence 10): (10 − 100) × 1,000,000.
		expect(decodeModernSequence(910_100_005)).toEqual({ tab: 10, group: 10, control: 5 });
		expect(decodeModernSequence(10)).toBeUndefined();
	});

	it("puts a modern command into its group, before the first control with a greater Sequence; one that names no group ends the bar", () => {
		const t = [
			tab("T", 100, [
				group("G10", 10, [button("A", 10), button("B", 30)]),
				group("G50", 50, [button("C", 21), button("D", 230)]),
			]),
		];
		const m = [
			modern("m20", 1_000_100_020),
			modern("m100", 1_000_500_100),
			modern("m999", 1_000_500_999),
			modern("loose", 7),
			modern("off", 1_000_100_005, { disabled: true }),
		];
		expect(ids(barOrder({ tabs: t, modern: m }))).toEqual([
			"A",
			"modern:m20",
			"B",
			"C",
			"modern:m100",
			"D",
			"modern:m999",
			"modern:loose",
		]);
	});

	it("adds Unified Interface's own items for each page", () => {
		const of = (l: UciLocation, o = {}) => {
			const s = systemItems(l, o);
			return [ids(s.lead), ids(s.trail)];
		};
		expect(of("HomePageGrid", { focusedView: true, ribbonDebug: true })).toEqual([
			["FocusedView", "ShowChartPane"],
			["OpenEntityDashboard", "CommandChecker"],
		]);
		expect(of("HomePageGrid")).toEqual([["ShowChartPane"], ["OpenEntityDashboard"]]);
		expect(of("SubGridStandard")).toEqual([[], ["NavigateToAssociatedGrid"]]);
		expect(of("SubGridAssociated")).toEqual([["ShowChartPane"], []]);
		expect(of("Form", { ribbonDebug: true })).toEqual([[], ["CommandChecker"]]);
	});

	it("hides with rows selected a command that doesn't count them, unless an item of its menu does", () => {
		const cmd = (id: string, enableRules: string[]): CommandDefinition => ({
			id,
			enableRules,
			displayRules: [],
			actions: [],
		});
		const rules: RibbonRules = {
			commands: new Map([
				["Plain.Command", cmd("Plain.Command", [])],
				["Any.Command", cmd("Any.Command", ["Mscrm.AnySelection"])],
				["Split.Command", cmd("Split.Command", [])],
				["Selected.Command", cmd("Selected.Command", ["Mscrm.AnySelection"])],
			]),
			enableRules: new Map([
				[
					"Mscrm.AnySelection",
					{ id: "Mscrm.AnySelection", steps: [{ kind: "SelectionCountRule" }] },
				],
			]),
			displayRules: new Map(),
		};
		const menuOf = (...items: RibbonButton[]) => ({
			id: "M",
			sections: [{ id: "S", sequence: 10, controlsId: "C", controls: items }],
		});
		expect(hiddenBySelection(button("Plain", 10), rules)).toBe(true);
		expect(hiddenBySelection(button("Any", 10), rules)).toBe(false);
		const split = button("Split", 10, {
			kind: "splitButton",
			menu: menuOf(button("Selected", 10), button("Plain", 20)),
		});
		expect(hiddenBySelection(split, rules)).toBe(false);
		const flyout = button("Split", 10, { kind: "flyout", menu: menuOf(button("Plain", 20)) });
		expect(hiddenBySelection(flyout, rules)).toBe(true);
		const t = [tab("T", 100, [group("G", 10, [button("Plain", 10), button("Any", 20)])])];
		const m = [modern("m", 1_000_100_030)];
		const shown = (n: number) =>
			simulateBar({ tabs: t, modern: m }, rules, ctx({ selectedCount: n }))
				.filter((e) => e.verdict.outcome === true)
				.map((e) => e.id);
		expect(shown(0)).toEqual([
			"ShowChartPane",
			"Plain",
			"Any",
			"modern:m",
			"OpenEntityDashboard",
		]);
		expect(shown(1)).toEqual(["ShowChartPane", "Any", "OpenEntityDashboard"]);
	});

	it("evaluates a migrated modern command's classic rules by the ribbon rules they stand for", () => {
		const defined = new Map([["Mscrm.CheckBulkEditSupportForEntity", {}]]);
		expect(classicRuleId("msdyn_Mscrm.CheckBulkEditSupportForEntity!0", defined)).toBe(
			"Mscrm.CheckBulkEditSupportForEntity",
		);
		expect(classicRuleId("Mscrm.CheckBulkEditSupportForEntity", defined)).toBe(
			"Mscrm.CheckBulkEditSupportForEntity",
		);
		expect(classicRuleId("msdyn_Unknown!1", defined)).toBe("msdyn_Unknown!1");
		// Sales Hub's Edit: replaced by a migrated command whose enable rule needs one row.
		const rules: RibbonRules = {
			commands: new Map([
				["Cmd.Edit", { id: "Cmd.Edit", enableRules: [], displayRules: [], actions: [] }],
			]),
			enableRules: new Map([
				[
					"Mscrm.SelectionCountExactlyOne",
					{
						id: "Mscrm.SelectionCountExactlyOne",
						steps: [{ kind: "SelectionCountRule", minimum: 1, maximum: 1 }],
					},
				],
			]),
			displayRules: new Map(),
		};
		const migrated = modern("mEdit", 1_000_100_010, {
			origin: "migrated",
			visibility: "classicRules",
			classicRules: [
				{
					id: "r",
					name: "x",
					uniqueName: "msdyn_Mscrm.SelectionCountExactlyOne!0",
					kind: "enable",
				},
			],
		});
		const t = [
			tab("T", 100, [group("G", 10, [button("Edit", 10, { commandId: "Cmd.Edit" })])]),
		];
		const overrides = new Map([
			["Edit", [{ buttonId: "Edit", effect: "replaced" as const, command: migrated }]],
		]);
		const outcome = (n: number) =>
			simulateBar({ tabs: t, overrides }, rules, ctx({ selectedCount: n })).find(
				(e) => e.id === "Edit",
			)!.verdict.outcome;
		expect(outcome(0)).toBe(false);
		expect(outcome(1)).toBe(true);
	});

	it("doesn't show a control whose command isn't in the ribbon", () => {
		const t = [tab("T", 100, [group("G", 10, [button("Orphan", 10)])])];
		const rules: RibbonRules = {
			commands: new Map(),
			enableRules: new Map(),
			displayRules: new Map(),
		};
		const [entry] = simulateBar({ tabs: t }, rules, ctx({ location: "Form" }));
		expect(entry.verdict).toMatchObject({ outcome: false, noCommand: true });
	});
});

// ---------------------------------------------------------------- fixtures

interface Recording {
	entity: string;
	location: UciLocation;
	parent?: { entity: string };
	states: Record<string, { selected?: number; visible: string[]; overflow: string[] }>;
	probe?: { modern: { name: string; sequence: number }[]; ribbonDiffXml: string };
}
/**
 * Command Checker, item by item: flags V shown, H hidden by its rules, S hidden by selection; each
 * rule True, False, or null where Command Checker lists it as Skipped (not evaluated: an earlier
 * rule was already False).
 */
interface CommandCheckerCapture {
	source: Record<string, string>;
	contexts: Record<
		string,
		Record<
			string,
			{
				label: string;
				command?: string;
				flags: string;
				rules: Record<string, boolean | null>;
			}
		>
	>;
}

/**
 * The recorded table: each rule's outcome per page and selection or form state, the same for
 * every entity, or per entity where they differed. A rule two commands listed differently in one
 * context is left out (Save, now a modern command, lists Mscrm.CanSavePrimaryEntityType as True;
 * Save as Complete lists it as False). Only a group's own controls count: the items of a menu
 * nobody opened list values for another state (with a row selected, the Delete item under Delete
 * lists Mscrm.SelectionCountAtLeastOne as False).
 */
function deriveRecordedRules(c: CommandCheckerCapture): RecordedRules {
	const groupLevel = (entity: string, id: string) => topLevelIds(entity).has(id);
	const contexts: Record<string, string[]> = {};
	const seen: Record<string, Record<string, Record<string, Set<boolean>>>> = {};
	for (const [full, items] of Object.entries(c.contexts)) {
		const [location, entity, state] = full.split(".");
		const key = `${location}.${state}`;
		(contexts[key] ??= []).push(entity);
		for (const [id, item] of Object.entries(items))
			for (const [rule, value] of Object.entries(item.rules))
				if (value !== null && groupLevel(entity, id))
					(((seen[rule] ??= {})[key] ??= {})[entity] ??= new Set()).add(value);
	}
	const rules: Record<string, Record<string, boolean | Record<string, boolean>>> = {};
	for (const rule of Object.keys(seen).sort()) {
		for (const [key, byEntity] of Object.entries(seen[rule])) {
			if (Object.values(byEntity).some((v) => v.size > 1)) continue;
			const values = Object.fromEntries(
				Object.entries(byEntity).map(([e, v]) => [e, [...v][0]] as const),
			);
			const distinct = new Set(Object.values(values));
			(rules[rule] ??= {})[key] = distinct.size === 1 ? [...distinct][0] : values;
		}
	}
	return {
		source: `Command Checker, ${c.source.org}, ${c.source.app}, ${c.source.user}, ${c.source.recorded}`,
		contexts: Object.fromEntries(Object.entries(contexts).map(([k, v]) => [k, v.sort()])),
		rules,
	};
}

const recordings = readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.map((f) => ({ file: f, data: JSON.parse(read(f)) as Recording }));
const capture = JSON.parse(read("commandChecker/2026-11-15.json")) as CommandCheckerCapture;

/** EntityDefinitions on CRM279420, 2026-11-15 (HasStateCode: both have statecode). */
const ENTITY_PROPERTIES: Record<string, Partial<Record<EntityProperty, boolean>>> = {
	contact: {
		IsActivity: false,
		IsActivityParty: true,
		HasActivities: true,
		HasNotes: true,
		HasFeedback: true,
		IsBusinessProcessEnabled: true,
		IsConnectionsEnabled: true,
		IsCustomizable: true,
		DuplicateDetectionEnabled: true,
		MailMergeEnabled: true,
		IsEnabledForCharts: true,
		IsChildEntity: false,
		IsBPFEntity: false,
		HasEmailAddresses: true,
		WorksWithQueue: false,
		IsImportable: true,
		HasStateCode: true,
	},
	account: {
		IsActivity: false,
		IsActivityParty: true,
		HasActivities: true,
		HasNotes: true,
		HasFeedback: false,
		IsBusinessProcessEnabled: true,
		IsConnectionsEnabled: true,
		IsCustomizable: true,
		DuplicateDetectionEnabled: true,
		MailMergeEnabled: true,
		IsEnabledForCharts: true,
		IsChildEntity: false,
		IsBPFEntity: false,
		HasEmailAddresses: true,
		WorksWithQueue: false,
		IsImportable: true,
		HasStateCode: true,
	},
};

const parsedCache = new Map<string, ReturnType<typeof parseRibbonXml>>();
const parsed = (entity: string) => {
	if (!parsedCache.has(entity))
		parsedCache.set(
			entity,
			parseRibbonXml(read(`ribbon/${entity}.All.xml`), "HomepageGrid", entity),
		);
	return parsedCache.get(entity)!;
};
/** A group's own controls, not the items of their menus. */
const topLevelCache = new Map<string, Set<string>>();
const topLevelIds = (entity: string) => {
	if (!topLevelCache.has(entity))
		topLevelCache.set(
			entity,
			new Set(
				parsed(entity).ribbon.tabs.flatMap((t) =>
					t.groups.flatMap((g) => g.buttons.map((b) => b.id)),
				),
			),
		);
	return topLevelCache.get(entity)!;
};
const tabsFor = (entity: string, location: UciLocation) => {
	const p = parsed(entity);
	const split = splitTabsByLocation(p.ribbon.tabs, entity, p.ribbon.scalingByTab);
	return split[
		location === "HomePageGrid" ? "HomepageGrid" : location === "Form" ? "Form" : "SubGrid"
	].tabs;
};
const FORM_STATE: Record<string, FormState> = {
	existing: "Existing",
	new: "Create",
	inactive: "Disabled",
};
const contextOf = (data: Recording, key: string, recorded: RecordedRules | undefined) =>
	ctx({
		location: data.location,
		entity: data.entity,
		primaryEntity: data.parent?.entity,
		selectedCount: data.states[key].selected ?? 0,
		formState: data.location === "Form" ? FORM_STATE[key.split(".")[0]] : undefined,
		relationshipType: data.location.startsWith("SubGrid") ? "OneToMany" : undefined,
		privileges: "all",
		entityProperties: ENTITY_PROPERTIES,
		recorded,
	});
/** A recorded item's id as the model names it. */
const modelId = (entry: string) => {
	const id = entry.split("|")[0];
	if (id.startsWith("changeVisualization-")) return "FocusedView";
	if (/-navigateToAssociatedGrid-/.test(id)) return "NavigateToAssociatedGrid";
	return id;
};
const shownIds = (entries: SimulatedEntry[]) =>
	entries.filter((e) => e.verdict.outcome === true).map((e) => e.id);

/** One state per selection or form state (widths only change the overflow). */
const statesOf = (data: Recording) => {
	const seen = new Set<string>();
	return Object.keys(data.states).filter((k) => {
		const c = k.replace(/(^|\.)w\d+/, "");
		return !seen.has(c) && !!seen.add(c);
	});
};

describe("#191 B1 against Command Checker (CRM279420, 2026-11-15)", () => {
	it("the recorded table is generated from the capture", () => {
		// UPDATE_RECORDED_RULES=1 rewrites it from the capture (then run the test again).
		if (process.env.UPDATE_RECORDED_RULES)
			writeFileSync(
				resolve(__dirname, "../services/uciPreview/recordedRules.json"),
				JSON.stringify(deriveRecordedRules(capture), null, "\t") + "\n",
			);
		expect(RECORDED_RULES).toEqual(deriveRecordedRules(capture));
	});

	for (const [full, items] of Object.entries(capture.contexts)) {
		const [location, entity, state] = full.split(".") as [UciLocation, string, string];
		const c = ctx({
			location,
			entity,
			primaryEntity: location.startsWith("SubGrid") ? "account" : undefined,
			selectedCount: state.startsWith("sel") ? Number(state.slice(3)) : 0,
			formState: location === "Form" ? (state as FormState) : undefined,
			relationshipType: location.startsWith("SubGrid") ? "OneToMany" : undefined,
			privileges: "all",
			entityProperties: ENTITY_PROPERTIES,
		});
		const p = parsed(entity);
		const rules = ribbonRules(p);
		const controls = new Map<string, RibbonButton>();
		const walk = (b: RibbonButton) => {
			controls.set(b.id, b);
			for (const sec of b.menu?.sections ?? []) for (const x of sec.controls) walk(x);
		};
		for (const t of p.ribbon.tabs)
			for (const g of t.groups) for (const b of groupControls(g)) walk(b);

		it(`${full}: every rule CBS works out agrees with Command Checker, command by command`, () => {
			let settled = 0;
			for (const [id, item] of Object.entries(items))
				for (const [ruleId, outcome] of Object.entries(item.rules)) {
					if (!topLevelIds(entity).has(id)) continue;
					const rule = rules.displayRules.get(ruleId) ?? rules.enableRules.get(ruleId);
					if (!rule || outcome === null) continue;
					const v = evaluateRule(rule, c);
					if (v.outcome === "unknown" || v.notes.some((n) => n.basis === "assumed"))
						continue;
					settled++;
					expect(v.outcome, `${id}: ${ruleId}`).toBe(outcome);
				}
			expect(settled).toBeGreaterThan(20);
		});

		it(`${full}: shows, hides and hides by selection what Command Checker does`, () => {
			let checked = 0;
			let decided = 0;
			for (const [id, item] of Object.entries(items)) {
				const control = controls.get(id);
				const command = control && rules.commands.get(control.commandId);
				if (!control || !command) continue;
				checked++;
				const bySelection = c.selectedCount > 0 && hiddenBySelection(control, rules);
				expect(bySelection, `${id} hidden by selection`).toBe(item.flags.includes("S"));
				// Its rules decide it only as a group's own control run through the ribbon's
				// command: a menu item's values belong to another state, and Unified Interface
				// runs a few controls through another command (Show As through Mscrm.Disabled).
				if (!topLevelIds(entity).has(id)) continue;
				if (item.command && item.command !== control.commandId && item.command !== id)
					continue;
				// An item every listed rule of which is True is hidden by something else.
				const ownRulesHide = Object.values(item.rules).some((v) => v === false);
				if (item.flags.includes("H") && !ownRulesHide) continue;
				const shown = !item.flags.includes("H");
				// On its own, CBS may not know, but it never contradicts Command Checker.
				const own = evaluateCommand(command, rules, c).outcome;
				expect(own, `${id}: CBS alone`).not.toBe(!shown);
				if (own !== "unknown") decided++;
				// With the recorded outcomes it decides, the right way.
				const withRecorded = evaluateCommand(command, rules, {
					...c,
					recorded: RECORDED_RULES,
				}).outcome;
				expect(withRecorded, `${id}: with the recorded outcomes`).toBe(shown);
			}
			expect(checked).toBeGreaterThan(20);
			// CBS decides some of them without any recording.
			expect(decided).toBeGreaterThan(5);
		});
	}
});

/**
 * Commands the model can't decide on a recorded bar: Command Checker never evaluated a rule they
 * need there (it lists a rule as Skipped once an earlier one is False, and leaves out what a
 * hidden custom action removes), so no outcome was recorded for that page and state.
 */
const KNOWN_GAPS: Record<string, string[]> = {
	// Show As: Unified Interface runs it through Mscrm.Disabled, so its own FCB.DataSetControl
	// rule was never evaluated.
	"account.HomePageGrid.json w1920.sel0": [
		"Mscrm.HomepageGrid.account.ChangeDataSetControlButton",
	],
	"contact.HomePageGrid.json w1920.sel0": [
		"Mscrm.HomepageGrid.contact.ChangeDataSetControlButton",
	],
	"contact.SubGridAssociated.json w1920.sel0": [
		"Mscrm.SubGrid.contact.ChangeDataSetControlButton",
	],
	"contact.SubGridStandard.json w1920.sel0": ["Mscrm.SubGrid.contact.ChangeDataSetControlButton"],
	// Quick Campaign's modernization rule, recorded with no row selected only: the capture with a
	// row selected missed it (account) or the probe's cached HideCustomAction left it out (contact).
	"account.HomePageGrid.json w1920.sel1": ["Mscrm.HomepageGrid.account.QuickCampaign"],
	"contact.HomePageGrid.json w1920.sel1": ["Mscrm.HomepageGrid.contact.QuickCampaign"],
	// The Outlook mail app's buttons: their first rule (an FCB, or a custom rule) is False, so
	// Command Checker skipped the rest.
	"contact.Form.json existing.w1920": [
		"MailApp.Form.SetRegarding.contact.Button",
		"MailApp.Form.OpenRecordOnWeb.contact.Button",
	],
	"contact.Form.json new.w1920": [
		"MailApp.Form.SetRegarding.contact.Button",
		"MailApp.Form.OpenRecordOnWeb.contact.Button",
	],
};

/**
 * Where the model is wrong, and why. Relationship on the account grid: its display rule is
 * privileges only, which a System Administrator holds, yet Command Checker listed it as False
 * (checked by hand, docs/uci-command-bar.md). The capture with a row selected missed the end of
 * the list, so no recording corrects it.
 */
const KNOWN_WRONG: Record<string, string[]> = {
	"account.HomePageGrid.json w1920.sel1": ["Mscrm.HomepageGrid.account.Relationship"],
	"account.HomePageGrid.json w1920.sel2": ["Mscrm.HomepageGrid.account.Relationship"],
};

describe("#191 B2 against the recorded bars", () => {
	for (const { file, data } of recordings.filter((r) => !r.data.probe))
		for (const key of statesOf(data)) {
			const c = contextOf(data, key, RECORDED_RULES);
			const sim = () =>
				simulateBar(
					{ tabs: tabsFor(data.entity, data.location) },
					ribbonRules(parsed(data.entity)),
					c,
					{
						focusedView: data.location === "HomePageGrid",
						ribbonDebug: true,
					},
				);
			const recorded = () =>
				[...data.states[key].visible, ...data.states[key].overflow].map(modelId);

			it(`${file} ${key}: never contradicts the bar, and keeps its order`, () => {
				const entries = sim();
				const shown = new Set(recorded());
				const wrong = KNOWN_WRONG[`${file} ${key}`] ?? [];
				for (const e of entries) {
					if (e.verdict.outcome === true && !wrong.includes(e.id))
						expect(shown.has(e.id), `shown but not recorded: ${e.id}`).toBe(true);
					if (shown.has(e.id))
						expect(e.verdict.outcome, `recorded but hidden: ${e.id}`).not.toBe(false);
				}
				const order = ids(entries);
				const positions = recorded().map((i) => order.indexOf(i));
				expect(
					positions.every((p) => p >= 0),
					"every recorded item is modelled",
				).toBe(true);
				expect([...positions].sort((a, b) => a - b)).toEqual(positions);
			});

			it(`${file} ${key}: draws each control as the bar did (plain, split or menu)`, () => {
				const byId = new Map(sim().map((e) => [e.id, e] as const));
				const drawn = [...data.states[key].visible, ...data.states[key].overflow]
					.map((item) => ({ entry: byId.get(modelId(item)), item }))
					.filter(({ entry }) => entry?.kind === "classic" && !entry.replacedBy);
				expect(drawn.length).toBeGreaterThan(0);
				for (const { entry, item } of drawn)
					expect(`${entry!.id} ${entry!.drawn}`).toBe(
						`${entry!.id} ${item.split("|")[1] ?? "plain"}`,
					);
			});

			const capturedKey = `${data.location}.${data.entity}.${recordedContextKey(c).split(".")[1]}`;
			if (capture.contexts[capturedKey])
				it(`${file} ${key}: shows the recorded bar where Command Checker was captured, apart from its known gaps`, () => {
					const gaps = KNOWN_GAPS[`${file} ${key}`] ?? [];
					const entries = sim();
					const unknown = entries
						.filter((e) => e.verdict.outcome === "unknown")
						.map((e) => e.id);
					expect([...unknown].sort()).toEqual([...gaps].sort());
					// Everything else comes out as recorded, in order (but for the known wrong ones).
					const wrong = KNOWN_WRONG[`${file} ${key}`] ?? [];
					expect(shownIds(entries).filter((i) => !wrong.includes(i))).toEqual(
						recorded().filter((i) => !gaps.includes(i)),
					);
				});
		}

	it("the probe: your own controls and modern commands where Unified Interface put them, hidden by a selection", () => {
		const { data } = recordings.find((r) => r.file === "contact.HomePageGrid.probe.json")!;
		const base = tabsFor("contact", "HomePageGrid");
		// The probe's buttons and group, appended the way CBS's store adds them.
		const rdx = new DOMParser().parseFromString(
			read(data.probe!.ribbonDiffXml),
			"application/xml",
		);
		const tabs = structuredClone(base);
		const main = tabs.find((t) => t.id === "Mscrm.HomepageGrid.contact.MainTab")!;
		for (const ca of rdx.querySelectorAll("CustomAction")) {
			const location = ca.getAttribute("Location")!;
			const el = ca.querySelector("CommandUIDefinition")!.firstElementChild!;
			const seq = Number(el.getAttribute("Sequence"));
			if (el.tagName === "Button") {
				const g = main.groups.find((x) => location === `${x.id}.Controls._children`)!;
				g.buttons.push(
					button(el.getAttribute("Id")!, seq, { commandId: el.getAttribute("Command")! }),
				);
			} else if (el.tagName === "Group") {
				const inner = [...el.querySelectorAll("Button")].map((b) =>
					button(b.getAttribute("Id")!, Number(b.getAttribute("Sequence")), {
						commandId: b.getAttribute("Command")!,
					}),
				);
				main.groups.push(group(el.getAttribute("Id")!, seq, inner));
			}
		}
		const probeRules = ribbonRules(parsed("contact"));
		const rules: RibbonRules = {
			...probeRules,
			commands: new Map([
				...probeRules.commands,
				...[...rdx.querySelectorAll("CommandDefinition")].map((cd) => {
					const id = cd.getAttribute("Id")!;
					const command: CommandDefinition = {
						id,
						actions: [],
						displayRules: [...cd.querySelectorAll("DisplayRules > DisplayRule")].map(
							(r) => r.getAttribute("Id")!,
						),
						enableRules: [...cd.querySelectorAll("EnableRules > EnableRule")].map((r) =>
							r.getAttribute("Id")!,
						),
					};
					return [id, command] as const;
				}),
			]),
		};
		const hiddenQuickCampaign = (t: RibbonTab[]) =>
			t.map((x) => ({
				...x,
				groups: x.groups.map((g) => ({
					...g,
					buttons: g.buttons.map((b) =>
						b.id === "Mscrm.HomepageGrid.contact.QuickCampaign"
							? { ...b, hidden: true }
							: b,
					),
				})),
			}));
		const mods = data.probe!.modern.map((m) => modern(m.name, m.sequence));
		for (const key of ["w1534.sel0", "w1534.sel1"]) {
			const c = contextOf(data, key, RECORDED_RULES);
			const entries = simulateBar(
				{ tabs: hiddenQuickCampaign(tabs), modern: mods },
				rules,
				c,
				{ focusedView: true, ribbonDebug: true },
			);
			// Modern commands carry the model's prefix.
			const shown = shownIds(entries).map((i) => i.replace(/^modern:/, ""));
			const recorded = [...data.states[key].visible, ...data.states[key].overflow].map(
				modelId,
			);
			expect(shown.join(" "), key).toEqual(recorded.join(" "));
		}
	});
});
