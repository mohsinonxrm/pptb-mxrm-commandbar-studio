import React, { useMemo, useState } from "react";
import {
	Button,
	DataGrid,
	DataGridBody,
	DataGridCell,
	DataGridHeader,
	DataGridHeaderCell,
	DataGridRow,
	Menu,
	MenuItemCheckbox,
	MenuList,
	MenuPopover,
	MenuTrigger,
	SearchBox,
	Switch,
	TableCellLayout,
	Text,
	Tooltip,
	createTableColumn,
	makeStyles,
	mergeClasses,
	tokens,
	useFocusableGroup,
	type TableColumnDefinition,
	type TableColumnSizingOptions,
} from "@fluentui/react-components";
import { ColumnTripleEditRegular, MoreHorizontalRegular } from "@fluentui/react-icons";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useSelectionStore } from "@/store/selectionStore";
import { bySequence, useRibbonStore } from "@/store/ribbonStore";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { ButtonContextMenu, type ButtonMenuTarget } from "@/components/shared/ButtonContextMenu";
import { CONTROL_KIND_LABELS } from "@/utils/controlKinds";
import { isGlobalOobReadOnly } from "@/utils/ribbonProvenance";
import { useModernAppNames, useModernCanvas } from "@/hooks/useModernCommands";
import type { RibbonButton, RibbonLocation, RibbonTab } from "@/types/ribbon";
import { ClassicModernOverrideBadge } from "./modern/ClassicModernOverrideBadge";
import { ModernCommandsTable } from "./modern/ModernCommandsTable";

/**
 * Edit mode's List (#183): the tab's buttons as a sortable grid. It's as tall
 * as its rows, so the canvas is the only thing that scrolls, with the header
 * kept in view. The default columns fit a 650 px canvas; ID and Command are
 * in the Columns menu (a row's id is in its label's tooltip). A row is
 * selected by a click or Enter, like everywhere else, and its menu is the
 * shared button menu (⋯, right-click, Shift+F10). Modern commands are a
 * section of their own below.
 */

