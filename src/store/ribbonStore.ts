import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
	RibbonLocation,
	RibbonDefinition,
	RibbonButton,
	RibbonGroup,
	RibbonTab,
	CommandDefinition,
	DisplayRule,
	EnableRule,
	LocLabel,
	GroupTemplate,
	ConflictEntry,
	TabDisplayRule,
	ScalingDefinition,
	RibbonMenuSection,
} from "@/types/ribbon";
import {
	layerSnapshotFromParts,
	locLabelsFromParts,
	type LayerSnapshot,
} from "@/services/dataverse/ribbonLayerService";
import {
	applyPublishedLayer,
	ownContainerIds as ownContainerIdsOf,
	ownControlIds,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import type { LayerOrphan } from "@/services/layerOrphans";
import { defaultTabDisplayRules, newTabCommandId } from "@/services/xmlGenerator";
import { generateRibbonId, newButtonIds } from "@/utils/idGenerator";
import {
	copyControl,
	findGroupControl,
	isOtherSolutionLabel,
	groupControls,
	isMenuKind,
	MENU_ITEM_KINDS,
	menuItemPlace,
	newMenu,
	newMenuSection,
	removeMenuItem,
} from "@/utils/ribbonMenu";
import { buttonLabelId, buttonTooltipBodyId, buttonTooltipTitleId } from "@/utils/locLabelRef";
import { isPlatformText, resolveDisplayLabel } from "@/utils/displayLabel";
import { isReadOnlyControlKind, renameCommandInXml } from "@/utils/controlKinds";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { canDeleteControl, canDeleteGroup, canDeleteTab } from "@/utils/ribbonProvenance";
import { onSolutionSwitch, useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import {
	OPEN_RECORD_ITEM_COMMAND_ID,
	OPEN_RECORD_ITEM_LOCATIONS,
	defaultOpenRecordCommand,
	openRecordCarrierOwnership,
	openRecordCarrierPlacement,
	openRecordCarriers,
	openRecordCommandUsers,
} from "@/utils/openRecordItem";

/** A ribbon scope with its own unmanaged layer: the table, or the application ribbon. */
export type LayerScope = "entity" | "application";

/** Platform display rules that are never both true: together they hide a button on every client. */
export const HIDE_DISPLAY_RULES = ["Mscrm.HideOnModern", "Mscrm.ShowOnlyOnModern"] as const;

export interface HistoryEntry {
	ts: string;
	userId: string;
	userName: string;
	op: string;
	target: string;
	detail: string;
	icon: string;
	color: "success" | "warn" | "info" | "danger";
	/** The workspace before this entry's change (after it, once the entry is undone). */
	snapshot: WorkspaceSnapshot;
	/** Edits with the same key in quick succession extend this entry (typing). */
	coalesceKey?: string;
}

type HistoryMeta = Omit<HistoryEntry, "snapshot" | "coalesceKey">;

/**
 * The editable workspace (#34): what undo / redo restore — the canvas, the
 * definitions it references, and the pending un-hides, orphan deletes (#64)
 * and customised / uncustomised commands (#31) the publish diff reads.
 * Baselines, layers and other loaded data are not part of it.
 */
export type WorkspaceSnapshot = Pick<
	RibbonStoreState,
	| "ribbons"
	| "commands"
	| "enableRules"
	| "displayRules"
	| "locLabels"
	| "pendingUnhides"
	| "pendingOrphanDeletes"
	| "customisedCommandIds"
	| "uncustomisedCommandIds"
>;

export type RibbonStoreState = {
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	baseline: Record<RibbonLocation, RibbonDefinition>;
	/** Commands / rules as loaded (or last published) — edits are detected against these. */
	baselineCommands: CommandDefinition[];
	baselineEnableRules: EnableRule[];
	baselineDisplayRules: DisplayRule[];
	/** LocLabels as loaded (or last published): translation-only edits are detected against these (#49). */
	baselineLocLabels: LocLabel[];
	/** The unmanaged layers as loaded / last refreshed (null when unreadable). */
	layers: Record<LayerScope, LayerSnapshot | null>;
	/**
	 * Controls hidden by a HideCustomAction of the layer that the user chose to
	 * un-hide (#47). They are not on the canvas: RetrieveEntityRibbon applies hides.
	 */
	pendingUnhides: Record<LayerScope, string[]>;
	/**
	 * What the layer adds that the ribbon doesn't return anywhere (#64), as
	 * loaded: not on the canvas, so listed apart to be deleted.
	 */
	orphans: Record<LayerScope, LayerOrphan[]>;
	/** Orphans (by id) the user chose to delete: removed from the layer on publish (#64). */
	pendingOrphanDeletes: Record<LayerScope, string[]>;
	/** Organisation base language (#50). */
	baseLanguageCode: number;
	/**
	 * The base language couldn't be read when the table loaded (#106): labels show
	 * in English, and publishing waits for a reload — it would write the canvas's
	 * English texts as the real language's titles.
	 */
	baseLanguageUnknown: boolean;
	/**
	 * An unmanaged layer couldn't be read (#110): which labels are yours is
	 * unknown, so a copy keeps no `$LocLabels:` token — it could be one of
	 * yours, and a later edit of the copy would change the original (#137).
	 */
	labelsUnknown: boolean;
	/**
	 * Out-of-the-box / other solutions' commands customised this session (#31,
	 * "Customise Command"): copied into the layer on publish, even unchanged.
	 */
	customisedCommandIds: string[];
	/**
	 * Commands whose copy in that scope's layer is removed on publish (#31,
	 * "Uncustomise"). Per scope: uncustomising for the table must not touch the
	 * application ribbon's copy.
	 */
	uncustomisedCommandIds: Record<LayerScope, string[]>;
	/**
	 * Commands uncustomised and published: the session still holds the removed
	 * copy (the original is only known after reloading the table), so they are
	 * read-only and can't be customised again until then (#31).
	 */
	reloadRequiredCommandIds: string[];
	commands: CommandDefinition[];
	displayRules: DisplayRule[];
	enableRules: EnableRule[];
	locLabels: LocLabel[];
	templates: GroupTemplate[];
	conflicts: ConflictEntry[];
	mutationsSincePublish: number;
	past: HistoryEntry[];
	future: HistoryEntry[];
};

export interface RibbonWorkspaceSeed {
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	commands: CommandDefinition[];
	displayRules: DisplayRule[];
	enableRules: EnableRule[];
	locLabels: LocLabel[];
	templates?: GroupTemplate[];
	conflicts?: ConflictEntry[];
	layers?: Partial<Record<LayerScope, LayerSnapshot | null>>;
	baseLanguageCode?: number;
	/** The base language couldn't be read (#106). */
	baseLanguageUnknown?: boolean;
	/** An unmanaged layer couldn't be read (#110). */
	labelsUnknown?: boolean;
	/** The table's layer orphans (ribbonService.fetchRibbonWorkspace, #64). */
	orphans?: Partial<Record<LayerScope, LayerOrphan[]>>;
}

type DragSource = { groupId: string; buttonId: string; tabId: string; location: RibbonLocation };
type DragTarget = {
	groupId: string;
	beforeButtonId?: string;
	tabId: string;
	location: RibbonLocation;
};

type NewButtonContext = {
	tabId: string;
	groupId: string;
	location: RibbonLocation;
	/** Without a sequence (or with one the group already uses) it goes after the last button. */
	button: Omit<RibbonButton, "id" | "sequence"> & { id?: string; sequence?: number };
};

type NewMenuItemContext = {
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	/** The flyout / split button (or a nested flyout) whose menu gets the item. */
	parentId: string;
	sectionId?: string;
	item: Pick<RibbonButton, "id" | "label" | "commandId"> & Partial<RibbonButton>;
};

type NewGroupContext = {
	tabId: string;
	location: RibbonLocation;
	/** Without an id the store makes one; without a free sequence it goes after the last group. */
	group: Omit<RibbonGroup, "id" | "sequence"> & { id?: string; sequence?: number };
};

export interface RibbonStore extends RibbonStoreState {
	// History actions
	undo(): void;
	redo(): void;
	restore(index: number): void;
	/**
	 * Runs `fn` as one undo step (#34): the actions it calls make a single
	 * history entry (named after the first of them). Nested batches join the
	 * outer one.
	 */
	batch(fn: () => void): void;
	/**
	 * Starts an edit session (#186): until endEditSession, every change joins
	 * one history entry, however far apart, so one Undo reverts the whole
	 * session (an editor drawer, from opening to Done). An Undo during the
	 * session reverts what it changed so far; the next change starts its entry
	 * again. Starting a session ends the one that was open.
	 */
	beginEditSession(): void;
	endEditSession(): void;

	// Mutations
	/**
	 * Moves a button to `dst`. Returns the id of the button now at `dst` — a
	 * new copy's id when a button that isn't yours was moved (#26) — or null
	 * when nothing moved.
	 */
	moveButton(src: DragSource, dst: DragTarget): string | null;
	setButtonProp(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
		patch: Partial<RibbonButton>,
	): void;
	deleteButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	/**
	 * Adds an item to the menu of flyout / split button `parentId` (#27) — to
	 * `sectionId`, or the first section (created when the menu has none).
	 */
	addMenuItem(ctx: NewMenuItemContext): void;
	/** Adds a section to the menu of `parentId` (#27). */
	addMenuSection(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		parentId: string,
		title?: string,
	): void;
	setMenuSectionProp(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		parentId: string,
		sectionId: string,
		patch: Partial<Pick<RibbonMenuSection, "title" | "displayMode" | "sequence">>,
	): void;
	/** Removes a menu section together with its items (#27). */
	deleteMenuSection(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		parentId: string,
		sectionId: string,
	): void;
	duplicateButton(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
	): void;
	createButton(ctx: NewButtonContext): void;
	createGroup(ctx: NewGroupContext): void;
	renameGroup(location: RibbonLocation, tabId: string, groupId: string, newLabel: string): void;
	duplicateGroup(location: RibbonLocation, tabId: string, groupId: string): void;
	setGroupTemplate(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		template: string,
	): void;
	deleteGroup(location: RibbonLocation, tabId: string, groupId: string): void;
	createTab(location: RibbonLocation, tabDef: Partial<RibbonTab>): void;
	renameTab(location: RibbonLocation, tabId: string, newLabel: string): void;
	deleteTab(location: RibbonLocation, tabId: string): void;
	reorderTabs(location: RibbonLocation, tabIds: string[]): void;
	/**
	 * Moves a group one place left (-1) or right (1) in its tab (#194). Like a
	 * tab (#163), a new group or one your customizations add is renumbered to
	 * sit between its neighbours; when neither it nor the group it passes can
	 * be, nothing moves (see canMoveGroup).
	 */
	moveGroup(location: RibbonLocation, tabId: string, groupId: string, by: -1 | 1): void;
	setTabDisplayRules(location: RibbonLocation, tabId: string, rules: TabDisplayRule[]): void;
	setScaling(location: RibbonLocation, tabId: string, scaling: ScalingDefinition): void;
	hideOobButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	customizeOobButton(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
	): void;
	/**
	 * "Customise Button" (#26, #31): copies a button that isn't yours into a
	 * new button of your own (id `<idPrefix>.<original id>`, same command,
	 * same place) and hides the original, so the copy can be changed and moved
	 * like any of your buttons. Returns the copy's id, or null when the button
	 * can't be customised this way (your own, hidden, a menu, read-only).
	 */
	customiseButton(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
		idPrefix: string,
	): string | null;
	upsertCommand(cmd: CommandDefinition): void;
	/**
	 * "Customise Command" (#31): marks a loaded command to be copied into the
	 * layer on publish — actions, parameters and rule references as loaded —
	 * so it can be changed without touching its buttons. Returns false when
	 * the command isn't loaded or must be reloaded first.
	 */
	customiseCommand(commandId: string): boolean;
	/**
	 * "Uncustomise" (#31): the copy of the command in `scope`'s layer is
	 * removed on publish, so the original applies again. Session edits are
	 * discarded (the UI confirms first).
	 */
	uncustomiseCommand(commandId: string, scope: LayerScope): void;
	/** Discards this session's customise / uncustomise / edits of a command (back to as loaded). */
	discardCommandChanges(commandId: string): void;
	/**
	 * Turns the override of opening a grid row (Mscrm.OpenRecordItem, #22) on
	 * or off for the home grid or the sub-grid (see utils/openRecordItem). On:
	 * a button using the command (the carrier Microsoft's recipe adds) goes on
	 * the location's main tab, and the command is added with a placeholder
	 * JavaScript action unless it is loaded already. Off: the carriers the
	 * switch created in the location are deleted (other buttons using the
	 * command stay), and the command too when no button uses it any more and it
	 * was created this session; the layer's copy is removed by the publish with
	 * the last button using it. One undo step. Returns false when it can't be
	 * done: no group to put the carrier in, or a carrier that isn't yours (or
	 * whose provenance isn't known yet).
	 */
	setOpenRecordOverride(location: RibbonLocation, enabled: boolean, idPrefix: string): boolean;
	/**
	 * Hides a button reversibly: adds the platform display rules
	 * Mscrm.HideOnModern + Mscrm.ShowOnlyOnModern (never both true) to its
	 * command. Every button that uses the command is hidden. Returns false when
	 * the button has no loaded command.
	 */
	hideWithDisplayRules(buttonCommandId: string | undefined): boolean;
	renameCommandId(oldId: string, newId: string): boolean;
	upsertDisplayRule(rule: DisplayRule): void;
	renameDisplayRuleId(oldId: string, newId: string): boolean;
	upsertEnableRule(rule: EnableRule): void;
	renameEnableRuleId(oldId: string, newId: string): boolean;
	upsertLocLabel(label: LocLabel): void;
	/** Marks a control hidden by the layer (#47) to be un-hidden on publish, or keeps it hidden. */
	setLayerHideUnhidden(scope: LayerScope, controlId: string, unhide: boolean): void;
	/** Marks a layer orphan (#64) to be deleted on publish, or keeps it. */
	setOrphanDeleted(scope: LayerScope, orphanId: string, deleted: boolean): void;
	/** Replaces a scope's layer snapshot (after a publish re-reads it). */
	setLayerSnapshot(scope: LayerScope, snapshot: LayerSnapshot | null): void;
	/**
	 * Marks the given locations as published (their baseline becomes the
	 * current state). Locations that were not published keep their pending
	 * changes. Command / rule baselines advance only when every location was
	 * published.
	 */
	/**
	 * Advances the baseline of the published locations. `published` is the layer
	 * each scope was imported as: its scaling Sequences and label tokens are taken
	 * into the model first (#66 review B1, m4).
	 */
	markPublished(
		locations?: RibbonLocation[],
		published?: Partial<Record<LayerScope, RibbonDiffParts>>,
	): void;
	setConflicts(entries: ConflictEntry[]): void;
	/**
	 * Applies an imported RibbonDiffXml (ribbonDiffImport.ts) as ONE session
	 * change. The baseline is left alone, so what was imported publishes (#30).
	 */
	applyImport(
		next: Pick<
			RibbonStoreState,
			"ribbons" | "commands" | "enableRules" | "displayRules" | "locLabels"
		>,
		summary: string,
	): void;

	// Load initial data
	loadRibbons(ribbons: Record<RibbonLocation, RibbonDefinition>): void;
	loadWorkspace(seed: RibbonWorkspaceSeed): void;
	/**
	 * Puts a saved workspace (unsaved changes of an earlier session, #16) on
	 * top of the loaded one as ONE undo step. Baselines and layers stay as
	 * loaded, so the restored edits are changes to publish.
	 */
	restoreWorkspace(workspace: WorkspaceSnapshot, detail: string): void;
	/** Empties the workspace (no table loaded): a solution switch ends the table being edited (#22). */
	resetWorkspace(): void;
}

const MAX_HISTORY = 80;

/**
 * Every tab, group and button id a new element must not reuse: the edited
 * ribbons, the baseline (a deleted element's id is still in the layer until
 * published) and what the unmanaged layers add (#66 review m1).
 */
export function workspaceIds(
	state: Pick<RibbonStoreState, "baseline" | "layers">,
	ribbons: Record<RibbonLocation, RibbonDefinition>,
): Set<string> {
	const ids = new Set<string>();
	for (const defs of [ribbons, state.baseline])
		for (const def of Object.values(defs ?? {}))
			for (const tab of def.tabs) {
				ids.add(tab.id);
				for (const group of tab.groups) {
					ids.add(group.id);
					// Menu items (#27) too.
					for (const button of groupControls(group)) ids.add(button.id);
				}
			}
	for (const snap of Object.values(state.layers ?? {})) {
		for (const id of snap?.containerIds ?? []) ids.add(id);
		for (const id of snap?.controlIds ?? []) ids.add(id);
	}
	return ids;
}

/** Tabs and groups the location's unmanaged layer adds; undefined when it couldn't be read. */
export function ownContainerIds(
	state: Pick<RibbonStoreState, "layers">,
	location: RibbonLocation,
): string[] | undefined {
	return scopeLayer(state, location)?.containerIds;
}

/** The unmanaged layer of the scope a location belongs to (the table's, or the application ribbon's). */
export function scopeLayer(
	state: Pick<RibbonStoreState, "layers">,
	location: RibbonLocation,
): LayerSnapshot | null | undefined {
	return state.layers[location === "Application" ? "application" : "entity"];
}

function cloneRibbons(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
): Record<RibbonLocation, RibbonDefinition> {
	return JSON.parse(JSON.stringify(ribbons));
}

export function workspaceOf(state: RibbonStoreState): WorkspaceSnapshot {
	// State is updated immutably, so the snapshot can share it.
	return {
		ribbons: state.ribbons,
		commands: state.commands,
		enableRules: state.enableRules,
		displayRules: state.displayRules,
		locLabels: state.locLabels,
		pendingUnhides: state.pendingUnhides,
		pendingOrphanDeletes: state.pendingOrphanDeletes,
		customisedCommandIds: state.customisedCommandIds,
		uncustomisedCommandIds: state.uncustomisedCommandIds,
	};
}

function historyMeta(
	op: string,
	target: string,
	detail: string,
	icon: string,
	color: HistoryMeta["color"] = "info",
): HistoryMeta {
	return {
		ts: new Date().toISOString(),
		userId: "",
		userName: "You",
		op,
		target,
		detail,
		icon,
		color,
	};
}

/** The open batch (#34), if any: its actions make one history entry when it closes. */
let openBatch: { snapshot: WorkspaceSnapshot; meta: HistoryMeta | null } | null = null;

/** Edits of the same thing closer together than this are one undo step (typing). */
const COALESCE_MS = 1000;

/** The open edit session's history key (#186), if any: its changes make one entry. */
let openSession: string | null = null;
let sessions = 0;

/**
 * The history after a change: a new entry, or the last one extended when the
 * change continues it — the same edit within COALESCE_MS, or anything in the
 * open edit session. `snapshot` is the workspace before the change.
 */
function historyAfter(
	state: RibbonStoreState,
	meta: HistoryMeta,
	snapshot: () => WorkspaceSnapshot,
	coalesceKey?: string,
): Pick<RibbonStoreState, "past" | "future" | "mutationsSincePublish"> {
	const key = openSession ?? coalesceKey;
	const last = state.past[state.past.length - 1];
	if (
		key &&
		last?.coalesceKey === key &&
		state.future.length === 0 &&
		(openSession !== null || Date.parse(meta.ts) - Date.parse(last.ts) < COALESCE_MS)
	) {
		return {
			past: [...state.past.slice(0, -1), { ...last, ...meta }],
			future: [],
			// Still counted, so the workspace is saved as the user types.
			mutationsSincePublish: state.mutationsSincePublish + 1,
		};
	}
	return {
		past: [...state.past, { ...meta, coalesceKey: key, snapshot: snapshot() }].slice(
			-MAX_HISTORY,
		),
		future: [],
		mutationsSincePublish: state.mutationsSincePublish + 1,
	};
}

/**
 * Applies a workspace change as one undo step: every user action goes through
 * here, so undo / redo always restore the canvas and the definitions together.
 * Consecutive edits with the same `coalesceKey` less than COALESCE_MS apart
 * (typing in a field) extend the last entry instead of adding one.
 */
function record(
	state: RibbonStoreState,
	change: Partial<WorkspaceSnapshot>,
	meta: HistoryMeta,
	coalesceKey?: string,
): Partial<RibbonStoreState> {
	if (openBatch) {
		if (!openBatch.meta) openBatch.meta = meta;
		return change;
	}
	return { ...change, ...historyAfter(state, meta, () => workspaceOf(state), coalesceKey) };
}

function commitMutation(
	state: RibbonStoreState,
	mutator: (ribbons: Record<RibbonLocation, RibbonDefinition>) => void,
	meta: HistoryMeta,
	coalesceKey?: string,
): Partial<RibbonStoreState> {
	const next = cloneRibbons(state.ribbons);
	mutator(next);
	return record(state, { ribbons: next }, meta, coalesceKey);
}

/**
 * Whether the workspace has anything to publish (#34 review): after an undo
 * the change counter alone can't tell, e.g. when undoing past a publish.
 */
export function hasPendingChanges(state: RibbonStoreState): boolean {
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	return (
		state.pendingUnhides.entity.length + state.pendingUnhides.application.length > 0 ||
		state.pendingOrphanDeletes.entity.length + state.pendingOrphanDeletes.application.length >
			0 ||
		state.customisedCommandIds.length > 0 ||
		state.uncustomisedCommandIds.entity.length +
			state.uncustomisedCommandIds.application.length >
			0 ||
		!same(state.ribbons, state.baseline) ||
		!same(state.commands, state.baselineCommands) ||
		!same(state.enableRules, state.baselineEnableRules) ||
		!same(state.displayRules, state.baselineDisplayRules) ||
		!same(state.locLabels, state.baselineLocLabels)
	);
}

/** Inserts or replaces the item with `item.id`; null when it is already there unchanged. */
function upsertById<T extends { id: string }>(items: T[], item: T): T[] | null {
	const i = items.findIndex((x) => x.id === item.id);
	if (i < 0) return [...items, item];
	if (JSON.stringify(items[i]) === JSON.stringify(item)) return null;
	return items.map((x, j) => (j === i ? item : x));
}

const NO_LAYERS: Record<LayerScope, LayerSnapshot | null> = { entity: null, application: null };
const NO_UNHIDES: Record<LayerScope, string[]> = { entity: [], application: [] };
const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

/**
 * A sequence for a button just placed between `prev` and `next` (#26): the
 * canvas orders by position, publish by Sequence, so a move must change it.
 * Keeps the current value when it already fits. Never returns a neighbour's
 * value: `undefined` when no sequence (≥ 1) lies strictly between them — the
 * caller then re-numbers (resequenceAround).
 */
export function sequenceBetween(current: number, prev?: number, next?: number): number | undefined {
	const fits = (prev === undefined || current > prev) && (next === undefined || current < next);
	if (fits) return current;
	if (prev !== undefined && next !== undefined) {
		return next - prev > 1 ? Math.floor((prev + next) / 2) : undefined;
	}
	if (prev !== undefined) return prev + 10;
	if (next !== undefined) return next > 1 ? Math.max(1, next - 10) : undefined;
	return current;
}

/**
 * Gives tabs or groups in their new order Sequences that publish that order
 * (#163): the ones `canRenumber` allows are renumbered between their
 * neighbours. One with no free value between neighbours that can't be
 * renumbered goes where its Sequence publishes it instead.
 */
export function resequenceOrder<T extends { sequence: number }>(
	ordered: T[],
	canRenumber: (item: T) => boolean,
): void {
	for (let i = 1; i < ordered.length; i++) {
		if (ordered[i].sequence > ordered[i - 1].sequence) continue;
		if (canRenumber(ordered[i])) resequenceAround(ordered, i, canRenumber);
		else if (canRenumber(ordered[i - 1])) resequenceAround(ordered, i - 1, canRenumber);
	}
	for (const item of ordered.filter(canRenumber)) {
		const at = ordered.indexOf(item);
		const fits =
			(ordered[at - 1]?.sequence ?? -Infinity) < item.sequence &&
			item.sequence < (ordered[at + 1]?.sequence ?? Infinity);
		if (fits) continue;
		ordered.splice(at, 1);
		const to = ordered.findIndex((t) => t.sequence > item.sequence);
		ordered.splice(to < 0 ? ordered.length : to, 0, item);
	}
}

/**
 * Items in Sequence order, which is the order Dataverse shows tabs' groups and
 * groups' controls in (#194). The load keeps the XML's order, and a new group
 * is added last whatever its Sequence, so the arrays can differ from it.
 */
export function bySequence<T extends { sequence: number }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => a.sequence - b.sequence);
}

