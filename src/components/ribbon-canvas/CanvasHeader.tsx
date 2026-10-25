import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	Button,
	CounterBadge,
	Input,
	Menu,
	MenuDivider,
	MenuItem,
	MenuItemRadio,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Overflow,
	OverflowItem,
	Tab,
	TabList,
	Tooltip,
	makeStyles,
	tokens,
	useIsOverflowItemVisible,
	useOverflowMenu,
} from "@fluentui/react-components";
import {
	AddRegular,
	ChevronDownRegular,
	DocumentRegular,
	EyeRegular,
	GlobeRegular,
	MoreHorizontalRegular,
	TableRegular,
	TableResizeColumnRegular,
} from "@fluentui/react-icons";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	horizontalListSortingStrategy,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSelectionStore } from "@/store/selectionStore";
import { ownContainerIds, scopeLayer, useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore, type RibbonViewStyle } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { useDisplayText } from "@/hooks/useDisplayText";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import {
	canDeleteTab as canDeleteTabWithContents,
	canRenameContainer,
	RENAME_NOT_PUBLISHABLE,
} from "@/utils/ribbonProvenance";
import { defaultTabId } from "@/utils/defaultTab";
import { LOCATION_INFO } from "@/constants/locationInfo";
import { LocationInfo } from "@/components/shared/LocationInfo";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { ModernAppFilter } from "./modern/ModernAppFilter";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";

/**
 * The two rows above the canvas (#180): where the command bar appears
 * (Fluent TabList with an overflow menu, About this location, App and View),
 * and the location's ribbon tabs (label only, the id in a tooltip, actions in a
 * Tab options menu, Add tab and Tab rules always reachable).
 */

const useStyles = makeStyles({
	row: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		padding: `0 ${tokens.spacingHorizontalS}`,
		minHeight: "40px",
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
		minWidth: 0,
	},
	locationRow: { backgroundColor: tokens.colorNeutralBackground2 },
	/**
	 * Fills the free space: Fluent's Overflow measures this container, and one
	 * sized to its content shrinks as tabs hide and never grows back.
	 */
	locationTabs: {
		flex: "1 1 0",
		minWidth: 0,
		overflow: "hidden",
		display: "flex",
		alignItems: "center",
	},
	spacer: { flex: "1 1 0", minWidth: 0 },
	viewValue: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	muted: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
	tabScroller: {
		flex: "0 1 auto",
		minWidth: 0,
		overflowX: "auto",
		overflowY: "hidden",
		scrollbarWidth: "thin",
	},
	tabList: { flexWrap: "nowrap" },
	tabLabel: {
		maxWidth: "220px",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	renameInput: { width: "160px", flexShrink: 0 },
	pinned: { flexShrink: 0 },
});

const LOCATION_ORDER: RibbonLocation[] = ["HomepageGrid", "Form", "SubGrid", "Application"];
const LOCATION_ICON: Record<RibbonLocation, React.ReactElement> = {
	HomepageGrid: <TableRegular />,
	Form: <DocumentRegular />,
	SubGrid: <TableResizeColumnRegular />,
	Application: <GlobeRegular />,
};
const VIEW_LABEL: Record<RibbonViewStyle, string> = {
	classic: "Classic ribbon",
	modern: "Modern command bar",
	list: "List",
};

// ── Location row ────────────────────────────────────────────────────────────

