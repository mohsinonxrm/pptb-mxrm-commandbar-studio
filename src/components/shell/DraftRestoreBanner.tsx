import { MessageBar, MessageBarBody, MessageBarActions, Button } from "@fluentui/react-components";
import { useDraftStore } from "@/store/draftStore";

/**
 * Offers the unsaved changes of an earlier session (#16). Shown only once the
 * table they belong to has finished loading (draftStore.workspaceLoaded), so a
 * restore always goes on top of that load.
 */
export function DraftRestoreBanner() {
	const pending = useDraftStore((s) => s.pending);
	const baselineChanged = useDraftStore((s) => s.pendingBaselineChanged);
	const restoreDraft = useDraftStore((s) => s.restoreDraft);
	const discardDraft = useDraftStore((s) => s.discardDraft);
	if (!pending) return null;

	return (
		<MessageBar
			intent="warning"
			layout="multiline"
			style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000 }}
		>
			<MessageBarBody>
				You have unpublished changes to this table from a previous session (saved{" "}
				{new Date(pending.savedAt).toLocaleString()}).
				{baselineChanged && (
					<>
						{" "}
						The table&apos;s ribbon has changed since then (published from another session, or by someone else):
						restored changes are compared with the ribbon as it is now, so review the publish plan before
						publishing.
					</>
				)}
			</MessageBarBody>
			<MessageBarActions
				containerAction={
					<Button size="small" appearance="subtle" onClick={discardDraft}>
						Discard
					</Button>
				}
			>
				<Button size="small" appearance="primary" onClick={() => restoreDraft()}>
					Restore
				</Button>
			</MessageBarActions>
		</MessageBar>
	);
}
