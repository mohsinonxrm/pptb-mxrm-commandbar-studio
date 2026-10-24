import {
	effectiveModernImage,
	hasOobOverrideChanges,
	indexButtons,
	planNewGroupScaling,
	summarizeRibbonDiff,
} from "@/services/xmlGenerator";
import { describeScalingChange, resequenceLayerScaling, type LayerScaleStep } from "@/services/scalingSequence";
import { buttonLabelId, buttonTooltipBodyId, buttonTooltipTitleId } from "@/utils/locLabelRef";
import type {
	CommandDefinition,
	DisplayRule,
	EnableRule,
	LocLabel,
	RibbonButton,
	RibbonDefinition,
} from "@/types/ribbon";
import { canUncustomiseCommand, type MovedControl } from "@/services/ribbonDiffMerge";
import type { LayerOrphan } from "@/services/layerOrphans";
import { MENU_ITEM_KINDS, groupControls, isDynamicMenuValue, isMenuKind, menuItemsOf } from "@/utils/ribbonMenu";
import { CONTROL_TAG_BY_KIND, controlCommandIds, isReadOnlyControlKind } from "@/utils/controlKinds";
import { isOwnControl } from "@/utils/ribbonProvenance";
import { OPEN_RECORD_ITEM_COMMAND_ID, openRecordCommandProblem } from "@/utils/openRecordItem";

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
	/** MaxSize / Scale steps the layer writes (#66 review). */
	scalingStepIds?: ReadonlySet<string> | readonly string[];
	/** CommandDefinitions the layer defines (#31). Unknown when absent. */
	commandIds?: ReadonlySet<string> | readonly string[];
	/** Commands the layer's own CustomActions use (#31). Unknown when absent. */
	commandRefIds?: ReadonlySet<string> | readonly string[];
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
	 * What the layer adds that isn't on the canvas (#64, layerOrphans) and the
	 * user chose to delete: removed from the layer like your own deleted
	 * buttons, tabs and groups, with the commands and labels nothing else uses.
	 */
	deletedOrphans?: Pick<LayerOrphan, "id" | "deleteControlIds" | "deleteContainerIds">[];
	/**
	 * Commands that belong to another scope and must not be published from this
	 * one. The application ribbon passes the commands its table's buttons use:
	 * most out-of-the-box commands are shared, and an edit made for one table
	 * must not reach the application ribbon (and with it every table).
	 */
	excludeCommandIds?: Set<string>;
	/**
	 * Out-of-the-box / other solutions' commands the user chose to customise
	 * (#31, "Customise Command"): copied into the layer even when unchanged.
	 */
	customisedCommandIds?: readonly string[];
	/**
	 * Commands the layer defines that the user chose to uncustomise (#31): the
	 * layer's CommandDefinition is removed, so the original applies again.
	 */
	uncustomisedCommandIds?: readonly string[];
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
	/**
	 * Commands that differ from their loaded version, or were customised (#31),
	 * and are used by a button in this scope.
	 */
	editedCommandIds: string[];
	/** Commands whose layer CommandDefinition is removed (#31, "Uncustomise"). */
	uncustomisedCommandIds: string[];
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
	/**
	 * Tabs / groups the layer adds that were renamed: the base-language title of
	 * the LocLabel their Title refers to is replaced with `text` (#58).
	 */
	renamedLabels: RenamedLabel[];
	/** Human-readable descriptions of changes CBS cannot publish yet. */
	unsupported: string[];
	/** Things worth knowing about what publishes (they don't block the publish). */
	warnings: string[];
}

/**
 * What Unified Interface does with a custom tab (#58). Microsoft: in Unified
 * Interface "tabs and groups still act as containers for controls, but there is
 * no visual indication of these containers"
 * (https://learn.microsoft.com/power-apps/developer/model-driven-apps/command-bar-ribbon-presentation).
 * Verified live: a custom home-grid tab's buttons appear in the table's
 * command bar (or its overflow menu) where the tab's display rule applies.
 */
