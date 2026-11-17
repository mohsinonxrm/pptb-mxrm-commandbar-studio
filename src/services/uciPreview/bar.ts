import { isUnrenderedInUci } from "@/utils/controlKinds";
import type {
	CommandDefinition,
	RibbonButton,
	RibbonGroup,
	RibbonTab,
	RuleStep,
} from "@/types/ribbon";
import type { ClassicModernOverride, ModernCommand } from "@/types/modernCommand";
import {
	countsSelection,
	evaluateCommand,
	type CommandVerdict,
	type Outcome,
	type RuleSet,
	type RuleVerdict,
	type SimulationContext,
	type UciLocation,
} from "@/services/uciPreview/rules";

/**
 * The bar model of the Unified Interface preview (#191, phase B2): every command of a location's
 * ribbon, in the order Unified Interface's command bar lists them (docs/uci-command-bar.md):
 *
 * 1. tabs and groups by Sequence; controls in **merged document order** (what RetrieveEntityRibbon
 *    returned), not by Sequence. A control that isn't where the loaded ribbon had it (new, moved
 *    to another group, or its Sequence changed) goes where the platform's merge will put it:
 *    before the first sibling with a greater Sequence, or at the end;
 * 2. modern commands go into the classic group their sequence names
 *    (1,000,000,000 + (tab − 100) × 1,000,000 + group × 10,000 + control), by the same rule;
 * 3. system items Unified Interface adds (Show Chart, Command checker, …) lead or close the bar.
 *
 * `simulateBar` then applies a page context: display and enable rules (`rules.ts`) and the
 * selection, which hides a plain button whose command doesn't count the selection.
 */

export type BarEntry =
	| {
			kind: "classic";
			id: string;
			button: RibbonButton;
			tabId: string;
			groupId: string;
			/** The migrated modern command users see in the button's place (#32). */
			replacedBy?: ModernCommand;
	  }
	| {
			kind: "modern";
			id: string;
			command: ModernCommand;
			/** The classic group its sequence names; absent when it names none (then it closes the bar). */
			groupId?: string;
	  }
	| { kind: "system"; id: SystemItemId; label: string };

export interface BarInput {
	/**
	 * The location's tabs (CBS's ribbon, with your unpublished changes). A control's loaded place
	 * comes from `source.position` (set when the merged ribbon is parsed), so publishing or the
	 * store's own order doesn't change it.
	 */
	tabs: readonly RibbonTab[];
	/** Top-level modern commands of this bar (hidden or switched-off ones are left out). */
	modern?: readonly ModernCommand[];
	/** Classic buttons a migrated modern command hides or replaces (#32). */
	overrides?: ReadonlyMap<string, readonly ClassicModernOverride[]>;
}

const MODERN_BASE = 1_000_000_000;

/** The classic slot a modern command's sequence names, or undefined if it doesn't name one. */
export function decodeModernSequence(
	sequence: number,
): { tab: number; group: number; control: number } | undefined {
	// A tab below Sequence 100 (a form's or sub-grid's main tab is 10) gives a negative offset.
	const rest = sequence - MODERN_BASE;
	if (!Number.isInteger(rest) || rest < -100_000_000 || rest >= MODERN_BASE) return undefined;
	const tabOffset = Math.floor(rest / 1_000_000);
	const within = rest - tabOffset * 1_000_000;
	return {
		tab: 100 + tabOffset,
		group: Math.floor(within / 10_000),
		control: within % 10_000,
	};
}

/** The platform's merge: before the first sibling with a greater Sequence, else at the end. */
function insertBySequence<T>(list: T[], item: T, seq: (x: T) => number): T[] {
	const at = list.findIndex((x) => seq(x) > seq(item));
	return at < 0 ? [...list, item] : [...list.slice(0, at), item, ...list.slice(at)];
}

