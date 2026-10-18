import { MessageBar, MessageBarBody, MessageBarActions, Button } from "@fluentui/react-components";
import { useDraftStore } from "@/store/draftStore";

const BANNER_STYLE = { position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000 } as const;

/**
 * Offers the unsaved changes of an earlier session (#16). Shown only once the
 * table they belong to has finished loading (draftStore.workspaceLoaded), so a
 * restore always goes on top of that load. Also warns when the changes can't
 * be saved as a draft (browser storage full).
 */
export function DraftRestoreBanner() {
	const pending = useDraftStore((s) => s.pending);
	const baselineChanged = useDraftStore((s) => s.pendingBaselineChanged);
	const saveFailed = useDraftStore((s) => s.saveFailed);
	const restoreDraft = useDraftStore((s) => s.restoreDraft);
	const discardDraft = useDraftStore((s) => s.discardDraft);
	if (!pending && saveFailed) {
		return (
			<MessageBar intent="error" layout="multiline" style={BANNER_STYLE}>
				<MessageBarBody>
					Your changes can&apos;t be saved as a draft: the browser storage is full. Publish them, or they are lost
					when Command Bar Studio closes.
				</MessageBarBody>
			</MessageBar>
		);
	}
	if (!pending) return null;

	return (
		<MessageBar intent="warning" layout="multiline" style={BANNER_STYLE}>
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
