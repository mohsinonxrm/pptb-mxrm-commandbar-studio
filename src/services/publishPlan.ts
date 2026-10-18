import { hasOobOverrideChanges, indexButtons, summarizeRibbonDiff } from "@/services/xmlGenerator";
import { buttonLabelId, buttonTooltipBodyId, buttonTooltipTitleId } from "@/utils/locLabelRef";
import type {
	CommandDefinition,
	DisplayRule,
	EnableRule,
	LocLabel,
	RibbonButton,
	RibbonDefinition,
} from "@/types/ribbon";
import type { MovedControl } from "@/services/ribbonDiffMerge";

/**
 * What the scope's unmanaged ribbon layer owns, as read at load (or refreshed
 * after a publish). Tabs / groups / labels outside it come from a managed
 * solution or the platform and can't be removed or changed through the layer.
 */
export interface PlanLayerOwnership {
	/** Tabs and groups the layer adds (ribbonDiffMerge.ownContainerIds). */
	containerIds: ReadonlySet<string> | readonly string[];
	/** LocLabels the layer defines. */
	locLabelIds: ReadonlySet<string> | readonly string[];
}

export interface PlanInput {
	locations: { current: RibbonDefinition; baseline: RibbonDefinition }[];
	commands: CommandDefinition[];
	baselineCommands: CommandDefinition[];
	enableRules: EnableRule[];
	baselineEnableRules: EnableRule[];
	displayRules: DisplayRule[];
	baselineDisplayRules: DisplayRule[];
	/** LocLabels now and as loaded / last published: translation-only edits (#49). */
	locLabels?: LocLabel[];
	baselineLocLabels?: LocLabel[];
	/** The scope's unmanaged layer. Without it, tab / group deletes and label or tab-rule edits are reported as unsupported. */
	layer?: PlanLayerOwnership;
	/**
	 * Controls hidden by a HideCustomAction of the layer that the user chose to
	 * un-hide (#47). RetrieveEntityRibbon applies hides, so these controls are
	 * not on the canvas at all.
	 */
	unhiddenLayerHideIds?: string[];
	/**
	 * Commands that belong to another scope and must not be published from this
	 * one. The application ribbon passes the commands its table's buttons use:
	 * most out-of-the-box commands are shared, and an edit made for one table
	 * must not reach the application ribbon (and with it every table).
	 */
	excludeCommandIds?: Set<string>;
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
	/** Tabs and groups the layer adds that were removed this session (#48). */
	deletedContainerIds: string[];
	/** Buttons the layer adds that were moved or re-sequenced (#26). */
	movedButtons: MovedControl[];
	/** LocLabels the layer defines whose translations changed, used in this scope (#49). */
	editedLocLabelIds: string[];
	/** Tabs the layer adds whose TabDisplayRules changed (#49). */
	editedTabIds: string[];
	/** Human-readable descriptions of changes CBS cannot publish yet. */
	unsupported: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const isMenuKind = (kind?: string) => kind === "flyout" || kind === "splitButton";
const isResourceIcon = (b: { icon?: string; image16?: string; image32?: string }) =>
	[b.icon, b.image16, b.image32].some((v) => !!v && v.startsWith("$webresource:"));
const LOC_REF = /^\$LocLabels:(.+)$/;
const locRef = (v: string | undefined) => (v ? (LOC_REF.exec(v)?.[1] ?? null) : null);
/** A rule reference the parser keeps verbatim (CommandDefinition.rawRuleRefs). */
const RAW_RULE_REF = /^\s*<(EnableRule|DisplayRule)\b[^>]*?\sId="([^"]+)"/;
const asSet = (v: ReadonlySet<string> | readonly string[] | undefined) => new Set<string>(v ?? []);

/** `$LocLabels:` ids a button's attributes reference, as loaded. */
function buttonLabelRefs(button: RibbonButton): string[] {
	const out: string[] = [];
	for (const v of Object.values(button.source?.attributes ?? {})) {
		const id = locRef(v);
		if (id) out.push(id);
	}
	return out;
}