/** Still where the loaded ribbon had it: same group, same Sequence, same control. */
function loadedIndex(button: RibbonButton, groupId: string): number | undefined {
	const source = button.source;
	const at = source?.position;
	if (!at || at.groupId !== groupId) return undefined;
	if (source.attributes.Id !== button.id) return undefined;
	if (Number(source.attributes.Sequence) !== button.sequence) return undefined;
	return at.index;
}

/**
 * A group's controls in merged order: those still where the loaded ribbon had them keep its
 * order; the others (new, moved here, re-sequenced) are merged in by Sequence, in the group's order.
 */
function controlsInMergedOrder(group: RibbonGroup): RibbonButton[] {
	const kept = group.buttons
		.map((b) => ({ b, at: loadedIndex(b, group.id) }))
		.filter((x): x is { b: RibbonButton; at: number } => x.at !== undefined)
		.sort((x, y) => x.at - y.at)
		.map((x) => x.b);
	return group.buttons
		.filter((b) => loadedIndex(b, group.id) === undefined)
		.reduce((list, b) => insertBySequence(list, b, (x) => x.sequence), kept);
}

/**
 * The chart designer's contextual tab: Command Checker lists it under
 * `Mscrm.ContextualCommandBar`, not on the grid's bar.
 */
const CONTEXTUAL_TAB = /\.VisualizationTab$/;

/** Every classic control and modern command of the bar, in order, before any rule. */
export function barOrder(input: BarInput): BarEntry[] {
	const tabs = input.tabs
		.filter((t) => !CONTEXTUAL_TAB.test(t.id))
		.sort((a, b) => a.sequence - b.sequence);
	// Groups by Sequence (a stable sort: ties keep the ribbon's order). In every recording the
	// merged groups were in Sequence order, and an added one lands where a sort puts it.
	const groupsOf = (tab: RibbonTab): RibbonGroup[] =>
		[...tab.groups].sort((a, b) => a.sequence - b.sequence);
	const controlsOf = controlsInMergedOrder;

	// Modern commands by the group their sequence names (lowest sequence first).
	const modern = [...(input.modern ?? [])]
		.filter((c) => !c.hidden && !c.disabled)
		.sort((a, b) => a.sequence - b.sequence);
	const groupBySlot = new Map<string, RibbonGroup>();
	for (const tab of tabs)
		for (const group of tab.groups) groupBySlot.set(`${tab.sequence}/${group.sequence}`, group);
	const modernByGroup = new Map<string, ModernCommand[]>();
	const trailing: ModernCommand[] = [];
	for (const c of modern) {
		const slot = decodeModernSequence(c.sequence);
		const group = slot && groupBySlot.get(`${slot.tab}/${slot.group}`);
		if (!group) trailing.push(c);
		else modernByGroup.set(group.id, [...(modernByGroup.get(group.id) ?? []), c]);
	}

	const asModern = (command: ModernCommand, groupId?: string): BarEntry => ({
		kind: "modern",
		id: `modern:${command.id}`,
		command,
		...(groupId ? { groupId } : {}),
	});
	const out: BarEntry[] = [];
	for (const tab of tabs)
		for (const group of groupsOf(tab)) {
			const controls = controlsOf(group);
			// Each modern command goes before the first control (shown or not) with a greater Sequence.
			const before = new Map<number, ModernCommand[]>();
			for (const c of modernByGroup.get(group.id) ?? []) {
				const control = decodeModernSequence(c.sequence)!.control;
				const at = controls.findIndex((b) => b.sequence > control);
				const key = at < 0 ? controls.length : at;
				before.set(key, [...(before.get(key) ?? []), c]);
			}
			controls.forEach((button, i) => {
				for (const c of before.get(i) ?? []) out.push(asModern(c, group.id));
				const o = input.overrides?.get(button.id) ?? [];
				// With every app's commands shown, one app's hide doesn't hide it for all (#194 review).
				const replacedBy = o.find((x) => x.effect === "replaced")?.command;
				const hidden =
					button.hidden ||
					(o.length > 0 && o.every((x) => x.effect === "hidden")) ||
					// A control Unified Interface doesn't draw shows as nothing, unless a modern command replaces it (#37).
					(isUnrenderedInUci(button.kind) && !replacedBy);
				if (!hidden)
					out.push({
						kind: "classic",
						id: button.id,
						button,
						tabId: tab.id,
						groupId: group.id,
						...(replacedBy ? { replacedBy } : {}),
					});
			});
			for (const c of before.get(controls.length) ?? []) out.push(asModern(c, group.id));
		}
	for (const c of trailing) out.push(asModern(c));
	return out;
}

