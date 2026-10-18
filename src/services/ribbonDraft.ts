/**
 * Unsaved changes of a session, kept in localStorage so they survive closing
 * the tool (#16).
 *
 * A draft is the editable workspace (WorkspaceSnapshot: the canvas, commands,
 * rules, labels, pending un-hides and customised / uncustomised commands), the
 * same state undo / redo restore. On restore it goes on top of the ribbon as
 * loaded at that time, which stays the baseline, so publishing compares the
 * draft with what is on the server now.
 *
 * Storage key: cbs:draft:v{DRAFT_FORMAT}:{org}:{solution id}:{table}. Drafts of
 * an older format (cbs:ribbon:…, before #16) are discarded.
 */
import { workspaceOf, type RibbonStoreState, type WorkspaceSnapshot } from "@/store/ribbonStore";
import type { RibbonLocation } from "@/types/ribbon";

/** Bumped when the draft's shape changes: drafts of another format are discarded. */
export const DRAFT_FORMAT = 2;

const PREFIX = `cbs:draft:v${DRAFT_FORMAT}:`;
/** Drafts saved before #16 (ribbons, commands, rules and labels only). */
const LEGACY_PREFIXES = ["cbs:ribbon:", "cbs:draft:"];

/** Which workspace a draft belongs to. */
export interface DraftKey {
	orgUrl: string;
	solutionId: string;
	entityLogicalName: string;
}

export interface RibbonDraft {
	format: typeof DRAFT_FORMAT;
	key: DraftKey;
	savedAt: string;
	/**
	 * Fingerprint of what was loaded (baselines and layers) when the draft was
	 * saved: when the table's ribbon on the server differs at restore, the
	 * restored edits may undo changes made since (they are compared with the
	 * ribbon as it is now).
	 */
	baselineFingerprint: string;
	workspace: WorkspaceSnapshot;
}

const LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form", "Application"];

export function normaliseDraftKey(key: DraftKey): DraftKey {
	return {
		orgUrl: key.orgUrl.trim().replace(/\/+$/, "").toLowerCase(),
		solutionId: key.solutionId.trim().toLowerCase(),
		entityLogicalName: key.entityLogicalName.trim().toLowerCase(),
	};
}

export function draftStorageKey(key: DraftKey): string {
	const k = normaliseDraftKey(key);
	return `${PREFIX}${encodeURIComponent(k.orgUrl)}:${encodeURIComponent(k.solutionId)}:${encodeURIComponent(k.entityLogicalName)}`;
}

export function sameDraftKey(a: DraftKey | null | undefined, b: DraftKey | null | undefined): boolean {
	if (!a || !b) return false;
	return draftStorageKey(a) === draftStorageKey(b);
}

/** FNV-1a: a cheap, stable hash. Not for security, only to notice a change. */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return `${(h >>> 0).toString(16)}.${text.length}`;
}

type BaselineState = Pick<
	RibbonStoreState,
	| "baseline"
	| "baselineCommands"
	| "baselineEnableRules"
	| "baselineDisplayRules"
	| "baselineLocLabels"
	| "layers"
	| "baseLanguageCode"
>;

let lastFingerprint: { of: unknown[]; value: string } | null = null;

/** Fingerprint of the loaded ribbon (cached: state is updated immutably). */
export function baselineFingerprint(state: BaselineState): string {
	const of = [
		state.baseline,
		state.baselineCommands,
		state.baselineEnableRules,
		state.baselineDisplayRules,
		state.baselineLocLabels,
		state.layers,
		state.baseLanguageCode,
	];
	if (lastFingerprint && lastFingerprint.of.every((v, i) => v === of[i])) return lastFingerprint.value;
	const value = hash(JSON.stringify(of));
	lastFingerprint = { of, value };
	return value;
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isScopeLists = (v: unknown) =>
	!!v && typeof v === "object" && isArray((v as Record<string, unknown>).entity) && isArray((v as Record<string, unknown>).application);

/** Whether `w` has everything a workspace needs (a damaged or hand-edited draft is not restored). */
function isWorkspace(w: unknown): w is WorkspaceSnapshot {
	if (!w || typeof w !== "object") return false;
	const x = w as Record<string, unknown>;
	const ribbons = x.ribbons as Record<string, { tabs?: unknown }> | undefined;
	return (
		!!ribbons &&
		LOCATIONS.every((l) => isArray(ribbons[l]?.tabs)) &&
		isArray(x.commands) &&
		isArray(x.enableRules) &&
		isArray(x.displayRules) &&
		isArray(x.locLabels) &&
		isScopeLists(x.pendingUnhides) &&
		isArray(x.customisedCommandIds) &&
		isScopeLists(x.uncustomisedCommandIds)
	);
}

export function writeDraft(key: DraftKey, state: RibbonStoreState): boolean {
	const draft: RibbonDraft = {
		format: DRAFT_FORMAT,
		key: normaliseDraftKey(key),
		savedAt: new Date().toISOString(),
		baselineFingerprint: baselineFingerprint(state),
		workspace: workspaceOf(state),
	};
	try {
		localStorage.setItem(draftStorageKey(key), JSON.stringify(draft));
		return true;
	} catch {
		// Quota exceeded or storage unavailable.
		return false;
	}
}

/**
 * The draft saved for `key`, or null. A draft that can't be used (another
 * format, damaged) is removed.
 */
export function readDraft(key: DraftKey): RibbonDraft | null {
	const storageKey = draftStorageKey(key);
	let raw: string | null;
	try {
		raw = localStorage.getItem(storageKey);
	} catch {
		return null;
	}
	if (!raw) return null;
	try {
		const draft = JSON.parse(raw) as Partial<RibbonDraft>;
		if (draft.format === DRAFT_FORMAT && sameDraftKey(draft.key, key) && isWorkspace(draft.workspace)) {
			return draft as RibbonDraft;
		}
	} catch {
		// Not JSON: removed below.
	}
	deleteDraft(key);
	return null;
}

export function deleteDraft(key: DraftKey): void {
	try {
		localStorage.removeItem(draftStorageKey(key));
	} catch {
		// Storage unavailable.
	}
}

/** Removes drafts of an older format (they can't be restored correctly). Returns how many. */
export function discardOutdatedDrafts(): number {
	const outdated: string[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && !k.startsWith(PREFIX) && LEGACY_PREFIXES.some((p) => k.startsWith(p))) outdated.push(k);
		}
		for (const k of outdated) localStorage.removeItem(k);
	} catch {
		return 0;
	}
	return outdated.length;
}
