/**
 * The last publish of each table in this window (#64 review): which
 * CustomActions it wrote, and when. RetrieveEntityRibbon is served from
 * per-server caches and has been seen returning the ribbon from before a
 * publish 10+ minutes later, so a button just published can be missing from
 * a reload — it must not then be offered for deletion as an orphan.
 *
 * Kept in sessionStorage (per PPTB window, survives reloading the table);
 * unavailable storage just means nothing is remembered.
 */

export interface RecentPublish {
	/** When the publish finished (ms since epoch). */
	at: number;
	/** Ids of the CustomActions the publish added or changed. */
	customActionIds: string[];
}

const keyOf = (orgUrl: string, entityLogicalName: string) =>
	`cbs:lastPublish:${orgUrl.replace(/\/+$/, "")}:${entityLogicalName}`;

/**
 * Remembers a table's publish. `changedKeys` are the `part:id` keys the
 * publish added or changed (publishService.buildMergedRibbonDiffXml).
 */
export function rememberPublish(
	orgUrl: string,
	entityLogicalName: string,
	changedKeys: string[],
	at = Date.now(),
): void {
	const customActionIds = changedKeys.flatMap(
		(k) => /^customActions:ca:(.+)$/.exec(k)?.[1] ?? [],
	);
	try {
		sessionStorage.setItem(
			keyOf(orgUrl, entityLogicalName),
			JSON.stringify({ at, customActionIds }),
		);
	} catch {
		// Storage unavailable: nothing remembered.
	}
}

/** The table's last publish in this window, or null. */
export function recentPublishOf(orgUrl: string, entityLogicalName: string): RecentPublish | null {
	try {
		const raw = sessionStorage.getItem(keyOf(orgUrl, entityLogicalName));
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<RecentPublish>;
		if (typeof value.at !== "number" || !Array.isArray(value.customActionIds)) return null;
		return {
			at: value.at,
			customActionIds: value.customActionIds.filter((id) => typeof id === "string"),
		};
	} catch {
		return null;
	}
}