export type SystemItemId =
	| "FocusedView"
	| "ShowAs"
	| "ShowChartPane"
	| "OpenEntityDashboard"
	| "NavigateToAssociatedGrid"
	| "CommandChecker";

/** Options for the items Unified Interface adds that no ribbon defines. */
export interface SystemItemOptions {
	/** The main grid offers the focused view (Sales apps' `changeVisualization-…`). */
	focusedView?: boolean;
	/**
	 * The main grid's view has more than one control (Kanban, a card list…): Unified Interface's
	 * Show As (`changeVisualization-Parent`) leads the bar, as on opportunities and cases.
	 */
	showAs?: boolean;
	/** The page has `&ribbondebug=true`, which adds Command checker. */
	ribbonDebug?: boolean;
}

const SYSTEM_LABELS: Record<SystemItemId, string> = {
	FocusedView: "Focused view",
	ShowAs: "Show As",
	ShowChartPane: "Show Chart",
	OpenEntityDashboard: "Open Dashboards",
	NavigateToAssociatedGrid: "See the records associated with this view",
	CommandChecker: "Command checker",
};

/** Unified Interface's own items before and after the ribbon's commands (docs, point 4). */
export function systemItems(
	location: UciLocation,
	options: SystemItemOptions = {},
): { lead: BarEntry[]; trail: BarEntry[] } {
	const item = (id: SystemItemId): BarEntry => ({ kind: "system", id, label: SYSTEM_LABELS[id] });
	const lead: SystemItemId[] =
		location === "HomePageGrid"
			? [
					...(options.focusedView ? (["FocusedView"] as const) : []),
					...(options.showAs ? (["ShowAs"] as const) : []),
					"ShowChartPane",
				]
			: location === "SubGridAssociated"
				? ["ShowChartPane"]
				: [];
	const trail: SystemItemId[] = [
		...(location === "HomePageGrid" ? (["OpenEntityDashboard"] as const) : []),
		...(location === "SubGridStandard" ? (["NavigateToAssociatedGrid"] as const) : []),
		...(options.ribbonDebug ? (["CommandChecker"] as const) : []),
	];
	return { lead: lead.map(item), trail: trail.map(item) };
}

/** Why an entry shows, doesn't, or can't be told. */
export interface EntryVerdict {
	outcome: Outcome;
	/** Its command's display and enable rules (classic, or a migrated command's classic rules). */
	rules: RuleVerdict[];
	/** Hidden because rows are selected and its command doesn't count them. */
	hiddenBySelection?: boolean;
	/** The control has no CommandDefinition: Unified Interface doesn't show it. */
	noCommand?: boolean;
	/** Unified Interface draws its own item in this control's place (Show As). */
	replacedByPlatform?: string;
	/** The modern command's visibility is a Power Fx formula, which CBS can't evaluate. */
	formula?: boolean;
}

/** How the bar draws a control: plain, an action with a menu beside it, or a menu. */
export type DrawnAs = "plain" | "split" | "flyout";

export type SimulatedEntry = BarEntry & {
	verdict: EntryVerdict;
	/** How a classic control is drawn (`drawnAs`). */
	drawn?: DrawnAs;
};

