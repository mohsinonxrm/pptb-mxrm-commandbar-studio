import { RECORDED_RULES } from "@/services/uciPreview/recordedRules";
import type { SimulatedEntry } from "@/services/uciPreview/bar";
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

/** Where a classic button goes in the ribbon: a group, and the control it goes before (or the end). */
export interface BarPlacement {
	tabId: string;
	groupId: string;
	beforeButtonId?: string;
}

/**
 * The ribbon position for a gap in the bar as drawn (#191 C5): gap `i` is before the `i`th
 * command listed, `listed.length` after the last. The new or moved button goes before the next
 * classic control, in its group; past a group's last control (the next one is in another group,
 * or there's none), at the end of the previous one's group. Modern commands and Unified
 * Interface's own items aren't ribbon controls, so they're stepped over; the bar redraws it where
 * the platform's merge puts it. `moving` is left out of the neighbours. Between two groups both
 * places draw the same, so a moved button keeps its own group. Null when the bar shows no classic
 * control to place it by.
 */
export function barPlacement(
	listed: readonly SimulatedEntry[],
	gap: number,
	moving?: string,
): BarPlacement | null {
	const classic = (e: SimulatedEntry | undefined) =>
		e?.kind === "classic" && e.id !== moving ? e : undefined;
	const right = listed.slice(gap).map(classic).find(Boolean);
	const left = listed.slice(0, gap).map(classic).filter(Boolean).pop();
	const own = listed.find((e) => e.id === moving);
	const ownGroup = own?.kind === "classic" ? own.groupId : undefined;
	if (right && (!left || left.groupId === right.groupId || ownGroup === right.groupId))
		return { tabId: right.tabId, groupId: right.groupId, beforeButtonId: right.button.id };
	if (left) return { tabId: left.tabId, groupId: left.groupId };
	return null;
}

/**
 * The gap a classic command moves to, one place earlier or later on the bar: before the classic
 * command before it, or after the one after it. Null at either end.
 */
export function moveGap(
	listed: readonly SimulatedEntry[],
	id: string,
	direction: "earlier" | "later",
): number | null {
	const at = listed.findIndex((e) => e.id === id);
	if (at < 0) return null;
	const isClassic = (e: SimulatedEntry) => e.kind === "classic";
	if (direction === "earlier") {
		for (let i = at - 1; i >= 0; i--) if (isClassic(listed[i])) return i;
		return null;
	}
	for (let i = at + 1; i < listed.length; i++) if (isClassic(listed[i])) return i + 1;
	return null;
}
