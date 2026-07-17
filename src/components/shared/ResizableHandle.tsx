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
		userSelect: "none",
	},
	handleH: {
		height: "4px",
		cursor: "row-resize",
		backgroundColor: "transparent",
		flexShrink: 0,
		":hover": { backgroundColor: tokens.colorNeutralStroke2 },
		":active": { backgroundColor: tokens.colorBrandStroke1 },
		userSelect: "none",
	},
});

interface ResizableHandleProps {
	/** "vertical" = left/right drag (resizes column width), "horizontal" = top/bottom drag (resizes row height) */
	direction: "vertical" | "horizontal";
	onResize: (delta: number) => void;
	"aria-label"?: string;
}

export function ResizableHandle({
	direction,
	onResize,
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

	return (
		<div
			className={direction === "vertical" ? styles.handleV : styles.handleH}
			role="separator"
			aria-orientation={direction === "vertical" ? "vertical" : "horizontal"}
			aria-label={ariaLabel}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
		/>
	);
}
