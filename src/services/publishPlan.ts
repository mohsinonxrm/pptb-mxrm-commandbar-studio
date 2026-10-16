import { hasOobOverrideChanges, indexButtons, summarizeRibbonDiff } from "@/services/xmlGenerator";
import type { CommandDefinition, DisplayRule, EnableRule, RibbonDefinition } from "@/types/ribbon";

export interface PlanInput {
	locations: { current: RibbonDefinition; baseline: RibbonDefinition }[];
	commands: CommandDefinition[];
	baselineCommands: CommandDefinition[];
	enableRules: EnableRule[];
	baselineEnableRules: EnableRule[];
	displayRules: DisplayRule[];
	baselineDisplayRules: DisplayRule[];
}

/**
 * Everything that changed in one ribbon scope (a table's three locations, or
 * the application ribbon), classified into what CBS can publish and what it
 * cannot yet — so unsupported edits are reported instead of being silently
 * "published" as nothing.
 */
export interface ScopePlan {
	/** True when there is something CBS will actually write. */
	hasChanges: boolean;
	/** Commands that differ from their loaded version and are used by a button in this scope. */
	editedCommandIds: string[];
	/**
	 * Enable / display rules that differ from their loaded version and are used
	 * by those commands. Kept apart because Dataverse allows an EnableRule and a
	 * DisplayRule to share an id (e.g. Mscrm.CanWritePrimary).
	 */
	editedEnableRuleIds: string[];
	editedDisplayRuleIds: string[];
	/** Unmanaged buttons removed this session. */
	deletedButtonIds: string[];
	/** Buttons hidden when loaded / last published and visible now. */
	unhiddenButtonIds: string[];
	/** Human-readable descriptions of changes CBS cannot publish yet. */
	unsupported: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const isMenuKind = (kind?: string) => kind === "flyout" || kind === "splitButton";
const isResourceIcon = (b: { icon?: string; image16?: string; image32?: string }) =>
	[b.icon, b.image16, b.image32].some((v) => !!v && v.startsWith("$webresource:"));

export function planScope(input: PlanInput): ScopePlan {
	const unsupported: string[] = [];
	const deleted: string[] = [];
	const unhidden: string[] = [];
	let generatorChange = false;
	const referencedCommandIds = new Set<string>();

	for (const { current, baseline } of input.locations) {
		const summary = summarizeRibbonDiff(current, baseline);
		if (
			summary.newButtons + summary.overriddenButtons + summary.hiddenButtons + summary.newTabs + summary.newGroups >
			0
		) {
			generatorChange = true;
		}
		if (summary.scalingChanges > 0) unsupported.push(`Scaling changes on ${current.location} (not supported yet)`);

		// Keyed by occurrence: the application ribbon repeats control ids.
		const cur = indexButtons(current);
		const base = indexButtons(baseline);
		for (const { button } of cur.values()) if (button.commandId) referencedCommandIds.add(button.commandId);

		for (const [key, b] of base) {
			const id = b.button.id;
			const c = cur.get(key);
			if (!c) {
				// "unmanaged" is set from the table's unmanaged layer at load.
				if (b.button.origin === "unmanaged") deleted.push(id);
				else unsupported.push(`Removing "${b.button.label}" (${id}) — only your own unmanaged buttons can be deleted; hide it instead`);
				continue;
			}
			if (b.button.hidden && !c.button.hidden) unhidden.push(id);
			if ((c.button.kind ?? "button") !== (b.button.kind ?? "button")) {
				unsupported.push(`Changing the kind of "${c.button.label}" (${id}) — not supported yet`);
			}
			const edited = hasOobOverrideChanges(b.button, c.button);
			if (edited && isMenuKind(c.button.kind) && b.button.origin !== "unmanaged") {
				unsupported.push(
					`Editing the menu button "${c.button.label}" (${id}) — flyout / split buttons from other solutions can't be edited yet (#27)`,
				);
			}
			if ((c.button.icon ?? "") !== (b.button.icon ?? "") && !isResourceIcon(c.button)) {
				unsupported.push(
					`Changing the icon of "${c.button.label}" (${id}) to a built-in icon — not supported yet; choose an SVG web resource`,
				);
			}
			if (c.groupId !== b.groupId || c.button.sequence !== b.button.sequence) {
				unsupported.push(`Moving or re-ordering "${c.button.label}" (${id}) — not supported yet`);
			}
		}

		for (const [key, c] of cur) {
			if (!base.has(key) && isMenuKind(c.button.kind)) {
				unsupported.push(`New flyout / split button "${c.button.label}" — menus can't be published yet (#27)`);
			}
		}

		const baseGroups = new Map(baseline.tabs.flatMap((t) => t.groups.map((g) => [g.id, g] as const)));
		const baseTabs = new Map(baseline.tabs.map((t) => [t.id, t] as const));
		for (const tab of current.tabs) {
			const bt = baseTabs.get(tab.id);
			if (bt && bt.label !== tab.label) unsupported.push(`Renaming tab ${tab.id} — not supported yet`);
			for (const g of tab.groups) {
				const bg = baseGroups.get(g.id);
				if (bg && (bg.label !== g.label || bg.template !== g.template)) {
					unsupported.push(`Renaming or re-templating group ${g.id} — not supported yet`);
				}
			}
		}
	}

	const baseCmd = new Map(input.baselineCommands.map((c) => [c.id, c]));
	const editedCommandIds = input.commands
		.filter((c) => referencedCommandIds.has(c.id) && (!baseCmd.has(c.id) || !same(baseCmd.get(c.id), c)))
		.map((c) => c.id);
	for (const c of input.commands) {
		if (!editedCommandIds.includes(c.id)) continue;
		if (c.actions.some((a) => a.kind === "powerFx" || a.kind === "customApi")) {
			unsupported.push(`Power Fx / Custom API action in command ${c.id} — can't be published yet (#28)`);
		}
	}

	const enableInScope = new Set<string>();
	const displayInScope = new Set<string>();
	for (const c of input.commands) {
		if (!referencedCommandIds.has(c.id)) continue;
		c.enableRules.forEach((r) => enableInScope.add(r));
		c.displayRules.forEach((r) => displayInScope.add(r));
	}
	const editedRules = <R extends { id: string }>(rules: R[], baseline: R[], inScope: Set<string>) => {
		const base = new Map(baseline.map((r) => [r.id, r] as const));
		return rules
			.filter((r) => inScope.has(r.id) && (!base.has(r.id) || !same(base.get(r.id), r)))
			.map((r) => r.id);
	};
	const editedEnableRuleIds = editedRules(input.enableRules, input.baselineEnableRules, enableInScope);
	const editedDisplayRuleIds = editedRules(input.displayRules, input.baselineDisplayRules, displayInScope);

	return {
		hasChanges:
			generatorChange ||
			editedCommandIds.length > 0 ||
			editedEnableRuleIds.length > 0 ||
			editedDisplayRuleIds.length > 0 ||
			deleted.length > 0 ||
			unhidden.length > 0,
		editedCommandIds,
		editedEnableRuleIds,
		editedDisplayRuleIds,
		deletedButtonIds: deleted,
		unhiddenButtonIds: unhidden,
		unsupported: [...new Set(unsupported)],
	};
}
