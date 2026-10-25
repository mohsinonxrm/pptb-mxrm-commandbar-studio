import { MessageSlot } from "@/components/shared/MessageSlot";
import { useDraftSaveMessage } from "@/hooks/useShellMessages";

/** The draft-save warning on its own (#16); the shell shows it in ShellMessages. */
export function DraftSaveWarning() {
	const message = useDraftSaveMessage();
	return message ? <MessageSlot scope="shell" messages={[message]} /> : null;
}
