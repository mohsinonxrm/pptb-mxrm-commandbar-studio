import React, { useState } from "react";
import {
	makeStyles,
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
} from "@fluentui/react-components";
import {
	EyeOffRegular,
	EditRegular,
	TranslateRegular,
	ImageRegular,
	CopyRegular,
	DeleteRegular,
	ArrowMoveRegular,
	EyeRegular,
	AppsAddInRegular,
	LockClosedRegular,
	AddRegular,
} from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import FluentIcon from "@/components/shared/FluentIcon";
import { HideOobWarningModal } from "@/components/modals/HideOobWarningModal";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import type { RibbonButton, RibbonTab, RibbonLocation } from "@/types/ribbon";

const DRAG_MIME = "application/x-rw-btn";
// Drag-source MIME emitted by SolutionElementsPane when the user drags an
// existing custom button from the left pane onto the canvas. We accept it
// here in the modern command bar's drop handler so the bar isn't
// drop-deaf to the secondary surface.
const DRAG_SE_MIME = "application/x-rw-se";

const useStyles = makeStyles({
	root: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingHorizontalS} 0`,
		minHeight: "48px",
	},
	// The buttons live in their own horizontally-scrollable lane so the bar can
	// hold any number of commands AND every one stays reachable for click / DnD /
	// edit (the old design truncated to N and buried the rest in an overflow menu,
	// which couldn't be dragged or edited). `minWidth: 0` lets the flex child
	// actually shrink so `overflowX: auto` engages instead of pushing siblings.
	scrollRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		flex: 1,
		minWidth: 0,
		overflowX: "auto",
		overflowY: "hidden",
		paddingBottom: tokens.spacingHorizontalXS,
	},
	button: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		height: "32px",
		padding: `0 ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusMedium,
		border: "1px solid transparent",
		cursor: "pointer",
		backgroundColor: "transparent",
		color: tokens.colorNeutralForeground1,
		whiteSpace: "nowrap",
		position: "relative",
		userSelect: "none",
		":hover": {
			backgroundColor: tokens.colorNeutralBackground3,
			border: `1px solid ${tokens.colorNeutralStroke1}`,
		},
		":focus-visible": {
			outline: `2px solid ${tokens.colorBrandStroke1}`,
			outlineOffset: "2px",
		},
	},
	buttonSelected: {
		backgroundColor: tokens.colorBrandBackground2,
		border: `1px solid ${tokens.colorBrandStroke1}`,
	},
	buttonHidden: {
		opacity: 0.4,
		textDecoration: "line-through",
	},
	buttonCustom: {
		border: `1px solid ${tokens.colorBrandStroke2}`,
	},
	lockIcon: {
		position: "absolute",
		top: "4px",
		left: "4px",
		color: tokens.colorNeutralForeground3,
		pointerEvents: "none",
	},
	dropLine: {
		width: "2px",
		height: "24px",
		backgroundColor: tokens.colorBrandStroke1,
		borderRadius: "2px",
		flexShrink: 0,
	},
	overflowBtn: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		height: "32px",
		padding: `0 ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground2,
		cursor: "pointer",
		color: tokens.colorNeutralForeground3,
		flexShrink: 0,
	},
	// "+ Add" lives outside the scroll lane so it's always visible (never scrolls
	// away) while the buttons scroll independently.
	trailingControls: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		flexShrink: 0,
		paddingLeft: tokens.spacingHorizontalS,
		borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
		marginLeft: tokens.spacingHorizontalXS,
	},
});

interface ModernCommandBarProps {
	tab: RibbonTab;
	location: RibbonLocation;
}

interface DropState {
	beforeButtonId: string | null;
}

interface BtnMenuState {
	button: RibbonButton;
	groupId: string;
	x: number;
	y: number;
}

export function ModernCommandBar({ tab, location }: ModernCommandBarProps) {
	const styles = useStyles();
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const moveButton = useRibbonStore((s) => s.moveButton);
	const deleteButton = useRibbonStore((s) => s.deleteButton);
	const duplicateButton = useRibbonStore((s) => s.duplicateButton);
	const hideOobButton = useRibbonStore((s) => s.hideOobButton);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const customizeOobButton = useRibbonStore((s) => s.customizeOobButton);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const openIconPicker = useUIStore((s) => s.openIconPicker);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	const openNewButton = useUIStore((s) => s.openNewButton);

	const [dropOver, setDropOver] = useState<DropState | null>(null);
	const [dragging, setDragging] = useState<string | null>(null);
	const [btnMenu, setBtnMenu] = useState<BtnMenuState | null>(null);
	const [hideWarning, setHideWarning] = useState<BtnMenuState | null>(null);

	const isGlobalOobReadOnly = (button: RibbonButton) =>
		location === "Application" && tab.id === "Mscrm.GlobalTab" && button.oob && !button.custom;

	// Flatten all buttons in group order. Unlike the old design, ALL buttons are
	// rendered in a horizontally-scrollable lane — no truncation/overflow menu —
	// so every command can be clicked, dragged, edited, and reordered here just
	// like in Classic view.
	const allButtons = tab.groups.flatMap((g) =>
		g.buttons.map((b) => ({ button: b, groupId: g.id })),
	);

	function onDragStart(e: React.DragEvent, groupId: string, buttonId: string) {
		e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ groupId, buttonId }));
		e.dataTransfer.effectAllowed = "move";
		setDragging(buttonId);
	}
	function onDragEnd() {
		setDragging(null);
		setDropOver(null);
	}
	function onDragOverBtn(e: React.DragEvent, buttonId: string) {
		// Accept drops from both internal re-ordering AND from Solution
		// Elements (left pane). Without preventDefault, no drop event fires.
		const types = Array.from(e.dataTransfer.types ?? []);
		if (!types.includes(DRAG_MIME) && !types.includes(DRAG_SE_MIME)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = types.includes(DRAG_MIME) ? "move" : "copy";
		setDropOver({ beforeButtonId: buttonId });
	}
	const createButton = useRibbonStore((s) => s.createButton);

	function onDropOn(e: React.DragEvent, groupId: string, beforeButtonId: string | null) {
		e.preventDefault();
		// Case 1 — re-ordering an existing button within the modern bar.
		const internalPayload = e.dataTransfer.getData(DRAG_MIME);
		if (internalPayload) {
			try {
				const src = JSON.parse(internalPayload);
				if (src?.buttonId) {
					moveButton(
						{ groupId: src.groupId, buttonId: src.buttonId, tabId: tab.id, location },
						{ groupId, beforeButtonId: beforeButtonId ?? undefined, tabId: tab.id, location },
					);
				}
			} catch {
				/* ignore malformed payload */
			}
			setDropOver(null);
			setDragging(null);
			return;
		}

		// Case 2 — a custom button dragged from Solution Elements. Drop it
		// into this group as a new (or copy of) button so users can use the
		// left pane as the source-of-truth for reusable buttons across tabs.
		const sePayload = e.dataTransfer.getData(DRAG_SE_MIME);
		if (sePayload) {
			try {
				const src = JSON.parse(sePayload) as {
					button?: {
						id: string;
						label?: string;
						icon?: string;
						kind?: RibbonButton["kind"];
					};
				};
				const seButton = src?.button;
				if (seButton) {
					// Use a copy-suffixed ID so we don't clash with the source
					// button (which may still live in another tab).
					const stamp = `_copy_${Date.now()}`;
					createButton({
						location,
						tabId: tab.id,
						groupId,
						button: {
							id: `${seButton.id}${stamp}`,
							label: seButton.label ?? "New Button",
							icon: seButton.icon,
							kind: seButton.kind ?? "button",
							sequence: 50,
							templateAlias: "o1",
							commandId: "",
							hidden: false,
							oob: false,
							custom: true,
							managed: false,
						},
					});
				}
			} catch {
				/* ignore malformed payload */
			}
			setDropOver(null);
			setDragging(null);
			return;
		}

		setDropOver(null);
		setDragging(null);
	}

	return (
		<>
			<div className={styles.root}>
				<div
					className={styles.scrollRow}
					onDragOver={(e) => {
						e.preventDefault();
					}}
					onDrop={(e) => onDropOn(e, tab.groups[0]?.id ?? "", null)}
				>
				{allButtons.map(({ button, groupId }) => (
					<React.Fragment key={button.id}>
						{dropOver?.beforeButtonId === button.id && (
							<div className={styles.dropLine} aria-hidden />
						)}
						<Tooltip
							content={
								isGlobalOobReadOnly(button)
									? "OOB global command bar buttons cannot be customized."
									: `${resolveDisplayLabel(button.label, locLabels)}${button.hidden ? " — hidden" : ""}`
							}
							relationship="label"
						>
							<button
								type="button"
								className={[
									styles.button,
									selectedButtonId === button.id ? styles.buttonSelected : "",
									button.hidden ? styles.buttonHidden : "",
									button.custom ? styles.buttonCustom : "",
								]
									.filter(Boolean)
									.join(" ")}
								aria-selected={selectedButtonId === button.id}
								aria-label={`${resolveDisplayLabel(button.label, locLabels)}${button.hidden ? " — hidden" : ""}`}
								onClick={() => selectButtonInContext(location, tab.id, groupId, button.id)}
								onContextMenu={(e) => {
									e.preventDefault();
									selectButtonInContext(location, tab.id, groupId, button.id);
									setBtnMenu({ button, groupId, x: e.clientX, y: e.clientY });
								}}
								draggable={!button.managed && !isGlobalOobReadOnly(button)}
								onDragStart={(e) => onDragStart(e, groupId, button.id)}
								onDragEnd={onDragEnd}
								onDragOver={(e) => onDragOverBtn(e, button.id)}
								onDrop={(e) => onDropOn(e, groupId, button.id)}
								style={{ opacity: dragging === button.id ? 0.3 : undefined }}
							>
								<FluentIcon name={button.icon || "apps_add_in"} size={16} />
								<Text size={200}>{resolveDisplayLabel(button.label, locLabels)}</Text>
								{button.hidden && <EyeOffRegular fontSize={12} aria-hidden />}
								{button.custom && (
									<Badge size="extra-small" color="brand" appearance="tint" aria-label="Custom">
										NEW
									</Badge>
								)}
								{isGlobalOobReadOnly(button) && (
									<span
										className={styles.lockIcon}
										title="OOB global command bar buttons cannot be customized."
									>
										<LockClosedRegular fontSize={12} />
									</span>
								)}
							</button>
						</Tooltip>
					</React.Fragment>
				))}
				</div>

				{/* Trailing controls — kept outside the scroll lane so "+ Add" is
				    always visible regardless of how far the buttons are scrolled. */}
				<div className={styles.trailingControls}>
					{/* + Add button — appends a new button to the first group of
					    the current tab. ClassicRibbon has per-group affordances;
					    in the modern view there are no visible group boundaries,
					    so we just target the first group. If the tab has no
					    groups yet, the affordance is disabled with a tooltip
					    pointing the user to Classic view to add groups first. */}
					{(() => {
						const firstGroup = tab.groups[0];
						if (!firstGroup) {
							return (
								<Tooltip
									content='No groups in this tab yet. Switch to "Classic ribbon" view to add a group first.'
									relationship="label"
								>
									<button type="button" className={styles.overflowBtn} disabled>
										<AddRegular fontSize={14} /> Add
									</button>
								</Tooltip>
							);
						}
						return (
							<Tooltip
								content={`Add a new button to "${firstGroup.label}"`}
								relationship="label"
							>
								<button
									type="button"
									className={styles.overflowBtn}
									onClick={() => openNewButton(firstGroup.id)}
									aria-label="Add a new button"
								>
									<AddRegular fontSize={14} /> Add
								</button>
							</Tooltip>
						);
					})()}
				</div>
			</div>

			{/* Button context menu — positioned at the cursor where the user
			    right-clicked. Without `positioning.target`, Fluent's Menu
			    rendered at (0,0) because the MenuTrigger is hidden and has
			    no measurable bounding box. */}
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
								<MenuItem disabled>OOB global command bar buttons cannot be customized.</MenuItem>
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
										if (btnMenu.button.oob) setHideWarning(btnMenu);
										else
											setButtonProp(location, tab.id, btnMenu.groupId, btnMenu.button.id, {
												hidden: true,
											});
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
							{btnMenu.button.origin === "unmanaged" && (
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
							)}
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
						</MenuList>
					</MenuPopover>
				</Menu>
			)}

			{hideWarning && (
				<HideOobWarningModal
					open
					buttonLabel={hideWarning.button.label}
					onConfirmHide={() => {
						hideOobButton(location, tab.id, hideWarning.groupId, hideWarning.button.id);
						setHideWarning(null);
					}}
					onConfirmDisplayRule={() => {
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
