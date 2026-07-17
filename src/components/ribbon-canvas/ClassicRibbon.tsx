import React, { useState, useMemo } from "react";
import {
	tokens,
	Text,
	Badge,
	Tooltip,
	Menu,
	MenuTrigger,
	MenuPopover,
	MenuList,
	MenuItem,
	MenuDivider,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import {
	AddRegular,
	EyeOffRegular,
	EyeRegular,
	LockClosedRegular,
	EditRegular,
	TranslateRegular,
	ImageRegular,
	CopyRegular,
	DeleteRegular,
	ArrowMoveRegular,
	AppsAddInRegular,
	RenameRegular,
	DocumentRegular,
} from "@fluentui/react-icons";
import {
	DndContext,
	DragOverlay,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	PointerSensor,
	KeyboardSensor,
	type DragStartEvent,
	type DragEndEvent,
	type DragOverEvent,
	closestCenter,
} from "@dnd-kit/core";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { useUIStore } from "@/store/uiStore";
import { HideOobWarningModal } from "@/components/modals/HideOobWarningModal";
import FluentIcon from "@/components/shared/FluentIcon";
import type { RibbonButton, RibbonGroup, RibbonTab, RibbonLocation } from "@/types/ribbon";

// ---------------------------------------------------------------------------
// Drag ID encoding helpers
// ---------------------------------------------------------------------------
// Drop slots are encoded as `slot::{groupId}::{buttonId | __end__}`
// Group containers are `group::{groupId}`

const SLOT_END = "__end__";

function makeSlotId(groupId: string, beforeButtonId: string | null): string {
	return `slot::${groupId}::${beforeButtonId ?? SLOT_END}`;
}

function makeGroupId(groupId: string): string {
	return `group::${groupId}`;
}

type ParsedDrop =
	| { kind: "slot"; groupId: string; beforeButtonId: string | null }
	| { kind: "group"; groupId: string }
	| null;

function parseDrop(id: string): ParsedDrop {
	if (id.startsWith("slot::")) {
		const [, groupId, beforeRaw] = id.split("::");
		return { kind: "slot", groupId, beforeButtonId: beforeRaw === SLOT_END ? null : beforeRaw };
	}
	if (id.startsWith("group::")) {
		return { kind: "group", groupId: id.slice("group::".length) };
	}
	return null;
}

const useStyles = {
	root: {
		display: "flex",
		gap: tokens.spacingHorizontalM,
		flexWrap: "wrap" as const,
		alignItems: "flex-start" as const,
		minHeight: "120px",
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
	},
	group: (isDropTarget: boolean): React.CSSProperties => ({
		display: "flex",
		flexDirection: "column",
		minWidth: "80px",
		border: `1px solid ${isDropTarget ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: isDropTarget ? tokens.colorBrandBackground2 : tokens.colorNeutralBackground2,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
		transition: "border-color 0.1s, background-color 0.1s",
	}),
	groupButtons: {
		display: "flex",
		gap: tokens.spacingHorizontalXS,
		flexWrap: "wrap" as const,
		minHeight: "72px",
		alignItems: "flex-start" as const,
		padding: tokens.spacingHorizontalXS,
	},
	groupLabel: {
		textAlign: "center" as const,
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
		paddingTop: tokens.spacingVerticalXS,
		paddingBottom: tokens.spacingVerticalXS,
		marginTop: "auto",
	},
	/** 2px vertical drop indicator between buttons during drag — matches prototype */
	dropLine: {
		width: "2px",
		minHeight: "72px",
		backgroundColor: tokens.colorBrandStroke1,
		borderRadius: "2px",
		flexShrink: 0,
	},
	emptyTab: {
		display: "flex",
		flexDirection: "column" as const,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		gap: tokens.spacingVerticalM,
		minHeight: "160px",
		color: tokens.colorNeutralForeground3,
		flex: 1,
		padding: "48px",
		textAlign: "center" as const,
	},
	addGroupBtn: {
		minHeight: "96px",
		width: "40px",
		display: "flex",
		alignItems: "center" as const,
		justifyContent: "center" as const,
		border: `1px dashed ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		cursor: "pointer",
		color: tokens.colorNeutralForeground3,
		backgroundColor: "transparent",
	},
	addButtonGhost: {
		display: "flex",
		flexDirection: "column" as const,
		alignItems: "center" as const,
		justifyContent: "center" as const,
		width: "60px",
		minHeight: "72px",
		borderRadius: tokens.borderRadiusMedium,
		border: `1px dashed ${tokens.colorNeutralStroke2}`,
		backgroundColor: "transparent",
		cursor: "pointer",
		color: tokens.colorNeutralForeground3,
	},
};

// Legacy makeStyles shell kept so nothing else breaks during migration

interface ClassicRibbonProps {
	tab: RibbonTab;
	location: RibbonLocation;
}

// Context menu state types
interface ButtonMenuState {
	groupId: string;
	button: RibbonButton;
	x: number;
	y: number;
}
interface GroupMenuState {
	group: RibbonGroup;
	x: number;
	y: number;
}

// ---------------------------------------------------------------------------
// DragGhostTile — rendered inside DragOverlay as the drag ghost
// ---------------------------------------------------------------------------

function DragGhostTile({ button }: { button: RibbonButton }) {
	const locLabels = useRibbonStore((s) => s.locLabels);
	const displayLabel = resolveDisplayLabel(button.label, locLabels);
	const iconName = button.icon || "apps_add_in";
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "4px",
				width: "60px",
				minHeight: "72px",
				padding: "4px",
				borderRadius: tokens.borderRadiusMedium,
				border: `1px solid ${tokens.colorBrandStroke1}`,
				backgroundColor: tokens.colorNeutralBackground1,
				boxShadow: tokens.shadow16,
				opacity: 0.9,
				cursor: "grabbing",
				pointerEvents: "none",
				color: button.custom ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground1,
			}}
		>
			<FluentIcon name={iconName} size={24} />
			<span
				style={{
					fontSize: tokens.fontSizeBase100,
					textAlign: "center",
					lineHeight: "1.2",
					maxWidth: "56px",
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					color: tokens.colorNeutralForeground1,
				}}
			>
				{displayLabel}
			</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// DroppableGroupContainer — wraps each group so it acts as a drop zone
// ---------------------------------------------------------------------------

function DroppableGroupContainer({
	group,
	isDropTarget,
	children,
	...rest
}: React.HTMLAttributes<HTMLDivElement> & {
	group: RibbonGroup;
	isDropTarget: boolean;
}) {
	const { setNodeRef, isOver } = useDroppable({
		id: makeGroupId(group.id),
		data: { type: "group", groupId: group.id },
	});
	return (
		<div
			ref={setNodeRef}
			style={{
				display: "flex",
				flexDirection: "column",
				minWidth: "80px",
				border: `1px solid ${
					isOver || isDropTarget ? tokens.colorBrandStroke1 : tokens.colorNeutralStroke2
				}`,
				borderRadius: tokens.borderRadiusMedium,
				backgroundColor:
					isOver || isDropTarget ? tokens.colorBrandBackground2 : tokens.colorNeutralBackground2,
				padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
				transition: "border-color 0.1s, background-color 0.1s",
			}}
			{...rest}
		>
			{children}
		</div>
	);
}

// ---------------------------------------------------------------------------
// DroppableSlot — a thin drop zone between buttons (shows 2 px blue line)
// ---------------------------------------------------------------------------

function DroppableSlot({
	groupId,
	beforeButtonId,
}: {
	groupId: string;
	beforeButtonId: string | null;
}) {
	const slotId = makeSlotId(groupId, beforeButtonId);
	const { setNodeRef, isOver } = useDroppable({
		id: slotId,
		data: { type: "slot", groupId, beforeButtonId },
	});
	return (
		<div
			ref={setNodeRef}
			style={{
				width: isOver ? "2px" : "0px",
				minHeight: "72px",
				backgroundColor: tokens.colorBrandStroke1,
				borderRadius: "2px",
				flexShrink: 0,
				transition: "width 0.1s",
			}}
			aria-hidden
		/>
	);
}

export function ClassicRibbon({ tab, location }: ClassicRibbonProps) {
	const moveButton = useRibbonStore((s) => s.moveButton);
	const createGroup = useRibbonStore((s) => s.createGroup);
	const deleteButton = useRibbonStore((s) => s.deleteButton);
	const duplicateButton = useRibbonStore((s) => s.duplicateButton);
	const duplicateGroup = useRibbonStore((s) => s.duplicateGroup);
	const setGroupTemplate = useRibbonStore((s) => s.setGroupTemplate);
	const hideOobButton = useRibbonStore((s) => s.hideOobButton);
	const customizeOobButton = useRibbonStore((s) => s.customizeOobButton);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const renameGroup = useRibbonStore((s) => s.renameGroup);
	const deleteGroup = useRibbonStore((s) => s.deleteGroup);
	const openNewButton = useUIStore((s) => s.openNewButton);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	const openIconPicker = useUIStore((s) => s.openIconPicker);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const selectGroup = useSelectionStore((s) => s.selectGroup);

	// Context menu state
	const [btnMenu, setBtnMenu] = useState<ButtonMenuState | null>(null);
	const [grpMenu, setGrpMenu] = useState<GroupMenuState | null>(null);
	const [hideWarning, setHideWarning] = useState<ButtonMenuState | null>(null);

	// @dnd-kit drag state
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overGroupId, setOverGroupId] = useState<string | null>(null);

	// The button + its group that is currently being dragged
	const activeInfo = useMemo(() => {
		if (!activeId) return null;
		for (const group of tab.groups) {
			const button = group.buttons.find((b) => b.id === activeId);
			if (button) return { button, groupId: group.id };
		}
		return null;
	}, [activeId, tab.groups]);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			// Require 5px movement before recognising a drag — prevents accidental
			// drags when the user clicks to select.
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor),
	);

	const isGlobalOobReadOnly = (button: RibbonButton) =>
		location === "Application" && tab.id === "Mscrm.GlobalTab" && button.oob && !button.custom;

	function handleDragStart(event: DragStartEvent) {
		setActiveId(String(event.active.id));
	}

	function handleDragOver(event: DragOverEvent) {
		const over = event.over;
		if (!over) {
			setOverGroupId(null);
			return;
		}
		const parsed = parseDrop(String(over.id));
		setOverGroupId(parsed ? parsed.groupId : null);
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		setActiveId(null);
		setOverGroupId(null);
		if (!over || !active) return;

		// Find source group
		let srcGroupId: string | null = null;
		for (const group of tab.groups) {
			if (group.buttons.some((b) => b.id === active.id)) {
				srcGroupId = group.id;
				break;
			}
		}
		if (!srcGroupId) return;

		const parsed = parseDrop(String(over.id));
		if (!parsed) return;

		if (parsed.kind === "slot") {
			moveButton(
				{ groupId: srcGroupId, buttonId: String(active.id), tabId: tab.id, location },
				{
					groupId: parsed.groupId,
					beforeButtonId: parsed.beforeButtonId ?? undefined,
					tabId: tab.id,
					location,
				},
			);
		} else if (parsed.kind === "group" && parsed.groupId !== srcGroupId) {
			// Dropped on group container (empty group or outside all slots)
			moveButton(
				{ groupId: srcGroupId, buttonId: String(active.id), tabId: tab.id, location },
				{ groupId: parsed.groupId, tabId: tab.id, location },
			);
		}
	}

	// Empty tab state
	if (tab.groups.length === 0) {
		return (
			<div style={useStyles.emptyTab}>
				<DocumentRegular fontSize={36} aria-hidden />
				<Text>This tab has no groups yet</Text>
				<button
					type="button"
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: "6px",
						padding: "6px 16px",
						background: tokens.colorBrandBackground,
						color: tokens.colorNeutralForegroundInverted,
						border: "none",
						borderRadius: tokens.borderRadiusMedium,
						cursor: "pointer",
						fontSize: tokens.fontSizeBase300,
					}}
					onClick={() => openNewGroup()}
				>
					<AddRegular fontSize={12} /> Add first group
				</button>
			</div>
		);
	}

	return (
		<>
			{/* Location banners */}
			{location === "SubGrid" && (
				<MessageBar
					intent="info"
					style={{ margin: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0` }}
				>
					<MessageBarBody>
						Subgrid ribbons support only 3 native controls: <strong>Add</strong>,{" "}
						<strong>Show List</strong>, and <strong>Delete</strong>. Their icons cannot be changed.
					</MessageBarBody>
				</MessageBar>
			)}
			{/* Form-ribbon Unified-Interface note rendered at RibbonCanvas level — not duplicated here. */}

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<div
					style={useStyles.root}
					role="treegrid"
					aria-label="Ribbon canvas"
					data-ribbon-canvas-root="1"
				>
					{tab.groups.map((group) => (
						<DroppableGroupContainer
							key={group.id}
							group={group}
							isDropTarget={overGroupId === group.id}
							role="rowgroup"
							aria-label={group.label}
							tabIndex={0}
							data-ribbon-group-id={group.id}
							onContextMenu={(e) => {
								if ((e.target as HTMLElement).closest("[data-btn]")) return;
								e.preventDefault();
								setGrpMenu({ group, x: e.clientX, y: e.clientY });
							}}
							onFocus={() => selectGroup(group.id)}
							onKeyDown={(e) => {
								if ((e.key === "Enter" || e.key === " ") && group.buttons.length > 0) {
									e.preventDefault();
									const first = group.buttons[0];
									if (!first) return;
									selectButtonInContext(location, tab.id, group.id, first.id);
									const target = document.querySelector<HTMLButtonElement>(
										`[data-ribbon-btn-id="${first.id}"]`,
									);
									target?.focus();
								}
							}}
						>
							<div style={useStyles.groupButtons}>
								{group.buttons.map((button) => (
									<React.Fragment key={button.id}>
										{/* Drop slot BEFORE this button — visible only when drag is active */}
										{activeId && <DroppableSlot groupId={group.id} beforeButtonId={button.id} />}
										<RibbonButtonTile
											button={button}
											groupId={group.id}
											tabId={tab.id}
											location={location}
											activeId={activeId}
											onContextMenu={(e) =>
												setBtnMenu({
													groupId: group.id,
													button,
													x: e.clientX,
													y: e.clientY,
												})
											}
										/>
									</React.Fragment>
								))}
								{/* Append slot — at end of group */}
								{activeId && <DroppableSlot groupId={group.id} beforeButtonId={null} />}
								<button
									type="button"
									style={useStyles.addButtonGhost}
									data-add-btn-group-id={group.id}
									onClick={() => openNewButton(group.id)}
									title={`Add button to ${group.label}`}
									aria-label={`Add button to ${group.label}`}
								>
									<AddRegular fontSize={16} />
									<Text size={100} style={{ color: "inherit" }}>
										Add
									</Text>
								</button>
							</div>
							<Tooltip
								content={`Template: ${group.template || "Flexible2"}`}
								relationship="description"
							>
								<div style={useStyles.groupLabel}>{group.label}</div>
							</Tooltip>
						</DroppableGroupContainer>
					))}
					<button
						type="button"
						style={useStyles.addGroupBtn}
						onClick={() =>
							createGroup({
								tabId: tab.id,
								location,
								group: {
									label: "New Group",
									sequence: (tab.groups.length + 1) * 10,
									template: "Flexible2",
									buttons: [],
								},
							})
						}
						title="Add group"
						aria-label="Add group"
					>
						<AddRegular fontSize={16} />
					</button>
				</div>

				{/* @dnd-kit DragOverlay — renders the ghost tile at the cursor */}
				<DragOverlay dropAnimation={null}>
					{activeInfo ? <DragGhostTile button={activeInfo.button} /> : null}
				</DragOverlay>
			</DndContext>

			{/* ── Button context menu ── */}
			{btnMenu && (
				<Menu
					open
					onOpenChange={(_, d) => !d.open && setBtnMenu(null)}
					positioning={{
						position: "below",
						align: "start",
						target: {
							getBoundingClientRect: () => ({
								x: btnMenu.x,
								y: btnMenu.y,
								top: btnMenu.y,
								left: btnMenu.x,
								right: btnMenu.x,
								bottom: btnMenu.y,
								width: 0,
								height: 0,
								toJSON: () => ({}),
							}),
						},
					}}
				>
					<MenuTrigger disableButtonEnhancement>
						<span style={{ display: "none" }} />
					</MenuTrigger>
					<MenuPopover>
						<MenuList>
							{isGlobalOobReadOnly(btnMenu.button) && (
								<MenuItem disabled icon={<LockClosedRegular />}>
									OOB global command bar buttons cannot be customized.
								</MenuItem>
							)}
							{isGlobalOobReadOnly(btnMenu.button) && <MenuDivider />}
							<MenuItem
								icon={<EditRegular />}
								onClick={() => {
									selectButtonInContext(location, tab.id, btnMenu.groupId, btnMenu.button.id);
									setBtnMenu(null);
								}}
							>
								Edit properties
							</MenuItem>
							<MenuItem
								icon={<ImageRegular />}
								disabled={isGlobalOobReadOnly(btnMenu.button)}
								onClick={() => {
									selectButtonInContext(location, tab.id, btnMenu.groupId, btnMenu.button.id);
									openIconPicker();
									setBtnMenu(null);
								}}
							>
								Change icon…
							</MenuItem>
							<MenuItem
								icon={<TranslateRegular />}
								disabled={isGlobalOobReadOnly(btnMenu.button)}
								onClick={() => {
									openLocalizationEditor(btnMenu.button.id);
									setBtnMenu(null);
								}}
							>
								Edit labels…
							</MenuItem>
							<MenuDivider />
							{btnMenu.button.hidden ? (
								<MenuItem
									icon={<EyeRegular />}
									disabled={isGlobalOobReadOnly(btnMenu.button)}
									onClick={() => {
										setButtonProp(location, tab.id, btnMenu.groupId, btnMenu.button.id, {
											hidden: false,
										});
										setBtnMenu(null);
									}}
								>
									Show button
								</MenuItem>
							) : (
								<MenuItem
									icon={<EyeOffRegular />}
									disabled={isGlobalOobReadOnly(btnMenu.button)}
									onClick={() => {
										if (btnMenu.button.oob) {
											setHideWarning(btnMenu);
										} else {
											setButtonProp(location, tab.id, btnMenu.groupId, btnMenu.button.id, {
												hidden: true,
											});
										}
										setBtnMenu(null);
									}}
								>
									Hide button
								</MenuItem>
							)}
							{(btnMenu.button.origin === "oob" || btnMenu.button.origin === "managed") && (
								<MenuItem
									icon={<AppsAddInRegular />}
									disabled={isGlobalOobReadOnly(btnMenu.button)}
									onClick={() => {
										customizeOobButton(location, tab.id, btnMenu.groupId, btnMenu.button.id);
										setBtnMenu(null);
									}}
								>
									Create override…
								</MenuItem>
							)}
							<MenuDivider />
							<MenuItem
								icon={<CopyRegular />}
								disabled={isGlobalOobReadOnly(btnMenu.button)}
								onClick={() => {
									duplicateButton(location, tab.id, btnMenu.groupId, btnMenu.button.id);
									setBtnMenu(null);
								}}
							>
								Duplicate
							</MenuItem>
							{/* Move to group sub-items */}
							{tab.groups
								.filter((g) => g.id !== btnMenu.groupId)
								.map((g) => (
									<MenuItem
										key={g.id}
										icon={<ArrowMoveRegular />}
										disabled={isGlobalOobReadOnly(btnMenu.button)}
										onClick={() => {
											moveButton(
												{
													groupId: btnMenu.groupId,
													buttonId: btnMenu.button.id,
													tabId: tab.id,
													location,
												},
												{ groupId: g.id, tabId: tab.id, location },
											);
											setBtnMenu(null);
										}}
									>
										Move to: {g.label}
									</MenuItem>
								))}
							{btnMenu.button.origin === "unmanaged" && (
								<>
									<MenuDivider />
									<MenuItem
										icon={<DeleteRegular />}
										disabled={isGlobalOobReadOnly(btnMenu.button)}
										onClick={() => {
											deleteButton(location, tab.id, btnMenu.groupId, btnMenu.button.id);
											setBtnMenu(null);
										}}
									>
										Delete
									</MenuItem>
								</>
							)}
						</MenuList>
					</MenuPopover>
				</Menu>
			)}

			{/* ── Group context menu ── */}
			{grpMenu && (
				<Menu
					open
					onOpenChange={(_, d) => !d.open && setGrpMenu(null)}
					positioning={{
						position: "below",
						align: "start",
						target: {
							getBoundingClientRect: () => ({
								x: grpMenu.x,
								y: grpMenu.y,
								top: grpMenu.y,
								left: grpMenu.x,
								right: grpMenu.x,
								bottom: grpMenu.y,
								width: 0,
								height: 0,
								toJSON: () => ({}),
							}),
						},
					}}
				>
					<MenuTrigger disableButtonEnhancement>
						<span style={{ display: "none" }} />
					</MenuTrigger>
					<MenuPopover>
						<MenuList>
							<MenuItem
								icon={<RenameRegular />}
								onClick={() => {
									const newLabel = window.prompt("Rename group:", grpMenu.group.label);
									if (newLabel?.trim()) {
										renameGroup(location, tab.id, grpMenu.group.id, newLabel.trim());
									}
									setGrpMenu(null);
								}}
							>
								Rename…
							</MenuItem>
							<MenuItem
								icon={<CopyRegular />}
								onClick={() => {
									duplicateGroup(location, tab.id, grpMenu.group.id);
									setGrpMenu(null);
								}}
							>
								Duplicate group
							</MenuItem>
							<MenuItem
								icon={<AppsAddInRegular />}
								onClick={() => {
									const newTemplate = window.prompt(
										"Change group template:",
										grpMenu.group.template,
									);
									if (newTemplate?.trim()) {
										setGroupTemplate(location, tab.id, grpMenu.group.id, newTemplate.trim());
									}
									setGrpMenu(null);
								}}
							>
								Change template…
							</MenuItem>
							<MenuDivider />
							<MenuItem
								icon={<DeleteRegular />}
								onClick={() => {
									if (window.confirm(`Delete group "${grpMenu.group.label}"?`)) {
										deleteGroup(location, tab.id, grpMenu.group.id);
									}
									setGrpMenu(null);
								}}
							>
								Delete group
							</MenuItem>
						</MenuList>
					</MenuPopover>
				</Menu>
			)}

			{/* ── Hide OOB warning modal ── */}
			{hideWarning && (
				<HideOobWarningModal
					open
					buttonLabel={hideWarning.button.label}
					onConfirmHide={() => {
						hideOobButton(location, tab.id, hideWarning.groupId, hideWarning.button.id);
						setHideWarning(null);
					}}
					onConfirmDisplayRule={() => {
						// Apply reversible hide via setButtonProp hidden flag (display rule approach)
						setButtonProp(location, tab.id, hideWarning.groupId, hideWarning.button.id, {
							hidden: true,
						});
						setHideWarning(null);
					}}
					onCancel={() => setHideWarning(null)}
				/>
			)}
		</>
	);
}

// ── RibbonButtonTile ─────────────────────────────────────────────────────────
// @dnd-kit draggable button tile with FluentIcon rendering.
// Drag behaviour is entirely managed via useDraggable — no HTML5 drag events.

interface RibbonButtonTileProps {
	button: RibbonButton;
	groupId: string;
	tabId: string;
	location: RibbonLocation;
	/** ID of the button currently being dragged (from DndContext) */
	activeId: string | null;
	onContextMenu: (event: React.MouseEvent) => void;
}

const RibbonButtonTile = React.memo(function RibbonButtonTile({
	button,
	groupId,
	tabId,
	location,
	activeId,
	onContextMenu,
}: RibbonButtonTileProps) {
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const isSelected = selectedButtonId === button.id;
	const isGlobalOobReadOnly =
		location === "Application" && tabId === "Mscrm.GlobalTab" && button.oob && !button.custom;
	const displayLabel = resolveDisplayLabel(button.label, locLabels);

	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: button.id,
		data: { type: "button", button, groupId },
		disabled: button.managed || isGlobalOobReadOnly,
	});

	const isBeingDragged = isDragging || activeId === button.id;

	const tileStyle: React.CSSProperties = {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: "4px",
		width: "60px",
		minHeight: "72px",
		padding: "4px",
		borderRadius: tokens.borderRadiusMedium,
		cursor: "grab",
		border: isSelected
			? `1px solid ${tokens.colorBrandStroke1}`
			: button.custom
				? `1px solid ${tokens.colorBrandStroke2}`
				: "1px solid transparent",
		backgroundColor: isSelected
			? tokens.colorBrandBackground2
			: button.managed
				? tokens.colorNeutralBackground3
				: "transparent",
		opacity: isBeingDragged ? 0.3 : button.hidden ? 0.4 : 1,
		position: "relative",
		userSelect: "none",
		color: button.custom ? tokens.colorBrandForeground1 : tokens.colorNeutralForeground1,
		transition: "opacity 0.15s, border-color 0.1s, background-color 0.1s",
	};

	const iconName = button.icon || "apps_add_in";

	const handleArrowNavigation = (event: React.KeyboardEvent<HTMLButtonElement>) => {
		if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
		event.preventDefault();
		const root = event.currentTarget.closest("[data-ribbon-canvas-root='1']");
		if (!root) return;
		const tiles = Array.from(
			root.querySelectorAll<HTMLButtonElement>(`[data-ribbon-tab-id="${tabId}"][data-btn="1"]`),
		);
		const index = tiles.findIndex((tile) => tile.dataset.ribbonBtnId === button.id);
		if (index < 0 || tiles.length === 0) return;
		const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
		const nextIndex = Math.max(0, Math.min(tiles.length - 1, index + delta));
		const nextTile = tiles[nextIndex];
		const nextGroupId = nextTile?.dataset.ribbonGroupId;
		const nextButtonId = nextTile?.dataset.ribbonBtnId;
		if (!nextTile || !nextGroupId || !nextButtonId) return;
		selectButtonInContext(location, tabId, nextGroupId, nextButtonId);
		nextTile.focus();
	};

	return (
		<Tooltip
			content={
				isGlobalOobReadOnly
					? "OOB global command bar buttons cannot be customized."
					: `${displayLabel}${button.hidden ? " — hidden" : ""}`
			}
			relationship="label"
		>
			<button
				ref={setNodeRef}
				type="button"
				data-btn="1"
				data-ribbon-tab-id={tabId}
				data-ribbon-group-id={groupId}
				data-ribbon-btn-id={button.id}
				style={tileStyle}
				aria-selected={isSelected}
				aria-label={`${displayLabel}${button.hidden ? " — hidden" : ""}${button.custom ? " (custom)" : ""}${button.managed ? " (read-only)" : ""}`}
				onClick={() => selectButtonInContext(location, tabId, groupId, button.id)}
				onFocus={() => selectButtonInContext(location, tabId, groupId, button.id)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						selectButtonInContext(location, tabId, groupId, button.id);
						return;
					}
					handleArrowNavigation(event);
				}}
				onContextMenu={(e) => {
					e.preventDefault();
					e.stopPropagation();
					selectButtonInContext(location, tabId, groupId, button.id);
					onContextMenu(e);
				}}
				// @dnd-kit spreads role="button", tabIndex, aria-roledescription, etc.
				// We accept those since they're consistent with gridcell semantics.
				{...attributes}
				{...listeners}
			>
				{/* Icon */}
				<FluentIcon
					name={iconName}
					size={24}
					style={{ filter: button.custom ? "none" : "grayscale(40%) opacity(0.85)" }}
				/>
				{/* Label */}
				<span
					style={{
						fontSize: tokens.fontSizeBase100,
						textAlign: "center",
						lineHeight: "1.2",
						maxWidth: "56px",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						color: tokens.colorNeutralForeground1,
					}}
				>
					{displayLabel}
				</span>
				{/* Badges */}
				{button.hidden && (
					<span style={{ position: "absolute", top: 2, right: 2 }} aria-hidden>
						<EyeOffRegular fontSize={10} style={{ color: tokens.colorNeutralForeground3 }} />
					</span>
				)}
				{button.custom && !button.managed && (
					<Badge
						size="extra-small"
						color="brand"
						appearance="tint"
						style={{ position: "absolute", bottom: 2, right: 2 }}
						aria-label="Custom"
					>
						NEW
					</Badge>
				)}
				{(button.managed || isGlobalOobReadOnly) && (
					<span
						style={{ position: "absolute", top: 2, left: 2 }}
						title={
							isGlobalOobReadOnly
								? "OOB global command bar buttons cannot be customized."
								: "Read-only (managed)"
						}
					>
						<LockClosedRegular fontSize={10} style={{ color: tokens.colorNeutralForeground3 }} />
					</span>
				)}
			</button>
		</Tooltip>
	);
});
