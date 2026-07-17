import React from "react";
import { makeStyles, tokens, Button, Text } from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	stepRow: {
		display: "flex",
		flexDirection: "column",
		gap: "8px",
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	stepBadge: {
		alignSelf: "flex-start",
	},
	note: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		fontStyle: "italic",
	},
	warningNote: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorStatusWarningForeground1,
		backgroundColor: tokens.colorStatusWarningBackground1,
		padding: `2px ${tokens.spacingHorizontalXS}`,
		borderRadius: tokens.borderRadiusSmall,
	},
});

export const ScalingSectionSummary: React.FC = () => {
	const styles = useStyles();
	const openScalingEditor = useUIStore((s) => s.openScalingEditor);

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbons = useRibbonStore((s) => s.ribbons);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);

	// Scaling isn't stored per-button; it's stored per-tab (via setScaling).
	// We just show a summary from the tab perspective.
	const groupCount = tab?.groups.length ?? 0;

	return (
		<div className={styles.section}>
			<div className={styles.header}>
				<Text size={200} weight="semibold">
					Scaling
				</Text>
				<Button appearance="subtle" size="small" icon={<EditRegular />} onClick={openScalingEditor}>
					Edit scaling
				</Button>
			</div>

			<div className={styles.warningNote}>
				⚠ Scaling applies only to the Classic ribbon (Legacy client / Outlook list views). The
				modern command bar (Unified Interface) ignores scaling.
			</div>

			{tab ? (
				<Text size={100} className={styles.note}>
					Tab <strong>{tab.label}</strong> has {groupCount} group(s). Open the Scaling Editor to
					configure MaxSize and Scale steps.
				</Text>
			) : (
				<Text size={100} className={styles.note}>
					Select a tab to configure scaling.
				</Text>
			)}
		</div>
	);
};

export default ScalingSectionSummary;
