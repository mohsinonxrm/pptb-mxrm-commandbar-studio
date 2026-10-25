import { MessageSlot } from "@/components/shared/MessageSlot";
import { useConnectionChangedMessage } from "@/hooks/useShellMessages";

/** The connection-changed notice on its own (#120); the shell shows it in ShellMessages. */
export function ConnectionChangedNotice() {
	const message = useConnectionChangedMessage();
	return message ? <MessageSlot scope="shell" messages={[message]} /> : null;
}
