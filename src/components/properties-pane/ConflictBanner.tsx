import React from "react";
import {
	makeStyles,
	tokens,
	Button,
	Text,
	MessageBar,
	MessageBarBody,
	MessageBarActions,
} from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { ConflictEntry } from "@/types/ribbon";

const useStyles = makeStyles({
	banner: {
		marginBottom: tokens.spacingHorizontalXS,
	},
});

export const ConflictBanner: React.FC = () => {
	const styles = useStyles();
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const conflicts = useRibbonStore((s) => s.conflicts);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const openConflictDrawer = useUIStore((s) => s.openConflictDrawer);

	// Locate the selected button to check its solution-layer provenance.
	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = group?.buttons.find((b) => b.id === selectedButtonId);

	// Show the banner when the provenance service identified this button as
	// coming from a managed solution layer, OR when the store has an explicit
	// conflict entry (populated after ribbon load via setConflicts).
	const storeConflict = conflicts.find((c: ConflictEntry) => c.elementId === selectedButtonId);
	const isManagedButton = button?.origin === "managed";

	if (!selectedButtonId || (!isManagedButton && !storeConflict)) return null;

	const solutionName = button?.solutionName ?? storeConflict?.solutions[0]?.solutionName;
	const publisherName = button?.publisherName ?? storeConflict?.solutions[0]?.publisher;
	const conflictCount = storeConflict?.solutions.length ?? (isManagedButton ? 1 : 0);

	return (
		<MessageBar intent="warning" className={styles.banner}>
			<MessageBarBody>
				<Text>
					{conflictCount > 1
						? `This button is customized by ${conflictCount} solutions. The last imported solution wins.`
						: `This button belongs to a managed solution${
								solutionName ? ` “${solutionName}”` : ""
							}${
								publisherName ? ` by ${publisherName}` : ""
							}. Customizing it will create an unmanaged override.`}
				</Text>
			</MessageBarBody>
			<MessageBarActions>
				<Button
					appearance="transparent"
					size="small"
					onClick={() => selectedButtonId && openConflictDrawer(selectedButtonId)}
				>
					View solution layers
				</Button>
			</MessageBarActions>
		</MessageBar>
	);
};

export default ConflictBanner;