/** A group whose Sequence a publish can change: new, or one your customizations add (#194). */
function groupRenumberable(
	state: Pick<RibbonStoreState, "baseline" | "layers">,
	location: RibbonLocation,
): (group: RibbonGroup) => boolean {
	const loaded = new Set(
		state.baseline[location]?.tabs.flatMap((t) => t.groups.map((g) => g.id)) ?? [],
	);
	const own = new Set(ownContainerIds(state, location) ?? []);
	return (g) => !loaded.has(g.id) || own.has(g.id);
}

/**
 * Whether a group can move one place left (-1) or right (1) and the publish
 * keep that order (#194): there is a place there, and the group or the one it
 * passes can be renumbered.
 */
export function canMoveGroup(
	state: Pick<RibbonStoreState, "ribbons" | "baseline" | "layers">,
	location: RibbonLocation,
	tabId: string,
	groupId: string,
	by: -1 | 1,
): boolean {
	const groups = bySequence(
		state.ribbons[location].tabs.find((t) => t.id === tabId)?.groups ?? [],
	);
	const from = groups.findIndex((g) => g.id === groupId);
	const other = groups[from + by];
	if (from < 0 || !other) return false;
	const canRenumber = groupRenumberable(state, location);
	return canRenumber(groups[from]) || canRenumber(other);
}

