import {
	makeStyles,
	tokens,
	Button,
	Select,
	Text,
	Badge,
	MessageBar,
	MessageBarBody,
	MessageBarActions,
	Input,
	Spinner,
} from "@fluentui/react-components";
import { useDisplayText } from "@/hooks/useDisplayText";
import {
	TableRegular,
	TableResizeColumnRegular,
	DocumentRegular,
	GlobeRegular,
	AddRegular,
	EyeRegular,
	CodeRegular,
	DismissRegular,
} from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { ownContainerIds, scopeLayer, useRibbonStore } from "@/store/ribbonStore";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import {
	canDeleteTab as canDeleteTabWithContents,
	canRenameContainer,
	RENAME_NOT_PUBLISHABLE,
} from "@/utils/ribbonProvenance";
import { defaultTabId, isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";
import { UCI_TAB_NOTE } from "@/services/publishPlan";
import { ClassicRibbon } from "./ClassicRibbon";
import { ModernCommandBar } from "./ModernCommandBar";
import { RibbonListView } from "./RibbonListView";
import { FlyoutMenuPanel } from "./FlyoutMenuPanel";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { hasUnpublishedChanges } from "@/store/draftStore";
import { ModernAppFilter } from "./modern/ModernAppFilter";
import { useState, useRef, useEffect, useCallback } from "react";
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	horizontalListSortingStrategy,
	useSortable,
	arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		flex: 1,
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground1,
	},
	locationRow: {
		display: "flex",
		alignItems: "center",
		gap: 0,
		padding: `0 ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground2,
		flexShrink: 0,
		height: "36px",
	},
	locationTab: {
		height: "36px",
		padding: `0 ${tokens.spacingHorizontalM}`,
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		cursor: "pointer",
		borderBottom: "2px solid transparent",
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
		":hover": {
			color: tokens.colorNeutralForeground1,
			backgroundColor: tokens.colorNeutralBackground3,
		},
	},
	locationTabActive: {
		color: tokens.colorBrandForeground1,
		borderBottomColor: tokens.colorBrandStroke1,
		fontWeight: tokens.fontWeightSemibold,
	},
	spacer: { flex: 1 },
	tabStrip: {
		display: "flex",
		alignItems: "center",
		gap: 0,
		padding: `0 ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground1,
		flexShrink: 0,
		height: "32px",
	},
	ribbonTab: {
		height: "32px",
		padding: `0 ${tokens.spacingHorizontalM}`,
		display: "flex",
		flexDirection: "column",
		alignItems: "flex-start",
		justifyContent: "center",
		cursor: "pointer",
		borderBottom: "2px solid transparent",
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	ribbonTabActive: {
		borderBottomColor: tokens.colorBrandStroke1,
	},
	ribbonTabLabel: {
		fontSize: tokens.fontSizeBase200,
		fontWeight: tokens.fontWeightSemibold,
		lineHeight: 1.2,
	},
	ribbonTabMeta: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		lineHeight: 1.2,
	},
	addTabBtn: {
		height: "24px",
		width: "24px",
		minWidth: "24px",
		marginLeft: tokens.spacingHorizontalXS,
		borderRadius: tokens.borderRadiusMedium,
		border: `1px dashed ${tokens.colorNeutralStroke2}`,
		backgroundColor: "transparent",
		color: tokens.colorNeutralForeground3,
		cursor: "pointer",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		":hover": {
			border: `1px solid ${tokens.colorNeutralStroke1}`,
			backgroundColor: tokens.colorNeutralBackground2,
		},
	},
	inlineTabInput: {
		height: "28px",
		fontSize: tokens.fontSizeBase200,
		fontWeight: tokens.fontWeightSemibold,
		minWidth: "60px",
		maxWidth: "140px",
	},
	canvas: {
		flex: 1,
		overflow: "auto",
		padding: tokens.spacingHorizontalM,
	},
});

const useEmptyTabStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		padding: "80px",
		gap: tokens.spacingHorizontalM,
		color: tokens.colorNeutralForeground3,
	},
});

const LOCATIONS: { value: RibbonLocation; label: string; icon: React.ReactNode; desc: string }[] = [
	{
		value: "HomepageGrid",
		label: "Home Grid",
		icon: <TableRegular />,
		desc: "Mscrm.HomepageGrid.{entity}",
	},
	{
		value: "SubGrid",
		label: "Sub Grid",
		icon: <TableResizeColumnRegular />,
		desc: "Mscrm.SubGrid.{entity}",
	},
	{ value: "Form", label: "Form", icon: <DocumentRegular />, desc: "Mscrm.Form.{entity}" },
	{
		value: "Application",
		label: "Application",
		icon: <GlobeRegular />,
		desc: "applicationRibbon.xml",
	},
];

