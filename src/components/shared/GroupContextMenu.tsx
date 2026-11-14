import { useEffect, useState } from "react";
import {
	Menu,
	MenuDivider,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
} from "@fluentui/react-components";
import {
	AddRegular,
	AppsAddInRegular,
	ArrowNextRegular,
	ArrowPreviousRegular,
	CopyRegular,
	DeleteRegular,
	RenameRegular,
} from "@fluentui/react-icons";
import { RenameGroupDialog } from "@/components/modals/RenameGroupDialog";
import { ChangeGroupTemplateDialog } from "@/components/modals/ChangeGroupTemplateDialog";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { useDisplayText } from "@/hooks/useDisplayText";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { canMoveGroup, ownContainerIds, scopeLayer, useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import {
	canDeleteGroup,
	canRenameContainer,
	RENAME_NOT_PUBLISHABLE,
} from "@/utils/ribbonProvenance";
import type { RibbonGroup, RibbonLocation, RibbonTab } from "@/types/ribbon";

/**
 * The one menu for a ribbon group (#194), wherever it is shown: the Classic
 * canvas (right-click) and the Edit-mode Structure tree now, the group cards
 * next. It opens at an element (so Shift+F10 and the Menu key work) or at the
 * pointer, and owns the dialogs its items open.
 */

export interface GroupMenuTarget {
	group: RibbonGroup;
	/** The element the menu opens against, or the pointer's position. */
	anchor: HTMLElement | { x: number; y: number };
	/** Skips the menu and opens that item's dialog (F2 on a tree node renames). */
	action?: "rename";
}

interface GroupContextMenuProps {
	location: RibbonLocation;
	tab: RibbonTab;
	/** null when closed. */
	target: GroupMenuTarget | null;
	onClose: () => void;
	/** How moving reads where the groups are shown: side by side (cards), or a list (the tree). */
	moveLabels?: readonly [string, string];
}

function positioningTarget(anchor: GroupMenuTarget["anchor"]) {
	if (anchor instanceof HTMLElement) return anchor;
	const { x, y } = anchor;
	return {
		getBoundingClientRect: () => ({
			x,
			y,
			top: y,
			left: x,
			right: x,
			bottom: y,
			width: 0,
			height: 0,
			toJSON: () => ({}),
		}),
	};
}

export function GroupContextMenu({
	location,
	tab,
	target,
	onClose,
	moveLabels = ["Move left", "Move right"],
}: GroupContextMenuProps) {
	const captionOf = useDisplayText();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	const customTemplates = useRibbonStore((s) => s.templates);
	const duplicateGroup = useRibbonStore((s) => s.duplicateGroup);
	const setGroupTemplate = useRibbonStore((s) => s.setGroupTemplate);
	const renameGroup = useRibbonStore((s) => s.renameGroup);
	const deleteGroup = useRibbonStore((s) => s.deleteGroup);
	const moveGroup = useRibbonStore((s) => s.moveGroup);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const openNewButton = useUIStore((s) => s.openNewButton);
	// The dialogs outlive the menu (#18: window.prompt / confirm don't work in PPTB).
	const [renaming, setRenaming] = useState<RibbonGroup | null>(null);
	const [retemplating, setRetemplating] = useState<RibbonGroup | null>(null);
	const [deleting, setDeleting] = useState<RibbonGroup | null>(null);

	useEffect(() => {
		if (target?.action !== "rename") return;
		setRenaming(target.group);
		onClose();
	}, [target, onClose]);

	// An imported group keeps its Title token in source (#30): it's the reference to caption.
	const groupText = (group: RibbonGroup) =>
		captionOf(group.label, locLabels, lang, group.source?.titleToken) || group.id;

	const menu =
		target &&
		!target.action &&
		(() => {
			const { group } = target;
			const run = (action: () => void) => () => {
				action();
				onClose();
			};
			return (
				<Menu
					open
					onOpenChange={(_, d) => !d.open && onClose()}
					positioning={{
						position: "below",
						align: "start",
						target: positioningTarget(target.anchor),
					}}
				>
					{/* The menu is opened from the canvas or the tree, not from a trigger of its own. */}
					<MenuTrigger disableButtonEnhancement>
						<span hidden />
					</MenuTrigger>
					<MenuPopover>
						<MenuList aria-label={`Actions for ${groupText(group)}`}>
							<MenuItem
								icon={<AddRegular />}
								onClick={run(() => openNewButton(group.id))}
							>
								Add button…
							</MenuItem>
							{/* Only where the rename can be published (#33), like Delete. */}
							{canRenameContainer(
								"group",
								group.id,
								baseline[location],
								scopeLayer({ layers }, location),
							) ? (
								<MenuItem
									icon={<RenameRegular />}
									onClick={run(() => setRenaming(group))}
								>
									Rename…
								</MenuItem>
							) : (
								<MenuItem
									icon={<RenameRegular />}
									disabled
									title={RENAME_NOT_PUBLISHABLE}
									subText="Only your own tabs and groups can be renamed"
								>
									Rename…
								</MenuItem>
							)}
							<MenuItem
								icon={<CopyRegular />}
								onClick={run(() => duplicateGroup(location, tab.id, group.id))}
							>
								Duplicate group
							</MenuItem>
							<MenuItem
								icon={<AppsAddInRegular />}
								onClick={run(() => setRetemplating(group))}
							>
								Change template…
							</MenuItem>
							<MenuDivider />
							{/* Only where the publish keeps the new order (#194, as #163 for tabs). */}
							{([-1, 1] as const).map((by, i) => {
								const can = canMoveGroup(
									{ ribbons, baseline, layers },
									location,
									tab.id,
									group.id,
									by,
								);
								const groups = tab.groups;
								const at = groups.findIndex((g) => g.id === group.id);
								const edge = !groups[at + by];
								return (
									<MenuItem
										key={by}
										icon={
											by < 0 ? <ArrowPreviousRegular /> : <ArrowNextRegular />
										}
										disabled={!can}
										subText={
											can || edge
												? undefined
												: "Only groups your customizations add can change places"
										}
										onClick={run(() =>
											moveGroup(location, tab.id, group.id, by),
										)}
									>
										{moveLabels[i]}
									</MenuItem>
								);
							})}
							{/* Only your own group with only your own buttons (#17 review). */}
							{canDeleteGroup(
								group,
								baseline[location],
								ownContainerIds({ layers }, location),
							) && (
								<>
									<MenuDivider />
									<MenuItem
										icon={<DeleteRegular />}
										onClick={run(() => setDeleting(group))}
									>
										Delete group
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
			{renaming && (
				<RenameGroupDialog
					open
					// The title itself, not the display text (a caption made from a key,
					// placeholders as words), which an edit would write back (#229 review).
					initialLabel={resolveDisplayLabel(renaming.label, locLabels, lang)}
					onRename={(label) => {
						// The store action keeps a rename one undo step and publishes it (#66).
						renameGroup(location, tab.id, renaming.id, label);
						setRenaming(null);
					}}
					onCancel={() => setRenaming(null)}
				/>
			)}
			{retemplating && (
				<ChangeGroupTemplateDialog
					open
					currentTemplate={retemplating.template}
					customTemplateIds={customTemplates.map((t) => t.id)}
					loadedGroup={baseline[location].tabs.some(
						(t) => t.id === tab.id && t.groups.some((g) => g.id === retemplating.id),
					)}
					onChange={(template) => {
						setGroupTemplate(location, tab.id, retemplating.id, template);
						setRetemplating(null);
					}}
					onCancel={() => setRetemplating(null)}
				/>
			)}
			{deleting && (
				<ConfirmDialog
					open
					title="Delete group"
					confirmLabel="Delete group"
					destructive
					onConfirm={() => {
						deleteGroup(location, tab.id, deleting.id);
						setDeleting(null);
					}}
					onCancel={() => setDeleting(null)}
				>
					Delete the group &ldquo;{groupText(deleting)}&rdquo; and its{" "}
					{deleting.buttons.length} button
					{deleting.buttons.length === 1 ? "" : "s"}?
				</ConfirmDialog>
			)}
		</>
	);
}