export function planScope(input: PlanInput): ScopePlan {
	const unsupported: string[] = [];
	const deleted: string[] = [];
	const unhidden: string[] = [];
	const deletedContainers: string[] = [];
	const moved: MovedControl[] = [];
	const editedTabIds: string[] = [];
	let generatorChange = false;
	const referencedCommandIds = new Set<string>();
	const ownContainers = asSet(input.layer?.containerIds);
	const ownLabels = asSet(input.layer?.locLabelIds);
	// LocLabels referenced by the scope as loaded, and the ones the generator
	// writes anyway (new / edited buttons, new tabs and groups).
	const referencedLabels = new Set<string>();
	const generatorLabels = new Set<string>();
	// Convention label ids of buttons that don't reference them (yet).
	const unreferencedConventionLabels = new Map<string, RibbonButton>();
	// Buttons placed where the baseline of their location doesn't have them, by
	// id: a deleted own button that reappears here was moved to another location
	// of the scope (e.g. cut on the grid, pasted on the form), not deleted.
	const placedNew = new Map<string, { groupId: string; sequence: number }>();
	const newMenus: { id: string; label: string }[] = [];

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

		for (const [key, { button }] of cur) {
			const refs = buttonLabelRefs(button);
			refs.forEach((id) => referencedLabels.add(id));
			const b = base.get(key)?.button;
			const emitted = !b || hasOobOverrideChanges(b, button);
			for (const id of [buttonLabelId(button.id), buttonTooltipTitleId(button.id), buttonTooltipBodyId(button.id)]) {
				if (emitted) generatorLabels.add(id);
				else if (!refs.includes(id)) unreferencedConventionLabels.set(id, button);
			}
			if (emitted) refs.forEach((id) => generatorLabels.add(id));
		}

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
				// Your own button: its CustomAction is moved in place. Anything else
				// would need a hide plus a copy, which CBS doesn't write (yet).
				if (b.button.origin === "unmanaged") {
					moved.push({ id, groupId: c.groupId, sequence: c.button.sequence });
				} else {
					unsupported.push(
						`Moving or re-ordering "${c.button.label}" (${id}) — only your own unmanaged buttons can be moved; hide it and add a new button instead`,
					);
				}
			}
		}

		for (const [key, c] of cur) {
			if (base.has(key)) continue;
			if (!placedNew.has(c.button.id)) placedNew.set(c.button.id, { groupId: c.groupId, sequence: c.button.sequence });
			if (isMenuKind(c.button.kind)) newMenus.push({ id: c.button.id, label: c.button.label });
		}

		const baseGroups = new Map(baseline.tabs.flatMap((t) => t.groups.map((g) => [g.id, g] as const)));
		const baseTabs = new Map(baseline.tabs.map((t) => [t.id, t] as const));
		const curTabIds = new Set(current.tabs.map((t) => t.id));
		const curGroupIds = new Set(current.tabs.flatMap((t) => t.groups.map((g) => g.id)));
		for (const tab of current.tabs) {
			const tabRef = locRef(tab.label);
			if (tabRef) referencedLabels.add(tabRef);
			const bt = baseTabs.get(tab.id);
			if (!bt) generatorLabels.add(`${tab.id}.Title`);
			if (bt && bt.label !== tab.label) unsupported.push(`Renaming tab ${tab.id} — not supported yet`);
			if (bt && !same(bt.tabDisplayRules ?? [], tab.tabDisplayRules ?? [])) {
				if (!ownContainers.has(tab.id)) {
					unsupported.push(
						`Changing the display rules of tab ${tab.id} — only tabs your unmanaged customizations add can be changed`,
					);
				} else if (!tab.commandId) {
					unsupported.push(`Changing the display rules of tab ${tab.id} — the tab has no Command to attach them to`);
				} else {
					editedTabIds.push(tab.id);
				}
			}
			for (const g of tab.groups) {
				const groupRef = locRef(g.label);
				if (groupRef) referencedLabels.add(groupRef);
				const bg = baseGroups.get(g.id);
				if (!bg) generatorLabels.add(`${g.id}.Title`);
				if (bg && (bg.label !== g.label || bg.template !== g.template)) {
					unsupported.push(`Renaming or re-templating group ${g.id} — not supported yet`);
				}
			}
		}

		// Deleted tabs and groups (#48). A group goes with its deleted tab.
		const notOwn = (kind: string, id: string) =>
			unsupported.push(
				`Removing ${kind} ${id} — only tabs and groups your unmanaged customizations add can be deleted; hide it instead`,
			);
		for (const bt of baseline.tabs) {
			if (!curTabIds.has(bt.id)) {
				if (ownContainers.has(bt.id)) deletedContainers.push(bt.id);
				else notOwn("tab", bt.id);
				continue;
			}
			for (const bg of bt.groups) {
				if (curGroupIds.has(bg.id)) continue;
				if (ownContainers.has(bg.id)) deletedContainers.push(bg.id);
				else notOwn("group", bg.id);
			}
		}
	}

	// A deleted own button placed anew in another location of the scope was
	// moved there: its CustomAction is relocated (and edited in place), never
	// removed — removing it would delete the button the paste just placed.
	for (let i = deleted.length - 1; i >= 0; i--) {
		const to = placedNew.get(deleted[i]);
		if (!to) continue;
		moved.push({ id: deleted[i], groupId: to.groupId, sequence: to.sequence });
		deleted.splice(i, 1);
	}
	for (const m of newMenus) {
		// A moved menu keeps its <Menu>: the merge edits the control in place.
		if (moved.some((x) => x.id === m.id)) continue;
		unsupported.push(`New flyout / split button "${m.label}" — menus can't be published yet (#27)`);
	}

	for (const id of input.excludeCommandIds ?? []) referencedCommandIds.delete(id);

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
		// References the model keeps verbatim (e.g. an <EnableRule> inside
		// <DisplayRules>) still use the rule, so an edit of it must publish.
		for (const raw of c.rawRuleRefs ?? []) {
			const m = RAW_RULE_REF.exec(raw.xml);
			if (m) (m[1] === "EnableRule" ? enableInScope : displayInScope).add(m[2]);
		}
	}
	const editedRules = <R extends { id: string }>(rules: R[], baseline: R[], inScope: Set<string>) => {
		const base = new Map(baseline.map((r) => [r.id, r] as const));
		return rules
			.filter((r) => inScope.has(r.id) && (!base.has(r.id) || !same(base.get(r.id), r)))
			.map((r) => r.id);
	};
	const editedEnableRuleIds = editedRules(input.enableRules, input.baselineEnableRules, enableInScope);
	const editedDisplayRuleIds = editedRules(input.displayRules, input.baselineDisplayRules, displayInScope);

	// Translation edits (#49). The generator writes the labels of new / edited
	// buttons, tabs and groups itself; any other edited label is written on its
	// own when the layer defines it (an unmanaged LocLabel with another
	// solution's id isn't something CBS writes).
	const editedLocLabelIds: string[] = [];
	if (input.locLabels && input.baselineLocLabels) {
		const baseLabels = new Map(input.baselineLocLabels.map((l) => [l.id, l] as const));
		for (const label of input.locLabels) {
			const prev = baseLabels.get(label.id);
			if (prev && same(prev, label)) continue;
			if (generatorLabels.has(label.id)) continue;
			if (referencedLabels.has(label.id)) {
				if (ownLabels.has(label.id)) editedLocLabelIds.push(label.id);
				else {
					unsupported.push(
						`Translations of label ${label.id} — it is defined by another solution; change the text in the properties pane instead`,
					);
				}
				continue;
			}
			const button = unreferencedConventionLabels.get(label.id);
			if (button) {
				unsupported.push(
					`Translations for "${button.label}" (${button.id}) — its text isn't a translatable label yet; change the text in the properties pane first, then add translations`,
				);
			}
		}
	}

	const unhiddenLayer = (input.unhiddenLayerHideIds ?? []).filter((id) => !unhidden.includes(id));

	return {
		hasChanges:
			generatorChange ||
			editedCommandIds.length > 0 ||
			editedEnableRuleIds.length > 0 ||
			editedDisplayRuleIds.length > 0 ||
			deleted.length > 0 ||
			unhidden.length > 0 ||
			unhiddenLayer.length > 0 ||
			deletedContainers.length > 0 ||
			moved.length > 0 ||
			editedLocLabelIds.length > 0 ||
			editedTabIds.length > 0,
		editedCommandIds,
		editedEnableRuleIds,
		editedDisplayRuleIds,
		deletedButtonIds: deleted,
		unhiddenButtonIds: [...unhidden, ...unhiddenLayer],
		deletedContainerIds: deletedContainers,
		movedButtons: moved,
		editedLocLabelIds,
		editedTabIds,
		unsupported: [...new Set(unsupported)],
	};
}
