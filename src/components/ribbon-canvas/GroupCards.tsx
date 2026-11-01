import { useRef, useState } from "react";
import {
	Badge,
	Button,
	Text,
	Tooltip,
	makeStyles,
	mergeClasses,
	tokens,
} from "@fluentui/react-components";
import { AddRegular, MoreVerticalRegular, ReOrderDotsVerticalRegular } from "@fluentui/react-icons";
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	pointerWithin,
	type CollisionDetection,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { bySequence, useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useDisplayText } from "@/hooks/useDisplayText";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { ButtonContextMenu, type ButtonMenuTarget } from "@/components/shared/ButtonContextMenu";
import { GroupContextMenu, type GroupMenuTarget } from "@/components/shared/GroupContextMenu";
import { CONTROL_KIND_LABELS, isReadOnlyControlKind } from "@/utils/controlKinds";
import { isGlobalOobReadOnly } from "@/utils/ribbonProvenance";
import { dropPlace, type DropSpot } from "@/utils/groupCards";
import type { RibbonButton, RibbonGroup, RibbonLocation, RibbonTab } from "@/types/ribbon";

/**
 * Edit mode's Groups view (#194): a card per group of the tab, in the tab's
 * order, with its controls in Sequence order. A card's ⋮ menu has the group's
 * actions (the shared group menu, with Move left / Move right); a row selects
 * its control, and its menu (right-click, Shift+F10, the Menu key) is the
 * shared button menu. Rows are dragged to reorder or move them: with the
 * pointer, or with the keyboard (Space picks up, the arrow keys move, Space or
 * Enter drops, Escape cancels).
 */

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalM,
	},
	card: {
		flex: "1 1 240px",
		minWidth: "220px",
		maxWidth: "320px",
		display: "flex",
		flexDirection: "column",
		backgroundColor: tokens.colorNeutralBackground1,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusLarge,
		boxShadow: tokens.shadow2,
		minHeight: 0,
	},
	cardSelected: { border: `1px solid ${tokens.colorBrandStroke1}` },
	cardOver: { backgroundColor: tokens.colorBrandBackground2 },
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXS} ${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
	},
	titleButton: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-start",
		justifyContent: "flex-start",
		padding: 0,
		fontWeight: "inherit",
		textAlign: "left",
	},
	ellipsis: {
		display: "block",
		maxWidth: "100%",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	rows: {
		display: "flex",
		flexDirection: "column",
		padding: tokens.spacingVerticalXS,
		gap: "2px",
		minHeight: "8px",
	},
	row: {
		display: "flex",
		alignItems: "center",
		justifyContent: "flex-start",
		gap: tokens.spacingHorizontalS,
		width: "100%",
		maxWidth: "100%",
		minWidth: 0,
		minHeight: "32px",
		padding: `0 ${tokens.spacingHorizontalS}`,
		fontWeight: tokens.fontWeightRegular,
		textAlign: "left",
	},
	rowSelected: {
		backgroundColor: tokens.colorSubtleBackgroundSelected,
		border: `1px solid ${tokens.colorBrandStroke1}`,
	},
	rowHidden: { color: tokens.colorNeutralForeground3 },
	handle: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
	handleOff: { visibility: "hidden" },
	label: { flex: 1, minWidth: 0 },
	footer: { padding: `0 ${tokens.spacingHorizontalXS} ${tokens.spacingVerticalXS}` },
	overlay: {
		boxShadow: tokens.shadow16,
		backgroundColor: tokens.colorNeutralBackground1,
		borderRadius: tokens.borderRadiusMedium,
	},
});

/**
 * A card holds its rows, so the card's centre is near its middle rows: rows
 * win (#194 review). With the pointer, the row or card under it; with the
 * keyboard, the nearest row, or an empty card.
 */
const rowsFirst: CollisionDetection = (args) => {
	const rows = args.droppableContainers.filter((c) => String(c.id).startsWith("row:"));
	const cards = args.droppableContainers.filter((c) => String(c.id).startsWith("card:"));
	if (args.pointerCoordinates) {
		const row = pointerWithin({ ...args, droppableContainers: rows });
		if (row.length) return row;
		const card = pointerWithin({ ...args, droppableContainers: cards });
		if (card.length) return card;
	}
	const rowGroups = new Set(rows.map((r) => (r.data.current as DropSpot | undefined)?.groupId));
	const emptyCards = cards.filter(
		(c) => !rowGroups.has((c.data.current as DropSpot | undefined)?.groupId),
	);
	return closestCenter({ ...args, droppableContainers: [...rows, ...emptyCards] });
};

