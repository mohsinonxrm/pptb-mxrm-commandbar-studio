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
} from "@/types/ribbon";
import type { LayerSnapshot } from "@/services/dataverse/ribbonLayerService";

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
 * definitions it references and the pending un-hides the publish diff reads.
 * Baselines, layers and other loaded data are not part of it.
 */
export type WorkspaceSnapshot = Pick<
	RibbonStoreState,
	"ribbons" | "commands" | "enableRules" | "displayRules" | "locLabels" | "pendingUnhides"
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
	/** Organisation base language (#50). */
	baseLanguageCode: number;
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
	button: Omit<RibbonButton, "id"> & { id?: string };
};

type NewGroupContext = {
	tabId: string;
	location: RibbonLocation;
	group: Omit<RibbonGroup, "id"> & { id?: string };
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

	// Mutations
	moveButton(src: DragSource, dst: DragTarget): void;
	setButtonProp(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
		patch: Partial<RibbonButton>,
	): void;
	deleteButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	duplicateButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
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
	setTabDisplayRules(location: RibbonLocation, tabId: string, rules: TabDisplayRule[]): void;
	setScaling(location: RibbonLocation, tabId: string, scaling: ScalingDefinition): void;
	hideOobButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	customizeOobButton(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
	): void;
	upsertCommand(cmd: CommandDefinition): void;
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
	/** Replaces a scope's layer snapshot (after a publish re-reads it). */
	setLayerSnapshot(scope: LayerScope, snapshot: LayerSnapshot | null): void;
	/**
	 * Marks the given locations as published (their baseline becomes the
	 * current state). Locations that were not published keep their pending
	 * changes. Command / rule baselines advance only when every location was
	 * published.
	 */
	markPublished(locations?: RibbonLocation[]): void;
	setConflicts(entries: ConflictEntry[]): void;

	// Load initial data
	loadRibbons(ribbons: Record<RibbonLocation, RibbonDefinition>): void;
	loadWorkspace(seed: RibbonWorkspaceSeed): void;
}

const MAX_HISTORY = 80;

function cloneRibbons(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
): Record<RibbonLocation, RibbonDefinition> {
	return JSON.parse(JSON.stringify(ribbons));
}

