/**
 * Unsaved changes across sessions and table / solution switches (#16).
 *
 * - Autosave: while a table's workspace is loaded, every change is saved as
 *   that table's draft (ribbonDraft.ts). The draft mirrors the workspace: it is
 *   removed when nothing is left to publish — after a publish, or undoing back
 *   to the loaded state. Loading a workspace is not a change and never touches
 *   a draft.
 * - Restore: a draft is offered only once the table it belongs to has finished
 *   loading, and goes on top of that load (the loaded ribbon stays the
 *   baseline). The offer is a modal dialog, so nothing can be edited before the
 *   user restores or discards it; autosave leaves the draft alone meanwhile.
 *   Undoing the restore keeps the draft.
 * - Switching table or solution with unpublished changes asks first: keep the
 *   draft (offered again when the table is reopened in the same solution),
 *   discard the changes, or cancel.
 * - Storage full: when the draft can't be saved, `saveFailed` is set (the
 *   banner warns) and "Keep as draft" doesn't switch, so nothing is lost.
 */
import { create } from "zustand";
import { hasPendingChanges, useRibbonStore, type RibbonStoreState } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import {
	baselineFingerprint,
	deleteDraft,
	draftWorkspace,
	readDraft,
	sameDraftKey,
	writeDraft,
	type DraftKey,
	type RibbonDraft,
} from "@/services/ribbonDraft";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";

export type PendingSwitch = { kind: "entity"; entity: EntityMetadata } | { kind: "solution"; solution: Solution };

/** What to do with the unpublished changes when switching: keep them as a draft, or discard them. */
export type SwitchChoice = "keep" | "discard" | "cancel";

export interface DraftStore {
	/** The workspace the ribbon store holds, whose draft autosave writes; null while loading or when none is. */
	target: DraftKey | null;
	/** A draft of an earlier session waiting for Restore / Discard. */
	pending: RibbonDraft | null;
	/** The table's ribbon on the server changed since `pending` was saved. */
	pendingBaselineChanged: boolean;
	/** A table / solution switch waiting for the user's answer (unpublished changes). */
	pendingSwitch: PendingSwitch | null;
	/** The last save of the draft failed (browser storage full or unavailable): the changes are only in memory. */
	saveFailed: boolean;
	/** When the draft in storage for the loaded table was saved (null: none). */
	lastSavedAt: string | null;

	/** A workspace load starts: the store's workspace no longer belongs to any draft. */
	beginLoad(): void;
	/** The workspace for `key` is loaded: autosave writes its draft, and a saved one is offered. */
	workspaceLoaded(key: DraftKey): void;
	/** Puts the pending draft on top of the loaded workspace (one undo step). False when there is none to restore. */
	restoreDraft(): boolean;
	/** Deletes the pending draft; later changes are saved again. */
	discardDraft(): void;

	requestEntitySwitch(entity: EntityMetadata): void;
	requestSolutionSwitch(solution: Solution): void;
	resolveSwitch(choice: SwitchChoice): void;
}

/** Whether `state` has anything to publish. The counter alone can't tell after a partial publish (#16 review). */
function unpublished(state: RibbonStoreState): boolean {
	return state.mutationsSincePublish > 0 || hasPendingChanges(state);
}

/** Whether the loaded workspace has changes that aren't published. */
export function hasUnpublishedChanges(): boolean {
	return useDraftStore.getState().target !== null && unpublished(useRibbonStore.getState());
}

/** The history entry of the last restore (its time), while the draft it restored is kept for an undo of it. */
let restoredAt: string | null = null;

/**
 * Writes (or, with nothing to publish, removes) the draft of the loaded
 * workspace. False when the draft couldn't be saved.
 */
function saveOrClear(state: RibbonStoreState): boolean {
	const { target, pending } = useDraftStore.getState();
	// A draft waiting for Restore / Discard is not overwritten (nor removed).
	if (!target || pending) return true;
	const table = state.ribbons.HomepageGrid.entityLogicalName;
	if (table && table.toLowerCase() !== target.entityLogicalName.toLowerCase()) return true;
	let ok = true;
	if (!unpublished(state)) {
		// Undoing a restore keeps the draft it restored (redo brings it back).
		const restoreUndone = restoredAt !== null && state.future.some((e) => e.op === "restored" && e.ts === restoredAt);
		if (!restoreUndone) {
			deleteDraft(target);
			useDraftStore.setState({ lastSavedAt: null });
		}
	} else {
		const savedAt = writeDraft(target, state);
		ok = savedAt !== null;
		if (savedAt) useDraftStore.setState({ lastSavedAt: savedAt });
	}
	const { saveFailed } = useDraftStore.getState();
	if (!ok && !saveFailed) {
		useRuntimeLogStore
			.getState()
			.logWarn(
				"ribbon",
				"Unsaved changes could not be saved as a draft (browser storage is full or unavailable): publish them, or they are lost when Command Bar Studio closes.",
			);
	}
	if (ok === saveFailed) useDraftStore.setState({ saveFailed: !ok });
	return ok;
}

/** What a draft depends on: a change of any of these saves it again. */
const WATCHED: (keyof RibbonStoreState)[] = [
	"mutationsSincePublish",
	"ribbons",
	"commands",
	"enableRules",
	"displayRules",
	"locLabels",
	"pendingUnhides",
	"customisedCommandIds",
	"uncustomisedCommandIds",
	"baseline",
	"baselineCommands",
	"baselineEnableRules",
	"baselineDisplayRules",
	"baselineLocLabels",
	"layers",
];