const rowId = (groupId: string, buttonId: string) => `row:${groupId}:${buttonId}`;
const cardId = (groupId: string) => `card:${groupId}`;

export function GroupCards({ tab, location }: { tab: RibbonTab; location: RibbonLocation }) {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const moveButton = useRibbonStore((s) => s.moveButton);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectGroup = useSelectionStore((s) => s.selectGroup);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const openNewButton = useUIStore((s) => s.openNewButton);
	const [groupMenu, setGroupMenu] = useState<GroupMenuTarget | null>(null);
	const [buttonMenu, setButtonMenu] = useState<ButtonMenuTarget | null>(null);
	const [dragging, setDragging] = useState<{ button: RibbonButton; groupId: string } | null>(
		null,
	);
	const [overGroup, setOverGroup] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	const groupText = (g: RibbonGroup) =>
		captionOf(g.label, locLabels, lang, g.source?.titleToken) || g.id;
	const buttonText = (b: RibbonButton) =>
		captionOf(b.label, locLabels, undefined, b.source?.labelToken) || b.id;

	// A small movement starts a pointer drag, so a click still selects. The
	// keyboard picks a row up with Space: Enter stays "select".
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
			keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
		}),
	);

	/**
	 * When a menu closes without opening a dialog, focus goes back to what
	 * opened it: Fluent would put it on the first control of the page, as the
	 * menu has no trigger of its own. A control moved elsewhere (Move to) is
	 * focused where it is now.
	 */
	const refocus = (anchor: GroupMenuTarget["anchor"] | undefined) =>
		// A timeout, not an animation frame: frames don't run while the window is hidden.
		setTimeout(() => {
			if (document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')) return;
			const selected = useSelectionStore.getState().selectedButtonId;
			const el =
				anchor instanceof HTMLElement && anchor.isConnected
					? anchor
					: [
							...(rootRef.current?.querySelectorAll<HTMLElement>(
								"[data-card-button]",
							) ?? []),
						].find((r) => r.dataset.cardButton === selected);
			el?.focus();
		});

	// What a screen reader hears while dragging: labels, not internal ids.
	const nameOf = (id: string | number | undefined) => {
		const raw = String(id ?? "");
		for (const g of tab.groups) {
			if (raw === cardId(g.id)) return `the end of ${groupText(g)}`;
			const b = g.buttons.find((x) => raw === rowId(g.id, x.id));
			if (b) return `${buttonText(b)} in ${groupText(g)}`;
		}
		return "";
	};

	const spotOf = (data: unknown): DropSpot | null =>
		data && typeof data === "object" && "groupId" in data ? (data as DropSpot) : null;

	const onDragStart = (e: DragStartEvent) => {
		const from = spotOf(e.active.data.current);
		const group = tab.groups.find((g) => g.id === from?.groupId);
		const button = group?.buttons.find((b) => b.id === from?.buttonId);
		if (group && button) setDragging({ button, groupId: group.id });
	};
	const onDragEnd = (e: DragEndEvent) => {
		setDragging(null);
		setOverGroup(null);
		const from = spotOf(e.active.data.current);
		const over = spotOf(e.over?.data.current);
		if (!from?.buttonId || !over) return;
		const place = dropPlace(tab.groups, from, over);
		if (!place) return;
		const movedId = moveButton(
			{ location, tabId: tab.id, groupId: from.groupId, buttonId: from.buttonId },
			{ location, tabId: tab.id, groupId: place.groupId, beforeButtonId: place.before },
		);
		// A control that isn't yours moves as a copy with a new id (#26): select it,
		// and keep the focus on it (its row is a new element, so dnd-kit can't).
		if (movedId) {
			selectButtonInContext(location, tab.id, place.groupId, movedId);
			setTimeout(() =>
				[...(rootRef.current?.querySelectorAll<HTMLElement>("[data-card-button]") ?? [])]
					.find((r) => r.dataset.cardButton === movedId)
					?.focus(),
			);
		}
	};

	return (
		<>
			<DndContext
				sensors={sensors}
				collisionDetection={rowsFirst}
				onDragStart={onDragStart}
				onDragOver={(e) => setOverGroup(spotOf(e.over?.data.current)?.groupId ?? null)}
				onDragEnd={onDragEnd}
				onDragCancel={() => {
					setDragging(null);
					setOverGroup(null);
				}}
				accessibility={{
					screenReaderInstructions: {
						draggable:
							"To move a button, press Space. Use the arrow keys to move it, Space or Enter to drop it, Escape to cancel.",
					},
					announcements: {
						onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
						onDragOver: ({ active, over }) =>
							over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : undefined,
						onDragEnd: ({ active, over }) =>
							over
								? `${nameOf(active.id)} was dropped on ${nameOf(over.id)}.`
								: `${nameOf(active.id)} was dropped.`,
						onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
					},
				}}
			>
				<div
					ref={rootRef}
					className={styles.root}
					aria-label={`Groups of ${tab.id}`}
					role="list"
				>
					{bySequence(tab.groups).map((group) => (
						<GroupCard
							key={group.id}
							group={group}
							tab={tab}
							location={location}
							title={groupText(group)}
							buttonText={buttonText}
							selected={selectedGroupId === group.id && !selectedButtonId}
							selectedButtonId={
								selectedGroupId === group.id ? selectedButtonId : null
							}
							dropping={overGroup === group.id && !!dragging}
							onSelectGroup={() => selectGroup(group.id)}
							onSelectButton={(b) =>
								selectButtonInContext(location, tab.id, group.id, b.id)
							}
							onGroupMenu={(anchor) => {
								selectGroup(group.id);
								setGroupMenu({ group, anchor });
							}}
							onButtonMenu={(b, anchor) => {
								selectButtonInContext(location, tab.id, group.id, b.id);
								setButtonMenu({ button: b, groupId: group.id, anchor });
							}}
							onAddButton={() => openNewButton(group.id)}
						/>
					))}
				</div>
				<DragOverlay dropAnimation={null}>
					{dragging && (
						<div className={mergeClasses(styles.row, styles.overlay)}>
							<ReOrderDotsVerticalRegular className={styles.handle} />
							<RibbonButtonIcon button={dragging.button} size={16} />
							<span className={mergeClasses(styles.label, styles.ellipsis)}>
								{buttonText(dragging.button)}
							</span>
						</div>
					)}
				</DragOverlay>
			</DndContext>
			<GroupContextMenu
				location={location}
				tab={tab}
				target={groupMenu}
				onClose={() => {
					refocus(groupMenu?.anchor);
					setGroupMenu(null);
				}}
			/>
			<ButtonContextMenu
				location={location}
				tab={tab}
				target={buttonMenu}
				onClose={() => {
					refocus(buttonMenu?.anchor);
					setButtonMenu(null);
				}}
			/>
		</>
	);
}