export function LocationRow() {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const setLocation = useSelectionStore((s) => s.setLocation);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const table = useSessionStore((s) => s.activeEntity?.logicalName);
	const view = useUIStore((s) => s.ribbonViewStyle);
	const setView = useUIStore((s) => s.setRibbonViewStyle);

	const select = (loc: RibbonLocation) => {
		setLocation(loc);
		const first = defaultTabId(ribbons[loc].tabs);
		if (first) setTabId(first);
	};

	return (
		<div className={`${styles.row} ${styles.locationRow}`}>
			{/* Padding leaves room for About this location, beside the tabs. */}
			<Overflow minimumVisible={1} padding={48}>
				<div className={styles.locationTabs}>
					<TabList
						size="small"
						aria-label="Where the command bar appears"
						selectedValue={location}
						onTabSelect={(_, d) => select(d.value as RibbonLocation)}
					>
						{LOCATION_ORDER.map((loc) => (
							<OverflowItem key={loc} id={loc} priority={loc === location ? 2 : 1}>
								<Tab value={loc} icon={LOCATION_ICON[loc]}>
									{LOCATION_INFO[loc].label}
								</Tab>
							</OverflowItem>
						))}
						<LocationOverflowMenu onSelect={select} />
					</TabList>
					<LocationInfo location={location} table={table} compact />
				</div>
			</Overflow>
			<ModernAppFilter />
			<Menu
				checkedValues={{ view: [view] }}
				onCheckedValueChange={(_, d) => setView(d.checkedItems[0] as RibbonViewStyle)}
			>
				<MenuTrigger disableButtonEnhancement>
					<Button
						appearance="subtle"
						size="small"
						icon={<ChevronDownRegular />}
						iconPosition="after"
						aria-label={`View as: ${VIEW_LABEL[view]}`}
						className={styles.pinned}
					>
						<span className={styles.muted}>View:&nbsp;</span>
						<span className={styles.viewValue}>{VIEW_LABEL[view]}</span>
					</Button>
				</MenuTrigger>
				<MenuPopover>
					<MenuList>
						{(Object.keys(VIEW_LABEL) as RibbonViewStyle[]).map((v) => (
							<MenuItemRadio key={v} name="view" value={v}>
								{VIEW_LABEL[v]}
							</MenuItemRadio>
						))}
					</MenuList>
				</MenuPopover>
			</Menu>
		</div>
	);
}

