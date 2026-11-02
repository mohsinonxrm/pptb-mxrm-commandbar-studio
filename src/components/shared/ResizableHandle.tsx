import { makeStyles, tokens } from "@fluentui/react-components";
import { useCallback, useRef } from "react";

const useStyles = makeStyles({
	handleV: {
		width: "4px",
		cursor: "col-resize",
		backgroundColor: "transparent",
		flexShrink: 0,
		":hover": { backgroundColor: tokens.colorNeutralStroke2 },
		":active": { backgroundColor: tokens.colorBrandStroke1 },
		":focus-visible": { backgroundColor: tokens.colorBrandStroke1, outline: "none" },
		userSelect: "none",
	},
	handleH: {
		height: "4px",
		cursor: "row-resize",
		backgroundColor: "transparent",
		flexShrink: 0,
		":hover": { backgroundColor: tokens.colorNeutralStroke2 },
		":active": { backgroundColor: tokens.colorBrandStroke1 },
		":focus-visible": { backgroundColor: tokens.colorBrandStroke1, outline: "none" },
		userSelect: "none",
	},
});

/** Pixels per arrow key press; Shift moves further. */
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

interface ResizableHandleProps {
	/** "vertical" = left/right drag (resizes column width), "horizontal" = top/bottom drag (resizes row height) */
	direction: "vertical" | "horizontal";
	onResize: (delta: number) => void;
	/** The size the handle controls, in px, and its limits (aria-valuenow / min / max). */
	value: number;
	min: number;
	max: number;
	/** What the value sizes, read out with it: "Properties pane" → "Properties pane, 386 pixels wide". */
	target: string;
	"aria-label"?: string;
}

export function ResizableHandle({
	direction,
	onResize,
	value,
	min,
	max,
	target,
	"aria-label": ariaLabel = `Resize ${direction} pane`,
}: ResizableHandleProps) {
	const styles = useStyles();
	const startPos = useRef<number>(0);

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			startPos.current = direction === "vertical" ? e.clientX : e.clientY;
		},
		[direction],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			const current = direction === "vertical" ? e.clientX : e.clientY;
			const delta = current - startPos.current;
			startPos.current = current;
			onResize(delta);
		},
		[direction, onResize],
	);

	// The arrow keys move the handle like the pointer does: Left/Up is a negative delta (#23)
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			const keys =
				direction === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
			const sign = e.key === keys[0] ? -1 : e.key === keys[1] ? 1 : 0;
			if (sign === 0) return;
			e.preventDefault();
			onResize(sign * (e.shiftKey ? KEY_STEP_LARGE : KEY_STEP));
		},
		[direction, onResize],
	);

	return (
		// A focusable separator is a widget (the WAI-ARIA window splitter), which jsx-a11y doesn't
		// know, so it reads this as a static separator
		// eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
		<div
			className={direction === "vertical" ? styles.handleV : styles.handleH}
			role="separator"
			aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
			aria-label={ariaLabel}
			aria-valuenow={Math.round(value)}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuetext={`${target}, ${Math.round(value)} pixels ${direction === "vertical" ? "wide" : "high"}`}
			// eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
			tabIndex={0}
			onKeyDown={onKeyDown}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
		/>
	);
}
