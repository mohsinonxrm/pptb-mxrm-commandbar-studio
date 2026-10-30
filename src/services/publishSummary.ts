import { LOCATION_INFO } from "@/constants/locationInfo";
import type { ScopePlan } from "@/services/publishPlan";
import { classifyButtons, indexButtons } from "@/services/xmlGenerator";
import type {
	CommandDefinition,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
} from "@/types/ribbon";

/**
 * What Publish will write, one row per change in plain words (#188): the
 * publish dialog lists the rows and the top bar counts them, so both say the
 * same number. Built from the publish plan (planScope) and the same button
 * classification the RibbonDiffXml generator uses, so a row is a change the
 * import actually makes. A change on several locations of the table (the same
 * button added to the grid and the form) is one row naming them.
 */

export type PublishChangeKind = "new" | "change" | "move" | "show" | "hide" | "delete";

export interface PublishChange {
	kind: PublishChangeKind;
	/** What happens, before the name: "Add", "Hide", "Change command". */
	action: string;
	/** What it happens to: a button's label, a tab's title, a command id. */
	name: string;
	/** After the name: "to the main grid and main form", "to “Orders”". */
	detail?: string;
}

export interface PublishSummaryInput {
	locations: { current: RibbonDefinition; baseline: RibbonDefinition }[];
	plan: ScopePlan;
	baselineCommands: CommandDefinition[];
	/** Rule ids as loaded: a rule that isn't there yet is added, not changed. */
	baselineEnableRuleIds: string[];
	baselineDisplayRuleIds: string[];
	/** A button's label as shown on the canvas. */
	buttonName: (button: RibbonButton) => string;
	/** A tab's or group's title as shown on the canvas. */
	titleOf: (label: string) => string;
}

const LOCATION_ORDER: RibbonLocation[] = ["HomepageGrid", "Form", "SubGrid", "Application"];

