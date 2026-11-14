import { useState } from "react";
import {
	Menu,
	MenuDivider,
	MenuGroupHeader,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import {
	AppsAddInRegular,
	ArrowMoveRegular,
	CopyRegular,
	DeleteRegular,
	EditRegular,
	EyeOffRegular,
	EyeRegular,
	ImageRegular,
	TranslateRegular,
} from "@fluentui/react-icons";
import { CustomiseMenuItems } from "@/components/ribbon-canvas/CustomiseMenuItems";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { HideOobWarningModal } from "@/components/modals/HideOobWarningModal";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { CONTROL_KIND_LABELS, isReadOnlyControlKind } from "@/utils/controlKinds";
import { moveTargets } from "@/utils/moveTargets";
import { canDeleteControl, isGlobalOobReadOnly } from "@/utils/ribbonProvenance";
import type { RibbonButton, RibbonLocation, RibbonTab } from "@/types/ribbon";

/**
 * The one menu for a ribbon button (#182, #190), wherever it is shown: the
 * Classic and Modern canvases now, Properties, the Edit-mode tree and the
 * Simulate preview later. It opens at the button's element (so Shift+F10 and
 * the Menu key work, not only a right-click), always lists the same items in
 * the same order, moves through a "Move to" submenu, and asks before Delete.
 */

export interface ButtonMenuTarget {
	button: RibbonButton;
	groupId: string;
	/** The element the menu opens against: the tile or chip that was used. */
	anchor: HTMLElement;
}

interface ButtonContextMenuProps {
	location: RibbonLocation;
	tab: RibbonTab;
	/** null when closed. */
	target: ButtonMenuTarget | null;
	onClose: () => void;
}

const useStyles = makeStyles({
	danger: { color: tokens.colorPaletteRedForeground1 },
	note: { maxWidth: "280px", whiteSpace: "normal" },
});

export function ButtonContextMenu({ location, tab, target, onClose }: ButtonContextMenuProps) {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const baseline = useRibbonStore((s) => s.baseline);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const customizeOobButton = useRibbonStore((s) => s.customizeOobButton);
	const duplicateButton = useRibbonStore((s) => s.duplicateButton);
	const moveButton = useRibbonStore((s) => s.moveButton);
	const deleteButton = useRibbonStore((s) => s.deleteButton);
	const hideOobButton = useRibbonStore((s) => s.hideOobButton);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const openIconPicker = useUIStore((s) => s.openIconPicker);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	// The dialogs outlive the menu, so they keep their own copy of the target.
	const [hiding, setHiding] = useState<ButtonMenuTarget | null>(null);
	const [deleting, setDeleting] = useState<ButtonMenuTarget | null>(null);

	const textOf = (b: RibbonButton) =>
		captionOf(b.label, locLabels, undefined, b.source?.labelToken);

	const menu =
		target &&
		(() => {
			const { button, groupId } = target;
			const locked = isGlobalOobReadOnly(location, tab.id, button);
			const readOnlyKind = isReadOnlyControlKind(button.kind);
			const targets = moveTargets(tab, groupId, button.id, locLabels, lang, captionOf);
			const run = (action: () => void) => () => {
				action();
				onClose();
			};
			return (
				<Menu
					open
					onOpenChange={(_, d) => !d.open && onClose()}
					positioning={{ target: target.anchor, position: "below", align: "start" }}
				>
					{/* The menu is opened from the canvas, not from a trigger of its own. */}
					<MenuTrigger disableButtonEnhancement>
						<span hidden />
					</MenuTrigger>
					<MenuPopover>
						<MenuList aria-label={`Actions for ${textOf(button)}`}>
							{locked && (
								<MenuGroupHeader className={styles.note}>
									Microsoft&apos;s global command bar buttons can&apos;t be
									changed.
								</MenuGroupHeader>
							)}
							{!locked && readOnlyKind && (
								<MenuGroupHeader className={styles.note}>
									{CONTROL_KIND_LABELS[button.kind]}: shown read-only. You can
									hide, move or delete it.
								</MenuGroupHeader>
							)}
							<MenuItem
								icon={<EditRegular />}
								onClick={run(() =>
									selectButtonInContext(location, tab.id, groupId, button.id),
								)}
							>
								Edit properties
							</MenuItem>
							<MenuItem
								icon={<ImageRegular />}
								disabled={locked || readOnlyKind}
								onClick={run(() => {
									selectButtonInContext(location, tab.id, groupId, button.id);
									openIconPicker();
								})}
							>
								Change icon…
							</MenuItem>
							<MenuItem
								icon={<TranslateRegular />}
								disabled={locked || readOnlyKind}
								onClick={run(() => openLocalizationEditor(button.id))}
							>
								Edit labels…
							</MenuItem>
							<MenuDivider />
							{button.hidden ? (
								<MenuItem
									icon={<EyeRegular />}
									disabled={locked}
									onClick={run(() =>
										setButtonProp(location, tab.id, groupId, button.id, {
											hidden: false,
										}),
									)}
								>
									Show button
								</MenuItem>
							) : (
								<MenuItem
									icon={<EyeOffRegular />}
									disabled={locked}
									onClick={run(() =>
										button.oob
											? setHiding(target)
											: setButtonProp(location, tab.id, groupId, button.id, {
													hidden: true,
												}),
									)}
								>
									{button.oob ? "Hide button…" : "Hide button"}
								</MenuItem>
							)}
							{(button.origin === "oob" || button.origin === "managed") && (
								<MenuItem
									icon={<AppsAddInRegular />}
									disabled={locked || readOnlyKind}
									onClick={run(() =>
										customizeOobButton(location, tab.id, groupId, button.id),
									)}
								>
									Create override…
								</MenuItem>
							)}
							<CustomiseMenuItems
								location={location}
								tabId={tab.id}
								groupId={groupId}
								button={button}
								onDone={onClose}
							/>
							<MenuDivider />
							<MenuItem
								icon={<CopyRegular />}
								disabled={locked}
								onClick={run(() =>
									duplicateButton(location, tab.id, groupId, button.id),
								)}
							>
								Duplicate
							</MenuItem>
							{targets.length === 0 || locked ? (
								<MenuItem
									icon={<ArrowMoveRegular />}
									disabled
									secondaryContent={locked ? undefined : "No other groups"}
								>
									Move to
								</MenuItem>
							) : (
								<Menu>
									<MenuTrigger disableButtonEnhancement>
										<MenuItem icon={<ArrowMoveRegular />}>Move to</MenuItem>
									</MenuTrigger>
									<MenuPopover>
										<MenuList aria-label="Move to group">
											{targets.map((t) => (
												<MenuItem
													key={t.groupId}
													onClick={run(() => {
														const movedId = moveButton(
															{
																groupId,
																buttonId: button.id,
																tabId: tab.id,
																location,
															},
															{
																groupId: t.groupId,
																tabId: tab.id,
																location,
															},
														);
														// A button that isn't yours moves as a copy (#26): select the copy.
														if (movedId)
															selectButtonInContext(
																location,
																tab.id,
																t.groupId,
																movedId,
															);
													})}
												>
													{t.text}
												</MenuItem>
											))}
										</MenuList>
									</MenuPopover>
								</Menu>
							)}
							{canDeleteControl(button, baseline[location]) && (
								<>
									<MenuDivider />
									<MenuItem
										icon={<DeleteRegular className={styles.danger} />}
										className={styles.danger}
										disabled={locked}
										onClick={run(() => setDeleting(target))}
									>
										Delete…
									</MenuItem>
								</>
							)}
						</MenuList>
					</MenuPopover>
				</Menu>
			);
		})();

	return (
		<>
			{menu}
			{deleting && (
				<ConfirmDialog
					open
					title="Delete button"
					confirmLabel="Delete button"
					destructive
					onConfirm={() => {
						deleteButton(location, tab.id, deleting.groupId, deleting.button.id);
						setDeleting(null);
					}}
					onCancel={() => setDeleting(null)}
				>
					Delete &ldquo;{textOf(deleting.button)}&rdquo;? You can undo this until you
					publish.
				</ConfirmDialog>
			)}
			{hiding && (
				<HideOobWarningModal
					open
					buttonLabel={textOf(hiding.button)}
					buttonId={hiding.button.id}
					commandId={hiding.button.commandId}
					onConfirmHide={() => {
						hideOobButton(location, tab.id, hiding.groupId, hiding.button.id);
						setHiding(null);
					}}
					onConfirmDisplayRule={() => {
						// Reversible hide: display rules on the button's command (not the hidden
						// flag, which publishes a HideCustomAction).
						useRibbonStore.getState().hideWithDisplayRules(hiding.button.commandId);
						setHiding(null);
					}}
					onCancel={() => setHiding(null)}
				/>
			)}
		</>
	);
}
