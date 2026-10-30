import type { CommandDefinition, DisplayRule } from "@/types/ribbon";

/**
 * Where a button shows, from its command's display rules (#184).
 *
 * Unified Interface evaluates CommandClientTypeRule as "Modern" (#152), and
 * Microsoft's Mscrm.HideOnModern is that rule inverted. A filter is a display
 * rule with exactly that one step; anything else on the command is left alone.
 */

export type ShowOn = "all" | "uci" | "classic" | "custom";

const HIDE_ON_MODERN = "Mscrm.HideOnModern";
const SHOW_ONLY_ON_MODERN = "Mscrm.ShowOnlyOnModern";

/** What a client-type display rule means, or undefined when it isn't one. */
export function filterOf(
	id: string,
	rule: DisplayRule | undefined,
): "uci" | "classic" | "other" | undefined {
	if (id === HIDE_ON_MODERN) return "classic";
	if (id === SHOW_ONLY_ON_MODERN) return "uci";
	const step = rule?.steps.length === 1 ? rule.steps[0] : undefined;
	if (step?.kind !== "CommandClientTypeRule" || step.default !== undefined) return undefined;
	if (step.type === "Modern") return step.invertResult ? "classic" : "uci";
	if (step.type === "Refresh" && !step.invertResult) return "classic";
	return "other";
}

/** The choice the command's display rules amount to. */
export function showOnOf(command: CommandDefinition, displayRules: DisplayRule[]): ShowOn {
	const filters = command.displayRules
		.map((id) =>
			filterOf(
				id,
				displayRules.find((r) => r.id === id),
			),
		)
		.filter((f) => f !== undefined);
	if (filters.length === 0) return "all";
	if (filters.length === 1 && filters[0] !== "other") return filters[0];
	return "custom";
}
