import type { RibbonDiffParts } from "@/services/ribbonDiffMerge";

/**
 * Buttons of a published layer that the merged ribbon has, but without their commands yet (#306).
 *
 * Dataverse adds the application ribbon's CustomActions to the merged ribbon (what
 * RetrieveApplicationRibbon returns, and Unified Interface draws) when it's published, but its
 * CommandDefinitions and rules later, on its own schedule: neither PublishXml nor PublishAllXml
 * hurries it. Measured on CRM279420, 2026-11-18: 20 to 40 minutes, with reads in between
 * returning older command sets. A button whose command isn't in the merged ribbon isn't drawn.
 *
 * Only controls the merged ribbon already has are looked at: some layer content never appears in
 * RetrieveApplicationRibbon (a tab added at Mscrm.Tabs._children, #58) and a command no control
 * uses doesn't matter, so neither is reported. Presence only: an existing definition's new content
 * can't be told from a stale one by id. LocLabels aren't in the merged XML at all.
 */
export interface MergedRibbonGaps {
	commands: string[];
	enableRules: string[];
	displayRules: string[];
}

/** The merged ribbon couldn't be parsed: nothing can be told from it. */
export class MergedRibbonUnreadable extends Error {}

const parse = (xml: string): Document => {
	const doc = new DOMParser().parseFromString(xml, "text/xml");
	if (doc.getElementsByTagName("parsererror").length > 0)
		throw new MergedRibbonUnreadable("the application ribbon's XML couldn't be parsed");
	return doc;
};

export function mergedRibbonGaps(mergedXml: string, layer: RibbonDiffParts): MergedRibbonGaps {
	const merged = parse(mergedXml);
	const idsOf = (selector: string) =>
		new Set([...merged.querySelectorAll(selector)].map((e) => e.getAttribute("Id") ?? ""));
	const mergedControls = new Set(
		[...merged.querySelectorAll("[Id][Command]")].map((e) => e.getAttribute("Id") ?? ""),
	);
	const mergedCommands = idsOf("CommandDefinitions > CommandDefinition");
	const mergedEnable = idsOf("RuleDefinitions > EnableRules > EnableRule");
	const mergedDisplay = idsOf("RuleDefinitions > DisplayRules > DisplayRule");

	// The layer's controls that reached the merged ribbon, and the commands they run.
	const commands = new Set<string>();
	for (const xml of layer.customActions.values()) {
		const action = parse(xml);
		for (const control of action.querySelectorAll("[Id][Command]")) {
			const command = control.getAttribute("Command") ?? "";
			if (mergedControls.has(control.getAttribute("Id") ?? "") && command)
				commands.add(command);
		}
	}
	// The rules those commands use, as the layer defines them (rules it doesn't define are
	// Microsoft's, already merged).
	const enableRules = new Set<string>();
	const displayRules = new Set<string>();
	for (const id of commands) {
		const definition = layer.commandDefinitions.get(id);
		if (!definition) continue;
		const doc = parse(definition);
		for (const r of doc.querySelectorAll("EnableRules > EnableRule"))
			if (layer.enableRules.has(r.getAttribute("Id") ?? ""))
				enableRules.add(r.getAttribute("Id")!);
		for (const r of doc.querySelectorAll("DisplayRules > DisplayRule"))
			if (layer.displayRules.has(r.getAttribute("Id") ?? ""))
				displayRules.add(r.getAttribute("Id")!);
	}
	const missing = (expected: Set<string>, present: Set<string>) =>
		[...expected].filter((id) => !present.has(id)).sort();
	return {
		// Only the layer's own commands: one overriding Microsoft's is merged already.
		commands: missing(commands, mergedCommands).filter((id) =>
			layer.commandDefinitions.has(id),
		),
		enableRules: missing(enableRules, mergedEnable),
		displayRules: missing(displayRules, mergedDisplay),
	};
}

export function hasGaps(gaps: MergedRibbonGaps): boolean {
	return gaps.commands.length + gaps.enableRules.length + gaps.displayRules.length > 0;
}
