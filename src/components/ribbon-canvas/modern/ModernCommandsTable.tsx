import {
	makeStyles,
	tokens,
	Text,
	Badge,
	Table,
	TableHeader,
	TableHeaderCell,
	TableBody,
	TableRow,
	TableCell,
	TableCellLayout,
	Tooltip,
	Button,
	mergeClasses,
} from "@fluentui/react-components";
import { ChevronDownRegular, ChevronRightRegular, EyeOffRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernAppNames, useModernCanvas } from "@/hooks/useModernCommands";
import { appLabel } from "@/services/modernCommands";
import type { ModernCommandNode } from "@/types/modernCommand";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";
import { ModernCommandTooltip } from "./ModernCommandChip";

const useStyles = makeStyles({
	root: {
		marginTop: tokens.spacingVerticalM,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	row: {
		cursor: "pointer",
		backgroundColor: tokens.colorPaletteBerryBackground1,
		":hover": { backgroundColor: tokens.colorPaletteBerryBackground2 },
	},
	rowSelected: {
		backgroundColor: tokens.colorPaletteBerryBackground2,
		outline: `1px solid ${tokens.colorPaletteBerryBorderActive}`,
	},
	hidden: { opacity: 0.55, textDecoration: "line-through" },
	mono: {
		fontFamily: tokens.fontFamilyMonospace,
		color: tokens.colorNeutralForeground3,
	},
	// Fixed columns that truncate: the table never scrolls sideways (#183).
	table: { tableLayout: "fixed", width: "100%" },
	note: { color: tokens.colorNeutralForeground3, minWidth: 0 },
});

const TYPE_SHORT: Record<string, string> = {
	button: "command",
	dropdown: "dropdown",
	split: "split",
	group: "group",
};

/**
 * Read-only list of the modern commands on this command bar (List view), in
 * a collapsible section of its own below the buttons (#183). Rows select the
 * command for the properties pane. Long names truncate; the label's tooltip
 * and the unique name's say the rest.
 */
export function ModernCommandsTable({
	tab,
	location,
}: {
	tab: RibbonTab;
	location: RibbonLocation;
}) {
	const styles = useStyles();
	const { nodes } = useModernCanvas(location, tab);
	const appNames = useModernAppNames();
	const selectedId = useModernCommandStore((s) => s.selectedCommandId);
	const selectCommand = useModernCommandStore((s) => s.selectCommand);
	const classicSelected = useSelectionStore((s) => s.selectedButtonId);
	const [open, setOpen] = useState(true);

	if (nodes.length === 0) return null;
	const rows: { node: ModernCommandNode; depth: number }[] = [];
	const walk = (list: ModernCommandNode[], depth: number) => {
		for (const node of list) {
			rows.push({ node, depth });
			walk(node.children, depth + 1);
		}
	};
	walk(nodes, 0);

	return (
		<section className={styles.root} aria-label="Modern commands">
			<div className={styles.header}>
				<Button
					appearance="subtle"
					size="small"
					icon={open ? <ChevronDownRegular /> : <ChevronRightRegular />}
					aria-expanded={open}
					onClick={() => setOpen(!open)}
				>
					<Text weight="semibold" size={200}>
						Modern commands ({rows.length})
					</Text>
				</Button>
				<Badge style={{ flexShrink: 0 }} size="small" appearance="tint" color="important">
					read-only
				</Badge>
				<Text size={100} truncate wrap={false} className={styles.note}>
					Built with the command designer (appaction). Edit them there.
				</Text>
			</div>
			{open && (
				<Table
					size="small"
					className={styles.table}
					aria-label="Modern commands (read-only)"
				>
					<TableHeader>
						<TableRow>
							<TableHeaderCell style={{ width: 52 }}>#</TableHeaderCell>
							<TableHeaderCell style={{ width: "36%" }}>Label</TableHeaderCell>
							<TableHeaderCell style={{ width: "20%" }}>App</TableHeaderCell>
							<TableHeaderCell style={{ width: 96 }}>Type</TableHeaderCell>
							<TableHeaderCell>Unique name</TableHeaderCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map(({ node, depth }) => {
							const cmd = node.command;
							const selected = selectedId === cmd.id && !classicSelected;
							return (
								<TableRow
									key={cmd.id}
									className={mergeClasses(
										styles.row,
										selected && styles.rowSelected,
									)}
									aria-selected={selected}
									tabIndex={0}
									onClick={() => selectCommand(cmd.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											selectCommand(cmd.id);
										}
									}}
								>
									<TableCell>{cmd.sequence}</TableCell>
									<TableCell>
										<Tooltip
											content={
												<ModernCommandTooltip
													node={node}
													appNames={appNames}
												/>
											}
											relationship="description"
										>
											<span
												className={
													cmd.hidden || cmd.disabled
														? styles.hidden
														: undefined
												}
												style={{
													paddingLeft: depth * 16,
													display: "flex",
													gap: 4,
													alignItems: "center",
													minWidth: 0,
													overflow: "hidden",
													whiteSpace: "nowrap",
													textOverflow: "ellipsis",
												}}
											>
												<span
													style={{
														minWidth: 0,
														overflow: "hidden",
														textOverflow: "ellipsis",
													}}
												>
													{cmd.label}
												</span>
												{cmd.hidden && (
													<EyeOffRegular
														fontSize={12}
														aria-label="hidden"
													/>
												)}
												<Badge
													style={{ flexShrink: 0 }}
													size="small"
													appearance="tint"
													color="important"
												>
													Modern
												</Badge>
											</span>
										</Tooltip>
									</TableCell>
									<TableCell>
										<TableCellLayout truncate>
											{appLabel(cmd, appNames)}
										</TableCellLayout>
									</TableCell>
									<TableCell>
										<Badge
											style={{ flexShrink: 0 }}
											size="small"
											appearance="outline"
										>
											{TYPE_SHORT[cmd.type]}
										</Badge>
									</TableCell>
									<TableCell>
										<TableCellLayout truncate className={styles.mono}>
											<span title={cmd.uniqueName}>{cmd.uniqueName}</span>
										</TableCellLayout>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
		</section>
	);
}