export const UCI_TAB_NOTE =
	"Unified Interface has no visible tabs: this tab's buttons appear in the table's command bar (or its overflow " +
	"menu) wherever the tab's display rule applies.";

/** A tab / group title the publish renames (#58). */
export interface RenamedLabel {
	/** The LocLabel whose base-language title becomes `text`. */
	id: string;
	text: string;
	/** The renamed tab / group. */
	containerId: string;
	/** A new label: the old one is shared with other controls, so the Title is pointed here. */
	newLabel?: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const isResourceIcon = (b: { icon?: string; image16?: string; image32?: string }) =>
	[b.icon, b.image16, b.image32].some((v) => !!v && v.startsWith("$webresource:"));
/**
 * The icon is the control definition's own ModernImage (or its absence), written
 * as is — e.g. an imported override (#30) — not a bare Fluent name picked in CBS.
 */
const isSourceIcon = (b: RibbonButton) =>
	!!b.source && effectiveModernImage(b) === b.source.modernImage && (b.source.modernImage !== undefined || !b.icon);
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
	// A control written verbatim (#42): the labels its children reference too.
	for (const m of button.source?.xml?.matchAll(/\$LocLabels:([^"'\s<]+)/g) ?? []) if (!out.includes(m[1])) out.push(m[1]);
	return out;
}

/** The sections of a button's menu, as compared for "did the menu's structure change" (#27). */
function sectionShape(button: RibbonButton) {
	return (button.menu?.sections ?? []).map((s) => ({
		id: s.id,
		title: s.title ?? "",
		sequence: s.sequence,
		displayMode: s.displayMode ?? "",
		controlsId: s.controlsId,
	}));
}

export function planScope(input: PlanInput): ScopePlan {
	const unsupported: string[] = [];
	const warnings: string[] = [];
	const deleted: string[] = [];
	const unhidden: string[] = [];
	const deletedContainers: string[] = [];
	const moved: MovedControl[] = [];
	const editedTabIds: string[] = [];
	const renamedLabels: RenamedLabel[] = [];
	// Who uses each label (tab / group titles, button texts), as loaded.
	const labelUsers = new Map<string, Set<string>>();
	const addUser = (token: string | undefined, by: string) => {
		const id = locRef(token);
		if (id) labelUsers.set(id, new Set([...(labelUsers.get(id) ?? []), by]));
	};
	for (const { baseline } of input.locations)
		for (const tab of baseline.tabs) {
			addUser(tab.label, tab.id);
			for (const g of tab.groups) {
				addUser(g.label, g.id);
				for (const b of groupControls(g)) for (const v of Object.values(b.source?.attributes ?? {})) addUser(v, b.id);
			}
		}
	const knownLabels = new Set([...(input.locLabels ?? []).map((l) => l.id), ...asSet(input.layer?.locLabelIds)]);
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
	// Menu items (#27) keep the `<Controls>` of the menu section they are in.
	const placedNew = new Map<string, { groupId: string; sequence: number; controlsId?: string }>();
	// New flyouts / split buttons without (visible) menu items (#27).
	const newMenus: { id: string; label: string }[] = [];

	// Every control placed anywhere in the scope now: the menu items of a flyout
	// moved to another location reappear there with it (#62 review m1).
	const placedAnywhere = new Set(
		input.locations.flatMap(({ current }) => Array.from(indexButtons(current).values(), (e) => e.button.id)),
	);
	// Renaming a tab / group the layer adds whose Title is a label the layer
	// defines: the label's text changes. Anything else isn't something CBS writes.
	const rename = (kind: "tab" | "group", id: string, before: string, after: string) => {
		const labelId = locRef(before);
		if (ownContainers.has(id) && labelId && ownLabels.has(labelId) && !locRef(after) && after.trim()) {
			// A label other controls also use keeps its text for them: the
			// renamed tab / group gets a label of its own (#66 review t3).
			if ([...(labelUsers.get(labelId) ?? [])].some((u) => u !== id)) {
				let own = `${id}.Title`;
				for (let n = 2; own === labelId || knownLabels.has(own); n++) own = `${id}.Title${n}`;
				knownLabels.add(own);
				renamedLabels.push({ id: own, text: after, containerId: id, newLabel: true });
			} else {
				renamedLabels.push({ id: labelId, text: after, containerId: id });
			}
		} else {
			unsupported.push(
				`Renaming ${kind} ${id} — only tabs and groups your unmanaged customizations add (with a translatable title) can be renamed`,
			);
		}
	};

	for (const { current, baseline } of input.locations) {
		const summary = summarizeRibbonDiff(current, baseline);
		if (
			summary.newButtons + summary.overriddenButtons + summary.hiddenButtons + summary.newTabs + summary.newGroups >
			0
		) {
			generatorChange = true;
		}
		if (summary.scalingChanges > 0) unsupported.push(`Scaling changes on ${current.location} (not supported yet)`);
		// A scaling Sequence used twice in a tab makes Unified Interface drop
		// every custom control of the table (#66 review): never publish one.
		const newScaling = planNewGroupScaling(current, baseline);
		unsupported.push(...newScaling.problems);
		// Scaling the layer wrote with a Sequence another step of the tab uses
		// (earlier CBS versions used the group's Sequence) is moved by the
		// publish; say so. What can't be moved blocks the publish.
		const layerSteps = asSet(input.layer?.scalingStepIds);
		for (const [tabId, scaling] of Object.entries(baseline.scalingByTab ?? {})) {
			const tab = current.tabs.find((t) => t.id === tabId);
			const layer: LayerScaleStep[] = [
				...scaling.maxSizes.filter((st) => layerSteps.has(st.id)).map((st) => ({ ...st, kind: "MaxSize" as const })),
				...scaling.scales.filter((st) => layerSteps.has(st.id)).map((st) => ({ ...st, kind: "Scale" as const })),
				...(tab?.groups ?? [])
					.map((g) => newScaling.steps.get(g.id))
					.filter((st): st is NonNullable<typeof st> => !!st)
					.map((st) => ({ ...st, kind: "MaxSize" as const })),
			];
			if (layer.length === 0) continue;
			const r = resequenceLayerScaling(
				tabId,
				{
					maxSizes: scaling.maxSizes.filter((st) => !layerSteps.has(st.id)).map((st) => st.sequence),
					scales: scaling.scales.filter((st) => !layerSteps.has(st.id)).map((st) => st.sequence),
				},
				layer,
			);
			warnings.push(...r.changes.map(describeScalingChange));
			unsupported.push(...r.problems);
		}

		// Keyed by occurrence: the application ribbon repeats control ids.
		const cur = indexButtons(current);
		const base = indexButtons(baseline);
		// Every command a control uses: a verbatim control's QueryCommand, … too (#42).
		for (const { button } of cur.values()) for (const id of controlCommandIds(button)) referencedCommandIds.add(id);

		for (const [key, { button, menu }] of cur) {
			const refs = buttonLabelRefs(button);
			refs.forEach((id) => referencedLabels.add(id));
			const b = base.get(key)?.button;
			const emitted = !b || hasOobOverrideChanges(b, button);
			// Only an item this publish writes: a loaded one is left as it is (#154).
			if (emitted && menu && !MENU_ITEM_KINDS.includes(button.kind ?? "button")) {
				unsupported.push(
					`Menu item "${button.label}" (${button.id}) is a ${CONTROL_TAG_BY_KIND[button.kind] ?? button.kind} — a menu can hold buttons and flyouts only; change its Kind`,
				);
			}
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
				const movedWith = b.menu && placedAnywhere.has(id) && placedAnywhere.has(b.menu.parentId);
				if (movedWith && b.button.origin !== "unmanaged") {
					// Moving the flyout would copy another solution's item into your
					// customizations (the moved flyout is written with its menu).
					unsupported.push(
						`Moving the menu of ${b.menu!.parentId} to another location — its item "${b.button.label}" (${id}) comes from another solution and can't be moved with it; move the flyout back`,
					);
					continue;
				}
				// A read-only kind is written to its new location as loaded (#42):
				// its <Menu> there also holds what other solutions add to it.
				if (isReadOnlyControlKind(b.button.kind) && placedAnywhere.has(id) && /<Menu[\s>/]/.test(b.button.source?.xml ?? "")) {
					unsupported.push(
						`Moving the <${CONTROL_TAG_BY_KIND[b.button.kind]}> "${b.button.label}" (${id}) to another location — its menu may hold items of other solutions; move it within its location instead`,
					);
					continue;
				}
				// "unmanaged" is set from the table's unmanaged layer at load. The
				// canvas deletes by the same rule (canDeleteControl, #17).
				if (isOwnControl(b.button)) deleted.push(id);
				else unsupported.push(`Removing "${b.button.label}" (${id}) — only your own unmanaged buttons can be deleted; hide it instead`);
				continue;
			}
			if (b.button.hidden && !c.button.hidden) unhidden.push(id);
			if ((c.button.kind ?? "button") !== (b.button.kind ?? "button")) {
				unsupported.push(`Changing the kind of "${c.button.label}" (${id}) — not supported yet`);
			}
			const edited = hasOobOverrideChanges(b.button, c.button);
			// ToggleButton, Label, DropDown, … are written back as loaded (#42).
			if (edited && isReadOnlyControlKind(c.button.kind)) {
				unsupported.push(
					`Editing the <${CONTROL_TAG_BY_KIND[c.button.kind]}> "${c.button.label}" (${id}) — CBS shows it read-only; it can be hidden, or moved and deleted when it's your own`,
				);
			}
			// Any control with a <Menu> (a ComboBox too): an override would drop it.
			if (edited && (isMenuKind(c.button.kind) || !!c.button.menu) && b.button.origin !== "unmanaged") {
				// An override replaces the whole control, menu included, and the
				// loaded menu also holds what other solutions add to it (#27).
				unsupported.push(
					`Editing the flyout / split button "${c.button.label}" (${id}) itself — only your own can be edited; its menu items can be edited, hidden or added to`,
				);
			}
			if (!same(sectionShape(b.button), sectionShape(c.button))) {
				unsupported.push(
					`Adding, removing or changing menu sections of "${c.button.label}" (${id}) — not supported yet for an existing menu; add, edit or remove its items instead`,
				);
			}
			if ((c.button.icon ?? "") !== (b.button.icon ?? "") && !isResourceIcon(c.button) && !isSourceIcon(c.button)) {
				unsupported.push(
					`Changing the icon of "${c.button.label}" (${id}) to a built-in icon — not supported yet; choose an SVG web resource`,
				);
			}
			// A menu item is placed by its section's Controls, not by the group its
			// flyout happens to be in (it moves with the flyout, #62 review m1).
			const placeChanged =
				c.menu || b.menu ? c.menu?.controlsId !== b.menu?.controlsId : c.groupId !== b.groupId;
			if (placeChanged || c.button.sequence !== b.button.sequence) {
				// Your own button: its CustomAction is moved in place. Moving any other
				// button moves a copy and hides the original (ribbonStore.moveButton,
				// #26), so what reaches here is a flyout / split button, a hidden or
				// read-only button, or a menu item. A menu item moves within its menu
				// section's Controls (#27).
				if (b.button.origin === "unmanaged") {
					moved.push({
						id,
						groupId: c.groupId,
						sequence: c.button.sequence,
						...(c.menu ? { controlsId: c.menu.controlsId } : {}),
					});
				} else {
					unsupported.push(
						`Moving or re-ordering "${c.button.label}" (${id}) — only your own unmanaged buttons, and copies made with "Customise button", can be moved; undo the move, then hide it and add a new button instead`,
					);
				}
			}
		}

		// Controls placed anew in this location (a move target, see below), and
		// new flyouts / split buttons with nothing in their menu (#27).
		for (const [key, c] of cur) {
			if (base.has(key)) continue;
			if (!placedNew.has(c.button.id)) {
				placedNew.set(c.button.id, {
					groupId: c.groupId,
					sequence: c.button.sequence,
					...(c.menu ? { controlsId: c.menu.controlsId } : {}),
				});
			}
			const dynamic = isDynamicMenuValue(c.button.source?.attributes["PopulateDynamically"]);
			if (isMenuKind(c.button.kind) && !dynamic && !menuItemsOf(c.button).some((b) => !b.hidden)) {
				newMenus.push({ id: c.button.id, label: c.button.label });
			}
		}

		const baseGroups = new Map(baseline.tabs.flatMap((t) => t.groups.map((g) => [g.id, g] as const)));
		const baseTabs = new Map(baseline.tabs.map((t) => [t.id, t] as const));
		const curTabIds = new Set(current.tabs.map((t) => t.id));
		const curGroupIds = new Set(current.tabs.flatMap((t) => t.groups.map((g) => g.id)));
		for (const tab of current.tabs) {
			const tabRef = locRef(tab.label);
			if (tabRef) referencedLabels.add(tabRef);
			const bt = baseTabs.get(tab.id);
			if (!bt) {
				generatorLabels.add(`${tab.id}.Title`);
				// An imported tab keeps its own Title label (#30), and the
				// CommandDefinition of its Command is written with it.
				const titleRef = locRef(tab.source?.titleToken);
				if (titleRef) generatorLabels.add(titleRef);
				if (tab.commandId) referencedCommandIds.add(tab.commandId);
				// A new table tab gets a default display rule; on the application
				// ribbon there's no default, and without a rule the tab never shows.
				if (current.location === "Application" && (tab.tabDisplayRules ?? []).length === 0) {
					unsupported.push(
						`New tab ${tab.id} has no tab display rule, so it would never be shown — add one in Tab rules`,
					);
				}
				warnings.push(`New tab "${tab.label}" (${tab.id}): ${UCI_TAB_NOTE}`);
			}
			if (bt && bt.label !== tab.label) rename("tab", tab.id, bt.label, tab.label);
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
				if (!bg) {
					generatorLabels.add(`${g.id}.Title`);
					// An imported group keeps its own Title label (#30).
					const titleRef = locRef(g.source?.titleToken);
					if (titleRef) generatorLabels.add(titleRef);
				}
				if (bg && bg.template !== g.template) unsupported.push(`Re-templating group ${g.id} — not supported yet`);
				if (bg && bg.label !== g.label) rename("group", g.id, bg.label, g.label);
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
		moved.push({ id: deleted[i], ...to });
		deleted.splice(i, 1);
	}
	// Orphans the user deletes (#64): not on the canvas, so not in the
	// baseline / current comparison above.
	for (const o of input.deletedOrphans ?? []) {
		for (const id of o.deleteControlIds) if (!deleted.includes(id)) deleted.push(id);
		for (const id of o.deleteContainerIds) if (!deletedContainers.includes(id)) deletedContainers.push(id);
	}
	for (const m of newMenus) {
		// A moved menu keeps its <Menu>: the merge edits the control in place.
		// A really new one is published with its whole menu (#27), which would
		// be empty.
		if (moved.some((x) => x.id === m.id)) continue;
		unsupported.push(`New flyout / split button "${m.label}" has no menu items — add at least one item to its menu`);
	}

	// Uncustomise (#31): only a command this scope's layer defines can be
	// removed from it. Without layer data, a command used in this scope.
	const layerCommands = input.layer?.commandIds ? asSet(input.layer.commandIds) : null;
	const uncustomised = new Set(input.uncustomisedCommandIds ?? []);
	const uncustomisedCommandIds = [...uncustomised].filter((id) =>
		layerCommands ? layerCommands.has(id) : referencedCommandIds.has(id) && !input.excludeCommandIds?.has(id),
	);
	// Your own command has no other definition: removing it breaks its buttons.
	for (const id of uncustomisedCommandIds) {
		if (input.layer?.commandRefIds && !canUncustomiseCommand(id, input.layer.commandRefIds)) {
			unsupported.push(
				`Uncustomising ${id} — it is your own command (your customizations' buttons use it and no other solution defines it); undo the uncustomise`,
			);
		}
	}

	// The open-record override (#22): RetrieveEntityRibbon shows no platform
	// definition of Mscrm.OpenRecordItem to fall back to, so removing the
	// layer's copy could leave its buttons without a command.
	if (uncustomisedCommandIds.includes(OPEN_RECORD_ITEM_COMMAND_ID) && referencedCommandIds.has(OPEN_RECORD_ITEM_COMMAND_ID)) {
		unsupported.push(
			`Uncustomising ${OPEN_RECORD_ITEM_COMMAND_ID} — its "Open record" buttons still use it; undo the uncustomise and turn the record open override off in the Advanced section instead`,
		);
	}

	for (const id of input.excludeCommandIds ?? []) referencedCommandIds.delete(id);

	// A customised command is written even unchanged — unless the layer already
	// has it (then only an edit replaces the layer's verbatim copy).
	const customised = new Set(input.customisedCommandIds ?? []);
	const baseCmd = new Map(input.baselineCommands.map((c) => [c.id, c]));
	const editedCommandIds = input.commands
		.filter(
			(c) =>
				referencedCommandIds.has(c.id) &&
				!uncustomised.has(c.id) &&
				(!baseCmd.has(c.id) ||
					!same(baseCmd.get(c.id), c) ||
					(customised.has(c.id) && !layerCommands?.has(c.id))),
		)
		.map((c) => c.id);
	for (const c of input.commands) {
		if (!editedCommandIds.includes(c.id)) continue;
		if (c.actions.some((a) => a.kind === "powerFx" || a.kind === "customApi")) {
			unsupported.push(
				`Power Fx / Custom API action in command ${c.id} — classic ribbon commands can't run these; remove the action (#28)`,
			);
		}
		// Opening a row of the table's grids runs this command (#22): never
		// publish the placeholder action the override starts with.
		const problem = c.id === OPEN_RECORD_ITEM_COMMAND_ID ? openRecordCommandProblem(c) : null;
		if (problem) unsupported.push(problem);
	}

	const enableInScope = new Set<string>();
	const displayInScope = new Set<string>();
	for (const c of input.commands) {
		if (!referencedCommandIds.has(c.id) || uncustomised.has(c.id)) continue;
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
			uncustomisedCommandIds.length > 0 ||
			editedEnableRuleIds.length > 0 ||
			editedDisplayRuleIds.length > 0 ||
			deleted.length > 0 ||
			unhidden.length > 0 ||
			unhiddenLayer.length > 0 ||
			deletedContainers.length > 0 ||
			moved.length > 0 ||
			editedLocLabelIds.length > 0 ||
			editedTabIds.length > 0 ||
			renamedLabels.length > 0,
		editedCommandIds,
		uncustomisedCommandIds,
		editedEnableRuleIds,
		editedDisplayRuleIds,
		deletedButtonIds: deleted,
		unhiddenButtonIds: [...unhidden, ...unhiddenLayer],
		deletedContainerIds: deletedContainers,
		movedButtons: moved,
		editedLocLabelIds,
		editedTabIds,
		renamedLabels,
		unsupported: [...new Set(unsupported)],
		warnings: [...new Set(warnings)],
	};
}