/**
 * Gives the button at `at` a sequence that keeps `buttons` in display order
 * when there is no free value between its neighbours (#57 review). Only the
 * buttons `canRenumber` allows (the moved one, your own, new ones) change; the
 * others keep their sequence, since CBS can't re-sequence them. When even that
 * leaves no room (e.g. two adjacent out-of-the-box sequences 10 and 11), the
 * button gets the lowest unused sequence after its previous neighbour, so it
 * never shares a value with another button (it then sorts a little later).
 */
export function resequenceAround<T extends { sequence: number }>(
	buttons: T[],
	at: number,
	canRenumber: (b: T) => boolean,
): void {
	let s = at;
	while (s > 0 && canRenumber(buttons[s - 1])) s--;
	let e = at;
	while (e < buttons.length - 1 && canRenumber(buttons[e + 1])) e++;
	const lo = s > 0 ? buttons[s - 1].sequence : 0;
	const hi = e < buttons.length - 1 ? buttons[e + 1].sequence : Infinity;
	if (hi - lo - 1 >= e - s + 1) {
		let prev = lo;
		for (let i = s; i <= e; i++) {
			const remaining = e - i;
			const b = buttons[i];
			// Keep a value that still fits and leaves room for the rest.
			if (!(b.sequence > prev && b.sequence <= hi - 1 - remaining)) {
				b.sequence =
					hi === Infinity
						? prev + 10
						: prev +
							Math.max(1, Math.min(10, Math.floor((hi - prev) / (remaining + 2))));
			}
			prev = b.sequence;
		}
		return;
	}
	const used = new Set(buttons.filter((_, i) => i !== at).map((b) => b.sequence));
	let seq = (at > 0 ? buttons[at - 1].sequence : 0) + 1;
	while (used.has(seq)) seq++;
	buttons[at].sequence = seq;
}

/**
 * Gives the item at `at` a Sequence between its neighbours, renumbering the
 * ones `canRenumber` allows when there's no free value (#164): a duplicate
 * took its original's Sequence + 5, which could collide with another copy or
 * pass its next neighbour.
 */
function placeBetween<T extends { sequence: number }>(
	list: T[],
	at: number,
	canRenumber: (t: T) => boolean,
): void {
	const item = list[at];
	const seq = sequenceBetween(item.sequence, list[at - 1]?.sequence, list[at + 1]?.sequence);
	if (seq !== undefined) {
		item.sequence = seq;
		return;
	}
	resequenceAround(list, at, canRenumber);
	// No room between neighbours that can't be renumbered (out-of-the-box ones
	// one apart): it goes where its Sequence publishes it, not where it was put.
	const fits =
		(list[at - 1]?.sequence ?? -Infinity) < item.sequence &&
		item.sequence < (list[at + 1]?.sequence ?? Infinity);
	if (!fits) {
		list.splice(at, 1);
		const to = list.findIndex((t) => t.sequence > item.sequence);
		list.splice(to < 0 ? list.length : to, 0, item);
	}
}

/** The publisher prefix ids of new elements start with (#164). */
function sessionIdPrefix(): string {
	const { activeSolution, publisherPrefix } = useSessionStore.getState();
	return activeSolution?.publisherPrefix?.trim() || publisherPrefix?.trim() || "new";
}

/** `id` starting with the publisher prefix: a copy of another solution's element is yours (#164). */
function prefixedId(id: string, prefix: string): string {
	const lower = id.toLowerCase();
	const p = prefix.toLowerCase();
	return lower.startsWith(`${p}.`) || lower.startsWith(`${p}_`) ? id : `${prefix}.${id}`;
}

const EMPTY_RIBBONS: Record<RibbonLocation, RibbonDefinition> = {
	HomepageGrid: { location: "HomepageGrid", entityLogicalName: "", tabs: [] },
	SubGrid: { location: "SubGrid", entityLogicalName: "", tabs: [] },
	Form: { location: "Form", entityLogicalName: "", tabs: [] },
	Application: { location: "Application", entityLogicalName: "", tabs: [] },
};

/** A control of a group (top-level button or menu item, #27) in a mutable ribbon copy. */
function controlAt(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
	location: RibbonLocation,
	tabId: string,
	groupId: string,
	id: string,
): { group: RibbonGroup; button: RibbonButton } | undefined {
	const group = ribbons[location].tabs
		.find((t) => t.id === tabId)
		?.groups.find((g) => g.id === groupId);
	const button = findGroupControl(group, id);
	return group && button ? { group, button } : undefined;
}

/**
 * Whether a control is in the location's baseline (loaded, or published this
 * session): the publish can't change its kind (#154).
 */
export function isLoadedControl(
	state: Pick<RibbonStoreState, "baseline">,
	location: RibbonLocation,
	id: string,
): boolean {
	return (state.baseline[location]?.tabs ?? []).some((t) =>
		t.groups.some((g) => groupControls(g).some((b) => b.id === id)),
	);
}

function isReadOnlyGlobalOobButton(
	location: RibbonLocation,
	tabId: string,
	button: RibbonButton,
): boolean {
	return (
		location === "Application" &&
		tabId === "Mscrm.GlobalTab" &&
		button.oob === true &&
		button.custom !== true
	);
}

/**
 * Whether "Customise Button" (#26, #31) applies: a visible button that isn't
 * yours (your own can be changed and moved directly) and isn't a menu (menus
 * can't be published yet, #27).
 */
export function canCustomiseButton(
	location: RibbonLocation,
	tabId: string,
	button: RibbonButton,
): boolean {
	return (
		button.origin !== "unmanaged" &&
		!button.hidden &&
		button.kind !== "flyout" &&
		button.kind !== "splitButton" &&
		// Copied from its attributes, which would lose the XML of a read-only kind (#42).
		!isReadOnlyControlKind(button.kind) &&
		!isReadOnlyGlobalOobButton(location, tabId, button)
	);
}

/** The button with this id as loaded (baseline) at the location, if it was. */
function loadedButton(
	state: RibbonStoreState,
	location: RibbonLocation,
	id: string,
): RibbonButton | undefined {
	for (const t of state.baseline[location].tabs)
		for (const g of t.groups) {
			const b = g.buttons.find((x) => x.id === id);
			if (b) return b;
		}
	return undefined;
}

/** A drop that leaves the button where it is (on itself, or just before its next neighbour). */
function isMoveInPlace(group: RibbonGroup, src: DragSource, dst: DragTarget): boolean {
	if (src.location !== dst.location || src.tabId !== dst.tabId || src.groupId !== dst.groupId)
		return false;
	// In Sequence order, where moveButton places it (#194 review).
	const buttons = bySequence(group.buttons);
	const idx = buttons.findIndex((b) => b.id === src.buttonId);
	const next = buttons[idx + 1]?.id;
	return dst.beforeButtonId
		? dst.beforeButtonId === src.buttonId || dst.beforeButtonId === next
		: next === undefined;
}

const LOC_LABEL_TOKEN = /^\$LocLabels:/;

/**
 * The session's LocLabel ids, for telling another solution's labels on a copy
 * (#137); none while a layer is unread, so no token is kept then.
 */
