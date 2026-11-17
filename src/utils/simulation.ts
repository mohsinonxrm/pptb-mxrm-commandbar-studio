import { RECORDED_RULES } from "@/services/uciPreview/recordedRules";
import type { PlacementGoal, SimulatedEntry } from "@/services/uciPreview/bar";
import type { SimulationContext, UciLocation } from "@/services/uciPreview/rules";
import type { Simulation } from "@/store/uiStore";
import type { EntityProperty, RibbonLocation } from "@/types/ribbon";

/** Simulate mode's helpers (#191): the page, the context and why a command isn't shown. */

/** The page Unified Interface shows a location's bar on, as the rules name it. */
export function uciLocation(location: RibbonLocation, simulation: Simulation): UciLocation | null {
	if (location === "HomepageGrid") return "HomePageGrid";
	if (location === "Form") return "Form";
	if (location === "SubGrid") return simulation.subGridPage;
	return null;
}

/** The simulation context for the preview model, with the entity's properties where read. */
export function simulationContext(
	page: UciLocation,
	entity: string,
	simulation: Simulation,
	properties?: Partial<Record<EntityProperty, boolean>>,
): SimulationContext {
	return {
		location: page,
		entity,
		selectedCount: page === "Form" ? 0 : simulation.selection,
		...(page === "Form" ? { formState: simulation.formState } : {}),
		privileges: "all",
		recorded: RECORDED_RULES,
		...(properties ? { entityProperties: { [entity]: properties } } : {}),
	};
}

/** Why an entry doesn't show, or can't be told, in a few words. */
export function entryReason(entry: SimulatedEntry): string | undefined {
	const v = entry.verdict;
	if (v.outcome === true) return undefined;
	if (v.hiddenBySelection) return "Rows are selected, and its command doesn't count them";
	if (v.noCommand) return "Its command isn't in the ribbon";
	if (v.replacedByPlatform)
		return `Unified Interface doesn't draw the ribbon's ${v.replacedByPlatform}; on a main grid whose view has more than one control, it leads the bar with its own`;
	if (v.formula) return "Can't tell: its visibility is a Power Fx formula";
	if (v.outcome === false) {
		const failed = v.rules.filter((r) => r.outcome === false).map((r) => r.ruleId);
		return `Hidden by ${failed.join(", ")}`;
	}
	const reasons = new Set(
		v.rules
			.filter((r) => r.outcome === "unknown")
			.flatMap((r) => r.notes)
			.filter((n) => n.basis === "cannot-simulate")
			.map((n) => n.reason ?? n.step),
	);
	return `Can't tell: it depends on ${[...reasons].join(", ") || "rules CBS can't evaluate"}`;
}

const PAGE_NAMES: Record<UciLocation, string> = {
	HomePageGrid: "Main grid",
	Form: "Main form",
	SubGridStandard: "Sub-grid on a form",
	SubGridAssociated: "Associated view",
};

const FORM_STATES: Record<Simulation["formState"], string> = {
	Create: "new record",
	Existing: "existing record",
	Disabled: "inactive record",
};

const SELECTIONS: Record<Simulation["selection"], string> = {
	0: "no records selected",
	1: "1 record selected",
	2: "2 or more records selected",
};

/** The page and its state, as the simulation strip sets them: "Main grid, 1 record selected". */
export function describeContext(page: UciLocation, simulation: Simulation): string {
	const state =
		page === "Form" ? FORM_STATES[simulation.formState] : SELECTIONS[simulation.selection];
	return `${PAGE_NAMES[page]}, ${state}`;
}

/**
 * The page in Dynamics 365 with Command Checker on (`ribbondebug=true`): a new form for a new
 * record, the entity's list otherwise (CBS has no record or parent form to open). In the app
 * chosen, if one is.
 */
export function commandCheckerUrl(
	connectionUrl: string,
	entity: string,
	page: UciLocation,
	simulation: Simulation,
	appId?: string,
): string {
	const newForm = page === "Form" && simulation.formState === "Create";
	const params = new URLSearchParams({
		...(appId ? { appid: appId } : {}),
		pagetype: newForm ? "entityrecord" : "entitylist",
		etn: entity,
		ribbondebug: "true",
	});
	return `${connectionUrl.replace(/\/$/, "")}/main.aspx?${params}`;
}

/**
 * What a gap in the bar as drawn asks of the ribbon (#191 C5): gap `i` is before the `i`th
 * command listed, `listed.length` after the last. The button goes between the entries on either
 * side (classic or modern; Unified Interface's own items lead or close the bar whatever the
 * ribbon says, so they're stepped over), in one of their groups: a moved button's own first,
 * then the one before the gap, then the one after. `planPlacement` finds the Sequence.
 */
export function placementGoal(
	listed: readonly SimulatedEntry[],
	gap: number,
	tabOf: (groupId: string) => string | undefined,
	moving?: string,
): PlacementGoal {
	const others = (list: readonly SimulatedEntry[]) =>
		list.filter((e) => e.kind !== "system" && e.id !== moving);
	const after = others(listed.slice(0, gap)).pop();
	const before = others(listed.slice(gap))[0];
	const own = listed.find((e) => e.id === moving);
	const groupOf = (e: SimulatedEntry | undefined) => {
		const groupId = e?.kind === "classic" || e?.kind === "modern" ? e.groupId : undefined;
		const tabId =
			e?.kind === "classic" ? e.tabId : groupId !== undefined ? tabOf(groupId) : undefined;
		return groupId && tabId ? { tabId, groupId } : undefined;
	};
	const groups = [groupOf(own), groupOf(after), groupOf(before)].filter(
		(g, i, all): g is { tabId: string; groupId: string } =>
			!!g && all.findIndex((x) => x?.groupId === g.groupId && x?.tabId === g.tabId) === i,
	);
	return {
		after: after?.id,
		before: before?.id,
		shown: new Set(listed.filter((e) => e.kind !== "system").map((e) => e.id)),
		groups,
		...(own?.kind === "classic"
			? { moving: { tabId: own.tabId, groupId: own.groupId, buttonId: own.button.id } }
			: {}),
	};
}

/**
 * The gap a command moves to, one place earlier or later on the bar: before the command before
 * it, or after the one after it (Unified Interface's own items don't count). Null at either end.
 */
export function moveGap(
	listed: readonly SimulatedEntry[],
	id: string,
	direction: "earlier" | "later",
): number | null {
	const at = listed.findIndex((e) => e.id === id);
	if (at < 0) return null;
	const counts = (e: SimulatedEntry) => e.kind !== "system";
	if (direction === "earlier") {
		for (let i = at - 1; i >= 0; i--) if (counts(listed[i])) return i;
		return null;
	}
	for (let i = at + 1; i < listed.length; i++) if (counts(listed[i])) return i + 1;
	return null;
}
