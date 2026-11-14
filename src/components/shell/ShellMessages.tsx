import { makeStyles, tokens } from "@fluentui/react-components";
import { MessageSlot } from "@/components/shared/MessageSlot";
import { useShellMessages } from "@/hooks/useShellMessages";

const useStyles = makeStyles({
	slot: {
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
	},
});

/**
 * The tool-wide message slot under the top bar (#179, #181): in normal flow,
 * so it pushes the panes down instead of covering them.
 */
export function ShellMessages() {
	const styles = useStyles();
	const messages = useShellMessages();
	if (messages.length === 0) return null;
	return <MessageSlot scope="shell" messages={messages} className={styles.slot} />;
}
