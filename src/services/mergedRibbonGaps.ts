import type { RibbonDiffParts } from "@/services/ribbonDiffMerge";

/**
 * What a published layer defines that the merged ribbon doesn't have yet (#306).
 *
 * Dataverse merges the application ribbon's CustomActions on every publish, but caches its
 * CommandDefinitions and rules on its own schedule: a publish (PublishXml, or PublishAllXml)
 * doesn't refresh them. A button whose command isn't in the merged ribbon isn't drawn, so a new
 * global command bar button stays invisible until the cache catches up (verified live on
 * CRM279420, 2026-11-18). Presence only: an existing definition's new content can't be told
 * from a stale one by id. LocLabels aren't in the merged XML at all, so they aren't checked.
 */
export interface MergedRibbonGaps {
	commands: string[];
	enableRules: string[];
	displayRules: string[];
}

export function mergedRibbonGaps(mergedXml: string, layer: RibbonDiffParts): MergedRibbonGaps {
	const doc = new DOMParser().parseFromString(mergedXml, "text/xml");
	const ids = (selector: string) =>
		new Set([...doc.querySelectorAll(selector)].map((e) => e.getAttribute("Id") ?? ""));
	const commands = ids("CommandDefinitions > CommandDefinition");
	const enableRules = ids("RuleDefinitions > EnableRules > EnableRule");
	const displayRules = ids("RuleDefinitions > DisplayRules > DisplayRule");
	const missing = (expected: Iterable<string>, merged: Set<string>) =>
		[...expected].filter((id) => !merged.has(id)).sort();
	return {
		commands: missing(layer.commandDefinitions.keys(), commands),
		enableRules: missing(layer.enableRules.keys(), enableRules),
		displayRules: missing(layer.displayRules.keys(), displayRules),
	};
}

export function hasGaps(gaps: MergedRibbonGaps): boolean {
	return gaps.commands.length + gaps.enableRules.length + gaps.displayRules.length > 0;
}