export interface RibbonRules extends RuleSet {
	commands: ReadonlyMap<string, CommandDefinition>;
}

const shown: EntryVerdict = { outcome: true, rules: [] };

/**
 * A modern command's own visibility. Migrated commands keep classic rules (`appactionrule`),
 * found in the ribbon by name; a Power Fx formula can't be evaluated.
 */
function modernVerdict(
	command: ModernCommand,
	rules: RibbonRules,
	ctx: SimulationContext,
): { verdict: EntryVerdict; countsSelection: boolean } {
	if (command.visibility === "formula")
		return {
			verdict: { outcome: "unknown", rules: [], formula: true },
			countsSelection: false,
		};
	if (command.visibility !== "classicRules" || command.classicRules.length === 0)
		return { verdict: shown, countsSelection: false };
	const idOf = (r: ModernCommand["classicRules"][number]) =>
		classicRuleId(
			r.uniqueName ?? r.name,
			r.kind === "enable" ? rules.enableRules : rules.displayRules,
		);
	const synthetic: CommandDefinition = {
		id: command.uniqueName,
		actions: [],
		enableRules: command.classicRules.filter((r) => r.kind === "enable").map(idOf),
		displayRules: command.classicRules.filter((r) => r.kind === "display").map(idOf),
	};
	const v = evaluateCommand(synthetic, rules, ctx);
	return {
		verdict: { outcome: v.outcome, rules: v.rules },
		countsSelection: countsSelection(synthetic, rules),
	};
}

/**
 * The ribbon rule a migrated modern command's classic rule (`appactionrule`) stands for. Its
 * unique name carries the solution's prefix and the rule's type:
 * `msdyn_Mscrm.CheckBulkEditSupportForEntity!0` is `Mscrm.CheckBulkEditSupportForEntity` (seen on
 * Sales Hub's migrated Edit, 2026-11-15). The name as given when no ribbon rule matches.
 */
export function classicRuleId(name: string, defined: ReadonlyMap<string, unknown>): string {
	const bare = name.replace(/!\d+$/, "");
	const unprefixed = bare.replace(/^[A-Za-z0-9]+_/, "");
	return [name, bare, unprefixed].find((id) => defined.has(id)) ?? name;
}

/**
 * Whether selecting rows hides this control ("hidden by selection" in Command Checker): its
 * command doesn't count the selection (no SelectionCountRule in its enable rules, as
 * `Mscrm.AnySelection` has), and neither does any item of its menu. A flyout or split button
 * with an item that counts it stays (Email a Link: Of Selected Items); one with no items of its
 * own (Excel Templates, filled when opened) goes. Checked on the account grid, 2026-11-15.
 */
export function hiddenBySelection(control: RibbonButton, rules: RibbonRules): boolean {
	const command = rules.commands.get(control.commandId);
	if (command && countsSelection(command, rules)) return false;
	const items = (control.menu?.sections ?? []).flatMap((s) => s.controls);
	return items.every((item) => hiddenBySelection(item, rules));
}

const rowsSelected = (ctx: SimulationContext) => ctx.location !== "Form" && ctx.selectedCount > 0;

/**
 * How Unified Interface draws a control. A flyout (or a button with a menu) is a menu with a
 * chevron. A split button is drawn split only while its menu has something to offer: plain when
 * none of its items would show (Delete with no rows: Delete needs a selection, Bulk Delete is
 * hidden), and plain with rows selected when an item doesn't count them (Email a Link: Of the
 * Current View). Recorded on contact and account's grids, form and sub-grids, 2026-10-29: all 25
 * split buttons drawn agree.
 */