interface GroupCardProps {
	group: RibbonGroup;
	tab: RibbonTab;
	location: RibbonLocation;
	title: string;
	buttonText: (b: RibbonButton) => string;
	selected: boolean;
	selectedButtonId: string | null;
	dropping: boolean;
	onSelectGroup: () => void;
	onSelectButton: (b: RibbonButton) => void;
	onGroupMenu: (anchor: HTMLElement) => void;
	onButtonMenu: (b: RibbonButton, anchor: HTMLElement) => void;
	onAddButton: () => void;
}

function GroupCard({
	group,
	tab,
	location,
	title,
	buttonText,
	selected,
	selectedButtonId,
	dropping,
	onSelectGroup,
	onSelectButton,
	onGroupMenu,
	onButtonMenu,
	onAddButton,
}: GroupCardProps) {
	const styles = useStyles();
	// The card's empty space takes a drop too (an empty group, or "last").
	const { setNodeRef } = useDroppable({ id: cardId(group.id), data: { groupId: group.id } });
	const rows = bySequence(group.buttons);
	return (
		<section
			ref={setNodeRef}
			role="listitem"
			aria-label={title}
			data-group-card={group.id}
			className={mergeClasses(
				styles.card,
				selected && styles.cardSelected,
				dropping && styles.cardOver,
			)}
		>
			<div className={styles.header}>
				<Tooltip content={`${title} (${group.id})`} relationship="description">
					<Button
						appearance="transparent"
						className={styles.titleButton}
						aria-pressed={selected}
						onClick={onSelectGroup}
						onContextMenu={(e) => {
							e.preventDefault();
							onGroupMenu(e.currentTarget);
						}}
						onKeyDown={(e) => {
							if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
								e.preventDefault();
								onGroupMenu(e.currentTarget);
							}
						}}
					>
						<Text weight="semibold" size={300} className={styles.ellipsis}>
							{title}
						</Text>
						<Text size={100} className={mergeClasses(styles.ellipsis, styles.muted)}>
							{group.template || "Flexible2"}
						</Text>
					</Button>
				</Tooltip>
				<Tooltip content="Group options" relationship="label">
					<Button
						appearance="subtle"
						size="small"
						icon={<MoreVerticalRegular />}
						aria-label={`Group options: ${title}`}
						onClick={(e) => onGroupMenu(e.currentTarget)}
					/>
				</Tooltip>
			</div>
			<SortableContext
				items={rows.map((b) => rowId(group.id, b.id))}
				strategy={verticalListSortingStrategy}
			>
				<div className={styles.rows} role="list" aria-label={`Buttons in ${title}`}>
					{rows.map((b) => (
						<ButtonRow
							key={b.id}
							button={b}
							groupId={group.id}
							text={buttonText(b)}
							locked={b.managed || isGlobalOobReadOnly(location, tab.id, b)}
							selected={selectedButtonId === b.id}
							onSelect={() => onSelectButton(b)}
							onMenu={(anchor) => onButtonMenu(b, anchor)}
						/>
					))}
				</div>
			</SortableContext>
			<div className={styles.footer}>
				<Button
					appearance="subtle"
					size="small"
					icon={<AddRegular />}
					onClick={onAddButton}
					aria-label={`Add button to ${title}`}
				>
					Add button
				</Button>
			</div>
		</section>
	);
}