export const loadedLabelIdsOf = (s: { locLabels: readonly LocLabel[]; labelsUnknown: boolean }) =>
	s.labelsUnknown ? undefined : new Set(s.locLabels.map((l) => l.id));

/**
 * The loaded source of a button for its copy: platform texts (`$Resources:`),
 * images and other attributes are kept so the copy looks the same, but
 * `$LocLabels:` tokens are not — those labels belong to the original, and
 * editing the copy's text must not change them (#11 review N5). Except another
 * solution's labels, whose text isn't loaded (#137): the generator gives the
 * copy a label of its own once its text is edited.
 */
function copySource(
	source: RibbonButton["source"],
	loadedLabelIds?: ReadonlySet<string>,
): RibbonButton["source"] {
	if (!source) return undefined;
	const keep = (token?: string) =>
		token && (!LOC_LABEL_TOKEN.test(token) || isOtherSolutionLabel(token, loadedLabelIds))
			? token
			: undefined;
	const attributes: Record<string, string> = {};
	for (const [k, v] of Object.entries(source.attributes)) {
		if (k !== "Id" && !LOC_LABEL_TOKEN.test(v)) attributes[k] = v;
	}
	return {
		...source,
		labelToken: keep(source.labelToken),
		tooltipTitleToken: keep(source.tooltipTitleToken),
		tooltipBodyToken: keep(source.tooltipBodyToken),
		attributes,
	};
}

const withoutCommand = (
	lists: Record<LayerScope, string[]>,
	commandId: string,
): Record<LayerScope, string[]> => ({
	entity: lists.entity.filter((id) => id !== commandId),
	application: lists.application.filter((id) => id !== commandId),
});

/** `commands` with `commandId` back to its loaded definition (the same array when unchanged). */
function loadedCommands(state: RibbonStoreState, commandId: string): CommandDefinition[] {
	const loaded = state.baselineCommands.find((c) => c.id === commandId);
	const current = state.commands.find((c) => c.id === commandId);
	if (!loaded || !current || JSON.stringify(loaded) === JSON.stringify(current))
		return state.commands;
	return state.commands.map((c) => (c.id === commandId ? JSON.parse(JSON.stringify(loaded)) : c));
}

