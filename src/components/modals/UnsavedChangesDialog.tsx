import { Button, Text, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { AppDialog, DangerButton } from "@/components/shared/AppDialog";
import { useDraftStore } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";

/**
 * Asks before switching table or solution while the loaded table has
 * unpublished changes (#16). Keep: the changes stay saved as the table's draft
 * and are offered again when it is reopened in the same solution. Discard: the
 * draft is deleted. Cancel: nothing changes. When the draft can't be saved
 * (browser storage full), Keep is disabled: switching would lose the changes.
 */
export function UnsavedChangesDialog() {
	const pendingSwitch = useDraftStore((s) => s.pendingSwitch);
	// An earlier draft waiting for Restore / Discard: changes made since aren't saved.
	const earlierDraft = useDraftStore((s) => s.pending !== null);
	const saveFailed = useDraftStore((s) => s.saveFailed);
	const resolveSwitch = useDraftStore((s) => s.resolveSwitch);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	if (!pendingSwitch) return null;

	const table = activeEntity?.displayName || activeEntity?.logicalName || "this table";
	const to =
		pendingSwitch.kind === "entity"
			? `table ${pendingSwitch.entity.displayName || pendingSwitch.entity.logicalName}`
			: `solution ${pendingSwitch.solution.friendlyName || pendingSwitch.solution.uniqueName}`;
	const solution = activeSolution?.friendlyName || activeSolution?.uniqueName || "this solution";

	return (
		<AppDialog
			open
			onOpenChange={(o) => !o && resolveSwitch("cancel")}
			modalType="alert"
			size="small"
			title="Unpublished changes"
			actions={
				<>
					<Button appearance="secondary" onClick={() => resolveSwitch("cancel")}>
						Cancel
					</Button>
					<DangerButton onClick={() => resolveSwitch("discard")}>
						Discard{earlierDraft ? " and switch" : " changes"}
					</DangerButton>
					{!earlierDraft && (
						<Button
							appearance="primary"
							disabled={saveFailed}
							onClick={() => resolveSwitch("keep")}
						>
							Keep as draft
						</Button>
					)}
				</>
			}
		>
			<Text block>
				{table} has changes that aren&apos;t published. Switch to {to}?
			</Text>
			<Text block style={{ marginTop: "8px" }}>
				{earlierDraft ? (
					<>
						Changes made since opening {table} aren&apos;t saved: the unsaved changes of
						your previous session are kept until you restore or discard them.
					</>
				) : (
					<>
						<strong>Keep as draft</strong> saves them on this computer: they are offered
						again when you open {table} in {solution}. <strong>Discard changes</strong>{" "}
						deletes them.
					</>
				)}
			</Text>
			{saveFailed && !earlierDraft && (
				<MessageBar intent="error" layout="multiline" style={{ marginTop: "12px" }}>
					<MessageBarBody>
						The changes can&apos;t be saved as a draft: the browser storage is full.
						Publish them first, or discard them to switch.
					</MessageBarBody>
				</MessageBar>
			)}
		</AppDialog>
	);
}