interface ButtonRowProps {
	button: RibbonButton;
	groupId: string;
	text: string;
	locked: boolean;
	selected: boolean;
	onSelect: () => void;
	onMenu: (anchor: HTMLElement) => void;
}

function ButtonRow({ button, groupId, text, locked, selected, onSelect, onMenu }: ButtonRowProps) {
	const styles = useStyles();
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: rowId(groupId, button.id),
		data: { groupId, buttonId: button.id },
		// A locked row can't be dragged, but a row can still be dropped before it.
		disabled: { draggable: locked, droppable: false },
	});
	const yours = button.custom && !button.managed;
	const kind = isReadOnlyControlKind(button.kind) ? CONTROL_KIND_LABELS[button.kind] : undefined;
	const name = `${text}${kind ? ` (${kind}, read-only)` : ""}${button.hidden ? ", hidden" : ""}${yours ? ", yours" : ""}, Sequence ${button.sequence}`;
	return (
		<div role="listitem" style={{ opacity: isDragging ? 0.4 : 1 }}>
			<Tooltip content={`${text} (${button.id})`} relationship="description">
				<Button
					ref={setNodeRef}
					appearance="subtle"
					{...attributes}
					{...listeners}
					// Keep a button's own semantics: dnd-kit's attributes make it a "button" too.
					aria-roledescription={locked ? undefined : "draggable button"}
					aria-label={name}
					aria-pressed={selected}
					data-card-button={button.id}
					className={mergeClasses(
						styles.row,
						selected && styles.rowSelected,
						button.hidden && styles.rowHidden,
					)}
					style={{ transform: CSS.Transform.toString(transform), transition }}
					onClick={onSelect}
					onContextMenu={(e) => {
						e.preventDefault();
						onMenu(e.currentTarget);
					}}
					onKeyDown={(e) => {
						if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
							e.preventDefault();
							onMenu(e.currentTarget);
							return;
						}
						listeners?.onKeyDown?.(e);
					}}
				>
					<ReOrderDotsVerticalRegular
						aria-hidden
						className={mergeClasses(styles.handle, locked && styles.handleOff)}
					/>
					<RibbonButtonIcon button={button} size={16} />
					<span className={mergeClasses(styles.label, styles.ellipsis)}>{text}</span>
					{button.hidden ? (
						<Badge size="small" appearance="outline" color="subtle">
							Hidden
						</Badge>
					) : yours ? (
						<Badge size="small" appearance="tint" color="brand">
							Yours
						</Badge>
					) : null}
					<Text size={100} className={styles.muted}>
						{button.sequence}
					</Text>
				</Button>
			</Tooltip>
		</div>
	);
}