export const useRibbonStore = create<RibbonStore>()(
	subscribeWithSelector((set, get) => ({
		ribbons: cloneRibbons(EMPTY_RIBBONS),
		baseline: cloneRibbons(EMPTY_RIBBONS),
		baselineCommands: [],
		baselineEnableRules: [],
		baselineDisplayRules: [],
		baselineLocLabels: [],
		layers: { ...NO_LAYERS },
		pendingUnhides: { entity: [], application: [] },
		orphans: { entity: [], application: [] },
		pendingOrphanDeletes: { entity: [], application: [] },
		baseLanguageCode: 1033,
		baseLanguageUnknown: false,
		labelsUnknown: false,
		customisedCommandIds: [],
		uncustomisedCommandIds: { entity: [], application: [] },
		reloadRequiredCommandIds: [],
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
		templates: [],
		conflicts: [],
		mutationsSincePublish: 0,
		past: [],
		future: [],

		loadRibbons(ribbons) {
			set({
				ribbons: cloneRibbons(ribbons),
				baseline: cloneRibbons(ribbons),
				mutationsSincePublish: 0,
				past: [],
				future: [],
			});
			// A load resets history: a batch it runs in starts over from it.
			if (openBatch) openBatch = { snapshot: workspaceOf(get()), meta: null };
		},

		setConflicts(entries) {
			set({ conflicts: entries });
		},

		applyImport(next, summary) {
			// One undo step for the canvas and the definitions together: #69's
			// workspace snapshots replace #30's per-definition restore.
			set((state) =>
				record(
					state,
					{
						ribbons: { ...state.ribbons, ...cloneRibbons(next.ribbons) },
						commands: [...next.commands],
						enableRules: [...next.enableRules],
						displayRules: [...next.displayRules],
						locLabels: [...next.locLabels],
					},
					historyMeta("imported", "RibbonDiffXml", summary, "arrow_upload", "success"),
				),
			);
		},

		loadWorkspace(seed) {
			const ribbons = cloneRibbons(seed.ribbons);
			set({
				ribbons,
				baseline: cloneRibbons(ribbons),
				commands: [...seed.commands],
				displayRules: [...seed.displayRules],
				enableRules: [...seed.enableRules],
				baselineCommands: JSON.parse(JSON.stringify(seed.commands)),
				baselineDisplayRules: JSON.parse(JSON.stringify(seed.displayRules)),
				baselineEnableRules: JSON.parse(JSON.stringify(seed.enableRules)),
				locLabels: [...seed.locLabels],
				baselineLocLabels: JSON.parse(JSON.stringify(seed.locLabels)),
				layers: { ...NO_LAYERS, ...(seed.layers ?? {}) },
				pendingUnhides: { ...NO_UNHIDES },
				orphans: { entity: [], application: [], ...(seed.orphans ?? {}) },
				pendingOrphanDeletes: { ...NO_UNHIDES },
				baseLanguageCode: seed.baseLanguageCode ?? 1033,
				baseLanguageUnknown: seed.baseLanguageUnknown ?? false,
				labelsUnknown: seed.labelsUnknown ?? false,
				customisedCommandIds: [],
				uncustomisedCommandIds: { entity: [], application: [] },
				reloadRequiredCommandIds: [],
				templates: [...(seed.templates ?? [])],
				conflicts: [...(seed.conflicts ?? [])],
				mutationsSincePublish: 0,
				past: [],
				future: [],
			});
			if (openBatch) openBatch = { snapshot: workspaceOf(get()), meta: null };
		},

		restoreWorkspace(workspace, detail) {
			const copy: WorkspaceSnapshot = JSON.parse(JSON.stringify(workspace));
			set((state) => {
				// An un-hide of a hide the layer no longer has would publish nothing.
				const stillHidden = (scope: LayerScope) => {
					const snap = state.layers[scope];
					return snap
						? copy.pendingUnhides[scope].filter((id) =>
								snap.hides.some((h) => h.location === id),
							)
						: copy.pendingUnhides[scope];
				};
				const change = {
					...copy,
					pendingUnhides: {
						entity: stillHidden("entity"),
						application: stillHidden("application"),
					},
				};
				// Nothing to restore (the server has it all): not a change.
				if (
					JSON.stringify(workspaceOf({ ...state, ...change })) ===
					JSON.stringify(workspaceOf(state))
				)
					return state;
				return record(
					state,
					change,
					historyMeta("restored", "unsaved changes", detail, "history"),
				);
			});
		},

		resetWorkspace() {
			get().loadWorkspace({
				ribbons: EMPTY_RIBBONS,
				commands: [],
				displayRules: [],
				enableRules: [],
				locLabels: [],
			});
		},

		undo() {
			get().restore(get().past.length - 1);
		},

		redo() {
			const state = get();
			if (state.future.length === 0 || openBatch) return;
			const [entry, ...rest] = state.future;
			set({
				...entry.snapshot,
				past: [...state.past, { ...entry, snapshot: workspaceOf(state) }],
				future: rest,
				mutationsSincePublish: hasPendingChanges({ ...state, ...entry.snapshot })
					? state.mutationsSincePublish + 1
					: 0,
			});
		},

		restore(index) {
			// Back to the workspace before entry `index`: the same as undoing each
			// later step (in one update), so the steps stay redoable and baselines
			// are untouched.
			const state = get();
			const { past } = state;
			if (index < 0 || index >= past.length || openBatch) return;
			let workspace = workspaceOf(state);
			let future = state.future;
			for (let i = past.length - 1; i >= index; i--) {
				// An undone step never absorbs later typing.
				future = [{ ...past[i], coalesceKey: undefined, snapshot: workspace }, ...future];
				workspace = past[i].snapshot;
			}
			const steps = past.length - index;
			set({
				...workspace,
				past: past.slice(0, index),
				future,
				mutationsSincePublish: hasPendingChanges({ ...state, ...workspace })
					? Math.max(1, state.mutationsSincePublish - steps)
					: 0,
			});
		},

		batch(fn) {
			if (openBatch) {
				fn();
				return;
			}
			openBatch = { snapshot: workspaceOf(get()), meta: null };
			try {
				fn();
			} finally {
				const { snapshot, meta } = openBatch;
				openBatch = null;
				if (meta) set((state) => historyAfter(state, meta, () => snapshot));
			}
		},

		beginEditSession() {
			openSession = `session:${++sessions}`;
		},

		endEditSession() {
			openSession = null;
		},

		moveButton(src, dst) {
			// A loaded button that isn't yours can't be moved in place (its
			// CustomAction isn't in your layer): move a copy of your own and hide
			// the original instead — Ribbon Workbench's "Customise Button" — as
			// one undo step (#26).
			const state = get();
			const srcTab = state.ribbons[src.location].tabs.find((t) => t.id === src.tabId);
			const srcGroup = srcTab?.groups.find((g) => g.id === src.groupId);
			const original = srcGroup?.buttons.find((b) => b.id === src.buttonId);
			const dstGroup = state.ribbons[dst.location].tabs
				.find((t) => t.id === dst.tabId)
				?.groups.find((g) => g.id === dst.groupId);
			if (!original || !srcGroup || !dstGroup) return null;
			// Judged by the origin it was loaded with, as publish does: "Create
			// override…" makes the current origin unmanaged, but the button is
			// still not in your layer. Only when the origin is known (provenance
			// sets it on load).
			const loadedOrigin = loadedButton(state, src.location, original.id)?.origin;
			const notYours = loadedOrigin !== undefined && loadedOrigin !== "unmanaged";
			if (
				notYours &&
				!original.menu &&
				!isMenuKind(original.kind) &&
				!isReadOnlyGlobalOobButton(src.location, src.tabId, original)
			) {
				if (isMoveInPlace(srcGroup, src, dst)) return null;
				const refuse = (why: string) => {
					useRuntimeLogStore
						.getState()
						.logWarn("ribbon", `Can't move ${original.id}: ${why}`);
					return null;
				};
				// Already customised (or hidden otherwise): its copy is what moves.
				if (original.hidden) return refuse("it's hidden — move your copy of it instead.");
				// A copy belongs in the same ribbon as the original: the table's
				// commands and rules aren't in the application ribbon, nor the reverse.
				if ((src.location === "Application") !== (dst.location === "Application"))
					return refuse(
						"it isn't yours, and a copy can't move between the table's ribbon and the application ribbon.",
					);
				const prefix = sessionIdPrefix();
				let moved: string | null = null;
				let copied = false;
				get().batch(() => {
					const copyId = get().customiseButton(
						src.location,
						src.tabId,
						src.groupId,
						src.buttonId,
						prefix,
					);
					if (!copyId) return;
					copied = true;
					moved = get().moveButton({ ...src, buttonId: copyId }, dst);
					useRuntimeLogStore
						.getState()
						.logInfo(
							"ribbon",
							`${original.id} isn't yours, so it can't be moved: moved your copy ${copyId} instead and hid the original.`,
						);
				});
				// Copied but not moved (can't happen with the destination checked
				// above): don't leave the copy and the hide behind.
				if (copied && !moved) get().undo();
				if (!copied)
					return refuse(
						"it isn't yours and can't be copied (e.g. it has an override of its command); undo the override, then move it.",
					);
				return moved;
			}
			// Read-only global buttons don't move (and don't make an empty history entry).
			if (isReadOnlyGlobalOobButton(src.location, src.tabId, original)) return null;
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[src.location].tabs.find((t) => t.id === src.tabId);
						if (!tab) return;
						const srcGroup = tab.groups.find((g) => g.id === src.groupId);
						if (!srcGroup) return;
						const btnIdx = srcGroup.buttons.findIndex((b) => b.id === src.buttonId);
						if (btnIdx === -1) return;
						if (
							isReadOnlyGlobalOobButton(
								src.location,
								src.tabId,
								srcGroup.buttons[btnIdx],
							)
						)
							return;
						// Resolve the destination before taking the button out of its
						// group: a missing destination must not lose the button.
						const dstTab =
							src.tabId === dst.tabId && src.location === dst.location
								? tab
								: ribbons[dst.location].tabs.find((t) => t.id === dst.tabId);
						const dstGroup = dstTab?.groups.find((g) => g.id === dst.groupId);
						if (!dstGroup) return;
						const [button] = srcGroup.buttons.splice(btnIdx, 1);
						// Placed among the destination's controls in Sequence order, the
						// order Unified Interface (and the Structure tree and group cards)
						// show; the load keeps the XML's order, which can differ (#194).
						dstGroup.buttons.sort((a, b) => a.sequence - b.sequence);
						const insertIdx = dst.beforeButtonId
							? dstGroup.buttons.findIndex((b) => b.id === dst.beforeButtonId)
							: dstGroup.buttons.length;
						const at = insertIdx < 0 ? dstGroup.buttons.length : insertIdx;
						dstGroup.buttons.splice(at, 0, button);
						const seq = sequenceBetween(
							button.sequence,
							dstGroup.buttons[at - 1]?.sequence,
							dstGroup.buttons[at + 1]?.sequence,
						);
						if (seq !== undefined) {
							button.sequence = seq;
						} else {
							// No free sequence between the neighbours: re-number the
							// buttons CBS can re-sequence — your own (the layer adds
							// them) and ones created this session.
							const own = new Set(
								state.layers[
									dst.location === "Application" ? "application" : "entity"
								]?.controlIds ?? [],
							);
							const loaded = new Set(
								state.baseline[dst.location].tabs.flatMap((t) =>
									t.groups.flatMap((g) => g.buttons.map((b) => b.id)),
								),
							);
							resequenceAround(
								dstGroup.buttons,
								at,
								(b) => b === button || own.has(b.id) || !loaded.has(b.id),
							);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "moved",
						target: src.buttonId,
						detail: `to ${dst.groupId}`,
						icon: "arrow_move",
						color: "info",
					},
				),
			);
			return src.buttonId;
		},

		setButtonProp(location, tabId, groupId, buttonId, patch) {
			// Typing in a text field is one undo step; toggles and numbers are not merged.
			const typed = Object.values(patch).every((v) => typeof v === "string");
			const coalesceKey = typed
				? `button:${location}:${buttonId}:${Object.keys(patch).sort().join(",")}`
				: undefined;
			set((state) => {
				// A loaded control keeps its kind, and a menu item can only be a
				// button or a flyout (#154). A refused kind-only edit isn't recorded.
				const kindAllowed = (ribbons: Record<RibbonLocation, RibbonDefinition>) => {
					const at = controlAt(ribbons, location, tabId, groupId, buttonId);
					return (
						!at ||
						patch.kind === undefined ||
						patch.kind === at.button.kind ||
						(!isLoadedControl(state, location, buttonId) &&
							(at.group.buttons.includes(at.button) ||
								MENU_ITEM_KINDS.includes(patch.kind)))
					);
				};
				if (Object.keys(patch).length === 1 && !kindAllowed(state.ribbons)) return {};
				return commitMutation(
					state,
					(ribbons) => {
						const button = controlAt(
							ribbons,
							location,
							tabId,
							groupId,
							buttonId,
						)?.button;
						if (!button) return;
						if (isReadOnlyGlobalOobButton(location, tabId, button)) return;
						const before = button.kind;
						const allowed = kindAllowed(ribbons);
						Object.assign(button, patch);
						if (!allowed) button.kind = before;
						// A button turned into a flyout / split button gets an (empty) menu.
						if (isMenuKind(button.kind) && !button.menu)
							button.menu = newMenu(button.id);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: patch.label ?? buttonId,
						detail: Object.keys(patch).join(", "),
						icon: "edit",
						color: "info",
					},
					coalesceKey,
				);
			});
		},

		deleteButton(location, tabId, groupId, buttonId) {
			// Only your own controls (#17): publish can't remove the others, so the
			// canvas and Dataverse would disagree. They can be hidden instead.
			const current = get();
			const button = controlAt(current.ribbons, location, tabId, groupId, buttonId)?.button;
			if (button && !canDeleteControl(button, current.baseline[location])) {
				useRuntimeLogStore
					.getState()
					.logWarn(
						"ribbon",
						`"${button.label}" (${buttonId}) was not deleted: only your own buttons can be deleted — hide it instead.`,
					);
				return;
			}
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const found = controlAt(ribbons, location, tabId, groupId, buttonId);
						if (!found) return;
						const { group, button } = found;
						if (isReadOnlyGlobalOobButton(location, tabId, button)) return;
						// A menu item leaves its menu section (#27).
						if (!removeMenuItem(group, buttonId))
							group.buttons = group.buttons.filter((b) => b.id !== buttonId);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: buttonId,
						detail: groupId,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		addMenuItem({ location, tabId, groupId, parentId, sectionId, item }) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(
							ribbons,
							location,
							tabId,
							groupId,
							parentId,
						)?.button;
						if (!parent || isReadOnlyGlobalOobButton(location, tabId, parent)) return;
						parent.menu = parent.menu ?? newMenu(parent.id);
						if (parent.menu.sections.length === 0)
							parent.menu.sections.push(newMenuSection(parent.id, []));
						const section =
							parent.menu.sections.find((s) => s.id === sectionId) ??
							parent.menu.sections[0];
						const last = section.controls[section.controls.length - 1]?.sequence ?? 0;
						section.controls.push({
							...item,
							kind: item.kind ?? "button",
							sequence: item.sequence ?? last + 10,
							// Menu items take their size from the section's DisplayMode.
							templateAlias: item.templateAlias ?? "",
							hidden: false,
							oob: false,
							custom: true,
							managed: false,
							origin: "unmanaged",
						});
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: item.label,
						detail: `menu of ${parentId}`,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		addMenuSection(location, tabId, groupId, parentId, title) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(
							ribbons,
							location,
							tabId,
							groupId,
							parentId,
						)?.button;
						if (!parent || isReadOnlyGlobalOobButton(location, tabId, parent)) return;
						parent.menu = parent.menu ?? { id: `${parent.id}.Menu`, sections: [] };
						parent.menu.sections.push(
							newMenuSection(parent.id, parent.menu.sections, title),
						);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: title ?? "Menu section",
						detail: `menu of ${parentId}`,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		setMenuSectionProp(location, tabId, groupId, parentId, sectionId, patch) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(
							ribbons,
							location,
							tabId,
							groupId,
							parentId,
						)?.button;
						const section = parent?.menu?.sections.find((s) => s.id === sectionId);
						if (
							!parent ||
							!section ||
							isReadOnlyGlobalOobButton(location, tabId, parent)
						)
							return;
						Object.assign(section, patch);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: sectionId,
						detail: Object.keys(patch).join(", "),
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteMenuSection(location, tabId, groupId, parentId, sectionId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(
							ribbons,
							location,
							tabId,
							groupId,
							parentId,
						)?.button;
						if (!parent?.menu || isReadOnlyGlobalOobButton(location, tabId, parent))
							return;
						parent.menu.sections = parent.menu.sections.filter(
							(s) => s.id !== sectionId,
						);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: sectionId,
						detail: `menu of ${parentId}`,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		duplicateButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const found = controlAt(ribbons, location, tabId, groupId, buttonId);
						if (found) {
							const { group, button: btn } = found;
							if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
							// The copy is a new control: it must not reuse the original's
							// LocLabel tokens / attributes (#11 review N5) — only its icon
							// (#60, copyControl) — and its menu gets ids of its own (#27).
							// A platform text (`$Resources:`) can't take a " (copy)" suffix:
							// the copy keeps it as it is (#86).
							const loadedLabelIds = loadedLabelIdsOf(state);
							const platformLabel =
								isPlatformText(btn.source?.labelToken) ||
								isOtherSolutionLabel(btn.source?.labelToken, loadedLabelIds);
							const copy: RibbonButton = {
								...copyControl(
									btn,
									`${prefixedId(btn.id, sessionIdPrefix())}_copy_${Date.now()}`,
									loadedLabelIds,
								),
								// A read-only kind is copied as loaded (#42), and a platform text
								// (`$Resources:`) or another solution's label (#137) can't take a
								// " (copy)" suffix (#86): both keep their label.
								label:
									isReadOnlyControlKind(btn.kind) || platformLabel
										? btn.label
										: `${btn.label} (copy)`,
								sequence: btn.sequence,
							};
							const place = menuItemPlace(group, buttonId);
							const list = place ? place.section.controls : group.buttons;
							const idx = list.findIndex((b) => b.id === buttonId);
							list.splice(idx + 1, 0, copy);
							// Right after the original, before its next neighbour (#164).
							const own = new Set(scopeLayer(state, location)?.controlIds ?? []);
							const loaded = new Set(
								(state.baseline[location]?.tabs ?? [])
									.flatMap((t) => t.groups.flatMap(groupControls))
									.map((b) => b.id),
							);
							placeBetween(
								list,
								idx + 1,
								(b) => b === copy || own.has(b.id) || !loaded.has(b.id),
							);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "duplicated",
						target: buttonId,
						detail: groupId,
						icon: "copy",
						color: "info",
					},
				),
			);
		},

		createButton({ tabId, groupId, location, button }) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (group) {
							// A new button goes after the group's last one, with a sequence
							// no other button of the group has (two new buttons both got 50).
							const used = new Set(group.buttons.map((b) => b.sequence));
							const after = Math.max(0, ...group.buttons.map((b) => b.sequence)) + 10;
							const sequence =
								button.sequence !== undefined && !used.has(button.sequence)
									? button.sequence
									: after;
							const newBtn: RibbonButton = {
								...button,
								id: button.id ?? `new_${Date.now()}`,
								label: button.label ?? "New Button",
								kind: button.kind ?? "button",
								sequence,
								templateAlias: button.templateAlias ?? "o1",
								commandId: button.commandId ?? "",
								hidden: button.hidden ?? false,
								oob: false,
								custom: true,
								managed: false,
								origin: "unmanaged",
							};
							if (isMenuKind(newBtn.kind) && !newBtn.menu)
								newBtn.menu = newMenu(newBtn.id);
							group.buttons.push(newBtn);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: button.label ?? "New Button",
						detail: groupId,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		createGroup({ tabId, location, group }) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) {
							// Same id scheme as new buttons and tabs:
							// {prefix}.{table}.{Location}.{Label}.Group, unique in the workspace.
							const ribbon = ribbons[location];
							const table =
								location === "Application" ? "global" : ribbon.entityLogicalName;
							const newGroup: RibbonGroup = {
								id:
									group.id ??
									generateRibbonId(
										table,
										`${location}.${group.label ?? "New Group"}`,
										"Group",
										workspaceIds(state, ribbons),
									),
								label: group.label ?? "New Group",
								sequence:
									group.sequence !== undefined &&
									!tab.groups.some((g) => g.sequence === group.sequence)
										? group.sequence
										: Math.max(0, ...tab.groups.map((g) => g.sequence)) + 10,
								template: group.template ?? "Flexible2",
								buttons: group.buttons ?? [],
							};
							tab.groups.push(newGroup);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: group.label ?? "New Group",
						detail: tabId,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		renameGroup(location, tabId, groupId, newLabel) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (group) group.label = newLabel;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "renamed",
						target: groupId,
						detail: newLabel,
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		duplicateGroup(location, tabId, groupId) {
			// The copy's id and title, when it kept a title it can't rename once published.
			let keptTitle: { copyId: string; title: string } | null = null;
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (!tab) return;
						const grp = tab.groups.find((g) => g.id === groupId);
						if (!grp) return;
						const stamp = `_copy_${Date.now()}`;
						const prefix = sessionIdPrefix();
						const loadedLabelIds = loadedLabelIdsOf(state);
						const lang = state.baseLanguageCode;
						// The group's Title as loaded: an imported group (#30) keeps it in
						// source while its label is still the token's text; a loaded one has
						// the token as its label.
						const imported = grp.source?.titleToken;
						const title =
							imported !== undefined &&
							resolveDisplayLabel(imported, state.locLabels, lang) === grp.label
								? imported
								: grp.label;
						// A platform text (`$Resources:`) or another solution's label (#137)
						// can't take a " (copy)" suffix — the copy took the key itself as its
						// literal title ("Ribbon.HomepageGrid.MainTab.Management (copy)"). Like
						// a copied button (#86), it keeps the token, so it shows the same text.
						const keepTitle =
							isPlatformText(title) || isOtherSolutionLabel(title, loadedLabelIds);
						const copy: RibbonGroup = {
							...JSON.parse(JSON.stringify(grp)),
							id: `${prefixedId(grp.id, prefix)}${stamp}`,
							// Otherwise the title's text (#33) plus " (copy)": a `$LocLabels:`
							// token never becomes part of the copy's title text.
							label: keepTitle
								? resolveDisplayLabel(title, state.locLabels, lang)
								: `${resolveDisplayLabel(grp.label, state.locLabels, lang)} (copy)`,
							// The copy must not reuse an imported group's other attributes (#30),
							// nor its Description (#42); a kept title is its only token.
							source: keepTitle ? { titleToken: title, attributes: {} } : undefined,
							description: undefined,
							sequence: grp.sequence,
							buttons: grp.buttons.map((b) =>
								copyControl(
									b,
									`${prefixedId(b.id, prefix)}${stamp}`,
									loadedLabelIds,
								),
							),
						};
						const idx = tab.groups.findIndex((g) => g.id === groupId);
						tab.groups.splice(idx + 1, 0, copy);
						// Right after the original, before its next neighbour (#164). Only the
						// copy and new groups are renumbered: a loaded group's Sequence change
						// wouldn't publish.
						const loadedGroups = new Set(
							(state.baseline[location]?.tabs ?? []).flatMap((t) =>
								t.groups.map((g) => g.id),
							),
						);
						placeBetween(
							tab.groups,
							idx + 1,
							(g) => g === copy || !loadedGroups.has(g.id),
						);
						if (keepTitle) keptTitle = { copyId: copy.id, title };
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "duplicated",
						target: groupId,
						detail: tabId,
						icon: "copy",
						color: "info",
					},
				),
			);
			if (keptTitle) {
				const { copyId, title } = keptTitle;
				useRuntimeLogStore
					.getState()
					.logInfo(
						"ribbon",
						`Duplicate group ${groupId}: the copy ${copyId} keeps its title ${title}, which comes from ` +
							`${isPlatformText(title) ? "the platform" : "another solution"} and can't take " (copy)". ` +
							`Rename the copy before you publish if it should read differently: once published, only titles of your own can be renamed.`,
					);
			}
		},

		setGroupTemplate(location, tabId, groupId, template) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (group) group.template = template;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: groupId,
						detail: `template → ${template}`,
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteGroup(location, tabId, groupId) {
			// Only your own group, holding only your own controls (#17 review).
			const current = get();
			const group = current.ribbons[location].tabs
				.find((t) => t.id === tabId)
				?.groups.find((g) => g.id === groupId);
			if (
				group &&
				!canDeleteGroup(
					group,
					current.baseline[location],
					ownContainerIds(current, location),
				)
			) {
				useRuntimeLogStore
					.getState()
					.logWarn(
						"ribbon",
						`Group "${group.label}" (${groupId}) was not deleted: only your own groups, with only your own buttons in them, can be deleted — hide its buttons instead.`,
					);
				return;
			}
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) tab.groups = tab.groups.filter((g) => g.id !== groupId);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: groupId,
						detail: tabId,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		createTab(location, tabDef) {
			set((state) => {
				// A tab id must be unique: a second tab with the same id was silently
				// merged into the first (#66 review M3).
				if (tabDef.id && workspaceIds(state, state.ribbons).has(tabDef.id)) return {};
				return commitMutation(
					state,
					(ribbons) => {
						const ribbon = ribbons[location];
						const table =
							location === "Application" ? "global" : ribbon.entityLogicalName;
						const id =
							tabDef.id ??
							generateRibbonId(
								table,
								`${location}.${tabDef.label ?? "New Tab"}`,
								"Tab",
								workspaceIds(state, ribbons),
							);
						// A tab is shown only where a TabDisplayRule bound to its Command
						// allows it (#58), so a new table tab starts with the rule for the
						// location it was added to; the user can change it in Tab rules.
						const commandId = newTabCommandId({ ...tabDef, id } as RibbonTab);
						const newTab: RibbonTab = {
							id,
							label: tabDef.label ?? "New Tab",
							// After the location's last tab, never sharing a sequence (#66 review t4).
							sequence:
								tabDef.sequence !== undefined &&
								!ribbon.tabs.some((t) => t.sequence === tabDef.sequence)
									? tabDef.sequence
									: Math.max(0, ...ribbon.tabs.map((t) => t.sequence)) + 10,
							commandId,
							tabDisplayRules: tabDef.tabDisplayRules?.length
								? tabDef.tabDisplayRules
								: defaultTabDisplayRules(
										location,
										ribbon.entityLogicalName,
										commandId,
									),
							groups: [],
						};
						ribbon.tabs.push(newTab);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: tabDef.label ?? "New Tab",
						detail: location,
						icon: "add",
						color: "success",
					},
				);
			});
		},

		renameTab(location, tabId, newLabel) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) tab.label = newLabel;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "renamed",
						target: tabId,
						detail: newLabel,
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteTab(location, tabId) {
			// Only your own tab, holding only your own groups and controls (#17 review).
			const current = get();
			const tab = current.ribbons[location].tabs.find((t) => t.id === tabId);
			if (
				tab &&
				!canDeleteTab(tab, current.baseline[location], ownContainerIds(current, location))
			) {
				useRuntimeLogStore
					.getState()
					.logWarn(
						"ribbon",
						`Tab "${tab.label}" (${tabId}) was not deleted: only your own tabs, with only your own groups and buttons in them, can be deleted.`,
					);
				return;
			}
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						ribbons[location].tabs = ribbons[location].tabs.filter(
							(t) => t.id !== tabId,
						);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: tabId,
						detail: location,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		reorderTabs(location, tabIds) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tabs = ribbons[location].tabs;
						const ordered = tabIds
							.map((id) => tabs.find((t) => t.id === id))
							.filter((t): t is RibbonTab => t !== undefined);
						ribbons[location].tabs = ordered;
						// The Sequence decides the order Dataverse shows (#163): a dragged
						// tab got none, so the publish had nothing to publish. A new tab,
						// or one your customizations add, is renumbered to sit between its
						// neighbours; another solution's can't be, and the publish says so.
						const loaded = new Set(
							state.baseline[location]?.tabs.map((t) => t.id) ?? [],
						);
						const own = new Set(ownContainerIds(state, location) ?? []);
						resequenceOrder(ordered, (t) => !loaded.has(t.id) || own.has(t.id));
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "reordered",
						target: "Tabs",
						detail: location,
						icon: "arrow_sort",
						color: "info",
					},
				),
			);
		},

		moveGroup(location, tabId, groupId, by) {
			const state = get();
			if (!canMoveGroup(state, location, tabId, groupId, by)) return;
			const label =
				state.ribbons[location].tabs
					.find((t) => t.id === tabId)
					?.groups.find((g) => g.id === groupId)?.label ?? groupId;
			set((s) =>
				commitMutation(
					s,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (!tab) return;
						// Moved among the groups as shown: in Sequence order.
						tab.groups.sort((a, b) => a.sequence - b.sequence);
						const from = tab.groups.findIndex((g) => g.id === groupId);
						const [group] = tab.groups.splice(from, 1);
						tab.groups.splice(from + by, 0, group);
						// As for tabs (#163): the Sequence orders groups in Dataverse.
						const canRenumber = groupRenumberable(s, location);
						resequenceOrder(tab.groups, canRenumber);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "reordered",
						target: label,
						detail: by < 0 ? "Moved left" : "Moved right",
						icon: "arrow_sort",
						color: "info",
					},
				),
			);
		},

		setTabDisplayRules(location, tabId, rules) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) tab.tabDisplayRules = rules;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: `${tabId} display rules`,
						detail: `${rules.length} rule(s)`,
						icon: "eye",
						color: "info",
					},
				),
			);
		},

		setScaling(location, tabId, scaling) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const ribbon = ribbons[location];
						ribbon.scalingByTab = ribbon.scalingByTab ?? {};
						ribbon.scalingByTab[tabId] = {
							tabId,
							maxSizes: [...scaling.maxSizes],
							scales: [...scaling.scales],
						};
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: `${tabId} scaling`,
						detail: `${scaling.maxSizes.length} MaxSize, ${scaling.scales.length} Scale`,
						icon: "resize",
						color: "info",
					},
				),
			);
		},

		hideOobButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const btn = controlAt(ribbons, location, tabId, groupId, buttonId)?.button;
						if (!btn) return;
						if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
						btn.hidden = true;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "hid",
						target: buttonId,
						detail: groupId,
						icon: "eye_off",
						color: "warn",
					},
				),
			);
		},

		customizeOobButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const btn = controlAt(ribbons, location, tabId, groupId, buttonId)?.button;
						if (btn) {
							if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
							// Creating an override makes this an unmanaged customization
							// layered over the OOB/managed original (same id).
							btn.oob = false;
							btn.custom = true;
							btn.managed = false;
							btn.origin = "unmanaged";
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "customized",
						target: buttonId,
						detail: "OOB override",
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		customiseButton(location, tabId, groupId, buttonId, idPrefix) {
			const state = get();
			const btn = state.ribbons[location].tabs
				.find((t) => t.id === tabId)
				?.groups.find((g) => g.id === groupId)
				?.buttons.find((b) => b.id === buttonId);
			if (!btn || !canCustomiseButton(location, tabId, btn)) return null;
			// Unique in the workspace, baseline and layers too (#66 review m1).
			const taken = workspaceIds(state, state.ribbons);
			const base = `${(idPrefix || "new").trim()}.${btn.id}`;
			let id = base;
			for (let n = 2; taken.has(id); n++) id = `${base}.${n}`;
			// Texts from the original's own LocLabels: the copy gets its own
			// labels with every language of the original's (the generator writes
			// the base language from the text and keeps the others). Another
			// solution's label isn't loaded: the copy keeps using it (#137).
			const labels: LocLabel[] = [];
			const shared: string[] = [];
			const loadedLabelIds = loadedLabelIdsOf(state);
			const texts: [string | undefined, string][] = [
				[btn.source?.labelToken, buttonLabelId(id)],
				[btn.source?.tooltipTitleToken, buttonTooltipTitleId(id)],
				[btn.source?.tooltipBodyToken, buttonTooltipBodyId(id)],
			];
			for (const [token, labelId] of texts) {
				if (!token || !LOC_LABEL_TOKEN.test(token)) continue;
				const original = state.locLabels.find(
					(l) => l.id === token.replace(LOC_LABEL_TOKEN, ""),
				);
				if (original)
					labels.push({ id: labelId, titles: original.titles.map((t) => ({ ...t })) });
				else if (isOtherSolutionLabel(token, loadedLabelIds)) shared.push(token);
			}
			if (shared.length > 0) {
				useRuntimeLogStore
					.getState()
					.logInfo(
						"ribbon",
						`Customise button ${btn.id}: ${shared.join(", ")} ${shared.length === 1 ? "is" : "are"} defined by another solution, ` +
							`so the copy ${id} uses ${shared.length === 1 ? "it" : "them"} too. Edit the copy's text to give it a label of its own.`,
					);
			}
			const labelIds = new Set(labels.map((l) => l.id));
			set((s) => {
				const ribbons = cloneRibbons(s.ribbons);
				const group = ribbons[location].tabs
					.find((t) => t.id === tabId)
					?.groups.find((g) => g.id === groupId);
				const idx = group?.buttons.findIndex((b) => b.id === buttonId) ?? -1;
				if (!group || idx < 0) return {};
				const original = group.buttons[idx];
				const copy: RibbonButton = {
					...original,
					id,
					source: copySource(original.source, loadedLabelIds),
					hidden: false,
					custom: true,
					oob: false,
					managed: false,
					origin: "unmanaged",
					solutionName: undefined,
					publisherName: undefined,
				};
				// The copy takes the original's place: right after it (its own
				// Sequence when one is free before the next button, else the
				// original's — the original is hidden, so they never show together).
				const next = group.buttons[idx + 1]?.sequence;
				if (next === undefined || original.sequence + 1 < next)
					copy.sequence = original.sequence + 1;
				original.hidden = true;
				group.buttons.splice(idx + 1, 0, copy);
				// The copy, the hidden original and the copy's labels are one undo step (#34).
				return record(
					s,
					{
						ribbons,
						...(labels.length > 0
							? {
									locLabels: [
										...s.locLabels.filter((l) => !labelIds.has(l.id)),
										...labels,
									],
								}
							: {}),
					},
					historyMeta(
						"customised",
						buttonId,
						`copied to ${id}, original hidden` +
							(shared.length > 0 ? " (keeps another solution's labels)" : ""),
						"copy",
					),
				);
			});
			return id;
		},

		customiseCommand(commandId) {
			const state = get();
			if (!state.commands.some((c) => c.id === commandId)) return false;
			if (state.reloadRequiredCommandIds.includes(commandId)) return false;
			set((s) =>
				record(
					s,
					{
						customisedCommandIds: [
							...s.customisedCommandIds.filter((id) => id !== commandId),
							commandId,
						],
						uncustomisedCommandIds: withoutCommand(s.uncustomisedCommandIds, commandId),
					},
					historyMeta(
						"customised",
						commandId,
						"command copied to your layer on publish",
						"code",
					),
				),
			);
			return true;
		},

		uncustomiseCommand(commandId, scope) {
			set((s) =>
				record(
					s,
					{
						commands: loadedCommands(s, commandId),
						customisedCommandIds: s.customisedCommandIds.filter(
							(id) => id !== commandId,
						),
						uncustomisedCommandIds: {
							...withoutCommand(s.uncustomisedCommandIds, commandId),
							[scope]: [
								...s.uncustomisedCommandIds[scope].filter((id) => id !== commandId),
								commandId,
							],
						},
					},
					historyMeta(
						"uncustomised",
						commandId,
						`command removed from the ${scope === "entity" ? "table's" : "application ribbon's"} layer on publish`,
						"arrow_undo",
					),
				),
			);
		},

		discardCommandChanges(commandId) {
			const state = get();
			const commands = loadedCommands(state, commandId);
			const changed =
				commands !== state.commands ||
				state.customisedCommandIds.includes(commandId) ||
				state.uncustomisedCommandIds.entity.includes(commandId) ||
				state.uncustomisedCommandIds.application.includes(commandId);
			if (!changed) return;
			set((s) =>
				record(
					s,
					{
						commands,
						customisedCommandIds: s.customisedCommandIds.filter(
							(id) => id !== commandId,
						),
						uncustomisedCommandIds: withoutCommand(s.uncustomisedCommandIds, commandId),
					},
					historyMeta("discarded", commandId, "command changes", "arrow_undo"),
				),
			);
		},

		setOpenRecordOverride(location, enabled, idPrefix) {
			if (!OPEN_RECORD_ITEM_LOCATIONS.includes(location)) return false;
			const state = get();
			const ribbon = state.ribbons[location];
			const carriers = openRecordCarriers(ribbon);
			if (enabled) {
				if (carriers.length > 0) return true;
				const at = openRecordCarrierPlacement(ribbon);
				if (!at) return false;
				const taken = workspaceIds(state, state.ribbons);
				for (const c of state.commands) taken.add(c.id);
				const { id } = newButtonIds(
					idPrefix,
					ribbon.entityLogicalName,
					location,
					"OpenRecordItem",
					taken,
				);
				get().batch(() => {
					get().createButton({
						location,
						tabId: at.tabId,
						groupId: at.groupId,
						button: {
							id,
							label: "Open record",
							tooltipTitle: "Open record",
							tooltipBody: `Runs the table's ${OPEN_RECORD_ITEM_COMMAND_ID} action for the selected row, as opening a row does.`,
							kind: "button",
							templateAlias: "o1",
							commandId: OPEN_RECORD_ITEM_COMMAND_ID,
							hidden: false,
							oob: false,
							custom: true,
							managed: false,
						},
					});
					if (!get().commands.some((c) => c.id === OPEN_RECORD_ITEM_COMMAND_ID)) {
						get().upsertCommand(defaultOpenRecordCommand());
					}
				});
				return true;
			}
			if (carriers.length === 0) return true;
			// Provenance not resolved yet ("unknown") or another solution's: not deleted.
			if (carriers.some((c) => openRecordCarrierOwnership(c) !== "yours")) return false;
			get().batch(() => {
				// Only the carriers the switch created: a button of your own that
				// uses the command stays (#22 review).
				for (const c of carriers)
					get().deleteButton(location, c.tabId, c.groupId, c.button.id);
				const s = get();
				const inUse = Object.values(s.ribbons).some(
					(r) => openRecordCommandUsers(r).length > 0,
				);
				// A command the layer defines stays in the session: the publish
				// removes it from the layer together with the last button using it.
				if (
					!inUse &&
					!s.baselineCommands.some((c) => c.id === OPEN_RECORD_ITEM_COMMAND_ID)
				) {
					set((st) =>
						record(
							st,
							{
								commands: st.commands.filter(
									(c) => c.id !== OPEN_RECORD_ITEM_COMMAND_ID,
								),
							},
							historyMeta(
								"removed",
								OPEN_RECORD_ITEM_COMMAND_ID,
								"grid open override",
								"delete",
								"danger",
							),
						),
					);
				}
			});
			return true;
		},

		hideWithDisplayRules(buttonCommandId) {
			const cmd = buttonCommandId
				? get().commands.find((c) => c.id === buttonCommandId)
				: undefined;
			if (!cmd) return false;
			const displayRules = [...cmd.displayRules];
			for (const id of HIDE_DISPLAY_RULES)
				if (!displayRules.includes(id)) displayRules.push(id);
			set((state) => {
				const commands = upsertById(state.commands, { ...cmd, displayRules });
				if (!commands) return state;
				return record(
					state,
					{ commands },
					historyMeta("hid", cmd.id, "with display rules", "eye_off", "warn"),
				);
			});
			return true;
		},

		upsertCommand(cmd) {
			set((state) => {
				const commands = upsertById(state.commands, cmd);
				if (!commands) return state;
				const added = commands.length > state.commands.length;
				return record(
					state,
					{ commands },
					added
						? historyMeta("added", cmd.id, "command", "add", "success")
						: historyMeta("edited", cmd.id, "command", "edit"),
					added ? undefined : `command:${cmd.id}`,
				);
			});
		},

		renameCommandId(oldId, newId) {
			const state = get();
			if (!oldId || !newId || oldId === newId) return true;
			if (state.commands.some((c) => c.id === newId)) return false;

			set((current) => {
				const nextRibbons = cloneRibbons(current.ribbons);
				for (const location of Object.keys(nextRibbons) as RibbonLocation[]) {
					for (const tab of nextRibbons[location].tabs) {
						for (const group of tab.groups) {
							for (const button of groupControls(group)) {
								if (button.commandId === oldId) {
									button.commandId = newId;
								}
								// A control written verbatim (#42) names the command in its XML.
								if (button.source?.xml)
									button.source.xml = renameCommandInXml(
										button.source.xml,
										oldId,
										newId,
									);
							}
						}
					}
				}

				const commands = current.commands.map((c) =>
					c.id === oldId
						? {
								...c,
								id: newId,
							}
						: c,
				);

				return record(
					current,
					{ ribbons: nextRibbons, commands },
					historyMeta("renamed", oldId, `command -> ${newId}`, "edit"),
				);
			});

			return true;
		},

		upsertDisplayRule(rule) {
			set((state) => {
				const displayRules = upsertById(state.displayRules, rule);
				if (!displayRules) return state;
				const added = displayRules.length > state.displayRules.length;
				return record(
					state,
					{ displayRules },
					added
						? historyMeta("added", rule.id, "display rule", "add", "success")
						: historyMeta("edited", rule.id, "display rule", "edit"),
					added ? undefined : `displayRule:${rule.id}`,
				);
			});
		},

		renameDisplayRuleId(oldId, newId) {
			const state = get();
			if (!oldId || !newId || oldId === newId) return true;
			if (state.displayRules.some((r) => r.id === newId)) return false;

			set((current) => {
				const displayRules = current.displayRules.map((r) =>
					r.id === oldId
						? {
								...r,
								id: newId,
							}
						: r,
				);
				const commands = current.commands.map((c) => ({
					...c,
					displayRules: c.displayRules.map((id) => (id === oldId ? newId : id)),
				}));

				return record(
					current,
					{ displayRules, commands },
					historyMeta("renamed", oldId, `display rule -> ${newId}`, "edit"),
				);
			});

			return true;
		},

		upsertEnableRule(rule) {
			set((state) => {
				const enableRules = upsertById(state.enableRules, rule);
				if (!enableRules) return state;
				const added = enableRules.length > state.enableRules.length;
				return record(
					state,
					{ enableRules },
					added
						? historyMeta("added", rule.id, "enable rule", "add", "success")
						: historyMeta("edited", rule.id, "enable rule", "edit"),
					added ? undefined : `enableRule:${rule.id}`,
				);
			});
		},

		renameEnableRuleId(oldId, newId) {
			const state = get();
			if (!oldId || !newId || oldId === newId) return true;
			if (state.enableRules.some((r) => r.id === newId)) return false;

			set((current) => {
				const enableRules = current.enableRules.map((r) =>
					r.id === oldId
						? {
								...r,
								id: newId,
							}
						: r,
				);
				const commands = current.commands.map((c) => ({
					...c,
					enableRules: c.enableRules.map((id) => (id === oldId ? newId : id)),
				}));

				return record(
					current,
					{ enableRules, commands },
					historyMeta("renamed", oldId, `enable rule -> ${newId}`, "edit"),
				);
			});

			return true;
		},

		upsertLocLabel(label) {
			set((state) => {
				const locLabels = upsertById(state.locLabels, label);
				if (!locLabels) return state;
				// Translation edits are publishable changes too (#49).
				return record(
					state,
					{ locLabels },
					historyMeta("edited", label.id, "label", "translate"),
					`locLabel:${label.id}`,
				);
			});
		},

		setLayerHideUnhidden(scope, controlId, unhide) {
			set((state) => {
				if (state.pendingUnhides[scope].includes(controlId) === unhide) return state;
				const ids = state.pendingUnhides[scope].filter((id) => id !== controlId);
				if (unhide) ids.push(controlId);
				return record(
					state,
					{ pendingUnhides: { ...state.pendingUnhides, [scope]: ids } },
					unhide
						? historyMeta("un-hid", controlId, "on publish", "eye")
						: historyMeta("kept hidden", controlId, "by customizations", "eye_off"),
				);
			});
		},

		setOrphanDeleted(scope, orphanId, deleted) {
			set((state) => {
				const orphan = state.orphans[scope].find((o) => o.id === orphanId);
				if (!orphan) return state;
				// Just published from here: most likely not loaded yet, not orphaned (#64 review).
				if (deleted && orphan.recentPublish?.published) return state;
				if (state.pendingOrphanDeletes[scope].includes(orphanId) === deleted) return state;
				const ids = state.pendingOrphanDeletes[scope].filter((id) => id !== orphanId);
				if (deleted) ids.push(orphanId);
				return record(
					state,
					{ pendingOrphanDeletes: { ...state.pendingOrphanDeletes, [scope]: ids } },
					deleted
						? historyMeta(
								"deleted",
								orphanId,
								"not on the canvas — removed on publish",
								"delete",
								"danger",
							)
						: historyMeta("kept", orphanId, "not on the canvas", "arrow_undo"),
				);
			});
		},

		setLayerSnapshot(scope, snapshot) {
			set((state) => ({ layers: { ...state.layers, [scope]: snapshot } }));
		},

		markPublished(locations, publishedLayers) {
			set((state) => {
				const all = Object.keys(state.ribbons) as RibbonLocation[];
				const published = locations ?? all;
				const baseline = cloneRibbons(state.baseline);
				const current = cloneRibbons(state.ribbons);
				let locLabels = state.locLabels;
				let baselineLocLabels = state.baselineLocLabels;
				const withLabels = (list: LocLabel[], from: LocLabel[]) => [
					...list.filter((l) => !from.some((x) => x.id === l.id)),
					...from,
				];
				for (const [scope, parts] of Object.entries(publishedLayers ?? {}) as [
					LayerScope,
					RibbonDiffParts,
				][]) {
					const locs: RibbonLocation[] =
						scope === "entity" ? ENTITY_LOCATIONS : ["Application"];
					for (const loc of locs)
						if (published.includes(loc)) applyPublishedLayer(current[loc], parts);
					// The layer's labels as published are both current and baseline.
					const fromLayer = locLabelsFromParts(parts);
					locLabels = withLabels(locLabels, fromLayer);
					baselineLocLabels = withLabels(
						baselineLocLabels,
						JSON.parse(JSON.stringify(fromLayer)),
					);
				}
				for (const loc of published) baseline[loc] = cloneRibbons(current)[loc];
				const everything = all.every((loc) => published.includes(loc));
				// Un-hides of published scopes are done: drop them from the hidden list.
				const layers = { ...state.layers };
				const pendingUnhides = { ...state.pendingUnhides };
				const unhidden: Record<LayerScope, string[]> = { entity: [], application: [] };
				const scopes: [LayerScope, boolean][] = [
					["entity", ENTITY_LOCATIONS.every((l) => published.includes(l))],
					["application", published.includes("Application")],
				];
				// What the published layer adds is yours from now on — before the
				// layer is re-read, and even when that read fails (#17 review).
				for (const [scope, done] of scopes) {
					const parts = publishedLayers?.[scope];
					if (!done || !parts) continue;
					const snap = layers[scope];
					const union = (ids: string[], add: Set<string>) => [
						...new Set([...ids, ...add]),
					];
					layers[scope] = snap
						? {
								...snap,
								containerIds: union(snap.containerIds, ownContainerIdsOf(parts)),
								controlIds: union(snap.controlIds, ownControlIds(parts)),
								// …and its labels: a published tab / group can be renamed (#33).
								locLabelIds: union(
									snap.locLabelIds,
									new Set(parts.locLabels.keys()),
								),
							}
						: layerSnapshotFromParts(parts);
				}
				for (const [scope, done] of scopes) {
					if (!done || pendingUnhides[scope].length === 0) continue;
					const snap = layers[scope];
					if (snap) {
						layers[scope] = {
							...snap,
							hides: snap.hides.filter(
								(h) => !pendingUnhides[scope].includes(h.location),
							),
						};
					}
					unhidden[scope] = pendingUnhides[scope];
					pendingUnhides[scope] = [];
				}
				// Deleted orphans of published scopes are gone from the layer (#64).
				const orphans = { ...state.orphans };
				const pendingOrphanDeletes = { ...state.pendingOrphanDeletes };
				const orphansDeleted: Record<LayerScope, string[]> = {
					entity: [],
					application: [],
				};
				for (const [scope, done] of scopes) {
					if (!done || pendingOrphanDeletes[scope].length === 0) continue;
					orphans[scope] = orphans[scope].filter(
						(o) => !pendingOrphanDeletes[scope].includes(o.id),
					);
					orphansDeleted[scope] = pendingOrphanDeletes[scope];
					pendingOrphanDeletes[scope] = [];
				}
				// Uncustomised commands of published scopes are gone from the layer;
				// the session still holds their removed copy until reloaded (#31).
				const uncustomisedCommandIds = { ...state.uncustomisedCommandIds };
				const reloadRequiredCommandIds = [...state.reloadRequiredCommandIds];
				const uncustomised: Record<LayerScope, string[]> = { entity: [], application: [] };
				for (const [scope, done] of scopes) {
					if (!done) continue;
					for (const id of uncustomisedCommandIds[scope]) {
						if (!reloadRequiredCommandIds.includes(id))
							reloadRequiredCommandIds.push(id);
					}
					uncustomised[scope] = uncustomisedCommandIds[scope];
					uncustomisedCommandIds[scope] = [];
				}
				// The layer no longer hides the published un-hides, nor has the
				// published uncustomised commands or deleted orphans, so undo must
				// not bring them back as pending (#34 review, #31, #64).
				const without = (
					lists: Record<LayerScope, string[]>,
					done: Record<LayerScope, string[]>,
				) => ({
					entity: lists.entity.filter((id) => !done.entity.includes(id)),
					application: lists.application.filter((id) => !done.application.includes(id)),
				});
				const dropPublished = (e: HistoryEntry): HistoryEntry => ({
					...e,
					snapshot: {
						...e.snapshot,
						pendingUnhides: without(e.snapshot.pendingUnhides, unhidden),
						// Entries recorded before #64 have no orphan deletes.
						pendingOrphanDeletes: without(
							e.snapshot.pendingOrphanDeletes ?? NO_UNHIDES,
							orphansDeleted,
						),
						uncustomisedCommandIds: without(
							e.snapshot.uncustomisedCommandIds,
							uncustomised,
						),
					},
				});
				const anyPublished =
					[unhidden, uncustomised, orphansDeleted].reduce(
						(n, l) => n + l.entity.length + l.application.length,
						0,
					) > 0;
				// Typing after a publish starts a new undo step.
				const past = state.past.map((e, i) => {
					const kept = anyPublished ? dropPublished(e) : e;
					return i === state.past.length - 1 && kept.coalesceKey
						? { ...kept, coalesceKey: undefined }
						: kept;
				});
				const next = {
					ribbons: current,
					locLabels,
					baselineLocLabels,
					baseline,
					layers,
					pendingUnhides,
					uncustomisedCommandIds,
					orphans,
					pendingOrphanDeletes,
					...(everything
						? {
								baselineCommands: JSON.parse(JSON.stringify(state.commands)),
								baselineEnableRules: JSON.parse(JSON.stringify(state.enableRules)),
								baselineDisplayRules: JSON.parse(
									JSON.stringify(state.displayRules),
								),
								baselineLocLabels: JSON.parse(JSON.stringify(locLabels)),
								customisedCommandIds: [],
							}
						: {}),
				};
				// Commands, rules, labels and customisations count too: after a
				// partial publish (e.g. the table import failed) they are still to
				// publish (#16 review).
				const pending = hasPendingChanges({ ...state, ...next });
				return {
					...next,
					past,
					future: anyPublished ? state.future.map(dropPublished) : state.future,
					reloadRequiredCommandIds,
					mutationsSincePublish: pending ? Math.max(1, state.mutationsSincePublish) : 0,
				};
			});
		},
	})),
);

// Switching solution ends the table being edited (#22): its ribbon, commands
// and history must not stay on the canvas (or reach a publish into the new
// solution). App.tsx loads the next table when one is picked.
onSolutionSwitch(() => {
	useRibbonStore.getState().resetWorkspace();
	useSelectionStore.getState().clearSelection();
});