/** Locations that didn't fit, as a More menu (#180). */
function LocationOverflowMenu({ onSelect }: { onSelect: (loc: RibbonLocation) => void }) {
	const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>();
	if (!isOverflowing) return null;
	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>
				<Button
					ref={ref}
					appearance="transparent"
					size="small"
					icon={<ChevronDownRegular />}
					iconPosition="after"
					aria-label={`${overflowCount} more locations`}
				>
					More
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{LOCATION_ORDER.map((loc) => (
						<LocationOverflowItem key={loc} location={loc} onSelect={onSelect} />
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}

function LocationOverflowItem({
	location,
	onSelect,
}: {
	location: RibbonLocation;
	onSelect: (loc: RibbonLocation) => void;
}) {
	const visible = useIsOverflowItemVisible(location);
	if (visible) return null;
	return (
		<MenuItem icon={LOCATION_ICON[location]} onClick={() => onSelect(location)}>
			{LOCATION_INFO[location].label}
		</MenuItem>
	);
}

// ── Ribbon tab strip ────────────────────────────────────────────────────────

export function RibbonTabStrip({ currentTab }: { currentTab: RibbonTab | undefined }) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const renameTab = useRibbonStore((s) => s.renameTab);
	const deleteTab = useRibbonStore((s) => s.deleteTab);
	const reorderTabs = useRibbonStore((s) => s.reorderTabs);
	const locLabels = useRibbonStore((s) => s.locLabels);
	// Tab titles in the organisation's base language: a rename replaces that
	// language's title (#66 review m3).
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	const openTabDisplayRules = useUIStore((s) => s.openTabDisplayRules);
	const openNewTab = useUIStore((s) => s.openNewTab);
	const announce = useUIStore((s) => s.announce);
	const captionOf = useDisplayText();

	const tabs = ribbons[location].tabs;
	const [editingTabId, setEditingTabId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	// Tab awaiting delete confirmation (#18: window.confirm doesn't work in PPTB).
	const [deletingTabId, setDeletingTabId] = useState<string | null>(null);
	/** The tab whose rename was just refused: it says why (#33), until another tab is picked. */
	const [renameRefusedTabId, setRenameRefusedTabId] = useState<string | null>(null);

	useEffect(() => {
		if (editingTabId && inputRef.current) inputRef.current.focus();
	}, [editingTabId]);

	const labelOf = (tab: RibbonTab) =>
		captionOf(tab.label, locLabels, lang, tab.source?.titleToken);

	/**
	 * A tab can be deleted when publishing can remove it: it was created in
	 * this session, or the table's (or application's) unmanaged layer adds it —
	 * and so is everything in it (#17 review).
	 */
	const canDelete = (tab: RibbonTab) =>
		canDeleteTabWithContents(tab, baseline[location], ownContainerIds({ layers }, location));
	/** Whether renaming the tab can be published (#33): new, or yours with a translatable title. */
	const canRename = (tab: RibbonTab) =>
		canRenameContainer("tab", tab.id, baseline[location], scopeLayer({ layers }, location));

	function startRename(tab: RibbonTab) {
		if (!canRename(tab)) {
			setRenameRefusedTabId(tab.id);
			announce(`${labelOf(tab)} can't be renamed: ${RENAME_NOT_PUBLISHABLE}.`);
			useRuntimeLogStore
				.getState()
				.logInfo("canvas", `Tab ${tab.id} can't be renamed: ${RENAME_NOT_PUBLISHABLE}.`);
			return;
		}
		setEditingTabId(tab.id);
		setEditValue(resolveDisplayLabel(tab.label, locLabels, lang));
	}

	function commitRename() {
		const tab = tabs.find((t) => t.id === editingTabId);
		// The editor starts from the display text, not a `$LocLabels:` token;
		// committing it unchanged must not turn the token into literal text.
		if (
			tab &&
			editValue.trim() &&
			editValue.trim() !== resolveDisplayLabel(tab.label, locLabels, lang)
		) {
			renameTab(location, tab.id, editValue.trim());
		}
		setEditingTabId(null);
	}

	function move(tab: RibbonTab, by: -1 | 1) {
		const ids = tabs.map((t) => t.id);
		const from = ids.indexOf(tab.id);
		const to = from + by;
		if (from < 0 || to < 0 || to >= ids.length) return;
		reorderTabs(location, arrayMove(ids, from, to));
	}

	// A small movement starts a drag, so a click still selects the tab. Pointer
	// only: the keyboard moves tabs with Move left / Move right instead of a
	// keyboard drag that took over Space and Enter (#180).
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;
			const ids = tabs.map((t) => t.id);
			const from = ids.indexOf(String(active.id));
			const to = ids.indexOf(String(over.id));
			if (from < 0 || to < 0) return;
			reorderTabs(location, arrayMove(ids, from, to));
		},
		[location, tabs, reorderTabs],
	);

	const deletingTab = deletingTabId ? tabs.find((t) => t.id === deletingTabId) : undefined;
	const index = currentTab ? tabs.findIndex((t) => t.id === currentTab.id) : -1;
	const ruleCount = currentTab
		? currentTab.tabDisplayRules.reduce((n, r) => n + r.rules.length, 0)
		: 0;

	return (
		<div className={styles.row}>
			<DndContext sensors={sensors} onDragEnd={onDragEnd}>
				<SortableContext
					items={tabs.map((t) => t.id)}
					strategy={horizontalListSortingStrategy}
				>
					<div className={styles.tabScroller}>
						<TabList
							size="small"
							className={styles.tabList}
							aria-label="Ribbon tabs"
							selectedValue={currentTab?.id}
							onTabSelect={(_, d) => {
								setTabId(String(d.value));
								if (renameRefusedTabId !== d.value) setRenameRefusedTabId(null);
							}}
						>
							{tabs.map((tab) =>
								tab.id === editingTabId ? (
									<Input
										key={tab.id}
										ref={inputRef}
										size="small"
										className={styles.renameInput}
										value={editValue}
										aria-label="Rename tab"
										onChange={(_, d) => setEditValue(d.value)}
										onBlur={commitRename}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												commitRename();
											}
											if (e.key === "Escape") {
												e.preventDefault();
												setEditingTabId(null);
											}
											e.stopPropagation();
										}}
									/>
								) : (
									<SortableRibbonTab
										key={tab.id}
										tab={tab}
										label={labelOf(tab)}
										refused={renameRefusedTabId === tab.id}
										onRename={() => {
											setTabId(tab.id);
											startRename(tab);
										}}
									/>
								),
							)}
						</TabList>
					</div>
				</SortableContext>
			</DndContext>

			{currentTab && (
				<Menu>
					<MenuTrigger disableButtonEnhancement>
						<Tooltip content="Tab options" relationship="label">
							<Button
								appearance="subtle"
								size="small"
								icon={<MoreHorizontalRegular />}
								className={styles.pinned}
							/>
						</Tooltip>
					</MenuTrigger>
					<MenuPopover>
						<MenuList>
							<MenuItem
								onClick={() => startRename(currentTab)}
								secondaryContent="F2"
								disabled={!canRename(currentTab)}
							>
								Rename…
							</MenuItem>
							<MenuItem onClick={openTabDisplayRules}>Tab display rules…</MenuItem>
							<MenuDivider />
							<MenuItem disabled={index <= 0} onClick={() => move(currentTab, -1)}>
								Move left
							</MenuItem>
							<MenuItem
								disabled={index < 0 || index >= tabs.length - 1}
								onClick={() => move(currentTab, 1)}
							>
								Move right
							</MenuItem>
							<MenuDivider />
							<MenuItem
								disabled={!canDelete(currentTab)}
								onClick={() => setDeletingTabId(currentTab.id)}
							>
								Delete tab…
							</MenuItem>
						</MenuList>
					</MenuPopover>
				</Menu>
			)}
			<Tooltip content="Add tab" relationship="label">
				<Button
					appearance="subtle"
					size="small"
					icon={<AddRegular />}
					onClick={openNewTab}
					className={styles.pinned}
				/>
			</Tooltip>
			<div className={styles.spacer} />
			<Button
				appearance="subtle"
				size="small"
				icon={<EyeRegular />}
				onClick={openTabDisplayRules}
				className={styles.pinned}
			>
				Tab rules
				{ruleCount > 0 && (
					<CounterBadge
						size="small"
						appearance="ghost"
						color="brand"
						count={ruleCount}
						style={{ marginLeft: tokens.spacingHorizontalXS }}
					/>
				)}
			</Button>

			{deletingTab && (
				<ConfirmDialog
					open
					title="Delete tab"
					confirmLabel="Delete tab"
					destructive
					onConfirm={() => {
						deleteTab(location, deletingTab.id);
						setDeletingTabId(null);
					}}
					onCancel={() => setDeletingTabId(null)}
				>
					Delete the tab &ldquo;{labelOf(deletingTab)}&rdquo; and its groups and buttons?
				</ConfirmDialog>
			)}
		</div>
	);
}

/** A ribbon tab: drag to reorder (pointer), double-click or F2 to rename. */
function SortableRibbonTab({
	tab,
	label,
	refused,
	onRename,
}: {
	tab: RibbonTab;
	label: string;
	refused: boolean;
	onRename: () => void;
}) {
	const styles = useStyles();
	// Only the listeners: Fluent's Tab keeps its own role, tab index and keys.
	const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: tab.id,
	});
	return (
		<Tooltip
			content={refused ? `${RENAME_NOT_PUBLISHABLE}.` : tab.id}
			relationship="description"
		>
			<Tab
				ref={setNodeRef}
				value={tab.id}
				data-tab-id={tab.id}
				{...listeners}
				style={{
					transform: CSS.Transform.toString(transform),
					transition,
					opacity: isDragging ? 0.5 : 1,
				}}
				onDoubleClick={onRename}
				onKeyDown={(e) => {
					if (e.key === "F2") onRename();
				}}
			>
				<span className={styles.tabLabel}>{label}</span>
			</Tab>
		</Tooltip>
	);
}
