import { groupControls } from "@/utils/ribbonMenu";
import type { CommandDefinition, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

export interface RibbonUsage {
	/** Tabs, groups and controls using each command (Command, PopulateQueryCommand). */
	byCommand: Map<string, number>;
	/** Commands using each enable rule, each command once. */
	byEnable: Map<string, number>;
	/** Commands using each display rule, each command once. */
	byDisplay: Map<string, number>;
}

/**
 * How much each command and rule is used (#185, #194), counted the same way in
 * the Solution tab, the bottom panel and the rule editor: a command by the
 * tabs, groups and controls (menu items too) that name it; a rule, per kind,
 * by the commands that list it.
 */
export function ribbonUsage(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
	commands: readonly CommandDefinition[],
): RibbonUsage {
	const byCommand = new Map<string, number>();
	const count = (id: string | undefined) => {
		if (id) byCommand.set(id, (byCommand.get(id) ?? 0) + 1);
	};
	for (const loc of Object.keys(ribbons) as RibbonLocation[])
		for (const tab of ribbons[loc].tabs) {
			count(tab.commandId);
			for (const group of tab.groups) {
				count(group.source?.attributes.Command);
				for (const b of groupControls(group)) {
					count(b.commandId);
					count(b.source?.attributes.PopulateQueryCommand);
				}
			}
		}
	const byEnable = new Map<string, number>();
	const byDisplay = new Map<string, number>();
	for (const c of commands) {
		for (const id of new Set(c.enableRules)) byEnable.set(id, (byEnable.get(id) ?? 0) + 1);
		for (const id of new Set(c.displayRules)) byDisplay.set(id, (byDisplay.get(id) ?? 0) + 1);
	}
	return { byCommand, byEnable, byDisplay };
}
