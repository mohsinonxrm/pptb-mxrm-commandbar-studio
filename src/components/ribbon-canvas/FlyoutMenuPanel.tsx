import { useMemo, type ReactNode } from "react";
import { useDisplayText } from "@/hooks/useDisplayText";
import {
	makeStyles,
	tokens,
	Text,
	Badge,
	Button,
	Input,
	Select,
	Tooltip,
	Caption1,
} from "@fluentui/react-components";
import {
	AddRegular,
	DeleteRegular,
	EyeOffRegular,
	EyeRegular,
	ChevronDownRegular,
} from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { groupControls, isDynamicMenuValue, isMenuKind, menuItemsOf, rootControlOf } from "@/utils/ribbonMenu";
import { canDeleteControl } from "@/utils/ribbonProvenance";
import { newButtonIds } from "@/utils/idGenerator";
import { useModernAppNames, useModernLocation } from "@/hooks/useModernCommands";
import { overrideNote } from "@/services/modernCommands";
import { ClassicModernOverrideBadge } from "./modern/ClassicModernOverrideBadge";
import type { RibbonButton, RibbonLocation, RibbonMenuSection, RibbonTab } from "@/types/ribbon";

const useStyles = makeStyles({
	root: {
		marginTop: tokens.spacingVerticalM,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground1,
		maxWidth: "520px",
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	spacer: { flex: 1 },
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: tokens.spacingHorizontalS,
	},
	section: {
		display: "flex",
		flexDirection: "column",
		gap: "2px",
	},
	sectionHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		padding: `2px ${tokens.spacingHorizontalXS}`,
		color: tokens.colorNeutralForeground3,
	},
	item: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		width: "100%",
		minHeight: "28px",
		padding: `0 ${tokens.spacingHorizontalS}`,
		border: "1px solid transparent",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: "transparent",
		color: tokens.colorNeutralForeground1,
		cursor: "pointer",
		textAlign: "left",
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
		":focus-visible": { outline: `2px solid ${tokens.colorBrandStroke1}` },
	},
	itemSelected: {
		backgroundColor: tokens.colorBrandBackground2,
		border: `1px solid ${tokens.colorBrandStroke1}`,
	},
	itemHidden: { opacity: 0.45, textDecoration: "line-through" },
	itemRow: { display: "flex", alignItems: "center", gap: "2px" },
	nested: {
		marginLeft: tokens.spacingHorizontalL,
		paddingLeft: tokens.spacingHorizontalS,
		borderLeft: `1px dashed ${tokens.colorNeutralStroke2}`,
	},
	empty: { padding: `2px ${tokens.spacingHorizontalS}`, color: tokens.colorNeutralForeground3 },
});

interface FlyoutMenuPanelProps {
	tab: RibbonTab;
	location: RibbonLocation;
}

/**
 * The menu of the selected flyout / split button (#27), shown under the
 * canvas: its sections and items, which can be selected (the properties pane
 * then edits the item), added, hidden and deleted. Sections can be added or
 * changed only on a menu created in this session — an existing menu's
 * sections are published as they are.
 */
