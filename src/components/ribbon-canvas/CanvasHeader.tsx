import React from "react";
import {
	Button,
	InfoLabel,
	Menu,
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
	ChevronDownRegular,
	DocumentRegular,
	GlobeRegular,
	TableRegular,
	TableResizeColumnRegular,
} from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore, type RibbonViewStyle } from "@/store/uiStore";
import { defaultTabId } from "@/utils/defaultTab";
import { LOCATION_INFO } from "@/constants/locationInfo";
import { LocationInfo } from "@/components/shared/LocationInfo";
import { UCI_TAB_NOTE } from "@/services/publishPlan";
import { ModernAppFilter } from "./modern/ModernAppFilter";
import type { RibbonLocation } from "@/types/ribbon";

/**
 * The row above the canvas (#180): where the command bar appears (Fluent
 * TabList with an overflow menu, About this location, App and View). The
 * location's ribbon tabs are in the Structure tree since #194; how Unified
 * Interface shows a custom tab is said here, behind an info button (#181).
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
	/** The open table, which the location tabs belong to (#179 review). */
	tableName: {
		flex: "0 1 auto",
		maxWidth: "200px",
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		paddingRight: tokens.spacingHorizontalS,
		borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
		fontWeight: tokens.fontWeightSemibold,
	},
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
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const customTab =
		!/^(Mscrm|Microsoft)\./.test(tabId) && ribbons[location].tabs.some((t) => t.id === tabId);
	const table = useSessionStore((s) => s.activeEntity?.logicalName);
	const tableName = useSessionStore((s) => s.activeEntity?.displayName);
	const view = useUIStore((s) => s.ribbonViewStyle);
	const setView = useUIStore((s) => s.setRibbonViewStyle);

	const select = (loc: RibbonLocation) => {
		setLocation(loc);
		const first = defaultTabId(ribbons[loc].tabs);
		if (first) setTabId(first);
	};

	return (
		<div className={`${styles.row} ${styles.locationRow}`}>
			{table && (
				<Tooltip
					content={`Table: ${tableName || table} (${table})`}
					relationship="description"
				>
					<span className={styles.tableName} tabIndex={0}>
						{tableName || table}
					</span>
				</Tooltip>
			)}
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
					{/* A custom tab: how Unified Interface shows it (#58). */}
					{customTab && (
						<InfoLabel
							size="small"
							info={UCI_TAB_NOTE}
							infoButton={{ "aria-label": "How Unified Interface shows this tab" }}
						/>
					)}
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
