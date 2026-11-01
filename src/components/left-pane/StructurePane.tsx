import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	Badge,
	Button,
	Menu,
	MenuDivider,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	SearchBox,
	Text,
	Tooltip,
	Tree,
	TreeItem,
	TreeItemLayout,
	makeStyles,
	mergeClasses,
	tokens,
	type TreeOpenChangeData,
} from "@fluentui/react-components";
import {
	AddRegular,
	EyeRegular,
	GroupRegular,
	MoreHorizontalRegular,
	TabDesktopRegular,
} from "@fluentui/react-icons";
import { arrayMove } from "@dnd-kit/sortable";
import { bySequence, ownContainerIds, scopeLayer, useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore } from "@/store/draftStore";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { useDisplayText } from "@/hooks/useDisplayText";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { ButtonContextMenu, type ButtonMenuTarget } from "@/components/shared/ButtonContextMenu";
import { GroupContextMenu, type GroupMenuTarget } from "@/components/shared/GroupContextMenu";
import { RenameGroupDialog } from "@/components/modals/RenameGroupDialog";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import {
	canDeleteTab as canDeleteTabWithContents,
	canRenameContainer,
	RENAME_NOT_PUBLISHABLE,
} from "@/utils/ribbonProvenance";
import type { RibbonButton, RibbonGroup, RibbonTab } from "@/types/ribbon";

/**
 * The left pane's Structure tab (#194): the location's ribbon as a tree of
 * tab › group › control. It replaces the ribbon tab strip above the canvas
 * (#180): choosing a tab node shows that tab, and the tab's actions are in its
 * node menu. Choosing a group or control selects it on the canvas and in
 * Properties, and a selection made there is shown here.
 *
 * Keys: the arrow keys move (Fluent's Tree), Enter chooses, F2 renames a tab or
 * group, and Shift+F10 or the Menu key opens a node's menu, as right-click does.
 */

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
		flexShrink: 0,
	},
	search: { flex: 1, minWidth: 0 },
	body: { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" },
	selected: {
		backgroundColor: tokens.colorSubtleBackgroundSelected,
		":hover": { backgroundColor: tokens.colorSubtleBackgroundSelected },
	},
	label: {
		display: "block",
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	hidden: { color: tokens.colorNeutralForeground3 },
	muted: { color: tokens.colorNeutralForeground3 },
	yours: { flexShrink: 0, marginLeft: tokens.spacingHorizontalXS },
	empty: {
		padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
		color: tokens.colorNeutralForeground3,
	},
});

const tabKey = (tabId: string) => `tab:${tabId}`;
const groupKey = (tabId: string, groupId: string) => `group:${tabId}:${groupId}`;
const buttonKey = (tabId: string, groupId: string, buttonId: string) =>
	`btn:${tabId}:${groupId}:${buttonId}`;

const keyOfSelection = (tabId: string, groupId: string | null, buttonId: string | null) =>
	buttonId
		? groupId && buttonKey(tabId, groupId, buttonId)
		: groupId
			? groupKey(tabId, groupId)
			: tabKey(tabId);

/** A tab's menu; groups and controls use the shared menus. */
interface TabMenuState {
	tab: RibbonTab;
	anchor: HTMLElement;
}

/** The node's own key events, not a nested node's bubbling up. */
const isOwnEvent = (e: React.SyntheticEvent) => e.target === e.currentTarget;
const isMenuKey = (e: React.KeyboardEvent) =>
	e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

