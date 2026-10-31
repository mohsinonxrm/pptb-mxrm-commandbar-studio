import React from "react";
import { makeStyles, tokens, Text } from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useDisplayText } from "@/hooks/useDisplayText";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	note: { color: tokens.colorNeutralForeground2 },
});

/**
 * The selected tab's scaling, read-only (#165, decided on #193): changes to
 * scaling can't be published yet, so it isn't edited until #165 makes them
 * publishable. Scaling only shapes the classic ribbon.
 */
export const ScalingSectionSummary: React.FC = () => {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbon = useRibbonStore((s) => s.ribbons[location]);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const captionOf = useDisplayText();

	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const scaling = ribbon.scalingByTab?.[tabId];
	const steps = (scaling?.maxSizes.length ?? 0) + (scaling?.scales.length ?? 0);
	const groups = tab?.groups.length ?? 0;

	return (
		<div className={styles.section}>
			{tab ? (
				<Text size={200} className={styles.note}>
					&ldquo;{captionOf(tab.label, locLabels, lang, tab.source?.titleToken) || tab.id}
					&rdquo; has {groups} group{groups === 1 ? "" : "s"} and {steps} scaling step
					{steps === 1 ? "" : "s"}.
				</Text>
			) : (
				<Text size={200} className={styles.note}>
					Select a tab to see its scaling.
				</Text>
			)}
			<Text size={200} className={styles.note}>
				Scaling decides how groups shrink as the classic ribbon narrows; Unified Interface
				ignores it. Command Bar Studio can&apos;t change it yet.
			</Text>
		</div>
	);
};

export default ScalingSectionSummary;