/** Saves the draft on every change of the workspace. Returns the unsubscribe. */
export function installDraftAutosave(): () => void {
	return useRibbonStore.subscribe((state, prev) => {
		if (WATCHED.every((k) => state[k] === prev[k])) return;
		saveOrClear(state);
	});
}

/** The draft key of `entityLogicalName` in the active org and solution. */
export function draftKeyFor(entityLogicalName: string): DraftKey {
	const session = useSessionStore.getState();
	return {
		orgUrl: session.connectionUrl,
		solutionId: session.activeSolution?.id ?? "",
		entityLogicalName,
	};
}

/** The loaded workspace back to what was loaded (the changes are kept as a draft, or discarded). */
function resetWorkspace(): void {
	const s = useRibbonStore.getState();
	s.loadWorkspace({
		ribbons: s.baseline,
		commands: s.baselineCommands,
		enableRules: s.baselineEnableRules,
		displayRules: s.baselineDisplayRules,
		locLabels: s.baselineLocLabels,
		templates: s.templates,
		conflicts: s.conflicts,
		layers: s.layers,
		baseLanguageCode: s.baseLanguageCode,
	});
}

function applySwitch(sw: PendingSwitch): void {
	// The loaded workspace is no longer the active table's.
	useDraftStore.setState({ target: null, pending: null, pendingBaselineChanged: false });
	const session = useSessionStore.getState();
	if (sw.kind === "entity") session.setActiveEntity(sw.entity);
	else session.setActiveSolution(sw.solution);
}

export const useDraftStore = create<DraftStore>()((set, get) => ({
	target: null,
	pending: null,
	pendingBaselineChanged: false,
	pendingSwitch: null,
	saveFailed: false,
	lastSavedAt: null,

	beginLoad() {
		restoredAt = null;
		set({ target: null, pending: null, pendingBaselineChanged: false, saveFailed: false, lastSavedAt: null });
	},

	workspaceLoaded(key) {
		const draft = readDraft(key);
		restoredAt = null;
		set({
			target: key,
			pending: draft,
			lastSavedAt: draft?.savedAt ?? null,
			pendingBaselineChanged: !!draft && draft.baselineFingerprint !== baselineFingerprint(useRibbonStore.getState()),
		});
	},

	restoreDraft() {
		const { target, pending } = get();
		// Only on top of the workspace the draft belongs to, once it is loaded.
		if (!target || !pending || !sameDraftKey(target, pending.key)) return false;
		set({ pending: null, pendingBaselineChanged: false });
		// Autosave writes the restored workspace (it is a change).
		const ribbons = useRibbonStore.getState();
		ribbons.restoreWorkspace(draftWorkspace(pending, ribbons), `saved ${new Date(pending.savedAt).toLocaleString()}`);
		const after = useRibbonStore.getState();
		const top = after.past[after.past.length - 1];
		if (after.past.length > ribbons.past.length && top?.op === "restored") restoredAt = top.ts;
		// Nothing restored (the server has it all already): the draft goes.
		else saveOrClear(after);
		return true;
	},

	discardDraft() {
		const { target, pending } = get();
		if (!pending) return;
		deleteDraft(pending.key);
		set({ pending: null, pendingBaselineChanged: false, lastSavedAt: null });
		// Changes made while the draft was offered are saved now.
		if (target && sameDraftKey(target, pending.key)) saveOrClear(useRibbonStore.getState());
	},

	requestEntitySwitch(entity) {
		if (useSessionStore.getState().activeEntity?.logicalName === entity.logicalName) return;
		if (hasUnpublishedChanges()) {
			// Whether "Keep as draft" can keep them: the draft is saved now.
			saveOrClear(useRibbonStore.getState());
			set({ pendingSwitch: { kind: "entity", entity } });
		} else applySwitch({ kind: "entity", entity });
	},

	requestSolutionSwitch(solution) {
		// Picking the solution that is already active isn't a switch.
		if (useSessionStore.getState().activeSolution?.id === solution.id) return;
		if (hasUnpublishedChanges()) {
			saveOrClear(useRibbonStore.getState());
			set({ pendingSwitch: { kind: "solution", solution } });
		}
		else applySwitch({ kind: "solution", solution });
	},

	resolveSwitch(choice) {
		const { pendingSwitch, target, pending } = get();
		if (!pendingSwitch) return;
		if (choice === "cancel") {
			set({ pendingSwitch: null });
			return;
		}
		// "keep": autosave has written the draft; it is saved again to be sure,
		// and when that fails (storage full) nothing switches. While an earlier
		// draft waits for Restore / Discard, that one is what is kept.
		if (choice === "keep" && !saveOrClear(useRibbonStore.getState())) return;
		if (choice === "discard" && target && !pending) deleteDraft(target);
		// The workspace no longer belongs to a draft: resetting it (and the
		// load that follows) must not touch the one kept.
		set({ pendingSwitch: null, target: null, pending: null, pendingBaselineChanged: false, saveFailed: false });
		resetWorkspace();
		applySwitch(pendingSwitch);
	},
}));
