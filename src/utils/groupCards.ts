import { bySequence } from "@/store/ribbonStore";
import type { RibbonGroup } from "@/types/ribbon";

/** The group cards' drag and drop (#194). */

/** A row being dragged, or what it is dropped on (a row, or a card's empty space). */
export interface DropSpot {
	groupId: string;
	buttonId?: string;
}

/**
 * Where a dragged row goes (#194): onto a row, it takes that row's place (after
 * it when moved down its own group); onto a card's empty space, it goes last.
 * null when nothing moves. `before` is moveButton's beforeButtonId.
 */
export function dropPlace(
	groups: readonly RibbonGroup[],
	from: DropSpot,
	over: DropSpot,
): { groupId: string; before?: string } | null {
	if (!from.buttonId || (over.groupId === from.groupId && over.buttonId === from.buttonId))
		return null;
	const dst = groups.find((g) => g.id === over.groupId);
	if (!dst) return null;
	const rows = bySequence(dst.buttons);
	if (!over.buttonId) {
		if (dst.id === from.groupId && rows.at(-1)?.id === from.buttonId) return null;
		return { groupId: dst.id };
	}
	const to = rows.findIndex((b) => b.id === over.buttonId);
	if (to < 0) return null;
	const fromIdx = dst.id === from.groupId ? rows.findIndex((b) => b.id === from.buttonId) : -1;
	if (fromIdx >= 0 && fromIdx < to) {
		const next = rows[to + 1]?.id;
		return next ? { groupId: dst.id, before: next } : { groupId: dst.id };
	}
	return { groupId: dst.id, before: over.buttonId };
}
