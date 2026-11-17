import { forwardRef, useContext, useState } from "react";
import {
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Overflow,
	OverflowItem,
	makeStyles,
	mergeClasses,
	useArrowNavigationGroup,
	useIsOverflowItemVisible,
	useOverflowMenu,
} from "@fluentui/react-components";
import { AddRegular, ChevronDownRegular, MoreVerticalRegular } from "@fluentui/react-icons";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import type { SimulatedEntry } from "@/services/uciPreview/bar";
import { D365 } from "./d365Theme";
import { BarEditingContext, type BarEditing } from "./barEditing";

/**
 * A Dynamics 365 command bar (#191): a white card 44 px high with 8 px corners, 32 px commands
 * (12 px side padding, 16 px icons, 14 px Segoe UI), and the commands that don't fit under a
 * ⋮ button as wide as the bar is high, as Unified Interface draws it (measured on CRM279420,
 * 2026-11-15). Commands keep the bar's order; the last ones go into ⋮ first.
 */

const useStyles = makeStyles({
	card: {
		display: "flex",
		alignItems: "center",
		minWidth: 0,
		height: "44px",
		padding: "0 6px",
		backgroundColor: D365.surface,
		borderRadius: "8px",
		boxShadow: D365.cardShadow,
		fontFamily: D365.font,
		fontSize: "14px",
		color: D365.text,
	},
	compact: {
		height: "32px",
		padding: 0,
		boxShadow: "none",
		backgroundColor: "transparent",
	},
	command: {
		display: "inline-flex",
		alignItems: "center",
		flexShrink: 0,
		gap: "8px",
		height: "32px",
		maxWidth: "240px",
		padding: "1px 12px",
		border: "1px solid transparent",
		borderRadius: "4px",
		backgroundColor: "transparent",
		color: D365.text,
		font: "inherit",
		lineHeight: "14px",
		whiteSpace: "nowrap",
		cursor: "pointer",
		position: "relative",
		":hover": { backgroundColor: D365.hover },
		":focus-visible": { outline: `2px solid ${D365.text}`, outlineOffset: "-2px" },
	},
	compactCommand: { height: "28px", padding: "0 8px", fontSize: "12px" },
	label: { overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 },
	icon: { display: "inline-flex", color: D365.icon, flexShrink: 0 },
	chevron: { color: D365.icon, flexShrink: 0, marginLeft: "-2px" },
	splitDivider: {
		alignSelf: "stretch",
		width: "1px",
		margin: "6px 0",
		backgroundColor: D365.divider,
	},
	/** The command chosen in CBS (Properties shows it). */
	selected: { backgroundColor: D365.selectedBg, border: `1px solid ${D365.brand}` },
	/** Yours: a dot in the corner, as on the artboard. */
	mine: {
		"::after": {
			content: '""',
			position: "absolute",
			top: "3px",
			right: "3px",
			width: "6px",
			height: "6px",
			borderRadius: "50%",
			backgroundColor: D365.brand,
		},
	},
	unknown: { border: `1px dashed ${D365.dashed}` },
	hidden: {
		color: D365.disabledText,
		textDecorationLine: "line-through",
		border: `1px dashed ${D365.dashed}`,
	},
	system: { cursor: "default" },
	/** A hidden command under ⋮ (Show hidden commands): struck through, as on the bar. */
	hiddenItem: { color: D365.disabledText, textDecorationLine: "line-through" },
	more: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		width: "44px",
		height: "32px",
		border: "none",
		borderRadius: "4px",
		backgroundColor: "transparent",
		color: D365.text,
		cursor: "pointer",
		":hover": { backgroundColor: D365.hover },
		":focus-visible": { outline: `2px solid ${D365.text}`, outlineOffset: "-2px" },
	},
	compactMore: { width: "28px", height: "28px" },
	fill: { display: "flex", alignItems: "center", flex: "1 1 0", minWidth: 0, overflow: "hidden" },
	/** A command's place on the bar: the insert marker and drop line sit on its edges. */
	slot: { position: "relative", display: "inline-flex", flexShrink: 0 },
	marker: {
		position: "absolute",
		top: 0,
		bottom: 0,
		left: "-6px",
		width: "12px",
		zIndex: 2,
		display: "flex",
		justifyContent: "center",
		cursor: "pointer",
		":hover > span": { opacity: 1 },
	},
	markerStart: { left: 0 },
	markerEnd: { left: "auto", right: "-6px" },
	markerLine: {
		width: "2px",
		height: "100%",
		backgroundColor: D365.brand,
		opacity: 0,
	},
	markerPlus: {
		position: "absolute",
		top: "-6px",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "14px",
		height: "14px",
		borderRadius: "50%",
		backgroundColor: D365.brand,
		color: D365.surface,
		opacity: 0,
	},
	/** Where a dragged command will go. */
	dropLine: {
		position: "absolute",
		top: "2px",
		bottom: "2px",
		left: "-1px",
		width: "2px",
		backgroundColor: D365.brand,
		zIndex: 2,
		pointerEvents: "none",
	},
	dropLineEnd: { left: "auto", right: "-1px" },
});