export function FlyoutMenuPanel({ tab, location }: FlyoutMenuPanelProps) {
	const styles = useStyles();
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const baseline = useRibbonStore((s) => s.baseline);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	const addMenuSection = useRibbonStore((s) => s.addMenuSection);
	const setMenuSectionProp = useRibbonStore((s) => s.setMenuSectionProp);
	const deleteMenuSection = useRibbonStore((s) => s.deleteMenuSection);
	// Menu items a migrated modern command hides or stands in for (#32).
	const { overrides: modernOverrides } = useModernLocation(location);
	const modernAppNames = useModernAppNames();

	const group = tab.groups.find((g) => g.id === selectedGroupId);
	const root = rootControlOf(group, selectedButtonId);
	// Controls that exist in the loaded ribbon: their menus' sections are fixed.
	const loadedIds = useMemo(() => {
		const ids = new Set<string>();
		for (const t of baseline[location]?.tabs ?? [])
			for (const g of t.groups) for (const b of groupControls(g)) ids.add(b.id);
		return ids;
	}, [baseline, location]);

	if (!group || !root || (!root.menu && !isMenuKind(root.kind))) return null;
	const groupId = group.id;
	const label = (b: RibbonButton) => captionOf(b.label, locLabels, undefined, b.source?.labelToken);
	const dynamicQuery = (b: RibbonButton) =>
		isDynamicMenuValue(b.source?.attributes["PopulateDynamically"])
			? (b.source?.attributes["PopulateQueryCommand"] ?? "a command")
			: null;

	const renderMenu = (parent: RibbonButton) => {
		const sections = [...(parent.menu?.sections ?? [])].sort((a, b) => a.sequence - b.sequence);
		const isNew = !loadedIds.has(parent.id);
		const dynamic = dynamicQuery(parent);
		return (
			<>
				{dynamic && (
					<Caption1 className={styles.empty}>
						Populated when the menu opens, by {dynamic}. Static items below are kept as
						they are.
					</Caption1>
				)}
				{sections.map((section) => (
					<MenuSectionView
						key={section.id}
						section={section}
						parent={parent}
						editable={isNew}
						onTitle={(title) =>
							setMenuSectionProp(location, tab.id, groupId, parent.id, section.id, {
								title,
							})
						}
						onDisplayMode={(displayMode) =>
							setMenuSectionProp(location, tab.id, groupId, parent.id, section.id, {
								displayMode,
							})
						}
						onDelete={() =>
							deleteMenuSection(location, tab.id, groupId, parent.id, section.id)
						}
						renderItem={renderItem}
					/>
				))}
				{sections.length === 0 && !dynamic && (
					<Caption1 className={styles.empty}>No menu sections yet.</Caption1>
				)}
				{isNew && (
					<div>
						<Button
							size="small"
							appearance="subtle"
							icon={<AddRegular />}
							onClick={() => addMenuSection(location, tab.id, groupId, parent.id, "")}
						>
							Add section
						</Button>
					</div>
				)}
			</>
		);
	};

	const renderItem = (item: RibbonButton) => {
		const selected = item.id === selectedButtonId;
		const modern = modernOverrides.get(item.id);
		return (
			<div key={item.id}>
				<div className={styles.itemRow}>
					<button
						type="button"
						className={[
							styles.item,
							selected ? styles.itemSelected : "",
							item.hidden ? styles.itemHidden : "",
						]
							.filter(Boolean)
							.join(" ")}
						aria-pressed={selected}
						aria-label={`Menu item ${label(item)}${item.hidden ? " — hidden" : ""}${overrideNote(modern, modernAppNames)}`}
						onClick={() => selectButtonInContext(location, tab.id, groupId, item.id)}
					>
						<RibbonButtonIcon button={item} size={16} />
						<Text size={200}>{label(item)}</Text>
						{item.menu && <ChevronDownRegular fontSize={12} aria-hidden />}
						<ClassicModernOverrideBadge overrides={modern} appNames={modernAppNames} />
						{item.custom && !loadedIds.has(item.id) && (
							<Badge size="extra-small" color="brand" appearance="tint">
								NEW
							</Badge>
						)}
					</button>
					{selected && (
						<ItemActions
							item={item}
							location={location}
							tabId={tab.id}
							groupId={groupId}
							// Keep the menu open on its flyout once the item is gone.
							onDeleted={() =>
								selectButtonInContext(location, tab.id, groupId, root.id)
							}
						/>
					)}
				</div>
				{item.menu && <div className={styles.nested}>{renderMenu(item)}</div>}
			</div>
		);
	};

	return (
		<section className={styles.root} aria-label={`Menu of ${label(root)}`}>
			<div className={styles.header}>
				<ChevronDownRegular aria-hidden />
				<Text weight="semibold" size={300}>
					{label(root)}
				</Text>
				<Badge size="small" appearance="outline">
					{root.kind === "splitButton" ? "Split button menu" : "Flyout menu"}
				</Badge>
				<span className={styles.spacer} />
				<Caption1>{menuItemsOf(root).length} item(s)</Caption1>
			</div>
			<div className={styles.body}>{renderMenu(root)}</div>
		</section>
	);
}

interface MenuSectionViewProps {
	section: RibbonMenuSection;
	parent: RibbonButton;
	editable: boolean;
	onTitle(title: string): void;
	onDisplayMode(mode: string): void;
	onDelete(): void;
	renderItem(item: RibbonButton): ReactNode;
}

