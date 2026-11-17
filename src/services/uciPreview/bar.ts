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

/** Why a control or modern command isn't on the bar at all, before any rule. */
export type OffBar =
	/** A HideCustomAction hides it. */
	| "hidden"
	/** A migrated modern command hides it in every app. */
	| "hiddenByModern"
	/** It's on the chart designer's contextual tab, not the page's bar. */
	| "contextualTab"
	/** Unified Interface doesn't draw this kind of control (#37). */
	| "unrendered"
	/** The modern command is hidden in the command designer. */
	| "modernHidden"
	/** The modern command is switched off. */
	| "modernDisabled";

/**
 * Why `barOrder` leaves a classic control out, if it does. With every app's commands shown, one
 * app's hide doesn't hide it for all (#194 review); a control Unified Interface doesn't draw
 * shows as nothing, unless a modern command replaces it (#37).
 */
export function classicOffBar(
	button: RibbonButton,
	tabId: string,
	overrides: readonly ClassicModernOverride[] = [],
): OffBar | undefined {
	if (CONTEXTUAL_TAB.test(tabId)) return "contextualTab";
	if (button.hidden) return "hidden";
	if (overrides.length > 0 && overrides.every((x) => x.effect === "hidden"))
		return "hiddenByModern";
	const replaced = overrides.some((x) => x.effect === "replaced");
	if (isUnrenderedInUci(button.kind) && !replaced) return "unrendered";
	return undefined;
}

/** Why `barOrder` leaves a modern command out, if it does. */
export function modernOffBar(command: ModernCommand): OffBar | undefined {
	if (command.hidden) return "modernHidden";
	if (command.disabled) return "modernDisabled";
	return undefined;
}

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
		.filter((c) => !modernOffBar(c))
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
				const replacedBy = o.find((x) => x.effect === "replaced")?.command;
				if (!classicOffBar(button, tab.id, o))
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
	/** It isn't on the bar at all (see `OffBar`). */
	offBar?: OffBar;
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

/** A place for a button in the ribbon: its group and the Sequence that puts it there. */
export interface PlacementPlan {
	tabId: string;
	groupId: string;
	sequence: number;
}

/** What a button is to be placed between on the bar, and which groups it may go in. */
export interface PlacementGoal {
	/** The bar entry (classic id or `modern:<id>`) it must follow; none: first. */
	after?: string;
	/** The bar entry it must precede; none: last. */
	before?: string;
	/** The entries the bar shows: only their order counts (hidden ones aren't drawn). */
	shown: ReadonlySet<string>;
	/** The groups to try, in order. */
	groups: readonly { tabId: string; groupId: string }[];
	/** The button moving; none for a new one. */
	moving?: { tabId: string; groupId: string; buttonId: string };
}

const PROBE = "__cbs_placement_probe__";

/** Integer Sequences worth trying among `values`, round ones first. */
function candidateSequences(values: readonly number[]): number[] {
	const sorted = [...new Set(values)].sort((a, b) => a - b);
	const out = new Set<number>();
	const add = (n: number) => {
		if (Number.isInteger(n) && n > 0) out.add(n);
	};
	if (sorted.length === 0) add(10);
	const first = sorted[0];
	if (first !== undefined) {
		add(Math.floor((first - 1) / 10) * 10);
		add(Math.floor(first / 2));
		add(first - 1);
	}
	for (let i = 0; i + 1 < sorted.length; i++) {
		const [a, b] = [sorted[i], sorted[i + 1]];
		add(Math.ceil((a + 1) / 10) * 10);
		add(Math.ceil((a + 1) / 5) * 5);
		add(Math.floor((a + b) / 2));
		add(a + 1);
		add(b - 1);
	}
	for (const v of sorted) {
		add(v - 1);
		add(v + 1);
	}
	const last = sorted[sorted.length - 1];
	if (last !== undefined) {
		add(Math.floor(last / 10) * 10 + 10);
		add(last + 1);
	}
	const roundness = (n: number) => (n % 10 === 0 ? 0 : n % 5 === 0 ? 1 : 2);
	return [...out].sort((a, b) => roundness(a) - roundness(b));
}

/**
 * The group and Sequence that make the platform's merge draw a button between `goal.after` and
 * `goal.before` (#191 C5). The bar's order isn't Sequence order: controls still where the loaded
 * ribbon had them keep its XML order, a moved or new one goes before the first sibling with a
 * greater Sequence, and modern commands go by the slot their sequence names. So each candidate
 * Sequence is checked with `barOrder` itself. A Sequence another control of the group has isn't
 * used. Null when no Sequence in any of the groups draws it there (e.g. a group whose XML has
 * Sequence 30 before 20: nothing new can go between them).
 */
export function planPlacement(input: BarInput, goal: PlacementGoal): PlacementPlan | null {
	const moving = goal.moving;
	const movingButton = moving
		? input.tabs
				.find((t) => t.id === moving.tabId)
				?.groups.find((g) => g.id === moving.groupId)
				?.buttons.find((b) => b.id === moving.buttonId)
		: undefined;
	if (moving && !movingButton) return null;
	const probeId = movingButton?.id ?? PROBE;
	for (const { tabId, groupId } of goal.groups) {
		const tab = input.tabs.find((t) => t.id === tabId);
		const group = tab?.groups.find((g) => g.id === groupId);
		if (!tab || !group) continue;
		const siblings = group.buttons.filter((b) => b.id !== probeId);
		const used = new Set(siblings.map((b) => b.sequence));
		const slots = (input.modern ?? []).flatMap((c) => {
			const slot = decodeModernSequence(c.sequence);
			return slot && slot.tab === tab.sequence && slot.group === group.sequence
				? [slot.control]
				: [];
		});
		for (const sequence of candidateSequences([...used, ...slots])) {
			if (used.has(sequence)) continue;
			if (
				movingButton &&
				moving!.groupId === groupId &&
				moving!.tabId === tabId &&
				movingButton.sequence === sequence
			)
				continue;
			const probe: RibbonButton = movingButton
				? { ...movingButton, sequence }
				: {
						id: PROBE,
						label: "",
						kind: "button",
						sequence,
						templateAlias: "o1",
						commandId: "",
						hidden: false,
						oob: false,
						custom: true,
						managed: false,
					};
			const tabs = input.tabs.map((t) => ({
				...t,
				groups: t.groups.map((g) => {
					const buttons = g.buttons.filter((b) => b.id !== probeId);
					return g.id === groupId && t.id === tabId
						? { ...g, buttons: [...buttons, probe] }
						: { ...g, buttons };
				}),
			}));
			const order = barOrder({ ...input, tabs })
				.map((e) => e.id)
				.filter((id) => id === probeId || goal.shown.has(id));
			const at = order.indexOf(probeId);
			if (at < 0) continue;
			if ((order[at - 1] ?? undefined) !== goal.after) continue;
			if ((order[at + 1] ?? undefined) !== goal.before) continue;
			return { tabId, groupId, sequence };
		}
	}
	return null;
}