export interface BarCommandProps {
	entry: SimulatedEntry;
	text: string;
	/** Why it isn't shown, or can't be told (its accessible description). */
	reason?: string;
	selected: boolean;
	mine: boolean;
	onChoose: () => void;
}

const DRAG_TYPE = "application/x-cbs-simulated";

interface DragState {
	dragId: string | null;
	setDragId(id: string | null): void;
	dropGap: number | null;
	setDropGap(gap: number | null): void;
}

export function D365CommandBar({
	label,
	commands,
	compact,
}: {
	label: string;
	commands: BarCommandProps[];
	/** A sub-grid's bar: no card, smaller commands. */
	compact?: boolean;
}) {
	const styles = useStyles();
	const arrowKeys = useArrowNavigationGroup({ axis: "horizontal", memorizeCurrent: true });
	const editing = useContext(BarEditingContext);
	const [dragId, setDragId] = useState<string | null>(null);
	const [dropGap, setDropGap] = useState<number | null>(null);
	const drag: DragState = { dragId, setDragId, dropGap, setDropGap };
	return (
		<div
			className={mergeClasses(styles.card, compact && styles.compact)}
			onDragLeave={(e) => {
				// Left the bar (not just moved between its commands): no drop place.
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropGap(null);
			}}
		>
			<Overflow padding={compact ? 32 : 48}>
				<div className={styles.fill} role="toolbar" aria-label={label} {...arrowKeys}>
					{commands.map((c, i) => (
						<OverflowItem
							key={c.entry.id}
							id={c.entry.id}
							// The command chosen in CBS stays in view.
							priority={c.selected ? 2 : 1}
						>
							<BarSlot
								command={c}
								index={i}
								last={i === commands.length - 1}
								compact={compact}
								editing={editing}
								drag={drag}
							/>
						</OverflowItem>
					))}
					<MoreCommands commands={commands} compact={compact} />
				</div>
			</Overflow>
		</div>
	);
}

/**
 * A command on the bar, with Simulate's editing around it: the insert marker before it (and
 * after the last), the drop line while a command is dragged, and its context menu. Passes its
 * ref on: Fluent's Overflow measures it.
 */
const BarSlot = forwardRef<
	HTMLSpanElement,
	{
		command: BarCommandProps;
		index: number;
		last: boolean;
		compact?: boolean;
		editing: BarEditing | null;
		drag: DragState;
	}