function MenuSectionView({
	section,
	parent,
	editable,
	onTitle,
	onDisplayMode,
	onDelete,
	renderItem,
}: MenuSectionViewProps) {
	const styles = useStyles();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	const items = [...section.controls].sort((a, b) => a.sequence - b.sequence);
	return (
		<div className={styles.section}>
			<div className={styles.sectionHeader}>
				{editable ? (
					<>
						<Input
							size="small"
							placeholder="Section title (optional)"
							value={section.title ?? ""}
							aria-label="Menu section title"
							onChange={(_, d) => onTitle(d.value)}
						/>
						<Select
							size="small"
							aria-label="Menu section display mode"
							value={section.displayMode ?? "Menu16"}
							onChange={(_, d) => onDisplayMode(d.value)}
						>
							<option value="Menu16">16 px icons</option>
							<option value="Menu32">32 px icons</option>
							<option value="Menu">Text only</option>
						</Select>
						<Tooltip content="Delete section and its items" relationship="label">
							<Button
								size="small"
								appearance="subtle"
								icon={<DeleteRegular />}
								onClick={onDelete}
							/>
						</Tooltip>
					</>
				) : (
					// A loaded section's Title can be a `$LocLabels:` / `$Resources:` token (#75).
					<Caption1>{captionOf(section.title, locLabels, undefined, section.attributes?.["Title"]) || section.id}</Caption1>
				)}
			</div>
			{items.map((item) => renderItem(item))}
			{section.rawContent !== undefined && (
				<Caption1 className={styles.empty}>Gallery / dynamic content (kept as is)</Caption1>
			)}
			{(section.rawControls?.length ?? 0) > 0 && (
				<Caption1 className={styles.empty}>
					{section.rawControls!.length} other control(s) CBS doesn't edit (kept as they
					are)
				</Caption1>
			)}
			{section.rawContent === undefined && (
				<AddItemButton parent={parent} section={section} />
			)}
		</div>
	);
}

function AddItemButton({ parent, section }: { parent: RibbonButton; section: RibbonMenuSection }) {
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const groupId = useSelectionStore((s) => s.selectedGroupId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const addMenuItem = useRibbonStore((s) => s.addMenuItem);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const sessionPrefix = useSessionStore((s) => s.publisherPrefix);
	const activeEntity = useSessionStore((s) => s.activeEntity);

	const add = () => {
		if (!groupId) return;
		const { ribbons, commands } = useRibbonStore.getState();
		const existing = new Set<string>(commands.map((c) => c.id));
		for (const r of Object.values(ribbons))
			for (const t of r.tabs)
				for (const g of t.groups) for (const b of groupControls(g)) existing.add(b.id);
		const prefix = activeSolution?.publisherPrefix?.trim() || sessionPrefix?.trim() || "new";
		const { id, commandId } = newButtonIds(
			prefix,
			activeEntity?.logicalName ?? "global",
			location,
			"MenuItem",
			existing,
		);
		addMenuItem({
			location,
			tabId,
			groupId,
			parentId: parent.id,
			sectionId: section.id,
			item: { id, label: "Menu item", commandId },
		});
		// Like a new button: its own (empty) command, filled in the Command Editor.
		upsertCommand({ id: commandId, enableRules: [], displayRules: [], actions: [] });
		selectButtonInContext(location, tabId, groupId, id);
	};

	return (
		<div>
			<Button size="small" appearance="subtle" icon={<AddRegular />} onClick={add}>
				Add item
			</Button>
		</div>
	);
}

function ItemActions({
	item,
	location,
	tabId,
	groupId,
	onDeleted,
}: {
	item: RibbonButton;
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	onDeleted(): void;
}) {
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const deleteButton = useRibbonStore((s) => s.deleteButton);
	const baseline = useRibbonStore((s) => s.baseline[location]);
	return (
		<>
			<Tooltip content={item.hidden ? "Show item" : "Hide item"} relationship="label">
				<Button
					size="small"
					appearance="subtle"
					icon={item.hidden ? <EyeRegular /> : <EyeOffRegular />}
					onClick={() =>
						setButtonProp(location, tabId, groupId, item.id, { hidden: !item.hidden })
					}
				/>
			</Tooltip>
			{canDeleteControl(item, baseline) && (
				<Tooltip content="Delete item" relationship="label">
					<Button
						size="small"
						appearance="subtle"
						icon={<DeleteRegular />}
						onClick={() => {
							deleteButton(location, tabId, groupId, item.id);
							onDeleted();
						}}
					/>
				</Tooltip>
			)}
		</>
	);
}