/** "a", "a and b", "a, b and c". */
function listText(items: string[]): string {
	return items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function whereText(locations: RibbonLocation[]): string {
	if (locations.includes("Application")) return "the application ribbon";
	const sorted = [...locations].sort(
		(a, b) => LOCATION_ORDER.indexOf(a) - LOCATION_ORDER.indexOf(b),
	);
	return `the ${listText(sorted.map((l) => LOCATION_INFO[l].label.toLowerCase()))}`;
}

export function summarizePublish(input: PublishSummaryInput): PublishChange[] {
	const { plan, buttonName, titleOf } = input;
	const rows = new Map<
		string,
		{ change: PublishChange; locations: RibbonLocation[]; preposition?: string }
	>();
	const add = (
		kind: PublishChangeKind,
		action: string,
		name: string,
		where: { location?: RibbonLocation; preposition?: string; detail?: string } = {},
	) => {
		const key = `${kind}|${action}|${name}|${where.detail ?? ""}`;
		const row = rows.get(key) ?? {
			change: { kind, action, name, ...(where.detail ? { detail: where.detail } : {}) },
			locations: [],
			preposition: where.preposition,
		};
		if (where.location && !row.locations.includes(where.location))
			row.locations.push(where.location);
		rows.set(key, row);
	};

	// Where each control, tab and group is now and was when loaded.
	const buttonsNow = new Map<string, { button: RibbonButton; location: RibbonLocation }>();
	const buttonsBefore = new Map<string, { button: RibbonButton; location: RibbonLocation }>();
	const containersBefore = new Map<
		string,
		{ kind: "tab" | "group"; label: string; location: RibbonLocation }
	>();
	const tabsNow = new Map<string, { label: string; location: RibbonLocation }>();
	for (const { current, baseline } of input.locations) {
		for (const { button } of indexButtons(current).values())
			if (!buttonsNow.has(button.id))
				buttonsNow.set(button.id, { button, location: current.location });
		for (const { button } of indexButtons(baseline).values())
			if (!buttonsBefore.has(button.id))
				buttonsBefore.set(button.id, { button, location: baseline.location });
		for (const tab of baseline.tabs) {
			containersBefore.set(tab.id, {
				kind: "tab",
				label: tab.label,
				location: baseline.location,
			});
			for (const g of tab.groups)
				containersBefore.set(g.id, {
					kind: "group",
					label: g.label,
					location: baseline.location,
				});
		}
		for (const tab of current.tabs)
			tabsNow.set(tab.id, { label: tab.label, location: current.location });
	}
	const moved = new Set(plan.movedButtons.map((m) => m.id));

	// New tabs and groups, then the buttons: added, changed, hidden.
	const newButtonCommands = new Set<string>();
	const keptButtonCommands = new Set<string>();
	for (const { current, baseline } of input.locations) {
		const location = current.location;
		const baseTabs = new Map(baseline.tabs.map((t) => [t.id, t] as const));
		for (const tab of current.tabs) {
			const bt = baseTabs.get(tab.id);
			if (!bt) {
				add("new", "Add tab", titleOf(tab.label), { location, preposition: "to" });
				continue;
			}
			const baseGroups = new Set(bt.groups.map((g) => g.id));
			for (const g of tab.groups)
				if (!baseGroups.has(g.id))
					add("new", "Add group", titleOf(g.label), {
						detail: `to tab “${titleOf(tab.label)}”`,
					});
		}
		const changes = classifyButtons(current, baseline);
		const changedIds = new Set(changes.map((c) => c.entry.button.id));
		for (const { entry, change } of changes) {
			const { button } = entry;
			if (moved.has(button.id)) continue;
			const name = buttonName(button);
			if (change === "new") {
				add("new", "Add", name, { location, preposition: "to" });
				if (button.commandId) newButtonCommands.add(button.commandId);
			} else if (change === "hide") {
				add("hide", "Hide", name, { location, preposition: "on" });
			} else {
				add("change", "Change", name, { location, preposition: "on" });
			}
		}
		for (const { button } of indexButtons(current).values())
			if (button.commandId && !changedIds.has(button.id))
				keptButtonCommands.add(button.commandId);
	}

	for (const id of plan.unhiddenButtonIds) {
		const b = buttonsNow.get(id) ?? buttonsBefore.get(id);
		add("show", "Show", b ? buttonName(b.button) : id, {
			location: b?.location,
			preposition: "again on",
		});
	}
	for (const m of plan.movedButtons) {
		const b = buttonsNow.get(m.id);
		const before = buttonsBefore.get(m.id);
		const elsewhere = b && before && b.location !== before.location;
		add("move", "Move", b ? buttonName(b.button) : m.id, {
			location: elsewhere ? b.location : undefined,
			preposition: "to",
		});
	}
	for (const id of plan.deletedButtonIds) {
		const b = buttonsBefore.get(id);
		add("delete", "Delete", b ? buttonName(b.button) : id, {
			location: b?.location,
			preposition: "from",
		});
	}
	for (const id of plan.deletedContainerIds) {
		const c = containersBefore.get(id);
		add(
			"delete",
			c?.kind === "group" ? "Delete group" : "Delete tab",
			c ? titleOf(c.label) : id,
			{
				location: c?.location,
				preposition: "from",
			},
		);
	}
	for (const r of plan.renamedLabels) {
		const c = containersBefore.get(r.containerId);
		add(
			"change",
			c?.kind === "group" ? "Rename group" : "Rename tab",
			c ? titleOf(c.label) : r.containerId,
			{
				detail: `to “${r.text}”`,
			},
		);
	}
	for (const t of plan.resequencedTabs) {
		const tab = tabsNow.get(t.id);
		add("move", "Move tab", tab ? titleOf(tab.label) : t.id, {
			location: tab?.location,
			preposition: "on",
		});
	}
	for (const id of plan.editedTabIds) {
		const tab = tabsNow.get(id);
		add("change", "Change the display rules of tab", tab ? titleOf(tab.label) : id);
	}

	// Commands and rules. A new command that only new buttons use is part of
	// adding them, not a change of its own.
	const loadedCommands = new Set(input.baselineCommands.map((c) => c.id));
	for (const id of plan.editedCommandIds) {
		if (loadedCommands.has(id)) add("change", "Change command", id);
		else if (!newButtonCommands.has(id) || keptButtonCommands.has(id))
			add("new", "Add command", id);
	}
	for (const id of plan.uncustomisedCommandIds)
		add("change", "Remove your copy of command", id, {
			detail: "(the original applies again)",
		});
	const loadedEnable = new Set(input.baselineEnableRuleIds);
	const loadedDisplay = new Set(input.baselineDisplayRuleIds);
	for (const id of plan.editedEnableRuleIds)
		if (loadedEnable.has(id)) add("change", "Change enable rule", id);
		else add("new", "Add enable rule", id);
	for (const id of plan.editedDisplayRuleIds)
		if (loadedDisplay.has(id)) add("change", "Change display rule", id);
		else add("new", "Add display rule", id);
	for (const id of plan.editedLocLabelIds) add("change", "Change the translations of", id);

	return [...rows.values()].map(({ change, locations, preposition }) =>
		locations.length > 0 && preposition
			? { ...change, detail: `${preposition} ${whereText(locations)}` }
			: change,
	);
}
