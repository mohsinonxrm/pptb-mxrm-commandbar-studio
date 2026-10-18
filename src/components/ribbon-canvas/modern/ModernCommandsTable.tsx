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
	Tooltip,
	mergeClasses,
} from "@fluentui/react-components";
import { EyeOffRegular } from "@fluentui/react-icons";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernAppNames, useModernCanvas } from "@/hooks/useModernCommands";
import { appLabel } from "@/services/modernCommands";
import { APP_ACTION_LOCATION_LABELS, type ModernCommandNode } from "@/types/modernCommand";
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
});

const TYPE_SHORT: Record<string, string> = {
	button: "command",
	dropdown: "dropdown",
	split: "split",
	group: "group",
};

/**
 * Read-only list of the modern commands on this command bar (List view),
 * below the classic buttons. Rows select the command for the properties pane.
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
				<Text weight="semibold" size={200}>
					Modern commands
				</Text>
				<Badge size="small" appearance="tint" color="important">
					read-only
				</Badge>
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					Built with the command designer (appaction). Edit them in the command designer.
				</Text>
			</div>
			<Table size="small" aria-label="Modern commands (read-only)">
				<TableHeader>
					<TableRow>
						<TableHeaderCell style={{ width: 56 }}>#</TableHeaderCell>
						<TableHeaderCell>Label</TableHeaderCell>
						<TableHeaderCell>App</TableHeaderCell>
						<TableHeaderCell>Location</TableHeaderCell>
						<TableHeaderCell style={{ width: 90 }}>Type</TableHeaderCell>
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
								className={mergeClasses(styles.row, selected && styles.rowSelected)}
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
											<ModernCommandTooltip node={node} appNames={appNames} />
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
												display: "inline-flex",
												gap: 4,
												alignItems: "center",
											}}
										>
											{cmd.label}
											{cmd.hidden && (
												<EyeOffRegular fontSize={12} aria-label="hidden" />
											)}
											<Badge
												size="extra-small"
												appearance="tint"
												color="important"
											>
												Modern
											</Badge>
										</span>
									</Tooltip>
								</TableCell>
								<TableCell>{appLabel(cmd, appNames)}</TableCell>
								<TableCell>
									{APP_ACTION_LOCATION_LABELS[cmd.location] ?? cmd.location}
								</TableCell>
								<TableCell>
									<Badge size="small" appearance="outline">
										{TYPE_SHORT[cmd.type]}
									</Badge>
								</TableCell>
								<TableCell>
									<span className={styles.mono} title={cmd.uniqueName}>
										{cmd.uniqueName}
									</span>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</section>
	);
}