function workspaceOf(state: RibbonStoreState): WorkspaceSnapshot {
	// State is updated immutably, so the snapshot can share it.
	return {
		ribbons: state.ribbons,
		commands: state.commands,
		enableRules: state.enableRules,
		displayRules: state.displayRules,
		locLabels: state.locLabels,
		pendingUnhides: state.pendingUnhides,
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
	const last = state.past[state.past.length - 1];
	if (
		coalesceKey &&
		last?.coalesceKey === coalesceKey &&
		state.future.length === 0 &&
		Date.parse(meta.ts) - Date.parse(last.ts) < COALESCE_MS
	) {
		return {
			...change,
			past: [...state.past.slice(0, -1), { ...last, ...meta }],
			// Still counted, so the workspace is saved as the user types.
			mutationsSincePublish: state.mutationsSincePublish + 1,
		};
	}
	const entry: HistoryEntry = { ...meta, coalesceKey, snapshot: workspaceOf(state) };
	return {
		...change,
		past: [...state.past, entry].slice(-MAX_HISTORY),
		future: [],
		mutationsSincePublish: state.mutationsSincePublish + 1,
	};
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
function hasPendingChanges(state: RibbonStoreState): boolean {
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	return (
		state.pendingUnhides.entity.length + state.pendingUnhides.application.length > 0 ||
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
 * Gives the button at `at` a sequence that keeps `buttons` in display order
 * when there is no free value between its neighbours (#57 review). Only the
 * buttons `canRenumber` allows (the moved one, your own, new ones) change; the
 * others keep their sequence, since CBS can't re-sequence them. When even that
 * leaves no room (e.g. two adjacent out-of-the-box sequences 10 and 11), the
 * button gets the lowest unused sequence after its previous neighbour, so it
 * never shares a value with another button (it then sorts a little later).
 */
export function resequenceAround(
	buttons: RibbonButton[],
	at: number,
	canRenumber: (b: RibbonButton) => boolean,
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
						: prev + Math.max(1, Math.min(10, Math.floor((hi - prev) / (remaining + 2))));
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

const EMPTY_RIBBONS: Record<RibbonLocation, RibbonDefinition> = {
	HomepageGrid: { location: "HomepageGrid", entityLogicalName: "", tabs: [] },
	SubGrid: { location: "SubGrid", entityLogicalName: "", tabs: [] },
	Form: { location: "Form", entityLogicalName: "", tabs: [] },
	Application: { location: "Application", entityLogicalName: "", tabs: [] },
};

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
		baseLanguageCode: 1033,
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
				baseLanguageCode: seed.baseLanguageCode ?? 1033,
				templates: [...(seed.templates ?? [])],
				conflicts: [...(seed.conflicts ?? [])],
				mutationsSincePublish: 0,
				past: [],
				future: [],
			});
			if (openBatch) openBatch = { snapshot: workspaceOf(get()), meta: null };
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
				if (meta) {
					set((state) => ({
						past: [...state.past, { ...meta, snapshot }].slice(-MAX_HISTORY),
						future: [],
						mutationsSincePublish: state.mutationsSincePublish + 1,
					}));
				}
			}
		},

		moveButton(src, dst) {
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
						if (isReadOnlyGlobalOobButton(src.location, src.tabId, srcGroup.buttons[btnIdx]))
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
								state.layers[dst.location === "Application" ? "application" : "entity"]?.controlIds ?? [],
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
		},

		setButtonProp(location, tabId, groupId, buttonId, patch) {
			// Typing in a text field is one undo step; toggles and numbers are not merged.
			const typed = Object.values(patch).every((v) => typeof v === "string");
			const coalesceKey = typed
				? `button:${location}:${buttonId}:${Object.keys(patch).sort().join(",")}`
				: undefined;
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						const button = group?.buttons.find((b) => b.id === buttonId);
						if (!button) return;
						if (isReadOnlyGlobalOobButton(location, tabId, button)) return;
						Object.assign(button, patch);
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
				),
			);
		},

		deleteButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (!group) return;
						const button = group.buttons.find((b) => b.id === buttonId);
						if (!button) return;
						if (isReadOnlyGlobalOobButton(location, tabId, button)) return;
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

		duplicateButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						const btn = group?.buttons.find((b) => b.id === buttonId);
						if (btn && group) {
							if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
							const copy: RibbonButton = {
								...btn,
								id: `${btn.id}_copy_${Date.now()}`,
								label: `${btn.label} (copy)`,
								// The copy is a new control: it must not reuse the original's
								// LocLabel tokens / attributes (#11 review N5).
								source: undefined,
								custom: true,
								oob: false,
								managed: false,
								origin: "unmanaged",
								sequence: btn.sequence + 5,
							};
							const idx = group.buttons.findIndex((b) => b.id === buttonId);
							group.buttons.splice(idx + 1, 0, copy);
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
							const newBtn: RibbonButton = {
								...button,
								id: button.id ?? `new_${Date.now()}`,
								label: button.label ?? "New Button",
								kind: button.kind ?? "button",
								sequence: button.sequence ?? (group.buttons.length + 1) * 10,
								templateAlias: button.templateAlias ?? "o1",
								commandId: button.commandId ?? "",
								hidden: button.hidden ?? false,
								oob: false,
								custom: true,
								managed: false,
								origin: "unmanaged",
							};
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
							const newGroup: RibbonGroup = {
								id: group.id ?? `grp_${Date.now()}`,
								label: group.label ?? "New Group",
								sequence: group.sequence ?? (tab.groups.length + 1) * 10,
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
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (!tab) return;
						const grp = tab.groups.find((g) => g.id === groupId);
						if (!grp) return;
						const stamp = `_copy_${Date.now()}`;
						const copy: RibbonGroup = {
							...JSON.parse(JSON.stringify(grp)),
							id: `${grp.id}${stamp}`,
							label: `${grp.label} (copy)`,
							sequence: grp.sequence + 5,
							buttons: grp.buttons.map((b) => ({
								...b,
								id: `${b.id}${stamp}`,
								custom: true,
								oob: false,
								managed: false,
								origin: "unmanaged" as const,
							})),
						};
						const idx = tab.groups.findIndex((g) => g.id === groupId);
						tab.groups.splice(idx + 1, 0, copy);
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
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const ribbon = ribbons[location];
						const newTab: RibbonTab = {
							id: tabDef.id ?? `tab_${Date.now()}`,
							label: tabDef.label ?? "New Tab",
							sequence: tabDef.sequence ?? (ribbon.tabs.length + 1) * 10,
							tabDisplayRules: [],
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
				),
			);
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
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						ribbons[location].tabs = ribbons[location].tabs.filter((t) => t.id !== tabId);
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
						ribbons[location].tabs = tabIds
							.map((id) => tabs.find((t) => t.id === id))
							.filter((t): t is RibbonTab => t !== undefined);
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
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						const btn = group?.buttons.find((b) => b.id === buttonId);
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
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						const btn = group?.buttons.find((b) => b.id === buttonId);
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

		hideWithDisplayRules(buttonCommandId) {
			const cmd = buttonCommandId ? get().commands.find((c) => c.id === buttonCommandId) : undefined;
			if (!cmd) return false;
			const displayRules = [...cmd.displayRules];
			for (const id of HIDE_DISPLAY_RULES) if (!displayRules.includes(id)) displayRules.push(id);
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
							for (const button of group.buttons) {
								if (button.commandId === oldId) {
									button.commandId = newId;
								}
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

		setLayerSnapshot(scope, snapshot) {
			set((state) => ({ layers: { ...state.layers, [scope]: snapshot } }));
		},

		markPublished(locations) {
			set((state) => {
				const all = Object.keys(state.ribbons) as RibbonLocation[];
				const published = locations ?? all;
				const baseline = cloneRibbons(state.baseline);
				const current = cloneRibbons(state.ribbons);
				for (const loc of published) baseline[loc] = current[loc];
				const everything = all.every((loc) => published.includes(loc));
				// Un-hides of published scopes are done: drop them from the hidden list.
				const layers = { ...state.layers };
				const pendingUnhides = { ...state.pendingUnhides };
				const unhidden: Record<LayerScope, string[]> = { entity: [], application: [] };
				const scopes: [LayerScope, boolean][] = [
					["entity", ENTITY_LOCATIONS.every((l) => published.includes(l))],
					["application", published.includes("Application")],
				];
				for (const [scope, done] of scopes) {
					if (!done || pendingUnhides[scope].length === 0) continue;
					const snap = layers[scope];
					if (snap) {
						layers[scope] = { ...snap, hides: snap.hides.filter((h) => !pendingUnhides[scope].includes(h.location)) };
					}
					unhidden[scope] = pendingUnhides[scope];
					pendingUnhides[scope] = [];
				}
				// The layer no longer hides the published un-hides, so undo must not
				// bring them back as pending (#34 review).
				const dropUnhidden = (e: HistoryEntry): HistoryEntry => ({
					...e,
					snapshot: {
						...e.snapshot,
						pendingUnhides: {
							entity: e.snapshot.pendingUnhides.entity.filter((id) => !unhidden.entity.includes(id)),
							application: e.snapshot.pendingUnhides.application.filter(
								(id) => !unhidden.application.includes(id),
							),
						},
					},
				});
				const anyUnhidden = unhidden.entity.length + unhidden.application.length > 0;
				// Typing after a publish starts a new undo step.
				const past = state.past.map((e, i) => {
					const kept = anyUnhidden ? dropUnhidden(e) : e;
					return i === state.past.length - 1 && kept.coalesceKey ? { ...kept, coalesceKey: undefined } : kept;
				});
				const pending =
					all.some((loc) => JSON.stringify(baseline[loc]) !== JSON.stringify(current[loc])) ||
					pendingUnhides.entity.length + pendingUnhides.application.length > 0;
				return {
					baseline,
					layers,
					pendingUnhides,
					past,
					future: anyUnhidden ? state.future.map(dropUnhidden) : state.future,
					...(everything
						? {
								baselineCommands: JSON.parse(JSON.stringify(state.commands)),
								baselineEnableRules: JSON.parse(JSON.stringify(state.enableRules)),
								baselineDisplayRules: JSON.parse(JSON.stringify(state.displayRules)),
								baselineLocLabels: JSON.parse(JSON.stringify(state.locLabels)),
							}
						: {}),
					mutationsSincePublish: pending ? Math.max(1, state.mutationsSincePublish) : 0,
				};
			});
		},
	})),
);
