import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { findGroupControl, menuItemPlace } from "@/utils/ribbonMenu";
import { canDeleteControl } from "@/utils/ribbonProvenance";

/**
 * Focus in a text field, a select or the code editor: keys edit the field
 * there (text undo, Ctrl+D, Delete), not the workspace (#17, #34 review).
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	if (target instanceof HTMLElement && target.isContentEditable) return true;
	return !!target.closest(
		'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], .monaco-editor',
	);
}

const OVERLAY_SELECTOR =
	'[role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], [role="listbox"], .fui-PopoverSurface, .fui-MenuPopover';

/**
 * Focus in a dialog, popover or menu — or a modal dialog is open: the canvas
 * shortcuts must not act behind it (#17).
 */
export function isInOverlay(target: EventTarget | null): boolean {
	if (target instanceof Element && target.closest(OVERLAY_SELECTOR)) return true;
	return !!document.querySelector('[aria-modal="true"], [role="alertdialog"]');
}

export function useKeyboardShortcuts() {
	const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
	const openBulkPublish = useUIStore((s) => s.openBulkPublish);
	const announce = useUIStore((s) => s.announce);
	const openHideInsteadOfDelete = useUIStore((s) => s.openHideInsteadOfDelete);
	const undo = useRibbonStore((s) => s.undo);
	const redo = useRibbonStore((s) => s.redo);
	const past = useRibbonStore((s) => s.past);
	const future = useRibbonStore((s) => s.future);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectedTabId = useSelectionStore((s) => s.tabId);
	const activeLocation = useSelectionStore((s) => s.location);
	const duplicateButton = useRibbonStore((s) => s.duplicateButton);
	const deleteButton = useRibbonStore((s) => s.deleteButton);
	const moveButton = useRibbonStore((s) => s.moveButton);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const selectGroup = useSelectionStore((s) => s.selectGroup);

	const cutBufferRef = useRef<{
		location: typeof activeLocation;
		tabId: string;
		groupId: string;
		buttonId: string;
	} | null>(null);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const isMac = navigator.platform.toUpperCase().includes("MAC");
			const ctrl = isMac ? e.metaKey : e.ctrlKey;
			const target = e.target;

			// Escape: close command palette
			if (e.key === "Escape") {
				setCommandPaletteOpen(false);
				return;
			}

			// Nothing acts behind a dialog, popover or menu (#17): its own keys
			// belong to it.
			if (isInOverlay(target)) return;

			// Command palette: Ctrl+K / Cmd+K
			if (ctrl && e.key === "k") {
				e.preventDefault();
				setCommandPaletteOpen(true);
				announce("Command palette opened");
				return;
			}

			// Save / Publish: Ctrl+S / Cmd+S
			if (ctrl && e.key === "s") {
				e.preventDefault();
				openBulkPublish();
				announce("Bulk publish dialog opened");
				return;
			}

			// In a text field (or the code editor) Ctrl+Z / Ctrl+Y undo the text,
			// not the workspace (#34 review); Ctrl+D, cut / paste and Delete are
			// the field's too (#17).
			const inTextField = isTextEntryTarget(target);

			// Undo: Ctrl+Z / Cmd+Z
			if (ctrl && e.key === "z" && !e.shiftKey && past.length > 0 && !inTextField) {
				e.preventDefault();
				undo();
				announce("Undo");
				return;
			}

			// Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y
			if (((ctrl && e.key === "y") || (ctrl && e.shiftKey && e.key === "z")) && !inTextField) {
				e.preventDefault();
				if (future.length > 0) {
					redo();
					announce("Redo");
				}
				return;
			}

			// Duplicate: Ctrl+D / Cmd+D
			if (ctrl && e.key === "d") {
				if (!inTextField && selectedButtonId && selectedGroupId && selectedTabId && activeLocation) {
					e.preventDefault();
					duplicateButton(activeLocation, selectedTabId, selectedGroupId, selectedButtonId);
					announce("Button duplicated");
				}
				return;
			}

			// Cut button: Ctrl+X / Cmd+X
			if (ctrl && e.key.toLowerCase() === "x") {
				if (
					!inTextField &&
					selectedButtonId &&
					selectedGroupId &&
					selectedTabId &&
					activeLocation
				) {
					e.preventDefault();
					const group = ribbons[activeLocation].tabs
						.find((t) => t.id === selectedTabId)
						?.groups.find((g) => g.id === selectedGroupId);
					if (group && menuItemPlace(group, selectedButtonId)) {
						// Cut / paste moves top-level controls only (#62 review m5).
						announce("Menu items can't be cut. Delete the item and add a new one to the other menu.");
						return;
					}
					cutBufferRef.current = {
						location: activeLocation,
						tabId: selectedTabId,
						groupId: selectedGroupId,
						buttonId: selectedButtonId,
					};
					announce("Button cut. Focus a destination group, then press paste.");
				}
				return;
			}

			// Paste cut button into focused/selected group: Ctrl+V / Cmd+V
			if (ctrl && e.key.toLowerCase() === "v") {
				const cut = cutBufferRef.current;
				if (
					!inTextField &&
					cut &&
					selectedGroupId &&
					selectedTabId &&
					activeLocation
				) {
					e.preventDefault();
					moveButton(
						{
							groupId: cut.groupId,
							buttonId: cut.buttonId,
							tabId: cut.tabId,
							location: cut.location,
						},
						{
							groupId: selectedGroupId,
							tabId: selectedTabId,
							location: activeLocation,
						},
					);
					requestAnimationFrame(() => {
						selectButtonInContext(activeLocation, selectedTabId, selectedGroupId, cut.buttonId);
						const targetTile = document.querySelector<HTMLButtonElement>(
							`[data-ribbon-btn-id="${cut.buttonId}"]`,
						);
						targetTile?.focus();
					});
					cutBufferRef.current = null;
					announce("Button pasted to destination group.");
				}
				return;
			}

			// Delete: Delete / Backspace (when canvas focused and button selected)
			if (
				(e.key === "Delete" || e.key === "Backspace") &&
				selectedButtonId &&
				selectedGroupId &&
				selectedTabId &&
				activeLocation
			) {
				if (!inTextField) {
					const activeTab = ribbons[activeLocation].tabs.find((t) => t.id === selectedTabId);
					const selectedGroup = activeTab?.groups.find((g) => g.id === selectedGroupId);
					const selected = findGroupControl(selectedGroup, selectedButtonId);
					if (!selected) return;
					e.preventDefault();
					// Only your own buttons are deleted — the same rule as publish (#17).
					// Anything else is offered a hide instead.
					if (!canDeleteControl(selected, baseline[activeLocation])) {
						const readOnly =
							activeLocation === "Application" &&
							selectedTabId === "Mscrm.GlobalTab" &&
							selected.oob &&
							!selected.custom;
						if (readOnly) announce(`"${selected.label}" is read-only and can't be deleted.`);
						else if (selected.hidden)
							announce(`"${selected.label}" can't be deleted — only your own buttons can. It is already hidden.`);
						else
							openHideInsteadOfDelete({
								location: activeLocation,
								tabId: selectedTabId,
								groupId: selectedGroupId,
								buttonId: selectedButtonId,
							});
						return;
					}
					// A menu item: select the next item of its section, else its flyout.
					// A top-level control: the next top-level control — never an item of
					// the menu being deleted with it (#62 review m5).
					const place = selectedGroup ? menuItemPlace(selectedGroup, selectedButtonId) : undefined;
					const orderedButtons = place
						? place.section.controls.map((button) => ({ groupId: selectedGroupId, buttonId: button.id }))
						: (activeTab?.groups.flatMap((group) =>
								group.buttons.map((button) => ({ groupId: group.id, buttonId: button.id })),
							) ?? []);
					const deletedIndex = orderedButtons.findIndex((btn) => btn.buttonId === selectedButtonId);
					const nextTarget =
						orderedButtons[deletedIndex + 1] ??
						orderedButtons[deletedIndex - 1] ??
						(place ? { groupId: selectedGroupId, buttonId: place.parent.id } : null);
					const fallbackGroupId = selectedGroupId;

					deleteButton(activeLocation, selectedTabId, selectedGroupId, selectedButtonId);
					requestAnimationFrame(() => {
						if (nextTarget) {
							selectButtonInContext(
								activeLocation,
								selectedTabId,
								nextTarget.groupId,
								nextTarget.buttonId,
							);
							const nextTile = document.querySelector<HTMLButtonElement>(
								`[data-ribbon-btn-id="${nextTarget.buttonId}"]`,
							);
							nextTile?.focus();
							return;
						}

						if (fallbackGroupId) {
							selectGroup(fallbackGroupId);
							const addButton = document.querySelector<HTMLButtonElement>(
								`[data-add-btn-group-id="${fallbackGroupId}"]`,
							);
							addButton?.focus();
						}
					});
					announce("Button deleted");
				}
			}
		};

		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [
		setCommandPaletteOpen,
		openBulkPublish,
		announce,
		openHideInsteadOfDelete,
		undo,
		redo,
		past.length,
		future.length,
		selectedButtonId,
		selectedGroupId,
		selectedTabId,
		activeLocation,
		duplicateButton,
		deleteButton,
		moveButton,
		ribbons,
		baseline,
		selectButtonInContext,
		selectGroup,
	]);
}
