import type { SlotMessage } from "@/components/shared/MessageSlot";
import { useDraftStore } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";

/**
 * Messages for the whole tool, shown in the shell's message slot under the top
 * bar (#179, #181), in normal flow instead of floating over the panes.
 */

/**
 * The latest changes can't be saved as a draft (browser storage full, #16).
 * Not dismissible: the changes are at risk until they're published.
 */
export function useDraftSaveMessage(): SlotMessage | null {
	const saveFailed = useDraftStore((s) => s.saveFailed);
	const lastSavedAt = useDraftStore((s) => s.lastSavedAt);
	if (!saveFailed) return null;
	return {
		id: "draft-save-failed",
		intent: "error",
		title: "Your latest changes can't be saved as a draft",
		body: lastSavedAt ? (
			<>
				The browser storage is full. The last saved draft is from{" "}
				{new Date(lastSavedAt).toLocaleString()}; publish your changes, or the ones made
				since are lost when Command Bar Studio closes.
			</>
		) : (
			<>
				The browser storage is full. Publish your changes, or they are lost when Command Bar
				Studio closes.
			</>
		),
		dismissible: false,
	};
}

/**
 * After the tool's connection changed in Power Platform ToolBox (#120): which
 * environment the tool works against now, that the previous environment's
 * solution and table were closed, and what happened to the unpublished changes.
 */
export function useConnectionChangedMessage(): SlotMessage | null {
	const notice = useSessionStore((s) => s.connectionNotice);
	const dismiss = useSessionStore((s) => s.dismissConnectionNotice);
	if (!notice) return null;
	const from = `${notice.from.name || notice.from.url} (${notice.from.environment})`;
	const to = `${notice.to.name || notice.to.url} (${notice.to.environment})`;
	return {
		id: "connection-changed",
		intent: notice.draftLost
			? "error"
			: notice.to.environment === "Production"
				? "warning"
				: "info",
		title: `Connection changed to ${to}`,
		body: (
			<>
				The solution and table loaded from {from} were closed; pick a solution to continue
				in {to}.{" "}
				{notice.draftKept && (
					<>
						Your unpublished changes were kept as a draft: switch the tool back to{" "}
						{from} and open the table to restore them.
					</>
				)}
				{notice.draftLost && (
					<>
						Your unpublished changes couldn&apos;t be saved as a draft (the browser
						storage is full) and are lost.
					</>
				)}
			</>
		),
		onDismiss: dismiss,
	};
}

export function useShellMessages(): SlotMessage[] {
	const draft = useDraftSaveMessage();
	const connection = useConnectionChangedMessage();
	return [connection, draft].filter((m): m is SlotMessage => m !== null);
}
