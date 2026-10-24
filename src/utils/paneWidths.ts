/** The canvas keeps at least this share of the window's width (#22). */
const MIN_CANVAS_SHARE = 0.4;
export const MIN_LEFT = 160;
export const MIN_RIGHT = 200;
const MAX_LEFT = 500;
const MAX_RIGHT = 600;

/**
 * The side panes' widths for a window `width` wide: as set, unless they'd
 * leave the canvas less than MIN_CANVAS_SHARE of it. Then both give way in
 * proportion, down to their minimums. In an 800 px pane the canvas showed one
 * group at a time (#22). The widths you set are kept for a wider window.
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

/**
 * The widths to store when a pane's handle is dragged by `delta` px (`right`
 * is 0 when the Properties pane isn't docked). The drag starts from the widths
 * as shown, for both panes: starting the dragged pane from its fitted width
 * while the other kept its larger stored one made the fit shrink the pane
 * being widened (#22 review).
 */
export function dragPaneWidths(
	width: number,
	left: number,
	right: number,
	side: "left" | "right",
	delta: number,
): { left?: number; right?: number } {
	const shown = fitPaneWidths(width, left, right);
	const clamp = (w: number, min: number, max: number) => Math.max(min, Math.min(max, w));
	if (side === "left") {
		const next = clamp(shown.left + delta, MIN_LEFT, MAX_LEFT);
		return right > 0 && shown.right !== right
			? { left: next, right: shown.right }
			: { left: next };
	}
	const next = clamp(shown.right - delta, MIN_RIGHT, MAX_RIGHT);
	return shown.left !== left ? { left: shown.left, right: next } : { right: next };
}