export function StructurePane() {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const selectGroup = useSelectionStore((s) => s.selectGroup);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const tabs = useRibbonStore((s) => s.ribbons[location].tabs);
	const locLabels = useRibbonStore((s) => s.locLabels);
	// Titles in the organisation's base language: a rename replaces that language's (#66 review m3).
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	const renameTab = useRibbonStore((s) => s.renameTab);
	const deleteTab = useRibbonStore((s) => s.deleteTab);
	const reorderTabs = useRibbonStore((s) => s.reorderTabs);
	const hasTable = useSessionStore((s) => !!s.activeEntity);
	// The open table's ribbon is in the store (until then it's empty, or the previous table's).
	const loaded = useDraftStore((s) => s.target !== null);
	const openNewTab = useUIStore((s) => s.openNewTab);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	const openTabDisplayRules = useUIStore((s) => s.openTabDisplayRules);
	const announce = useUIStore((s) => s.announce);
	const noteStructureChoice = useUIStore((s) => s.noteStructureChoice);

	const [filter, setFilter] = useState("");
	const [openItems, setOpenItems] = useState<Set<string>>(() => new Set());
	// While filtering, what's open follows the matches until a node is toggled.
	const [filterOpen, setFilterOpen] = useState<Set<string> | null>(null);
	const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
	const [groupMenu, setGroupMenu] = useState<GroupMenuTarget | null>(null);
	const [buttonMenu, setButtonMenu] = useState<ButtonMenuTarget | null>(null);
	const [menuTabId, setMenuTabId] = useState<string | null>(null);
	const [renamingTab, setRenamingTab] = useState<RibbonTab | null>(null);
	const [deletingTab, setDeletingTab] = useState<RibbonTab | null>(null);
	// A click that chose a node opens it; a click on the chosen node toggles it.
	const choseOnClick = useRef<string | null>(null);
	const treeRef = useRef<HTMLDivElement>(null);

	const tabText = (tab: RibbonTab) =>
		captionOf(tab.label, locLabels, lang, tab.source?.titleToken) || tab.id;
	const groupText = (group: RibbonGroup) =>
		captionOf(group.label, locLabels, lang, group.source?.titleToken) || group.id;
	const buttonText = (button: RibbonButton) =>
		captionOf(button.label, locLabels, undefined, button.source?.labelToken) || button.id;

	const currentTab = tabs.find((t) => t.id === tabId);

	// What's shown on the canvas is shown here: its tab, and the selected control's group.
	useEffect(() => {
		const keys = [tabKey(tabId)];
		if (selectedGroupId) keys.push(groupKey(tabId, selectedGroupId));
		setOpenItems((prev) =>
			keys.every((k) => prev.has(k)) ? prev : new Set([...prev, ...keys]),
		);
	}, [location, tabId, selectedGroupId]);

	const selectedKey = keyOfSelection(tabId, selectedGroupId, selectedButtonId);
	// …and scrolled to when it was selected elsewhere.
	useEffect(() => {
		if (!selectedKey) return;
		const node = [
			...(treeRef.current?.querySelectorAll<HTMLElement>("[data-structure-key]") ?? []),
		].find((n) => n.dataset.structureKey === selectedKey);
		node?.scrollIntoView?.({ block: "nearest" });
	}, [selectedKey]);

	// The filter: a node shows when it, an ancestor or a descendant matches;
	// ancestors of a match are opened.
	const q = filter.trim().toLowerCase();
	const view = useMemo(() => {
		const hit = (text: string, id: string) =>
			text.toLowerCase().includes(q) || id.toLowerCase().includes(q);
		const shown = new Set<string>();
		const opened = new Set<string>();
		if (!q) return { shown: null, opened };
		for (const tab of tabs) {
			const tk = tabKey(tab.id);
			const tabHit = hit(tabText(tab), tab.id);
			for (const group of tab.groups) {
				const gk = groupKey(tab.id, group.id);
				const groupHit = hit(groupText(group), group.id);
				for (const button of group.buttons) {
					const btnHit = hit(buttonText(button), button.id);
					if (btnHit || groupHit || tabHit)
						shown.add(buttonKey(tab.id, group.id, button.id));
					if (btnHit) {
						opened.add(tk);
						opened.add(gk);
						shown.add(gk);
						shown.add(tk);
					}
				}
				if (groupHit || tabHit) shown.add(gk);
				if (groupHit) {
					opened.add(tk);
					shown.add(tk);
				}
			}
			if (tabHit) shown.add(tk);
		}
		return { shown, opened };
		// The text helpers read only these.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [q, tabs, locLabels, lang, captionOf]);
	const isShown = (key: string) => !view.shown || view.shown.has(key);
	const effectiveOpen = q ? (filterOpen ?? view.opened) : openItems;

	const onOpenChange = (_: unknown, d: TreeOpenChangeData) => {
		const value = String(d.value);
		// Choosing a node by a click (or Enter) opens it, never closes it.
		const open = choseOnClick.current === value && d.type === "Click" ? true : d.open;
		choseOnClick.current = null;
		const next = new Set(effectiveOpen);
		if (open) next.add(value);
		else next.delete(value);
		if (q) setFilterOpen(next);
		else setOpenItems(next);
	};

	const chooseTab = (tab: RibbonTab) => {
		if (tab.id !== tabId || selectedGroupId || selectedButtonId) setTabId(tab.id);
	};
	const chooseGroup = (tab: RibbonTab, group: RibbonGroup) => {
		if (tab.id !== tabId) setTabId(tab.id);
		selectGroup(group.id);
	};
	const chooseButton = (tab: RibbonTab, group: RibbonGroup, button: RibbonButton) =>
		selectButtonInContext(location, tab.id, group.id, button.id);

	const canRenameTab = (tab: RibbonTab) =>
		canRenameContainer("tab", tab.id, baseline[location], scopeLayer({ layers }, location));
	const canRenameGroup = (group: RibbonGroup) =>
		canRenameContainer("group", group.id, baseline[location], scopeLayer({ layers }, location));
	const canDeleteTab = (tab: RibbonTab) =>
		canDeleteTabWithContents(tab, baseline[location], ownContainerIds({ layers }, location));

	/** F2 on a tab or group that can't be renamed says why (#33). */
	const refuseRename = (kind: "Tab" | "Group", id: string, text: string) => {
		announce(`${text} can't be renamed: ${RENAME_NOT_PUBLISHABLE}.`);
		useRuntimeLogStore
			.getState()
			.logInfo("structure", `${kind} ${id} can't be renamed: ${RENAME_NOT_PUBLISHABLE}.`);
	};

	const moveTab = (tab: RibbonTab, by: -1 | 1) => {
		const ids = tabs.map((t) => t.id);
		const from = ids.indexOf(tab.id);
		const to = from + by;
		if (from < 0 || to < 0 || to >= ids.length) return;
		reorderTabs(location, arrayMove(ids, from, to));
	};

	/**
	 * When a menu closes without opening a dialog, focus goes back to the tree:
	 * to the chosen node (a move can put the control somewhere else), or the
	 * node the menu was opened from. Fluent would put it on the first control of
	 * the page, as the menu has no trigger of its own.
	 */
	const refocus = (anchor: HTMLElement | undefined) =>
		// A timeout, not an animation frame: frames don't run while the window is hidden.
		setTimeout(() => {
			// A dialog the menu opened keeps the focus (the narrow drawer the tree is in doesn't count).
			const dialog = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]');
			if (dialog && !dialog.contains(treeRef.current)) return;
			const sel = useSelectionStore.getState();
			const key = keyOfSelection(sel.tabId, sel.selectedGroupId, sel.selectedButtonId);
			const node =
				[
					...(treeRef.current?.querySelectorAll<HTMLElement>("[data-structure-key]") ??
						[]),
				].find((n) => n.dataset.structureKey === key) ??
				anchor?.closest<HTMLElement>('[role="treeitem"]');
			if (node?.isConnected) node.focus();
		});

	// The group and control menus act on the tab of the node they were opened
	// on. They own their dialogs, so they stay mounted after closing.
	const menuTab = tabs.find((t) => t.id === menuTabId) ?? currentTab;

	const nodeHandlers = (
		key: string,
		choose: () => void,
		openMenu: (anchor: HTMLElement) => void,
		rename?: () => void,
	) => ({
		"data-structure-key": key,
		onClick: () => {
			if (selectedKey !== key) choseOnClick.current = key;
			choose();
			// A group or control chosen in the narrow drawer closes it for the canvas (#194).
			if (!key.startsWith("tab:")) noteStructureChoice();
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
			if (!isOwnEvent(e)) return;
			if (isMenuKey(e)) {
				e.preventDefault();
				choose();
				openMenu(e.currentTarget);
			} else if (e.key === "F2" && rename) {
				e.preventDefault();
				rename();
			}
		},
		onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
			// The innermost node's menu, not its tab's or group's.
			if ((e.target as HTMLElement).closest('[role="treeitem"]') !== e.currentTarget) return;
			e.preventDefault();
			choose();
			openMenu(e.currentTarget);
		},
	});

	// Fluent doesn't pass a click in the actions slot on to the node: choose it here, as right-click does.
	const actionsButton = (
		label: string,
		choose: () => void,
		openMenu: (anchor: HTMLElement) => void,
	) => (
		<Button
			appearance="subtle"
			size="small"
			icon={<MoreHorizontalRegular />}
			aria-label={`Actions for ${label}`}
			onClick={(e) => {
				choose();
				openMenu(e.currentTarget);
			}}
		/>
	);

	const renderButton = (tab: RibbonTab, group: RibbonGroup, button: RibbonButton) => {
		const key = buttonKey(tab.id, group.id, button.id);
		if (!isShown(key)) return null;
		const text = buttonText(button);
		const selected = selectedKey === key;
		const yours = button.custom && !button.managed;
		const choose = () => chooseButton(tab, group, button);
		const openMenu = (anchor: HTMLElement) => {
			setMenuTabId(tab.id);
			setButtonMenu({ button, groupId: group.id, anchor });
		};
		return (
			<TreeItem
				key={key}
				itemType="leaf"
				value={key}
				aria-selected={selected}
				aria-description={button.id}
				{...nodeHandlers(key, choose, openMenu)}
			>
				<TreeItemLayout
					className={selected ? styles.selected : undefined}
					iconBefore={<RibbonButtonIcon button={button} size={16} />}
					aside={
						button.hidden ? (
							<Badge size="medium" appearance="outline" color="subtle">
								Hidden
							</Badge>
						) : (
							<Text
								size={200}
								className={styles.muted}
								aria-label={`Sequence ${button.sequence}`}
							>
								{button.sequence}
							</Text>
						)
					}
					actions={actionsButton(text, choose, openMenu)}
				>
					<span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
						<span
							className={mergeClasses(styles.label, button.hidden && styles.hidden)}
						>
							{text}
						</span>
						{yours && (
							<Tooltip
								content="Yours: added by your customizations"
								relationship="label"
							>
								<Badge size="extra-small" color="brand" className={styles.yours} />
							</Tooltip>
						)}
					</span>
				</TreeItemLayout>
			</TreeItem>
		);
	};

	const renderGroup = (tab: RibbonTab, group: RibbonGroup) => {
		const key = groupKey(tab.id, group.id);
		if (!isShown(key)) return null;
		const text = groupText(group);
		const selected = selectedKey === key;
		const choose = () => chooseGroup(tab, group);
		const openMenu = (anchor: HTMLElement) => {
			setMenuTabId(tab.id);
			setGroupMenu({ group, anchor });
		};
		return (
			<TreeItem
				key={key}
				itemType="branch"
				value={key}
				aria-selected={selected}
				aria-description={group.id}
				{...nodeHandlers(key, choose, openMenu, () => {
					if (!canRenameGroup(group)) return refuseRename("Group", group.id, text);
					choose();
					setMenuTabId(tab.id);
					setGroupMenu({ group, anchor: document.body, action: "rename" });
				})}
			>
				<TreeItemLayout
					className={selected ? styles.selected : undefined}
					iconBefore={<GroupRegular />}
					aside={
						<Text
							size={200}
							className={styles.muted}
							aria-label={`${group.buttons.length} controls`}
						>
							{group.buttons.length}
						</Text>
					}
					actions={actionsButton(text, choose, openMenu)}
				>
					<span className={styles.label}>{text}</span>
				</TreeItemLayout>
				<Tree>{bySequence(group.buttons).map((b) => renderButton(tab, group, b))}</Tree>
			</TreeItem>
		);
	};

	const renderTab = (tab: RibbonTab) => {
		const key = tabKey(tab.id);
		if (!isShown(key)) return null;
		const text = tabText(tab);
		const selected = selectedKey === key;
		const openMenu = (anchor: HTMLElement) => setTabMenu({ tab, anchor });
		const rename = () => {
			if (canRenameTab(tab)) setRenamingTab(tab);
			else refuseRename("Tab", tab.id, text);
		};
		return (
			<TreeItem
				key={key}
				itemType="branch"
				value={key}
				aria-selected={selected}
				aria-description={tab.id}
				{...nodeHandlers(key, () => chooseTab(tab), openMenu, rename)}
			>
				<TreeItemLayout
					className={selected ? styles.selected : undefined}
					iconBefore={<TabDesktopRegular />}
					aside={
						<Text
							size={200}
							className={styles.muted}
							aria-label={`${tab.groups.length} groups`}
						>
							{tab.groups.length}
						</Text>
					}
					actions={actionsButton(text, () => chooseTab(tab), openMenu)}
				>
					<span className={styles.label}>{text}</span>
				</TreeItemLayout>
				<Tree>{bySequence(tab.groups).map((g) => renderGroup(tab, g))}</Tree>
			</TreeItem>
		);
	};

	const tabMenuIndex = tabMenu ? tabs.findIndex((t) => t.id === tabMenu.tab.id) : -1;
	const ruleCount = tabMenu
		? tabMenu.tab.tabDisplayRules.reduce((n, r) => n + r.rules.length, 0)
		: 0;
	const visibleTabs = tabs.filter((t) => isShown(tabKey(t.id)));

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<SearchBox
					size="small"
					className={styles.search}
					placeholder="Filter tabs, groups, buttons"
					aria-label="Filter the structure"
					value={filter}
					disabled={!hasTable || !loaded}
					onChange={(_, d) => {
						setFilter(d.value);
						setFilterOpen(null);
					}}
				/>
				<Tooltip content="Add tab" relationship="label">
					<Button
						appearance="subtle"
						size="small"
						icon={<AddRegular />}
						disabled={!hasTable || !loaded}
						onClick={openNewTab}
					/>
				</Tooltip>
			</div>
			<div className={styles.body}>
				{!hasTable ? (
					<Text as="p" block size={200} className={styles.empty}>
						Choose a table to see its tabs, groups and buttons.
					</Text>
				) : !loaded ? (
					<Text as="p" block size={200} className={styles.empty}>
						Shown once the table&apos;s ribbon is loaded.
					</Text>
				) : tabs.length === 0 ? (
					<Text as="p" block size={200} className={styles.empty}>
						This location has no tabs.
					</Text>
				) : visibleTabs.length === 0 ? (
					<Text as="p" block size={200} className={styles.empty}>
						Nothing matches &ldquo;{filter.trim()}&rdquo;.
					</Text>
				) : (
					<Tree
						ref={treeRef}
						size="small"
						aria-label="Ribbon structure"
						openItems={effectiveOpen}
						onOpenChange={onOpenChange}
					>
						{tabs.map(renderTab)}
					</Tree>
				)}
			</div>

			{tabMenu && (
				<Menu
					open
					onOpenChange={(_, d) => {
						if (d.open) return;
						setTabMenu(null);
						refocus(tabMenu.anchor);
					}}
					positioning={{ target: tabMenu.anchor, position: "below", align: "start" }}
				>
					<MenuTrigger disableButtonEnhancement>
						<span hidden />
					</MenuTrigger>
					<MenuPopover>
						<MenuList aria-label={`Actions for ${tabText(tabMenu.tab)}`}>
							{canRenameTab(tabMenu.tab) ? (
								<MenuItem
									secondaryContent="F2"
									onClick={() => setRenamingTab(tabMenu.tab)}
								>
									Rename…
								</MenuItem>
							) : (
								<MenuItem
									disabled
									title={RENAME_NOT_PUBLISHABLE}
									subText="Only your own tabs and groups can be renamed"
								>
									Rename…
								</MenuItem>
							)}
							<MenuItem
								icon={<EyeRegular />}
								secondaryContent={ruleCount > 0 ? String(ruleCount) : undefined}
								onClick={() => openTabDisplayRules(location, tabMenu.tab.id)}
							>
								Tab display rules…
							</MenuItem>
							<MenuItem
								icon={<AddRegular />}
								onClick={() => {
									chooseTab(tabMenu.tab);
									openNewGroup();
								}}
							>
								Add group…
							</MenuItem>
							<MenuDivider />
							<MenuItem
								disabled={tabMenuIndex <= 0}
								onClick={() => moveTab(tabMenu.tab, -1)}
							>
								Move up
							</MenuItem>
							<MenuItem
								disabled={tabMenuIndex < 0 || tabMenuIndex >= tabs.length - 1}
								onClick={() => moveTab(tabMenu.tab, 1)}
							>
								Move down
							</MenuItem>
							<MenuDivider />
							<MenuItem
								disabled={!canDeleteTab(tabMenu.tab)}
								onClick={() => setDeletingTab(tabMenu.tab)}
							>
								Delete tab…
							</MenuItem>
						</MenuList>
					</MenuPopover>
				</Menu>
			)}

			{menuTab && (
				<GroupContextMenu
					location={location}
					tab={menuTab}
					moveLabels={["Move up", "Move down"]}
					target={groupMenu}
					onClose={() => {
						refocus(
							groupMenu?.anchor instanceof HTMLElement ? groupMenu.anchor : undefined,
						);
						setGroupMenu(null);
					}}
				/>
			)}
			{menuTab && (
				<ButtonContextMenu
					location={location}
					tab={menuTab}
					target={buttonMenu}
					onClose={() => {
						refocus(buttonMenu?.anchor);
						setButtonMenu(null);
					}}
				/>
			)}

			{renamingTab && (
				<RenameGroupDialog
					open
					noun="tab"
					// The title itself, not the display text, which an edit would write back.
					initialLabel={resolveDisplayLabel(renamingTab.label, locLabels, lang)}
					onRename={(label) => {
						renameTab(location, renamingTab.id, label);
						setRenamingTab(null);
					}}
					onCancel={() => setRenamingTab(null)}
				/>
			)}
			{deletingTab && (
				<ConfirmDialog
					open
					title="Delete tab"
					confirmLabel="Delete tab"
					destructive
					onConfirm={() => {
						deleteTab(location, deletingTab.id);
						setDeletingTab(null);
					}}
					onCancel={() => setDeletingTab(null)}
				>
					Delete the tab &ldquo;{tabText(deletingTab)}&rdquo; and its groups and buttons?
				</ConfirmDialog>
			)}
		</div>
	);
}
