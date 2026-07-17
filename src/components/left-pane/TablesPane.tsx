import {
	makeStyles,
	tokens,
	Input,
	Text,
	Subtitle2,
	Spinner,
	DataGridHeaderCell,
	DataGridCell,
	createTableColumn,
	type TableColumnDefinition,
} from "@fluentui/react-components";
import {
	DataGrid,
	DataGridHeader,
	DataGridBody,
	DataGridRow,
} from "@fluentui-contrib/react-data-grid-react-window";
import { SearchRegular, LockClosedRegular } from "@fluentui/react-icons";
import { useSessionStore } from "@/store/sessionStore";
import type { EntityMetadata } from "@/types/entity";
import { useState, useMemo } from "react";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground2,
	},
	header: {
		padding: `${tokens.spacingHorizontalS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	searchBox: {
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		flexShrink: 0,
	},
	scrollArea: {
		flex: 1,
		overflow: "hidden",
		padding: `0 ${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalXS}`,
	},
	gridWrap: {
		height: "100%",
	},
	sectionHeader: {
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		cursor: "pointer",
		userSelect: "none",
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	entityRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingHorizontalS} ${tokens.spacingHorizontalM}`,
		cursor: "pointer",
		borderRadius: tokens.borderRadiusMedium,
		borderLeft: "3px solid transparent",
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	entityRowActive: {
		borderLeftColor: tokens.colorBrandStroke1,
		backgroundColor: tokens.colorBrandBackground2,
		":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
	},
	entityName: {
		flex: 1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
});

export function TablesPane() {
	const styles = useStyles();
	const entities = useSessionStore((s) => s.entities);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const setActiveEntity = useSessionStore((s) => s.setActiveEntity);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const solutionEntityIds = useSessionStore((s) => s.solutionEntityIds);

	const [filter, setFilter] = useState("");
	const [customExpanded, setCustomExpanded] = useState(true);
	const [stdExpanded, setStdExpanded] = useState(true);

	// `entities` is now pre-scoped to the active solution (App.tsx fetches
	// entity metadata only for components of the chosen solution), so we
	// don't need a client-side join here anymore — just apply the text filter.
	const solutionMembers = entities;

	const filtered = useMemo(() => {
		const q = filter.toLowerCase();
		return solutionMembers.filter(
			(e) => e.displayName.toLowerCase().includes(q) || e.logicalName.toLowerCase().includes(q),
		);
	}, [solutionMembers, filter]);

	const custom = filtered.filter((e) => e.isCustomEntity);
	const standard = filtered.filter((e) => !e.isCustomEntity);
	type TableRowItem =
		| { kind: "header"; id: string; label: string; count: number }
		| { kind: "entity"; id: string; entity: EntityMetadata };

	const rows = useMemo<TableRowItem[]>(
		() => [
			...(custom.length > 0
				? [{ kind: "header" as const, id: "custom-header", label: "CUSTOM", count: custom.length }]
				: []),
			...(customExpanded
				? custom.map((e) => ({ kind: "entity" as const, id: `custom-${e.logicalName}`, entity: e }))
				: []),
			...(standard.length > 0
				? [
						{
							kind: "header" as const,
							id: "standard-header",
							label: "STANDARD" as const,
							count: standard.length,
						},
					]
				: []),
			...(stdExpanded
				? standard.map((e) => ({ kind: "entity" as const, id: `std-${e.logicalName}`, entity: e }))
				: []),
		],
		[custom, customExpanded, standard, stdExpanded],
	);

	const columns: TableColumnDefinition<TableRowItem>[] = [
		createTableColumn<TableRowItem>({
			columnId: "table",
			renderHeaderCell: () => (
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					Entity
				</Text>
			),
			renderCell: (row) => {
				if (row.kind === "header") {
					const expanded = row.label === "CUSTOM" ? customExpanded : stdExpanded;
					return (
						<div
							className={styles.sectionHeader}
							onClick={() =>
								row.label === "CUSTOM" ? setCustomExpanded((v) => !v) : setStdExpanded((v) => !v)
							}
							role="button"
							aria-expanded={expanded}
						>
							<Text size={100} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
								{expanded ? "▾" : "▸"} {row.label} ({row.count})
							</Text>
						</div>
					);
				}

				return (
					<EntityRowItem
						entity={row.entity}
						isActive={activeEntity?.logicalName === row.entity.logicalName}
						onClick={() => setActiveEntity(row.entity)}
					/>
				);
			},
		}),
	];

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<Subtitle2>Tables</Subtitle2>
			</div>
			<div className={styles.searchBox}>
				<Input
					contentBefore={<SearchRegular />}
					placeholder="Search tables…"
					size="small"
					value={filter}
					onChange={(_, d) => setFilter(d.value)}
					style={{ width: "100%" }}
				/>
			</div>
			<div className={styles.scrollArea}>
				{!activeSolution && (
					<div style={{ padding: 24, textAlign: "center" }}>
						<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
							Select a solution from the top bar to see its tables.
						</Text>
					</div>
				)}
				{activeSolution && solutionEntityIds === null && (
					<div style={{ padding: 24, textAlign: "center" }}>
						<Spinner size="small" label="Loading solution tables…" />
					</div>
				)}
				{activeSolution &&
					solutionEntityIds !== null &&
					solutionMembers.length === 0 && (
						<div style={{ padding: 24, textAlign: "center" }}>
							<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
								No tables to show for <em>{activeSolution.friendlyName}</em>.
								<br />
								<br />
								Add a table to the solution in the maker portal (Solutions ›{" "}
								<em>{activeSolution.friendlyName}</em> › Add existing › Table)
								and reload.
							</Text>
						</div>
					)}
				{activeSolution && solutionEntityIds !== null && solutionMembers.length > 0 && (
					<DataGrid
						className={styles.gridWrap}
						items={rows}
						columns={columns}
						getRowId={(item) => item.id}
						focusMode="none"
					>
						<DataGridHeader>
							<DataGridRow>
								{({ renderHeaderCell }) => (
									<DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
								)}
							</DataGridRow>
						</DataGridHeader>
						<DataGridBody<TableRowItem> itemSize={52} height={420} listProps={{ width: "100%" }}>
							{({ item, rowId }, style) => (
								<DataGridRow<TableRowItem> key={rowId} style={style}>
									{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
								</DataGridRow>
							)}
						</DataGridBody>
					</DataGrid>
				)}
			</div>
		</div>
	);
}

function EntityRowItem({
	entity,
	isActive,
	onClick,
}: {
	entity: EntityMetadata;
	isActive: boolean;
	onClick: () => void;
}) {
	const styles = useStyles();
	return (
		<div
			className={`${styles.entityRow} ${isActive ? styles.entityRowActive : ""}`}
			onClick={onClick}
			role="button"
			tabIndex={0}
			aria-pressed={isActive}
			onKeyDown={(e) => e.key === "Enter" && onClick()}
		>
			<div className={styles.entityName}>
				<Text size={200} weight={isActive ? "semibold" : "regular"}>
					{entity.displayName}
				</Text>
				<br />
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					{entity.logicalName}
				</Text>
			</div>
			{entity.isManaged && (
				<LockClosedRegular
					fontSize={12}
					style={{ color: tokens.colorNeutralForeground3 }}
					aria-label="Managed"
				/>
			)}
		</div>
	);
}