>(function BarSlot({ command, index, last, compact, editing, drag }, ref) {
	const styles = useStyles();
	const { entry } = command;
	const movable = !!editing && editing.canMove(entry);
	const dragging = drag.dragId !== null;
	const onDragOver = (e: React.DragEvent<HTMLSpanElement>) => {
		if (!editing || !dragging) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		const rect = e.currentTarget.getBoundingClientRect();
		drag.setDropGap(e.clientX < rect.left + rect.width / 2 ? index : index + 1);
	};
	const onDrop = (e: React.DragEvent<HTMLSpanElement>) => {
		if (!editing || drag.dragId === null || drag.dropGap === null) return;
		e.preventDefault();
		editing.moveTo(drag.dragId, drag.dropGap);
		drag.setDragId(null);
		drag.setDropGap(null);
	};
	const button = (
		<BarCommand
			{...command}
			compact={compact}
			draggable={movable || undefined}
			aria-keyshortcuts={movable ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
			onDragStart={
				movable
					? (e: React.DragEvent<HTMLButtonElement>) => {
							e.dataTransfer.effectAllowed = "move";
							e.dataTransfer.setData(DRAG_TYPE, entry.id);
							drag.setDragId(entry.id);
						}
					: undefined
			}
			onDragEnd={
				movable
					? () => {
							drag.setDragId(null);
							drag.setDropGap(null);
						}
					: undefined
			}
			onKeyDown={
				movable
					? (e: React.KeyboardEvent<HTMLButtonElement>) => {
							if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight"))
								return;
							e.preventDefault();
							e.stopPropagation();
							editing!.moveBy(entry.id, e.key === "ArrowLeft" ? "earlier" : "later");
						}
					: undefined
			}
		/>
	);
	return (
		<span ref={ref} className={styles.slot} onDragOver={onDragOver} onDrop={onDrop}>
			{editing && !dragging && (
				<InsertMarker
					gap={index}
					edge={index === 0 ? "start" : undefined}
					editing={editing}
				/>
			)}
			{drag.dropGap === index && <span className={styles.dropLine} data-drop-gap={index} />}
			{editing && entry.kind === "classic" ? (
				<Menu openOnContext>
					<MenuTrigger disableButtonEnhancement>{button}</MenuTrigger>
					<MenuPopover>
						<MenuList>
							<MenuItem onClick={() => editing.insertAt(index)}>
								Add a button before
							</MenuItem>
							<MenuItem onClick={() => editing.insertAt(index + 1)}>
								Add a button after
							</MenuItem>
							{movable && (
								<>
									<MenuItem
										disabled={!editing.canMoveBy(entry.id, "earlier")}
										secondaryContent="Alt+←"
										onClick={() => editing.moveBy(entry.id, "earlier")}
									>
										Move earlier
									</MenuItem>
									<MenuItem
										disabled={!editing.canMoveBy(entry.id, "later")}
										secondaryContent="Alt+→"
										onClick={() => editing.moveBy(entry.id, "later")}
									>
										Move later
									</MenuItem>
								</>
							)}
						</MenuList>
					</MenuPopover>
				</Menu>
			) : (
				button
			)}
			{last && editing && !dragging && (
				<InsertMarker gap={index + 1} edge="end" editing={editing} />
			)}
			{last && drag.dropGap === index + 1 && (
				<span
					className={mergeClasses(styles.dropLine, styles.dropLineEnd)}
					data-drop-gap={index + 1}
				/>
			)}
		</span>
	);
});

/**
 * A "+" between two commands, shown on hover, that adds a button there. Mouse only: the
 * keyboard gets the same through a command's context menu (Shift+F10).
 */
function InsertMarker({
	gap,
	edge,
	editing,
}: {
	gap: number;
	edge?: "start" | "end";
	editing: BarEditing;
}) {
	const styles = useStyles();
	return (
		// a mouse shortcut; the context menu's Add a button before / after is the keyboard's way
		<span
			aria-hidden="true"
			data-insert-gap={gap}
			title="Add a button here"
			className={mergeClasses(
				styles.marker,
				edge === "start" && styles.markerStart,
				edge === "end" && styles.markerEnd,
			)}
			onClick={(e) => {
				e.stopPropagation();
				editing.insertAt(gap);
			}}
		>
			<span className={styles.markerLine} />
			<span className={styles.markerPlus}>
				<AddRegular fontSize={10} />
			</span>
		</span>
	);
}

type NativeButtonProps = Pick<
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	"draggable" | "onDragStart" | "onDragEnd" | "onKeyDown" | "aria-keyshortcuts" | "onContextMenu"
>;

/** One command, as Dynamics 365 draws it. */
const BarCommand = forwardRef<
	HTMLButtonElement,
	BarCommandProps & { compact?: boolean } & NativeButtonProps
>(function BarCommand({ entry, text, reason, selected, mine, onChoose, compact, ...native }, ref) {
	const styles = useStyles();
	const v = entry.verdict.outcome;
	// A flyout shows its chevron, menu filled when opened (Run Report) too; a split button its
	// action and, apart, its menu's chevron (Email a Link with no rows), when it's drawn split.
	const menu = entry.drawn === "flyout" || entry.drawn === "split";
	const split = entry.drawn === "split";
	return (
		// eslint-disable-next-line no-restricted-syntax, jsx-a11y/role-supports-aria-props -- drawn as Dynamics 365 draws it; aria-description (ARIA 1.3) is read by Chromium
		<button
			{...native}
			ref={ref}
			type="button"
			data-simulated={entry.id}
			aria-disabled={entry.kind === "system" || undefined}
			aria-current={selected || undefined}
			aria-description={
				reason ?? (entry.kind === "system" ? "Added by Unified Interface" : undefined)
			}
			title={reason ? `${text}\n\n${reason}` : text}
			className={mergeClasses(
				styles.command,
				compact && styles.compactCommand,
				entry.kind === "system" && styles.system,
				v === "unknown" && styles.unknown,
				v === false && styles.hidden,
				mine && styles.mine,
				selected && styles.selected,
			)}
			onClick={entry.kind === "system" ? undefined : onChoose}
		>
			{entry.kind === "classic" && (
				<span className={styles.icon}>
					<RibbonButtonIcon button={entry.button} size={16} light />
				</span>
			)}
			<span className={styles.label}>{text}</span>
			{menu && split && <span className={styles.splitDivider} aria-hidden="true" />}
			{menu && <ChevronDownRegular fontSize={12} className={styles.chevron} />}
		</button>
	);
});

/** ⋮: the commands that didn't fit, in the bar's order. */
function MoreCommands({ commands, compact }: { commands: BarCommandProps[]; compact?: boolean }) {
	const styles = useStyles();
	const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>();
	if (!isOverflowing) return null;
	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>
				{/* eslint-disable-next-line no-restricted-syntax -- drawn as Dynamics 365 draws it */}
				<button
					ref={ref}
					type="button"
					aria-haspopup="menu"
					aria-label={`More commands (${overflowCount})`}
					title="More commands"
					className={mergeClasses(styles.more, compact && styles.compactMore)}
				>
					<MoreVerticalRegular fontSize={compact ? 16 : 20} />
				</button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{commands.map((c) => (
						<MoreItem key={c.entry.id} {...c} />
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}

function MoreItem({ entry, text, reason, onChoose }: BarCommandProps) {
	const styles = useStyles();
	const visible = useIsOverflowItemVisible(entry.id);
	if (visible) return null;
	return (
		<MenuItem
			data-simulated-overflow={entry.id}
			disabled={entry.kind === "system"}
			icon={
				entry.kind === "classic" ? (
					<RibbonButtonIcon button={entry.button} size={16} light />
				) : undefined
			}
			secondaryContent={
				entry.verdict.outcome === "unknown"
					? "Can't tell"
					: entry.verdict.outcome === false
						? "Hidden"
						: undefined
			}
			className={entry.verdict.outcome === false ? styles.hiddenItem : undefined}
			aria-description={reason}
			onClick={entry.kind === "system" ? undefined : onChoose}
		>
			{text}
		</MenuItem>
	);
}
