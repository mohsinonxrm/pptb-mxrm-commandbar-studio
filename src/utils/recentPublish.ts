/**
 * The recent publishes of each table in this window (#64 review): which
 * CustomActions they wrote, and when. RetrieveEntityRibbon is served from
 * per-server caches and has been seen returning the ribbon from before a
 * publish 10+ minutes later, so a button just published can be missing from
 * a reload — it must not then be offered for deletion as an orphan.
 *
 * Kept in sessionStorage (per PPTB window, survives reloading the table);
 * unavailable storage just means nothing is remembered.
 */

/** How long after a publish the ribbon may still be the one from before it. */
export const RECENT_PUBLISH_MINUTES = 30;
const WINDOW_MS = RECENT_PUBLISH_MINUTES * 60_000;

export interface RecentPublish {
	/** When the table's last publish finished (ms since epoch). */
	at: number;
	/**
	 * The CustomActions recent publishes added or changed, with when each was
	 * last published. Entries older than RECENT_PUBLISH_MINUTES are dropped.
	 */
	publishedAt: Record<string, number>;
}

const keyOf = (orgUrl: string, entityLogicalName: string) =>
	`cbs:lastPublish:${orgUrl.replace(/\/+$/, "")}:${entityLogicalName}`;

function read(key: string, now: number): RecentPublish | null {
	try {
		const raw = sessionStorage.getItem(key);
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<RecentPublish>;
		if (typeof value.at !== "number" || !value.publishedAt || typeof value.publishedAt !== "object") return null;
		const publishedAt = Object.fromEntries(
			Object.entries(value.publishedAt).filter(
				(e): e is [string, number] => typeof e[1] === "number" && now - e[1] < WINDOW_MS,
			),
		);
		return { at: value.at, publishedAt };
	} catch {
		return null;
	}
}

/**
 * Remembers a table's publish. `changedKeys` are the `part:id` keys the
 * publish added or changed (publishService.buildMergedRibbonDiffXml). What an
 * earlier publish wrote less than RECENT_PUBLISH_MINUTES ago is kept: a later,
 * unrelated publish doesn't make it deletable while the ribbon may be stale.
 */
export function rememberPublish(
	orgUrl: string,
	entityLogicalName: string,
	changedKeys: string[],
	at = Date.now(),
): void {
	const key = keyOf(orgUrl, entityLogicalName);
	const publishedAt = { ...(read(key, at)?.publishedAt ?? {}) };
	for (const k of changedKeys) {
		const id = /^customActions:ca:(.+)$/.exec(k)?.[1];
		if (id) publishedAt[id] = at;
	}
	try {
		sessionStorage.setItem(key, JSON.stringify({ at, publishedAt }));
	} catch {
		// Storage unavailable: nothing remembered.
	}
}

/** The table's recent publishes in this window (entries still within the window), or null. */
export function recentPublishOf(orgUrl: string, entityLogicalName: string, now = Date.now()): RecentPublish | null {
	return read(keyOf(orgUrl, entityLogicalName), now);
}
