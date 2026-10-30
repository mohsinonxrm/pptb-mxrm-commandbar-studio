import React from "react";
import { makeStyles, tokens, Button, Text } from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useDisplayText } from "@/hooks/useDisplayText";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
	},
	action: { alignSelf: "flex-start" },
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
	note: { color: tokens.colorNeutralForeground2 },
});

export const ScalingSectionSummary: React.FC = () => {
	const styles = useStyles();
	const openScalingEditor = useUIStore((s) => s.openScalingEditor);

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbons = useRibbonStore((s) => s.ribbons);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const captionOf = useDisplayText();

	// Scaling isn't stored per-button; it's stored per-tab (via setScaling).
	// We just show a summary from the tab perspective.
	const groupCount = tab?.groups.length ?? 0;

	return (
		<div className={styles.section}>
			{tab ? (
				<Text size={200} className={styles.note}>
					Scaling is set for the whole tab: &ldquo;
					{captionOf(tab.label, locLabels, lang, tab.source?.titleToken) || tab.id}
					&rdquo; has {groupCount} group{groupCount === 1 ? "" : "s"}.
				</Text>
			) : (
				<Text size={200} className={styles.note}>
					Select a tab to configure scaling.
				</Text>
			)}
			<Button
				appearance="secondary"
				size="small"
				icon={<EditRegular />}
				onClick={openScalingEditor}
				disabled={!tab}
				className={styles.action}
			>
				Edit scaling
			</Button>
		</div>
	);
};

export default ScalingSectionSummary;
