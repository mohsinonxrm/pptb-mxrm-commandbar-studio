import {
	makeStyles,
	tokens,
	Text,
	Badge,
	Caption1,
	Subtitle2,
	Divider,
	Link,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useModernAppNames } from "@/hooks/useModernCommands";
import { describeModernCommand } from "@/services/modernCommands";
import type { ModernCommand } from "@/types/modernCommand";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
	},
	title: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		flexWrap: "wrap",
	},
	grid: {
		display: "grid",
		gridTemplateColumns: "max-content 1fr",
		columnGap: tokens.spacingHorizontalM,
		rowGap: tokens.spacingVerticalXS,
		alignItems: "baseline",
	},
	key: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase200,
	},
	value: {
		fontSize: tokens.fontSizeBase200,
		overflowWrap: "anywhere",
		minWidth: 0,
	},
	mono: {
		fontFamily: tokens.fontFamilyMonospace,
	},
	list: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
	},
});

function Row({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
	const styles = useStyles();
	if (!value) return null;
	return (
		<>
			<Text className={styles.key}>{label}</Text>
			<Text className={`${styles.value} ${mono ? styles.mono : ""}`}>{value}</Text>
		</>
	);
}

/** Read-only properties of a modern command (`appaction`, #32). */
export function ModernCommandProperties({
	command,
	items,
}: {
	command: ModernCommand;
	items: ModernCommand[];
}) {
	const styles = useStyles();
	const appNames = useModernAppNames();
	const selectCommand = useModernCommandStore((s) => s.selectCommand);
	const parent = useModernCommandStore((s) =>
		command.parentId ? s.commands.find((c) => c.id === command.parentId) : undefined,
	);
	const usesFormula = command.visibility === "formula" || command.action === "formula";

	return (
		<section className={styles.root} aria-label="Modern command properties">
			<div className={styles.title}>
				<Subtitle2>{command.label}</Subtitle2>
				<Badge appearance="tint" color="important">
					Modern
				</Badge>
				{command.managed && (
					<Badge appearance="outline" color="informative">
						Managed
					</Badge>
				)}
			</div>
			<MessageBar intent="info">
				<MessageBarBody>
					Modern commands are read-only in Command Bar Studio and are never published from
					here. Edit them in the command designer.
				</MessageBarBody>
			</MessageBar>

			<div className={styles.grid}>
				{describeModernCommand(command, appNames).map((r) => (
					<Row key={r.label} label={r.label} value={r.value} />
				))}
				<Row label="Tooltip title" value={command.tooltipTitle} />
				<Row label="Tooltip text" value={command.tooltipDescription} />
				<Row label="Accessibility text" value={command.accessibilityText} />
				<Row
					label="Icon"
					value={
						command.fontIcon ?? command.iconWebResourceName ?? command.iconWebResourceId
					}
				/>
				<Row label="Group title" value={command.groupTitle} />
				<Row label="Name" value={command.name} />
				<Row label="Unique name" value={command.uniqueName} mono />
				<Row label="Id" value={command.id} mono />
			</div>

			{usesFormula && (
				<Caption1>
					Power Fx formulas are stored in the app&apos;s command component library, not on
					the command, so only the function reference is shown here.
				</Caption1>
			)}

			{parent && (
				<>
					<Divider />
					<Text className={styles.key}>Inside</Text>
					<Link onClick={() => selectCommand(parent.id)}>{parent.label}</Link>
				</>
			)}

			{items.length > 0 && (
				<>
					<Divider />
					<Text className={styles.key}>Items ({items.length})</Text>
					<div className={styles.list}>
						{items.map((c) => (
							<Link key={c.id} onClick={() => selectCommand(c.id)}>
								{c.label}
								{c.hidden ? " (hidden)" : ""}
							</Link>
						))}
					</div>
				</>
			)}

			{command.classicRules.length > 0 && (
				<>
					<Divider />
					<Text className={styles.key}>
						Classic rules ({command.classicRules.length})
					</Text>
					<div className={styles.list}>
						{command.classicRules.map((r) => (
							<Text key={r.id} className={`${styles.value} ${styles.mono}`}>
								{r.kind === "enable" ? "Enable" : "Display"}:{" "}
								{r.uniqueName ?? r.name}
							</Text>
						))}
					</div>
				</>
			)}
		</section>
	);
}
