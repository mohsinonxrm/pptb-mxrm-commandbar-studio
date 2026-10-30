import { MessageBar, MessageBarBody } from "@fluentui/react-components";
import { useDraftStore } from "@/store/draftStore";

/**
 * Warns when the latest changes can't be saved as a draft (browser storage
 * full, #16), and says which draft is still saved.
 */
export function DraftSaveWarning() {
	const saveFailed = useDraftStore((s) => s.saveFailed);
	const lastSavedAt = useDraftStore((s) => s.lastSavedAt);
	if (!saveFailed) return null;

	return (
		<MessageBar
			intent="error"
			layout="multiline"
			style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000 }}
		>
			<MessageBarBody>
				Your latest changes can&apos;t be saved as a draft: the browser storage is full.{" "}
				{lastSavedAt ? (
					<>
						The last saved draft is from {new Date(lastSavedAt).toLocaleString()};
						publish your changes, or the ones made since are lost when Command Bar
						Studio closes.
					</>
				) : (
					<>Publish them, or they are lost when Command Bar Studio closes.</>
				)}
			</MessageBarBody>
		</MessageBar>
	);
}