interface RibbonCanvasProps {
	isLoadingRibbon?: boolean;
	/** The table being loaded and the step the load is on (#4). */
	loadingTable?: string;
	loadingStep?: string | null;
	ribbonLoadError?: string | null;
	/** The ribbon loaded, but an unmanaged layer couldn't be read (#110). */
	layerReadError?: string | null;
	onRetryRibbonLoad?: () => void;
}

export function RibbonCanvas({
	isLoadingRibbon = false,
	loadingTable,
	loadingStep = null,
	ribbonLoadError = null,
	layerReadError = null,
	onRetryRibbonLoad,
}: RibbonCanvasProps) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const setLocation = useSelectionStore((s) => s.setLocation);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const renameTab = useRibbonStore((s) => s.renameTab);
	const deleteTab = useRibbonStore((s) => s.deleteTab);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	// Tab titles in the organisation's base language: a rename replaces that
	// language's title (#66 review m3).
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	// Not yet deleted (a pending delete is crossed out in the list), and not
	// just published from here (most likely not loaded yet, #64 review).
	const orphanCount = useRibbonStore(
		(s) =>
			s.orphans.entity.filter((o) => !s.pendingOrphanDeletes.entity.includes(o.id) && !o.recentPublish?.published)
				.length,
	);
	const clearSelection = useSelectionStore((s) => s.clearSelection);
	const reorderTabs = useRibbonStore((s) => s.reorderTabs);
	const ribbonViewStyle = useUIStore((s) => s.ribbonViewStyle);
	const setRibbonViewStyle = useUIStore((s) => s.setRibbonViewStyle);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
	const openTabDisplayRules = useUIStore((s) => s.openTabDisplayRules);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	const openNewTab = useUIStore((s) => s.openNewTab);

	// Inline tab rename state
	const [editingTabId, setEditingTabId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	// Tab awaiting delete confirmation (#18: window.confirm doesn't work in PPTB).
	const [deletingTabId, setDeletingTabId] = useState<string | null>(null);
	// Retry of an unread layer replaces the canvas: unpublished changes are asked about first (#110).
	const [confirmingReload, setConfirmingReload] = useState(false);
	const deletingTab = deletingTabId ? ribbons[location].tabs.find((t) => t.id === deletingTabId) : undefined;

	useEffect(() => {
		if (editingTabId && inputRef.current) inputRef.current.focus();
	}, [editingTabId]);

	function commitTabRename() {
		const tab = ribbons[location].tabs.find((t) => t.id === editingTabId);
		// The editor starts from the display text, not a `$LocLabels:` token;
		// committing it unchanged must not turn the token into literal text.
		if (tab && editValue.trim() && editValue.trim() !== resolveDisplayLabel(tab.label, locLabels, lang)) {
			renameTab(location, tab.id, editValue.trim());
		}
		setEditingTabId(null);
	}

	/**
	 * A tab can be deleted when publishing can remove it: it was created in
	 * this session, or the table's (or application's) unmanaged layer adds it —
	 * and so is everything in it (#17 review).
	 */
	function canDeleteTab(tab: RibbonTab): boolean {
		return canDeleteTabWithContents(tab, baseline[location], ownContainerIds({ layers }, location));
	}

	/** Whether renaming the tab can be published (#33): new, or yours with a translatable title. */
	function canRenameTab(tab: RibbonTab): boolean {
		return canRenameContainer("tab", tab.id, baseline[location], scopeLayer({ layers }, location));
	}

	/** The tab whose rename was just refused: it says why (#33), until another tab is picked. */
	const [renameRefusedTabId, setRenameRefusedTabId] = useState<string | null>(null);
	function startTabRename(tab: RibbonTab) {
		if (!canRenameTab(tab)) {
			setRenameRefusedTabId(tab.id);
			useRuntimeLogStore.getState().logInfo("canvas", `Tab ${tab.id} can't be renamed: ${RENAME_NOT_PUBLISHABLE}.`);
			return;
		}
		setEditingTabId(tab.id);
		setEditValue(resolveDisplayLabel(tab.label, locLabels, lang));
	}

	// PointerSensor without an activation constraint starts a drag on every
	// pointerdown, which steals the click event before `onClick` can run —
	// users could never switch tabs by clicking. Requiring a small movement
	// distance before drag activates lets ordinary clicks pass through to
	// onClick while still supporting drag-to-reorder.
	const tabSensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor),
	);

	const handleTabDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;
			const tabIds = ribbons[location].tabs.map((t) => t.id);
			const oldIndex = tabIds.indexOf(String(active.id));
			const newIndex = tabIds.indexOf(String(over.id));
			if (oldIndex < 0 || newIndex < 0) return;
			reorderTabs(location, arrayMove(tabIds, oldIndex, newIndex));
		},
		[location, ribbons, reorderTabs],
	);

	const ribbon = ribbons[location];
	const currentTab =
		ribbon.tabs.find((t) => t.id === tabId) ?? ribbon.tabs.find((t) => t.id === defaultTabId(ribbon.tabs));

	useEffect(() => {
		if (!ribbon.tabs.length) return;
		const exists = ribbon.tabs.some((t) => t.id === tabId);
		if (!exists) {
			const first = defaultTabId(ribbon.tabs);
			if (first) setTabId(first);
		}
	}, [ribbon.tabs, tabId, setTabId]);

	return (
		<main className={styles.root} aria-label="Ribbon canvas">
			{/* Location selector row */}
			<div className={styles.locationRow} role="tablist" aria-label="Ribbon location">
				{LOCATIONS.map((loc) => (
					<div
						key={loc.value}
						role="tab"
						aria-selected={location === loc.value}
						className={`${styles.locationTab} ${location === loc.value ? styles.locationTabActive : ""}`}
						onClick={() => {
							setLocation(loc.value);
							const firstTabId = defaultTabId(ribbons[loc.value].tabs);
							if (firstTabId) setTabId(firstTabId);
						}}
						title={loc.desc}
						tabIndex={location === loc.value ? 0 : -1}
					>
						{loc.icon}
						<Text size={200}>{loc.label}</Text>
					</div>
				))}
				<div className={styles.spacer} />
				<div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
					<ModernAppFilter />
					<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
						View as:
					</Text>
					<Select
						value={ribbonViewStyle}
						onChange={(_, d) => setRibbonViewStyle(d.value as "classic" | "modern" | "list")}
						size="small"
						style={{ height: "26px", width: "170px" }}
					>
						<option value="classic">Classic ribbon</option>
						<option value="modern">Modern command bar</option>
						<option value="list">List view</option>
					</Select>
					<Button appearance="subtle" size="small" icon={<CodeRegular />} onClick={openXmlDrawer}>
						XML
					</Button>
				</div>
			</div>

			{layerReadError && !isLoadingRibbon && !ribbonLoadError && (
				<MessageBar intent="warning" layout="multiline" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Couldn&apos;t read your unmanaged ribbon customizations, so labels may show as ids and
						ownership (what you can edit or delete) is unknown. Reload before editing. Details:{" "}
						{layerReadError}
					</MessageBarBody>
					{onRetryRibbonLoad && (
						<MessageBarActions>
							<Button
								size="small"
								onClick={() => (hasUnpublishedChanges() ? setConfirmingReload(true) : onRetryRibbonLoad())}
							>
								Retry
							</Button>
						</MessageBarActions>
					)}
				</MessageBar>
			)}

			{/* Location-specific info banners */}
			{location === "Form" && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Form ribbon customizations target the legacy web client. On Unified Interface, form
						commands render in a flat command bar — tab layout and scaling are ignored, but button
						visibility and command actions work as configured (same behaviour as Ribbon Workbench).
						Microsoft does not officially support the tabbed ribbon UI on Unified Interface.
					</MessageBarBody>
				</MessageBar>
			)}
			{location === "SubGrid" && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Subgrid ribbons support only 3 native controls: Add, Show List, and Delete. Their icons
						cannot be changed.
					</MessageBarBody>
				</MessageBar>
			)}
			{location === "Application" && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Buttons added to GlobalTab appear in the persistent global command bar at the top of
						every page. OOB GlobalTab buttons are read-only and cannot be customized.
					</MessageBarBody>
				</MessageBar>
			)}

			{/* A custom tab: how Unified Interface shows it (#58). */}
			{currentTab && !/^(Mscrm|Microsoft)\./.test(currentTab.id) && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>{UCI_TAB_NOTE}</MessageBarBody>
				</MessageBar>
			)}

			{/* Charts / AllEntities tabs: their buttons never show in Unified Interface (#64). */}
			{currentTab && isHiddenOnUnifiedInterface(currentTab.id) && (
				<MessageBar intent="warning" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Unified Interface doesn&apos;t show this tab&apos;s buttons on the command bar, and they
						don&apos;t come back when the table is reloaded. Add buttons to the table&apos;s main tab
						instead.
					</MessageBarBody>
				</MessageBar>
			)}

			{/* The table's customizations the ribbon doesn't return anywhere (#64). */}
			{location !== "Application" && orphanCount > 0 && (
				<MessageBar intent="warning" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						{orphanCount} element{orphanCount !== 1 ? "s" : ""} of your customizations for this table
						{orphanCount !== 1 ? " aren't" : " isn't"} on the canvas: the ribbon doesn&apos;t return{" "}
						{orphanCount !== 1 ? "them" : "it"}. See <strong>Orphaned customizations</strong> in the
						Properties pane to delete {orphanCount !== 1 ? "them" : "it"}.
					</MessageBarBody>
					<MessageBarActions>
						<Button size="small" onClick={clearSelection}>
							Show
						</Button>
					</MessageBarActions>
				</MessageBar>
			)}

			{/* Tab strip — sortable via drag */}
			<DndContext sensors={tabSensors} onDragEnd={handleTabDragEnd}>
				<SortableContext
					items={ribbon.tabs.map((t) => t.id)}
					strategy={horizontalListSortingStrategy}
				>
					<div className={styles.tabStrip} role="tablist" aria-label="Ribbon tabs">
						{ribbon.tabs.map((tab) => (
							<SortableTab
								key={tab.id}
								tab={tab}
								isActive={currentTab?.id === tab.id}
								isEditing={editingTabId === tab.id}
								editValue={editValue}
								inputRef={tab.id === editingTabId ? inputRef : undefined}
								onSelect={() => {
									if (editingTabId !== tab.id) setTabId(tab.id);
									if (renameRefusedTabId !== tab.id) setRenameRefusedTabId(null);
								}}
								onDoubleClick={() => {
									setTabId(tab.id);
									startTabRename(tab);
								}}
								onF2={() => startTabRename(tab)}
								renameRefused={renameRefusedTabId === tab.id}
								onDelete={
									currentTab?.id === tab.id && canDeleteTab(tab)
										? () => setDeletingTabId(tab.id)
										: undefined
								}
								onEditChange={setEditValue}
								onEditCommit={commitTabRename}
								onEditCancel={() => setEditingTabId(null)}
								styles={styles}
							/>
						))}
						<button
							type="button"
							className={styles.addTabBtn}
							title="Add tab"
							aria-label="Add tab"
							onClick={openNewTab}
						>
							<AddRegular fontSize={12} />
						</button>
						<div className={styles.spacer} />
						{/* Tab rules trigger */}
						<Button
							appearance="subtle"
							size="small"
							icon={<EyeRegular />}
							onClick={openTabDisplayRules}
						>
							Tab rules
							{currentTab && currentTab.tabDisplayRules.length > 0 && (
								<Badge size="small" appearance="tint" color="brand" style={{ marginLeft: 4 }}>
									{currentTab.tabDisplayRules.reduce((n, r) => n + r.rules.length, 0)}
								</Badge>
							)}
						</Button>
					</div>
				</SortableContext>
			</DndContext>

			{/* Canvas area */}
			<div className={styles.canvas}>
				{isLoadingRibbon ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
						}}
					>
						<Spinner
							label={
								<>
									{loadingTable ? `Loading ${loadingTable}` : "Loading the ribbon"}
									{loadingStep && (
										<>
											<br />
											<span style={{ fontSize: "12px", opacity: 0.8 }}>{loadingStep}</span>
										</>
									)}
								</>
							}
						/>
					</div>
				) : ribbonLoadError ? (
					<MessageBar intent="error">
						<MessageBarBody>Failed to load ribbon definition. {ribbonLoadError}</MessageBarBody>
						{onRetryRibbonLoad && (
							<MessageBarActions
								containerAction={
									<Button appearance="primary" size="small" onClick={onRetryRibbonLoad}>
										Retry
									</Button>
								}
							/>
						)}
					</MessageBar>
				) : !currentTab ? (
					<EmptyTab onAddGroup={openNewGroup} />
				) : (
					<>
						{ribbonViewStyle === "classic" ? (
							<ClassicRibbon tab={currentTab} location={location} />
						) : ribbonViewStyle === "modern" ? (
							<ModernCommandBar tab={currentTab} location={location} />
						) : (
							<RibbonListView tab={currentTab} location={location} />
						)}
						{/* The selected flyout / split button's menu (#27). */}
						<FlyoutMenuPanel tab={currentTab} location={location} />
					</>
				)}
			</div>
			{confirmingReload && onRetryRibbonLoad && (
				<ConfirmDialog
					open
					title="Reload the ribbon"
					confirmLabel="Reload"
					onConfirm={() => {
						setConfirmingReload(false);
						onRetryRibbonLoad();
					}}
					onCancel={() => setConfirmingReload(false)}
				>
					You have unpublished changes. Reloading replaces the canvas; your changes are kept in a draft that
					is offered after the reload. They were made while your labels weren&apos;t loaded, so check their
					texts before you publish: a text can read a label&apos;s id.
				</ConfirmDialog>
			)}
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
					Delete the tab &ldquo;{captionOf(deletingTab.label, locLabels, lang, deletingTab.source?.titleToken)}&rdquo; and its
					groups and buttons?
				</ConfirmDialog>
			)}
		</main>
	);
}

