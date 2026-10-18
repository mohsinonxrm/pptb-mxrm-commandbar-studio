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
 *   baseline). Until the user restores or discards it, autosave leaves it alone,
 *   so editing first doesn't overwrite it.
 * - Switching table or solution with unpublished changes asks first: keep the
 *   draft (offered again when the table is reopened in the same solution),
 *   discard the changes, or cancel.
 */
import { create } from "zustand";
import { useRibbonStore, type RibbonStoreState } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import {
	baselineFingerprint,
	deleteDraft,
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

/** Whether the loaded workspace has changes that aren't published. */
export function hasUnpublishedChanges(): boolean {
	return useDraftStore.getState().target !== null && useRibbonStore.getState().mutationsSincePublish > 0;
}

let saveFailed = false;

/** Writes (or, with nothing to publish, removes) the draft of the loaded workspace. */
function saveOrClear(state: RibbonStoreState): void {
	const { target, pending } = useDraftStore.getState();
	// A draft waiting for Restore / Discard is not overwritten (nor removed).
	if (!target || pending) return;
	const table = state.ribbons.HomepageGrid.entityLogicalName;
	if (table && table.toLowerCase() !== target.entityLogicalName.toLowerCase()) return;
	if (state.mutationsSincePublish === 0) {
		deleteDraft(target);
		return;
	}
	const ok = writeDraft(target, state);
	if (!ok && !saveFailed) {
		useRuntimeLogStore
			.getState()
			.logWarn("ribbon", "Unsaved changes could not be saved as a draft (browser storage is full or unavailable).");
	}
	saveFailed = !ok;
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

	beginLoad() {
		set({ target: null, pending: null, pendingBaselineChanged: false });
	},

	workspaceLoaded(key) {
		const draft = readDraft(key);
		set({
			target: key,
			pending: draft,
			pendingBaselineChanged: !!draft && draft.baselineFingerprint !== baselineFingerprint(useRibbonStore.getState()),
		});
	},

	restoreDraft() {
		const { target, pending } = get();
		// Only on top of the workspace the draft belongs to, once it is loaded.
		if (!target || !pending || !sameDraftKey(target, pending.key)) return false;
		set({ pending: null, pendingBaselineChanged: false });
		// Autosave writes the restored workspace (it is a change).
		useRibbonStore
			.getState()
			.restoreWorkspace(pending.workspace, `saved ${new Date(pending.savedAt).toLocaleString()}`);
		return true;
	},

	discardDraft() {
		const { target, pending } = get();
		if (!pending) return;
		deleteDraft(pending.key);
		set({ pending: null, pendingBaselineChanged: false });
		// Changes made while the draft was offered are saved now.
		if (target && sameDraftKey(target, pending.key)) saveOrClear(useRibbonStore.getState());
	},

	requestEntitySwitch(entity) {
		if (useSessionStore.getState().activeEntity?.logicalName === entity.logicalName) return;
		if (hasUnpublishedChanges()) set({ pendingSwitch: { kind: "entity", entity } });
		else applySwitch({ kind: "entity", entity });
	},

	requestSolutionSwitch(solution) {
		// Picking the solution that is already active isn't a switch.
		if (useSessionStore.getState().activeSolution?.id === solution.id) return;
		if (hasUnpublishedChanges()) set({ pendingSwitch: { kind: "solution", solution } });
		else applySwitch({ kind: "solution", solution });
	},

	resolveSwitch(choice) {
		const { pendingSwitch, target, pending } = get();
		if (!pendingSwitch) return;
		if (choice === "cancel") {
			set({ pendingSwitch: null });
			return;
		}
		// "keep": autosave has written the draft already. While an earlier
		// draft waits for Restore / Discard, that one is what is kept.
		if (choice === "discard" && target && !pending) deleteDraft(target);
		// The workspace no longer belongs to a draft: resetting it (and the
		// load that follows) must not touch the one kept.
		set({ pendingSwitch: null, target: null, pending: null, pendingBaselineChanged: false });
		resetWorkspace();
		applySwitch(pendingSwitch);
	},
}));
