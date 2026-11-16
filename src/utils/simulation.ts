import { RECORDED_RULES } from "@/services/uciPreview/recordedRules";
import type { SimulatedEntry } from "@/services/uciPreview/bar";
import type { SimulationContext, UciLocation } from "@/services/uciPreview/rules";
import type { Simulation } from "@/store/uiStore";
import type { RibbonLocation } from "@/types/ribbon";

/** Simulate mode's helpers (#191): the page, the context and why a command isn't shown. */

/** The page Unified Interface shows a location's bar on, as the rules name it. */
export function uciLocation(location: RibbonLocation, simulation: Simulation): UciLocation | null {
	if (location === "HomepageGrid") return "HomePageGrid";
	if (location === "Form") return "Form";
	if (location === "SubGrid") return simulation.subGridPage;
	return null;
}

/** The simulation context for the preview model. */
export function simulationContext(
	page: UciLocation,
	entity: string,
	simulation: Simulation,
): SimulationContext {
	return {
		location: page,
		entity,
		selectedCount: page === "Form" ? 0 : simulation.selection,
		...(page === "Form" ? { formState: simulation.formState } : {}),
		privileges: "all",
		recorded: RECORDED_RULES,
	};
}

/** Why an entry doesn't show, or can't be told, in a few words. */
export function entryReason(entry: SimulatedEntry): string | undefined {
	const v = entry.verdict;
	if (v.outcome === true) return undefined;
	if (v.hiddenBySelection) return "Rows are selected, and its command doesn't count them";
	if (v.noCommand) return "Its command isn't in the ribbon";
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