function EmptyTab({ onAddGroup }: { onAddGroup: () => void }) {
	const styles = useEmptyTabStyles();
	return (
		<div className={styles.root}>
			<DocumentRegular fontSize={32} style={{ opacity: 0.4 }} />
			<Text size={300}>This tab has no groups yet</Text>
			<Button appearance="primary" size="small" icon={<AddRegular />} onClick={onAddGroup}>
				Add first group
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// SortableTab — a draggable + droppable tab chip for the tab strip
// ---------------------------------------------------------------------------
interface SortableTabProps {
	tab: import("@/types/ribbon").RibbonTab;
	isActive: boolean;
	isEditing: boolean;
	editValue: string;
	inputRef?: React.RefObject<HTMLInputElement>;
	onSelect: () => void;
	onDoubleClick: () => void;
	onF2: () => void;
	onEditChange: (v: string) => void;
	onEditCommit: () => void;
	onEditCancel: () => void;
	/** Set when the tab can be deleted (your own or new tab, and selected); asks to confirm first. */
	onDelete?: () => void;
	/** A rename was just refused (#33): the tooltip says why. */
	renameRefused?: boolean;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	styles: Record<string, any>;
}

function SortableTab({
	tab,
	isActive,
	isEditing,
	editValue,
	inputRef,
	onSelect,
	onDoubleClick,
	onF2,
	onEditChange,
	onEditCommit,
	onEditCancel,
	onDelete,
	renameRefused,
	styles,
}: SortableTabProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: tab.id,
	});
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	// Tab titles in the organisation's base language: a rename replaces that
	// language's title (#66 review m3).
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const displayLabel = captionOf(tab.label, locLabels, lang, tab.source?.titleToken);

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		touchAction: "none",
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			className={`${styles.ribbonTab} ${isActive ? styles.ribbonTabActive : ""}`}
			role="tab"
			aria-selected={isActive}
			tabIndex={isActive ? 0 : -1}
			onClick={onSelect}
			onDoubleClick={onDoubleClick}
			title={renameRefused ? `${RENAME_NOT_PUBLISHABLE}.` : undefined}
			onKeyDown={(e) => {
				if (e.key === "F2") onF2();
			}}
		>
			{isEditing ? (
				<Input
					ref={inputRef}
					className={styles.inlineTabInput}
					value={editValue}
					onChange={(_, d) => onEditChange(d.value)}
					onBlur={onEditCommit}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							onEditCommit();
						}
						if (e.key === "Escape") {
							e.preventDefault();
							onEditCancel();
						}
						e.stopPropagation();
					}}
					onClick={(e) => e.stopPropagation()}
					size="small"
					aria-label="Rename tab"
				/>
			) : (
				<>
					<Text className={styles.ribbonTabLabel}>{displayLabel}</Text>
					<Text className={styles.ribbonTabMeta}>{tab.id}</Text>
					{onDelete && (
						<Button
							appearance="subtle"
							size="small"
							icon={<DismissRegular />}
							aria-label={`Delete tab ${displayLabel}`}
							title="Delete this tab and everything in it"
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								onDelete();
							}}
						/>
					)}
				</>
			)}
		</div>
	);
}
