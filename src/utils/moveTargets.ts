import { resolveDisplayLabel } from "@/utils/displayLabel";
import type { LocLabel, RibbonTab } from "@/types/ribbon";

export interface MoveTarget {
	groupId: string;
	/** The group's title as the canvas shows it; never a `$LocLabels:` / `$Resources:` token. */
	text: string;
}

/**
 * The groups a button can be moved to from its context menu (#75): every
 * group of the tab except the one holding the button — by the group id the
 * menu was opened for and by where the button actually is, so a stale id
 * never offers the current group. Titles resolve like the canvas renders
 * them, fall back to the group id when there's no text, and get the id
 * appended when two targets would otherwise read the same.
 */
export function moveTargets(
	tab: RibbonTab,
	currentGroupId: string,
	buttonId: string | undefined,
	locLabels: LocLabel[],
	languageCode?: number,
): MoveTarget[] {
	const targets = tab.groups
		.filter((g) => g.id !== currentGroupId && !(buttonId && g.buttons.some((b) => b.id === buttonId)))
		.map((g) => ({ groupId: g.id, text: resolveDisplayLabel(g.label, locLabels, languageCode).trim() || g.id }));
	const count = new Map<string, number>();
	for (const t of targets) count.set(t.text, (count.get(t.text) ?? 0) + 1);
	return targets.map((t) =>
		(count.get(t.text) ?? 0) > 1 && t.text !== t.groupId ? { ...t, text: `${t.text} (${t.groupId})` } : t,
	);
}