const useStyles = makeStyles({
	root: { width: "100%", minWidth: 0 },
	toolbar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} 0`,
	},
	search: { flex: 1, minWidth: 0, maxWidth: "480px" },
	muted: { color: tokens.colorNeutralForeground3 },
	grid: { width: "100%", minWidth: 0 },
	// The canvas scrolls; the header stays in view.
	header: {
		position: "sticky",
		top: 0,
		zIndex: 1,
		backgroundColor: tokens.colorNeutralBackground1,
	},
	row: { cursor: "pointer" },
	rowSelected: {
		backgroundColor: tokens.colorSubtleBackgroundSelected,
		":hover": { backgroundColor: tokens.colorSubtleBackgroundSelected },
	},
	hidden: { color: tokens.colorNeutralForeground3 },
	mono: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3 },
	badge: { marginLeft: tokens.spacingHorizontalXS, flexShrink: 0 },
	labelMain: { display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" },
	ellipsis: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
});

interface ButtonRow {
	button: RibbonButton;
	/** The button's label as displayed (resolved). */
	label: string;
	groupId: string;
	/** The group's title as displayed (resolved). */
	groupLabel: string;
	/** Where it is on the tab: groups, then buttons, in Sequence order. */
	order: number;
}

type OptionalColumn = "id" | "command";
const OPTIONAL_LABEL: Record<OptionalColumn, string> = { id: "ID", command: "Command" };

const isControlEvent = (e: React.SyntheticEvent) =>
	!!(e.target as HTMLElement).closest('button, input, [role="switch"], [role="menuitem"]');

export function RibbonListView({ tab, location }: { tab: RibbonTab; location: RibbonLocation }) {
	const styles = useStyles();
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const captionOf = useDisplayText();
	const { overrides: modernOverrides } = useModernCanvas(location, tab);
	const modernAppNames = useModernAppNames();

	const [filter, setFilter] = useState("");
	const [optional, setOptional] = useState<OptionalColumn[]>([]);
	const [menu, setMenu] = useState<ButtonMenuTarget | null>(null);
	// Kept here: showing a column remounts the grid (review).
	const [sortState, setSortState] = useState<
		| { sortColumn: string | number | undefined; sortDirection: "ascending" | "descending" }
		| undefined
	>(undefined);
	// Enter selects a row: the grid's focus manager would otherwise take it to
	// move into the row's first cell (review).
	const passEnter = useFocusableGroup({
		tabBehavior: "unlimited",
		ignoreDefaultKeydown: { Enter: true },
	});

	// Labels resolved as the canvas shows them (#75), in the order the tab shows them.
	const allRows: ButtonRow[] = useMemo(() => {
		let order = 0;
		return bySequence(tab.groups).flatMap((g) =>
			bySequence(g.buttons).map((b) => ({
				button: b,
				label: captionOf(b.label, locLabels, undefined, b.source?.labelToken) || b.id,
				groupId: g.id,
				groupLabel: captionOf(g.label, locLabels, lang, g.source?.titleToken) || g.id,
				order: order++,
			})),
		);
	}, [tab, captionOf, locLabels, lang]);

	const q = filter.toLowerCase().trim();
	const rows = q
		? allRows.filter(
				({ button, label, groupLabel }) =>
					button.id.toLowerCase().includes(q) ||
					label.toLowerCase().includes(q) ||
					// The label as loaded too: a `$LocLabels:` token or untranslated text.
					button.label.toLowerCase().includes(q) ||
					(button.commandId ?? "").toLowerCase().includes(q) ||
					groupLabel.toLowerCase().includes(q),
			)
		: allRows;

	const select = (row: ButtonRow) =>
		selectButtonInContext(location, tab.id, row.groupId, row.button.id);
	// Opening the menu doesn't select the row: in a narrow window that opens
	// Properties, which takes the focus and closes the menu. The menu acts on its
	// own button, and Edit properties selects it.
	const openMenu = (row: ButtonRow, anchor: HTMLElement) =>
		setMenu({ button: row.button, groupId: row.groupId, anchor });

	const sizing: TableColumnSizingOptions = {
		seq: { defaultWidth: 52, minWidth: 44, idealWidth: 52 },
		label: { defaultWidth: 220, minWidth: 140, idealWidth: 220 },
		kind: { defaultWidth: 110, minWidth: 80, idealWidth: 110 },
		group: { defaultWidth: 150, minWidth: 90, idealWidth: 150 },
		visible: { defaultWidth: 72, minWidth: 64, idealWidth: 72 },
		id: { defaultWidth: 240, minWidth: 140, idealWidth: 240 },
		command: { defaultWidth: 220, minWidth: 140, idealWidth: 220 },
		actions: { defaultWidth: 44, minWidth: 44, idealWidth: 44 },
	};

	const header = (text: string) => (
		<Text size={200} weight="semibold">
			{text}
		</Text>
	);
	const truncated = (text: string, className?: string) => (
		// The whole text as a title: it's cut off when the column is narrow.
		<TableCellLayout truncate className={className} title={text}>
			{text}
		</TableCellLayout>
	);

	const columns: TableColumnDefinition<ButtonRow>[] = [
		createTableColumn<ButtonRow>({
			columnId: "seq",
			compare: (a, b) => a.button.sequence - b.button.sequence || a.order - b.order,
			renderHeaderCell: () => header("#"),
			renderCell: ({ button }) => <Text size={200}>{button.sequence}</Text>,
		}),
		createTableColumn<ButtonRow>({
			columnId: "label",
			compare: (a, b) => a.label.localeCompare(b.label) || a.order - b.order,
			renderHeaderCell: () => header("Label"),
			renderCell: ({ button, label }) => (
				<Tooltip content={`${label} (${button.id})`} relationship="description">
					<TableCellLayout
						media={<RibbonButtonIcon button={button} size={16} />}
						className={button.hidden ? styles.hidden : undefined}
						main={{ className: styles.labelMain }}
					>
						{/* The label truncates; the modern badge after it never does (review). */}
						<span className={styles.ellipsis}>{label}</span>
						<span className={styles.badge}>
							<ClassicModernOverrideBadge
								overrides={modernOverrides.get(button.id)}
								appNames={modernAppNames}
							/>
						</span>
					</TableCellLayout>
				</Tooltip>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "kind",
			compare: (a, b) =>
				CONTROL_KIND_LABELS[a.button.kind].localeCompare(
					CONTROL_KIND_LABELS[b.button.kind],
				) || a.order - b.order,
			renderHeaderCell: () => header("Kind"),
			renderCell: ({ button }) => truncated(CONTROL_KIND_LABELS[button.kind] ?? button.kind),
		}),
		createTableColumn<ButtonRow>({
			columnId: "group",
			compare: (a, b) => a.groupLabel.localeCompare(b.groupLabel) || a.order - b.order,
			renderHeaderCell: () => header("Group"),
			renderCell: ({ groupLabel }) => truncated(groupLabel),
		}),
		...(optional.includes("id")
			? [
					createTableColumn<ButtonRow>({
						columnId: "id",
						compare: (a, b) => a.button.id.localeCompare(b.button.id),
						renderHeaderCell: () => header("ID"),
						renderCell: ({ button }) => truncated(button.id, styles.mono),
					}),
				]
			: []),
		...(optional.includes("command")
			? [
					createTableColumn<ButtonRow>({
						columnId: "command",
						compare: (a, b) =>
							(a.button.commandId ?? "").localeCompare(b.button.commandId ?? "") ||
							a.order - b.order,
						renderHeaderCell: () => header("Command"),
						renderCell: ({ button }) => truncated(button.commandId || "—", styles.mono),
					}),
				]
			: []),
		createTableColumn<ButtonRow>({
			columnId: "visible",
			compare: (a, b) =>
				Number(a.button.hidden) - Number(b.button.hidden) || a.order - b.order,
			renderHeaderCell: () => header("Visible"),
			renderCell: ({ button, label, groupId }) => {
				const locked = isGlobalOobReadOnly(location, tab.id, button);
				return (
					<Tooltip
						content={
							locked
								? "Microsoft's global command bar buttons can't be changed."
								: button.hidden
									? "Hidden"
									: "Shown"
						}
						relationship="description"
					>
						<Switch
							checked={!button.hidden}
							disabled={locked}
							aria-label={`Toggle visibility of ${label}`}
							onChange={(_, d) =>
								setButtonProp(location, tab.id, groupId, button.id, {
									hidden: !d.checked,
								})
							}
						/>
					</Tooltip>
				);
			},
		}),
		createTableColumn<ButtonRow>({
			columnId: "actions",
			renderHeaderCell: () => <span className={styles.muted} />,
			renderCell: (row) => (
				<Button
					appearance="subtle"
					size="small"
					icon={<MoreHorizontalRegular />}
					aria-label={`Actions for ${row.label}`}
					onClick={(e) => openMenu(row, e.currentTarget)}
				/>
			),
		}),
	];

	return (
		<div className={styles.root}>
			<div className={styles.toolbar}>
				<SearchBox
					size="small"
					className={styles.search}
					placeholder={`Filter ${allRows.length} button${allRows.length !== 1 ? "s" : ""}`}
					aria-label="Filter the buttons"
					value={filter}
					onChange={(_, d) => setFilter(d.value)}
				/>
				{q && (
					<Text size={100} className={styles.muted}>
						{rows.length} match{rows.length !== 1 ? "es" : ""}
					</Text>
				)}
				<Menu
					checkedValues={{ columns: optional }}
					onCheckedValueChange={(_, d) => setOptional(d.checkedItems as OptionalColumn[])}
				>
					<MenuTrigger disableButtonEnhancement>
						<Button appearance="subtle" size="small" icon={<ColumnTripleEditRegular />}>
							Columns
						</Button>
					</MenuTrigger>
					<MenuPopover>
						<MenuList>
							{(Object.keys(OPTIONAL_LABEL) as OptionalColumn[]).map((c) => (
								<MenuItemCheckbox key={c} name="columns" value={c}>
									{OPTIONAL_LABEL[c]}
								</MenuItemCheckbox>
							))}
						</MenuList>
					</MenuPopover>
				</Menu>
			</div>
			<div {...passEnter}>
				<DataGrid
					// New columns get their sizes: the grid sizes its columns once.
					key={optional.join("|")}
					className={styles.grid}
					items={rows}
					columns={columns}
					columnSizingOptions={sizing}
					resizableColumns
					sortable
					sortState={sortState}
					onSortChange={(_, s) => setSortState(s)}
					getRowId={(row) => row.button.id}
					focusMode="composite"
					size="small"
					aria-label={`Buttons of ${tab.id}`}
				>
					<DataGridHeader className={styles.header}>
						<DataGridRow>
							{({ renderHeaderCell }) => (
								<DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
							)}
						</DataGridRow>
					</DataGridHeader>
					<DataGridBody<ButtonRow>>
						{({ item, rowId }) => {
							const selected = selectedButtonId === item.button.id;
							return (
								<DataGridRow<ButtonRow>
									key={rowId}
									aria-selected={selected}
									data-list-button={item.button.id}
									className={mergeClasses(
										styles.row,
										selected && styles.rowSelected,
									)}
									onClick={(e: React.MouseEvent<HTMLDivElement>) => {
										if (!isControlEvent(e)) select(item);
									}}
									onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
										if (isControlEvent(e)) return;
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											select(item);
										} else if (
											e.key === "ContextMenu" ||
											(e.shiftKey && e.key === "F10")
										) {
											e.preventDefault();
											openMenu(item, e.currentTarget);
										}
									}}
									onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => {
										e.preventDefault();
										openMenu(item, e.currentTarget);
									}}
								>
									{({ renderCell }) => (
										<DataGridCell>{renderCell(item)}</DataGridCell>
									)}
								</DataGridRow>
							);
						}}
					</DataGridBody>
				</DataGrid>
			</div>
			{rows.length === 0 && (
				<Text size={200} className={styles.muted} as="p">
					{q ? "No buttons match." : "This tab has no buttons."}
				</Text>
			)}
			<ButtonContextMenu
				location={location}
				tab={tab}
				target={menu}
				onClose={() => {
					// Back to the row, unless a dialog took the focus. A timeout, not an
					// animation frame: frames don't run while the window is hidden.
					const anchor = menu?.anchor;
					setTimeout(() => {
						if (
							document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
						)
							return;
						if (anchor?.isConnected) anchor.focus();
					});
					setMenu(null);
				}}
			/>
			<ModernCommandsTable tab={tab} location={location} />
		</div>
	);
}
