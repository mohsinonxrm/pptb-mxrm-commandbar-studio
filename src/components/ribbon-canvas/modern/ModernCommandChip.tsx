import { makeStyles, tokens, Text, Badge, Tooltip, mergeClasses } from "@fluentui/react-components";
import { ChevronDownRegular, EyeOffRegular, LockClosedRegular } from "@fluentui/react-icons";
import type { DragEvent } from "react";
import FluentIcon from "@/components/shared/FluentIcon";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSelectionStore } from "@/store/selectionStore";
import { appLabel, describeModernCommand } from "@/services/modernCommands";
import type { ModernCommandNode } from "@/types/modernCommand";

const useStyles = makeStyles({
	chip: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		height: "32px",
		padding: `0 ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusMedium,
		border: `1px dashed ${tokens.colorPaletteBerryBorderActive}`,
		backgroundColor: tokens.colorPaletteBerryBackground1,
		color: tokens.colorNeutralForeground1,
		cursor: "default",
		whiteSpace: "nowrap",
		flexShrink: 0,
		userSelect: "none",
		":hover": { backgroundColor: tokens.colorPaletteBerryBackground2 },
		":focus-visible": {
			outline: `2px solid ${tokens.colorBrandStroke1}`,
			outlineOffset: "2px",
		},
	},
	selected: {
		border: `1px solid ${tokens.colorPaletteBerryForeground2}`,
		backgroundColor: tokens.colorPaletteBerryBackground2,
	},
	muted: {
		opacity: 0.5,
	},
	hidden: {
		textDecoration: "line-through",
	},
	tooltip: {
		display: "flex",
		flexDirection: "column",
		gap: "2px",
		maxWidth: "360px",
	},
	tooltipRow: {
		fontSize: tokens.fontSizeBase200,
		overflowWrap: "anywhere",
	},
});

/** Tooltip body shared by the chip and the list view. */
export function ModernCommandTooltip({
	node,
	appNames,
}: {
	node: ModernCommandNode;
	appNames: ReadonlyMap<string, string>;
}) {
	const styles = useStyles();
	const cmd = node.command;
	return (
		<div className={styles.tooltip}>
			<Text weight="semibold">{cmd.label}</Text>
			<Text className={styles.tooltipRow}>
				Modern command — read-only in CBS; edit it in the command designer.
			</Text>
			{describeModernCommand(cmd, appNames).map((r) => (
				<Text key={r.label} className={styles.tooltipRow}>
					<b>{r.label}:</b> {r.value}
				</Text>
			))}
			{node.children.length > 0 && (
				<Text className={styles.tooltipRow}>
					<b>Items:</b> {node.children.map((c) => c.command.label).join(", ")}
				</Text>
			)}
		</div>
	);
}

/**
 * A modern command (`appaction`) on the command bar: distinct dashed berry
 * styling, a "Modern" badge, not draggable and without a context menu.
 * Clicking selects it so the properties pane shows it read-only.
 */
export function ModernCommandChip({
	node,
	appNames,
	showApp,
	onDragRejected,
}: {
	node: ModernCommandNode;
	appNames: ReadonlyMap<string, string>;
	/** Badge the app (when the App filter shows every app). */
	showApp: boolean;
	/** Called when something is dragged over / dropped on the chip (which accepts nothing). */
	onDragRejected?: () => void;
}) {
	const styles = useStyles();
	const cmd = node.command;
	const selectedId = useModernCommandStore((s) => s.selectedCommandId);
	const selectCommand = useModernCommandStore((s) => s.selectCommand);
	const classicSelected = useSelectionStore((s) => s.selectedButtonId);
	const isSelected = selectedId === cmd.id && !classicSelected;
	const hasMenu = cmd.type === "dropdown" || cmd.type === "split" || node.children.length > 0;
	const icon = cmd.fontIcon && !cmd.fontIcon.startsWith("$") ? cmd.fontIcon : "apps_add_in";
	const status = `${cmd.hidden ? " — hidden" : ""}${cmd.disabled ? " — disabled" : ""}`;
	// Read-only: never a drop target, and the drop must not reach the command
	// bar lane (which would move / create a classic button).
	const rejectDrag = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "none";
		onDragRejected?.();
	};

	return (
		<Tooltip
			content={<ModernCommandTooltip node={node} appNames={appNames} />}
			relationship="description"
		>
			<button
				type="button"
				draggable={false}
				className={mergeClasses(
					styles.chip,
					isSelected && styles.selected,
					(cmd.hidden || cmd.disabled) && styles.muted,
					cmd.hidden && styles.hidden,
				)}
				aria-pressed={isSelected}
				aria-label={`${cmd.label} — modern command (read-only), ${appLabel(cmd, appNames)}${status}`}
				onClick={() => selectCommand(cmd.id)}
				onDragStart={(e) => e.preventDefault()}
				onDragOver={rejectDrag}
				onDrop={rejectDrag}
				onContextMenu={(e) => {
					e.preventDefault();
					selectCommand(cmd.id);
				}}
			>
				<FluentIcon name={icon} size={16} />
				<Text size={200}>{cmd.label}</Text>
				{hasMenu && <ChevronDownRegular fontSize={12} aria-hidden />}
				{cmd.hidden && <EyeOffRegular fontSize={12} aria-hidden />}
				<Badge
					size="extra-small"
					appearance="tint"
					color="important"
					icon={<LockClosedRegular />}
				>
					Modern
				</Badge>
				{showApp && (
					<Badge size="extra-small" appearance="outline" color="informative">
						{appLabel(cmd, appNames)}
					</Badge>
				)}
			</button>
		</Tooltip>
	);
}