export function drawnAs(
	control: RibbonButton,
	rules: RibbonRules,
	ctx: SimulationContext,
): DrawnAs {
	const items = (control.menu?.sections ?? []).flatMap((s) => s.controls);
	if (control.kind !== "splitButton" && control.kind !== "mruSplitButton")
		return control.kind === "flyout" || control.menu ? "flyout" : "plain";
	if (rowsSelected(ctx) && items.some((item) => hiddenBySelection(item, rules))) return "plain";
	const offered = items.some((item) => {
		const command = rules.commands.get(item.commandId);
		return !!command && evaluateCommand(command, rules, ctx).outcome !== false;
	});
	return offered ? "split" : "plain";
}

/**
 * Whether a modern command shows in this page context. One without classic rules doesn't count
 * the selection: rows selected hide it (probe, #192).
 */
export function modernEntryVerdict(
	command: ModernCommand,
	rules: RibbonRules,
	ctx: SimulationContext,
): EntryVerdict {
	const m = modernVerdict(command, rules, ctx);
	if (rowsSelected(ctx) && !m.countsSelection)
		return { ...m.verdict, outcome: false, hiddenBySelection: true };
	return m.verdict;
}

/**
 * Whether a classic control shows in this page context, and how it's drawn. A menu item is
 * judged the same way: its own command's rules, and the selection when it doesn't count it.
 */
export function classicEntryVerdict(
	control: RibbonButton,
	rules: RibbonRules,
	ctx: SimulationContext,
): { verdict: EntryVerdict; drawn?: DrawnAs } {
	// The ribbon's Show As: Unified Interface runs it through Mscrm.Disabled and draws its own
	// Show As, first on the bar, where the view has more than one control (Command Checker,
	// account, contact and case grids and sub-grids).
	if (/\.ChangeDataSetControlButton$/.test(control.id))
		return { verdict: { outcome: false, rules: [], replacedByPlatform: "Show As" } };
	const command = rules.commands.get(control.commandId);
	if (!command) return { verdict: { outcome: false, rules: [], noCommand: true } };
	const v: CommandVerdict = evaluateCommand(command, rules, ctx);
	const drawn = drawnAs(control, rules, ctx);
	if (rowsSelected(ctx) && hiddenBySelection(control, rules))
		return { drawn, verdict: { outcome: false, rules: v.rules, hiddenBySelection: true } };
	return { drawn, verdict: { outcome: v.outcome, rules: v.rules } };
}

/** Each bar entry with whether it shows in this page context. Items stay in bar order. */
export function simulateBar(
	input: BarInput,
	rules: RibbonRules,
	ctx: SimulationContext,
	options: SystemItemOptions = {},
): SimulatedEntry[] {
	const system = systemItems(ctx.location, options);
	const entries = barOrder(input).map((entry): SimulatedEntry => {
		if (entry.kind === "system") return { ...entry, verdict: shown };
		// A classic button a migrated modern command stands in for shows as that command does.
		if (entry.kind === "modern" || entry.replacedBy)
			return {
				...entry,
				verdict: modernEntryVerdict(
					entry.kind === "modern" ? entry.command : entry.replacedBy!,
					rules,
					ctx,
				),
			};
		return { ...entry, ...classicEntryVerdict(entry.button, rules, ctx) };
	});
	const sys = (e: BarEntry): SimulatedEntry => ({
		...e,
		verdict: shown,
		...(e.id === "ShowAs" ? { drawn: "flyout" as const } : {}),
	});
	return [...system.lead.map(sys), ...entries, ...system.trail.map(sys)];
}

/** The rule maps `simulateBar` needs, from the parsed ribbon's lists. */
export function ribbonRules(parsed: {
	commands: readonly CommandDefinition[];
	displayRules: readonly { id: string; steps: RuleStep[] }[];
	enableRules: readonly { id: string; steps: RuleStep[] }[];
}): RibbonRules {
	return {
		commands: new Map(parsed.commands.map((c) => [c.id, c])),
		displayRules: new Map(parsed.displayRules.map((r) => [r.id, r])),
		enableRules: new Map(parsed.enableRules.map((r) => [r.id, r])),
	};
}
