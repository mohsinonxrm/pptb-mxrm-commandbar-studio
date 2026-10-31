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
 * Only what differs from the loaded ribbon is stored (WorkspaceDelta): the
 * changed, added and removed tabs, groups, buttons, commands, rules and labels.
 * Everything else is filled in from the fresh load on restore. The delta is deflated and
 * base64-encoded: a whole workspace (every location, the application ribbon,
 * hundreds of commands and rules) took over a million characters, and
 * localStorage holds about five million per origin.
 *
 * Storage key: cbs:draft:v{DRAFT_FORMAT}:{org}:{solution id}:{table}. Drafts of
 * another format (cbs:ribbon:…, before #16) are discarded.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { workspaceOf, type RibbonStoreState, type WorkspaceSnapshot } from "@/store/ribbonStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

/** Bumped when the draft's shape changes: drafts of another format are discarded. */
export const DRAFT_FORMAT = 4;

/** Drafts older than this are discarded at startup. */
export const DRAFT_MAX_AGE_DAYS = 30;

const PREFIX = `cbs:draft:v${DRAFT_FORMAT}:`;
/** Drafts saved before #16 (ribbons, commands, rules and labels only), and other formats. */
const LEGACY_PREFIXES = ["cbs:ribbon:", "cbs:draft:"];

/** Which workspace a draft belongs to. */
export interface DraftKey {
	orgUrl: string;
	solutionId: string;
	entityLogicalName: string;
}

/**
 * A list of items with ids, as a change of the loaded list. Usually a patch:
 * the loaded items in their order without `drop`, the items in `set` replaced
 * (matched by id), then `add` at the end — what edits do (they replace items
 * in place and append new ones). Otherwise every item in order: its id when it
 * is as loaded, else the item. A changed tab or group keeps only what changed
 * in its groups or buttons, the same way.
 */
export type ListDelta = { set: unknown[]; drop: string[]; add: unknown[] } | unknown[];

/**
 * A location that differs from the loaded one: the settings that differ
 * (e.g. scalingByTab; the others come from the fresh load) and its tabs.
 */
interface LocationDelta {
	props: Record<string, unknown>;
	/** Settings the loaded location has and this one doesn't. */
	unset: string[];
	tabs: ListDelta;
}

/** Workspace lists diffed against their loaded version (the baseline field). */
const DIFFED = {
	commands: "baselineCommands",
	enableRules: "baselineEnableRules",
	displayRules: "baselineDisplayRules",
	locLabels: "baselineLocLabels",
} as const;
type DiffedField = keyof typeof DIFFED;

/** What a workspace adds to the loaded ribbon. */
export interface WorkspaceDelta {
	/** Only the locations that differ from the loaded ones. */
	ribbons: Partial<Record<RibbonLocation, LocationDelta>>;
	lists: Record<DiffedField, ListDelta>;
	/**
	 * Every other workspace field (pending un-hides, customised / uncustomised
	 * commands, …) as it is. A field added to WorkspaceSnapshot later is saved
	 * here without changes; a draft without it restores it as loaded.
	 */
	other: Partial<WorkspaceSnapshot>;
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
	delta: WorkspaceDelta;
}

/** As stored: the delta deflated and base64-encoded. */
type StoredDraft = Omit<RibbonDraft, "delta"> & { data: string };

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

export function sameDraftKey(
	a: DraftKey | null | undefined,
	b: DraftKey | null | undefined,
): boolean {
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
	if (lastFingerprint && lastFingerprint.of.every((v, i) => v === of[i]))
		return lastFingerprint.value;
	const value = hash(JSON.stringify(of));
	lastFingerprint = { of, value };
	return value;
}

// State is updated immutably: an object's JSON never changes, so it is cached.
const jsonCache = new WeakMap<object, string>();
function json(item: object): string {
	let text = jsonCache.get(item);
	if (text === undefined) {
		text = JSON.stringify(item);
		jsonCache.set(item, text);
	}
	return text;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

type Item = { id: string } & Record<string, unknown>;

/** Which property of an item holds a nested list diffed the same way: tabs → groups → buttons. */
interface Level {
	list?: string;
	child?: Level;
}
const LEAF: Level = {};
const TABS: Level = { list: "groups", child: { list: "buttons", child: LEAF } };

/** Items of `baseline` by id; null for an id more than one item has (never referenced). */
function uniqueById(baseline: Item[]): Map<string, Item | null> {
	const byId = new Map<string, Item | null>();
	for (const b of baseline) byId.set(b.id, byId.has(b.id) ? null : b);
	return byId;
}

/** A changed or new item: its nested list (if any) as a delta of the loaded item's. */
function diffItem(item: Item, loaded: Item | undefined, level: Level): unknown {
	if (!level.list || !Array.isArray(item[level.list])) return item;
	const loadedList = (loaded?.[level.list] as Item[] | undefined) ?? [];
	// Spread keeps the key order (the publish compares JSON).
	return {
		...item,
		[level.list]: diffList(item[level.list] as Item[], loadedList, level.child ?? LEAF),
	};
}

function patchItem(stored: Item, loaded: Item | undefined, level: Level): Item {
	if (!level.list || stored[level.list] === undefined) return stored;
	const loadedList = (loaded?.[level.list] as Item[] | undefined) ?? [];
	return {
		...stored,
		[level.list]: patchList(stored[level.list] as ListDelta, loadedList, level.child ?? LEAF),
	};
}

function diffList(items: Item[], baseline: Item[], level: Level): ListDelta {
	const byId = uniqueById(baseline);
	const ids = new Set(items.map((i) => i.id));
	if (ids.size === items.length && byId.size === baseline.length) {
		const kept = baseline.filter((b) => ids.has(b.id));
		const added = items.slice(kept.length);
		if (kept.every((b, i) => items[i].id === b.id) && added.every((a) => !byId.has(a.id))) {
			return {
				set: items
					.slice(0, kept.length)
					.filter((item) => json(byId.get(item.id)!) !== json(item))
					.map((item) => diffItem(item, byId.get(item.id)!, level)),
				drop: baseline.filter((b) => !ids.has(b.id)).map((b) => b.id),
				add: added.map((item) => diffItem(item, undefined, level)),
			};
		}
	}
	return items.map((item) => {
		const loaded = byId.get(item.id) ?? undefined;
		return loaded && json(loaded) === json(item) ? item.id : diffItem(item, loaded, level);
	});
}

/**
 * A list delta over a fresh load. An unchanged (referenced) item the load no
 * longer has is dropped; a changed one is kept as changed, at the end.
 */
function patchList(delta: ListDelta, baseline: Item[], level: Level): Item[] {
	const byId = uniqueById(baseline);
	if (Array.isArray(delta)) {
		const out: Item[] = [];
		for (const e of delta) {
			if (typeof e !== "string")
				out.push(patchItem(e as Item, byId.get((e as Item).id) ?? undefined, level));
			else {
				const loaded = byId.get(e);
				if (loaded) out.push(clone(loaded));
			}
		}
		return out;
	}
	const drop = new Set(delta.drop);
	const set = new Map((delta.set as Item[]).map((i) => [i.id, i]));
	const added: Item[] = [];
	// An added item the load has already (e.g. published, then the tool closed)
	// replaces it rather than appearing twice.
	for (const a of delta.add as Item[]) {
		if (byId.has(a.id)) set.set(a.id, a);
		else added.push(a);
	}
	const loadedIds = new Set(baseline.map((b) => b.id));
	return [
		...baseline
			.filter((b) => !drop.has(b.id))
			.map((b) => (set.has(b.id) ? patchItem(set.get(b.id)!, b, level) : clone(b))),
		// A changed item the load no longer has is kept as changed (as in the
		// list form); an unchanged one goes with the load.
		...[...set.values()]
			.filter((i) => !loadedIds.has(i.id))
			.map((i) => patchItem(i, undefined, level)),
		...added.map((a) => patchItem(a, undefined, level)),
	];
}

const isEmptyPatch = (d: ListDelta) =>
	!Array.isArray(d) && d.set.length + d.drop.length + d.add.length === 0;

/** `list` (of objects with ids) as plain items, for the generic diff. */
const items = (list: { id: string }[]) => list as unknown as Item[];

/** What `state`'s workspace adds to its loaded ribbon. */
export function workspaceDelta(state: RibbonStoreState): WorkspaceDelta {
	const w = workspaceOf(state);
	const ribbons: WorkspaceDelta["ribbons"] = {};
	for (const loc of LOCATIONS) {
		const current = w.ribbons[loc] as unknown as Record<string, unknown> | undefined;
		const loaded = state.baseline[loc] as unknown as Record<string, unknown> | undefined;
		if (!current) continue;
		const tabs = diffList(
			current.tabs as Item[],
			(loaded?.tabs as Item[] | undefined) ?? [],
			TABS,
		);
		const props: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(current)) {
			if (k !== "tabs" && JSON.stringify(v) !== JSON.stringify(loaded?.[k])) props[k] = v;
		}
		const unset = Object.keys(loaded ?? {}).filter((k) => k !== "tabs" && !(k in current));
		if (!isEmptyPatch(tabs) || Object.keys(props).length + unset.length > 0)
			ribbons[loc] = { props, unset, tabs };
	}
	const lists = {} as WorkspaceDelta["lists"];
	for (const f of Object.keys(DIFFED) as DiffedField[])
		lists[f] = diffList(items(w[f]), items(state[DIFFED[f]]), LEAF);
	const other: Partial<WorkspaceSnapshot> = { ...w };
	delete other.ribbons;
	for (const f of Object.keys(DIFFED) as DiffedField[]) delete other[f];
	return { ribbons, lists, other };
}

/** The workspace `draft` saved, rebuilt over `state`'s loaded ribbon (`state` is as loaded). */
export function draftWorkspace(draft: RibbonDraft, state: RibbonStoreState): WorkspaceSnapshot {
	const { delta } = draft;
	const ribbons = {} as WorkspaceSnapshot["ribbons"];
	for (const loc of LOCATIONS) {
		const d = delta.ribbons[loc];
		const loaded = state.baseline[loc];
		if (!d) {
			ribbons[loc] = clone(loaded);
			continue;
		}
		// The loaded location's key order, as the session had it (the publish compares JSON).
		const def: Record<string, unknown> = { ...clone(loaded), ...clone(d.props) };
		for (const k of d.unset) delete def[k];
		def.tabs = patchList(d.tabs, items(loaded?.tabs ?? []), TABS);
		ribbons[loc] = def as unknown as RibbonDefinition;
	}
	const workspace = {
		...workspaceOf(state),
		...clone(delta.other),
		ribbons,
	} as WorkspaceSnapshot;
	for (const f of Object.keys(DIFFED) as DiffedField[]) {
		(workspace as Record<DiffedField, unknown>)[f] = patchList(
			delta.lists[f],
			items(state[DIFFED[f]]),
			LEAF,
		);
	}
	return workspace;
}

function encode(delta: WorkspaceDelta): string {
	return btoa(strFromU8(deflateSync(strToU8(JSON.stringify(delta)), { level: 9 }), true));
}

function decode(data: string): unknown {
	return JSON.parse(strFromU8(inflateSync(strToU8(atob(data), true))));
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isObject = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v);
const isListDelta = (v: unknown) => {
	if (isArray(v)) return true;
	const x = v as Record<string, unknown> | null;
	return !!x && typeof x === "object" && isArray(x.set) && isArray(x.drop) && isArray(x.add);
};
const isScopeLists = (v: unknown) =>
	!!v &&
	typeof v === "object" &&
	isArray((v as Record<string, unknown>).entity) &&
	isArray((v as Record<string, unknown>).application);

/** Whether `d` has everything a delta needs (a damaged or hand-edited draft is not restored). */
function isDelta(d: unknown): d is WorkspaceDelta {
	if (!d || typeof d !== "object") return false;
	const x = d as Record<string, unknown>;
	const ribbons = x.ribbons as
		| Record<string, { tabs?: unknown; props?: unknown; unset?: unknown } | undefined>
		| undefined;
	const other = (x.other ?? {}) as Record<string, unknown>;
	return (
		!!ribbons &&
		typeof ribbons === "object" &&
		Object.entries(ribbons).every(
			([loc, def]) =>
				LOCATIONS.includes(loc as RibbonLocation) &&
				isListDelta(def?.tabs) &&
				isObject(def?.props) &&
				isArray(def?.unset),
		) &&
		isObject(x.lists) &&
		(Object.keys(DIFFED) as DiffedField[]).every((f) =>
			isListDelta((x.lists as Record<string, unknown>)[f]),
		) &&
		isObject(x.other) &&
		["pendingUnhides", "uncustomisedCommandIds"].every(
			(f) => !(f in other) || isScopeLists(other[f]),
		) &&
		(!("customisedCommandIds" in other) || isArray(other.customisedCommandIds))
	);
}

/** Saves the draft of `state`'s workspace: when it was saved, or null when it couldn't be stored (storage full or unavailable). */
export function writeDraft(key: DraftKey, state: RibbonStoreState): string | null {
	try {
		const stored: StoredDraft = {
			format: DRAFT_FORMAT,
			key: normaliseDraftKey(key),
			savedAt: new Date().toISOString(),
			baselineFingerprint: baselineFingerprint(state),
			data: encode(workspaceDelta(state)),
		};
		localStorage.setItem(draftStorageKey(key), JSON.stringify(stored));
		return stored.savedAt;
	} catch {
		// QuotaExceededError, or storage unavailable.
		return null;
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
		const stored = JSON.parse(raw) as Partial<StoredDraft>;
		if (
			stored.format === DRAFT_FORMAT &&
			sameDraftKey(stored.key, key) &&
			typeof stored.data === "string"
		) {
			const delta = decode(stored.data);
			if (isDelta(delta)) {
				const s = stored as StoredDraft;
				return {
					format: s.format,
					key: s.key,
					savedAt: s.savedAt,
					baselineFingerprint: s.baselineFingerprint,
					delta,
				};
			}
		}
	} catch {
		// Not JSON, or not a deflated delta: removed below.
	}
	deleteDraft(key);
	return null;
}

/**
 * Whether a usable draft is saved for `key` (the table picker's marker, #194):
 * the checks readDraft makes, without decoding the changes.
 */
export function hasDraft(key: DraftKey): boolean {
	try {
		const raw = localStorage.getItem(draftStorageKey(key));
		if (!raw) return false;
		const stored = JSON.parse(raw) as Partial<StoredDraft>;
		return (
			stored.format === DRAFT_FORMAT &&
			sameDraftKey(stored.key, key) &&
			typeof stored.data === "string"
		);
	} catch {
		return false;
	}
}

export function deleteDraft(key: DraftKey): void {
	try {
		localStorage.removeItem(draftStorageKey(key));
	} catch {
		// Storage unavailable.
	}
}

/** Whether the draft stored as `raw` was saved more than DRAFT_MAX_AGE_DAYS before `now` (or is unreadable). */
function expired(raw: string | null, now: number): boolean {
	try {
		const savedAt = Date.parse((JSON.parse(raw ?? "") as Partial<StoredDraft>).savedAt ?? "");
		return !(now - savedAt <= DRAFT_MAX_AGE_DAYS * 86_400_000);
	} catch {
		return true;
	}
}

/**
 * Removes drafts of another format (they can't be restored correctly) and
 * drafts older than DRAFT_MAX_AGE_DAYS. Returns how many.
 */
export function discardOutdatedDrafts(now = Date.now()): number {
	const outdated: string[] = [];
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (!k) continue;
			if (
				k.startsWith(PREFIX)
					? expired(localStorage.getItem(k), now)
					: LEGACY_PREFIXES.some((p) => k.startsWith(p))
			) {
				outdated.push(k);
			}
		}
		for (const k of outdated) localStorage.removeItem(k);
	} catch {
		return 0;
	}
	return outdated.length;
}
