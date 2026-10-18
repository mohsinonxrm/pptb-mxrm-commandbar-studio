import {
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions,
	Button,
	Text,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import { useDraftStore } from "@/store/draftStore";

/**
 * Offers the unsaved changes of an earlier session (#16). Shown only once the
 * table they belong to has finished loading (draftStore.workspaceLoaded), so a
 * restore always goes on top of that load. Modal: nothing can be edited until
 * the user restores or discards them, so no edit is lost to (or overwritten
 * by) the restore.
 */
export function DraftRestoreDialog() {
	const pending = useDraftStore((s) => s.pending);
	const baselineChanged = useDraftStore((s) => s.pendingBaselineChanged);
	const restoreDraft = useDraftStore((s) => s.restoreDraft);
	const discardDraft = useDraftStore((s) => s.discardDraft);
	if (!pending) return null;

	return (
		// No dismiss: the user picks Restore or Discard.
		<Dialog open modalType="alert">
			<DialogSurface style={{ maxWidth: "520px" }}>
				<DialogBody>
					<DialogTitle>Unpublished changes</DialogTitle>
					<DialogContent>
						<Text block>
							You have unpublished changes to this table from a previous session (saved{" "}
							{new Date(pending.savedAt).toLocaleString()}). Restore them on top of the ribbon as it is now, or
							discard them?
						</Text>
						{baselineChanged && (
							<MessageBar intent="warning" layout="multiline" style={{ marginTop: "12px" }}>
								<MessageBarBody>
									The table&apos;s ribbon has changed since then (published from another session, or by someone
									else): review the publish plan before publishing.
								</MessageBarBody>
							</MessageBar>
						)}
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={discardDraft}>
							Discard
						</Button>
						<Button appearance="primary" onClick={() => restoreDraft()}>
							Restore
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
}
