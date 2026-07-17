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
import {
	TableRegular,
	TableResizeColumnRegular,
	DocumentRegular,
	GlobeRegular,
	AddRegular,
	EyeRegular,
	CodeRegular,
} from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { useUIStore } from "@/store/uiStore";
import type { RibbonLocation } from "@/types/ribbon";
import { ClassicRibbon } from "./ClassicRibbon";
import { ModernCommandBar } from "./ModernCommandBar";
import { RibbonListView } from "./RibbonListView";
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
	ribbonLoadError?: string | null;
	onRetryRibbonLoad?: () => void;
}

export function RibbonCanvas({
	isLoadingRibbon = false,
	ribbonLoadError = null,
	onRetryRibbonLoad,
}: RibbonCanvasProps) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const setLocation = useSelectionStore((s) => s.setLocation);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const renameTab = useRibbonStore((s) => s.renameTab);
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

	useEffect(() => {
		if (editingTabId && inputRef.current) inputRef.current.focus();
	}, [editingTabId]);

	function commitTabRename() {
		if (editingTabId && editValue.trim()) {
			renameTab(location, editingTabId, editValue.trim());
		}
		setEditingTabId(null);
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
	const currentTab = ribbon.tabs.find((t) => t.id === tabId) ?? ribbon.tabs[0];

	useEffect(() => {
		if (!ribbon.tabs.length) return;
		const exists = ribbon.tabs.some((t) => t.id === tabId);
		if (!exists) {
			setTabId(ribbon.tabs[0].id);
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
							const firstTabId = ribbons[loc.value].tabs[0]?.id;
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
								}}
								onDoubleClick={() => {
									setTabId(tab.id);
									setEditingTabId(tab.id);
									setEditValue(tab.label);
								}}
								onF2={() => {
									setEditingTabId(tab.id);
									setEditValue(tab.label);
								}}
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
									{currentTab.tabDisplayRules.length}
								</Badge>
							)}
						</Button>
						{currentTab?.template && (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									paddingRight: tokens.spacingHorizontalS,
									fontSize: tokens.fontSizeBase100,
									color: tokens.colorNeutralForeground3,
								}}
							>
								<span>Template:</span>
								<Badge size="small" appearance="outline">
									{currentTab.template.split(".").pop() ?? "—"}
								</Badge>
							</div>
						)}
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
						<Spinner label="Loading ribbon definition..." />
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
				) : ribbonViewStyle === "classic" ? (
					<ClassicRibbon tab={currentTab} location={location} />
				) : ribbonViewStyle === "modern" ? (
					<ModernCommandBar tab={currentTab} location={location} />
				) : (
					<RibbonListView tab={currentTab} location={location} />
				)}
			</div>
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
	styles,
}: SortableTabProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: tab.id,
	});
	const locLabels = useRibbonStore((s) => s.locLabels);
	const displayLabel = resolveDisplayLabel(tab.label, locLabels);

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
				</>
			)}
		</div>
	);
}
