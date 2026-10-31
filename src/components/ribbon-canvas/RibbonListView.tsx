import {
	makeStyles,
	tokens,
	Text,
	Badge,
	Switch,
	Input,
	DataGridHeaderCell,
	DataGridCell,
	createTableColumn,
	type TableColumnDefinition,
	type TableColumnSizingOptions,
} from "@fluentui/react-components";
import { useDisplayText } from "@/hooks/useDisplayText";
import {
	DataGrid,
	DataGridHeader,
	DataGridBody,
	DataGridRow,
} from "@fluentui-contrib/react-data-grid-react-window";
import { EyeOffRegular, SearchRegular } from "@fluentui/react-icons";
import { useState, useMemo } from "react";
import { useSelectionStore } from "@/store/selectionStore";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonButton, RibbonTab, RibbonLocation } from "@/types/ribbon";
import { useModernAppNames, useModernCanvas } from "@/hooks/useModernCommands";
import { ClassicModernOverrideBadge } from "./modern/ClassicModernOverrideBadge";
import { ModernCommandsTable } from "./modern/ModernCommandsTable";

const useStyles = makeStyles({
	root: {
		width: "100%",
	},
	row: {
		cursor: "pointer",
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	rowSelected: {
		backgroundColor: tokens.colorBrandBackground2,
	},
	iconCell: {
		width: "20px",
		height: "20px",
		borderRadius: "3px",
		backgroundColor: tokens.colorNeutralBackground4,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
	},
	// Constrains long labels/IDs/commands so they don't bleed into adjacent
	// columns when the DataGrid hands us narrow cells.
	clip: {
		display: "block",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		maxWidth: "100%",
	},
});

const ROW_HEIGHT = 42;
const MAX_VISIBLE_ROWS = 10;

interface RibbonListViewProps {
	tab: RibbonTab;
	location: RibbonLocation;
}

interface ButtonRow {
	button: RibbonButton;
	/** The button's label as displayed (resolved). */
	label: string;
	groupId: string;
	/** The group's title as displayed (resolved). */
	groupLabel: string;
}

export function RibbonListView({ tab, location }: RibbonListViewProps) {
	const styles = useStyles();
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	const lang = useRibbonStore((s) => s.baseLanguageCode);

	const isGlobalOobReadOnly = (button: RibbonButton) =>
		location === "Application" && tab.id === "Mscrm.GlobalTab" && button.oob && !button.custom;

	const [filter, setFilter] = useState("");
	// Classic buttons hidden / replaced by a migrated modern command (#32).
	const { overrides: modernOverrides } = useModernCanvas(location, tab);
	const modernAppNames = useModernAppNames();

	// Labels resolved as the canvas shows them, for cells, tooltips and accessible names (#75).
	const allRows: ButtonRow[] = tab.groups.flatMap((g) =>
		g.buttons.map((b) => ({
			button: b,
			label: captionOf(b.label, locLabels, undefined, b.source?.labelToken),
			groupId: g.id,
			groupLabel: captionOf(g.label, locLabels, lang, g.source?.titleToken),
		})),
	);

	const rows: ButtonRow[] = useMemo(() => {
		const q = filter.toLowerCase().trim();
		if (!q) return allRows;
		return allRows.filter(
			({ button, label, groupLabel }) =>
				button.id.toLowerCase().includes(q) ||
				button.label.toLowerCase().includes(q) ||
				label.toLowerCase().includes(q) ||
				(button.commandId ?? "").toLowerCase().includes(q) ||
				groupLabel.toLowerCase().includes(q),
		);
	}, [allRows, filter]);

	// Explicit column widths — without these the DataGrid hands flexible
	// widths that cause adjacent cells to overlap when content is long.
	const columnSizingOptions: TableColumnSizingOptions = {
		seq: { defaultWidth: 56, minWidth: 48, idealWidth: 56 },
		icon: { defaultWidth: 48, minWidth: 40, idealWidth: 48 },
		label: { defaultWidth: 260, minWidth: 140, idealWidth: 260 },
		id: { defaultWidth: 280, minWidth: 160, idealWidth: 280 },
		kind: { defaultWidth: 90, minWidth: 72, idealWidth: 90 },
		group: { defaultWidth: 160, minWidth: 100, idealWidth: 160 },
		command: { defaultWidth: 280, minWidth: 160, idealWidth: 280 },
		visible: { defaultWidth: 80, minWidth: 64, idealWidth: 80 },
	};

	const columns: TableColumnDefinition<ButtonRow>[] = [
		createTableColumn<ButtonRow>({
			columnId: "seq",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					#
				</Text>
			),
			renderCell: ({ button }) => <Text size={200}>{button.sequence}</Text>,
		}),
		createTableColumn<ButtonRow>({
			columnId: "icon",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					Icon
				</Text>
			),
			renderCell: ({ button }) => (
				<div className={styles.iconCell}>
					<RibbonButtonIcon button={button} size={16} />
				</div>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "label",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					Label
				</Text>
			),
			renderCell: ({ button, label }) => (
				<span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
					<Text size={200} className={styles.clip} title={label}>
						{label}
					</Text>
					<ClassicModernOverrideBadge
						overrides={modernOverrides.get(button.id)}
						appNames={modernAppNames}
					/>
				</span>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "id",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					ID
				</Text>
			),
			renderCell: ({ button }) => (
				<Text
					size={200}
					font="monospace"
					className={styles.clip}
					title={button.id}
					style={{ color: tokens.colorNeutralForeground3 }}
				>
					{button.id}
				</Text>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "kind",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					Kind
				</Text>
			),
			renderCell: ({ button }) => (
				<Badge size="small" appearance="outline">
					{button.kind}
				</Badge>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "group",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					Group
				</Text>
			),
			renderCell: ({ groupLabel }) => (
				<Text size={200} className={styles.clip} title={groupLabel}>
					{groupLabel}
				</Text>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "command",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					Command
				</Text>
			),
			renderCell: ({ button }) => (
				<Text
					size={200}
					font="monospace"
					className={styles.clip}
					title={button.commandId || ""}
					style={{ color: tokens.colorNeutralForeground3 }}
				>
					{button.commandId || "—"}
				</Text>
			),
		}),
		createTableColumn<ButtonRow>({
			columnId: "visible",
			renderHeaderCell: () => (
				<Text size={200} weight="semibold">
					Visible
				</Text>
			),
			renderCell: ({ button, label, groupId }) => (
				<Switch
					checked={!button.hidden}
					label={button.hidden ? <EyeOffRegular fontSize={14} /> : undefined}
					disabled={isGlobalOobReadOnly(button)}
					title={
						isGlobalOobReadOnly(button)
							? "OOB global command bar buttons cannot be customized."
							: undefined
					}
					aria-label={`Toggle visibility of ${label}`}
					onChange={(_, d) =>
						setButtonProp(location, tab.id, groupId, button.id, { hidden: !d.checked })
					}
				/>
			),
		}),
	];

	return (
		<div className={styles.root}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: tokens.spacingHorizontalS,
					padding: `${tokens.spacingVerticalXS} 0`,
				}}
			>
				<Input
					size="small"
					contentBefore={<SearchRegular />}
					placeholder={`Filter ${allRows.length} button${allRows.length !== 1 ? "s" : ""}…`}
					value={filter}
					onChange={(_, d) => setFilter(d.value)}
					style={{ minWidth: 0, flex: 1, maxWidth: 480 }}
				/>
				{filter && (
					<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
						{rows.length} match{rows.length !== 1 ? "es" : ""}
					</Text>
				)}
			</div>
			<DataGrid
				items={rows}
				columns={columns}
				columnSizingOptions={columnSizingOptions}
				resizableColumns
				getRowId={(item) => item.button.id}
				focusMode="composite"
				sortable
				selectionMode="single"
				selectedItems={selectedButtonId ? new Set([selectedButtonId]) : new Set()}
				onSelectionChange={(_, data) => {
					const id = [...data.selectedItems][0] as string;
					const row = rows.find((r) => r.button.id === id);
					if (row) {
						selectButtonInContext(location, tab.id, row.groupId, row.button.id);
					}
				}}
			>
				<DataGridHeader>
					<DataGridRow>
						{({ renderHeaderCell }) => (
							<DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
						)}
					</DataGridRow>
				</DataGridHeader>
				{/* As tall as its rows, up to ten: a fixed height left the grid's box
				    shorter than its rows on a short window, and the modern commands
				    below were drawn over them. The canvas scrolls for the rest. */}
				<DataGridBody<ButtonRow>
					itemSize={ROW_HEIGHT}
					height={Math.max(1, Math.min(rows.length, MAX_VISIBLE_ROWS)) * ROW_HEIGHT}
					listProps={{ width: "100%" }}
				>
					{({ item, rowId }, style) => (
						<DataGridRow<ButtonRow>
							key={rowId}
							style={style}
							className={
								selectedButtonId === item.button.id
									? styles.rowSelected
									: styles.row
							}
						>
							{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
						</DataGridRow>
					)}
				</DataGridBody>
			</DataGrid>
			<ModernCommandsTable tab={tab} location={location} />
		</div>
	);
}
