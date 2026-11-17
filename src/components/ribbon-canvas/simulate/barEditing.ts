import { createContext } from "react";
import type { SimulatedEntry } from "@/services/uciPreview/bar";

/**
 * Editing on the bar (#191 C5), given by Simulate: add a button at a gap (an insert marker, or a
 * command's context menu), and move a classic command (drag it to a gap, its context menu, or
 * Alt+←/→). Gap `i` is before the `i`th command listed, `commands.length` after the last.
 */
export interface BarEditing {
	insertAt(gap: number): void;
	moveTo(entryId: string, gap: number): void;
	moveBy(entryId: string, direction: "earlier" | "later"): void;
	/** Whether a command can be moved: a classic one, not a read-only global one. */
	canMove(entry: SimulatedEntry): boolean;
	/** Whether there's a place to move it to, earlier or later. */
	canMoveBy(entryId: string, direction: "earlier" | "later"): boolean;
}

/** Simulate's editing; none on a bar drawn elsewhere. */
export const BarEditingContext = createContext<BarEditing | null>(null);
