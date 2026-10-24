/** The canvas keeps at least this share of the window's width (#22). */
const MIN_CANVAS_SHARE = 0.4;
export const MIN_LEFT = 160;
export const MIN_RIGHT = 200;

/**
 * The side panes' widths for a window `width` wide: as set, unless they'd
 * leave the canvas less than MIN_CANVAS_SHARE of it. Then both give way in
 * proportion, down to their minimums. In an 800 px pane the canvas showed one
 * group at a time (#22). The widths set by dragging aren't changed.
 */
export function fitPaneWidths(
	width: number,
	left: number,
	right: number,
): { left: number; right: number } {
	const over = left + right - width * (1 - MIN_CANVAS_SHARE);
	if (over <= 0 || left + right === 0) return { left, right };
	const shrink = (w: number, min: number) =>
		Math.max(Math.min(w, min), Math.round(w - (over * w) / (left + right)));
	return { left: shrink(left, MIN_LEFT), right: right === 0 ? 0 : shrink(right, MIN_RIGHT) };
}
