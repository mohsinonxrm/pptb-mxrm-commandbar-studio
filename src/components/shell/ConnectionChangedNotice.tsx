import {
	Button,
	MessageBar,
	MessageBarActions,
	MessageBarBody,
	MessageBarTitle,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useSessionStore } from "@/store/sessionStore";

/**
 * After the tool's connection changed in Power Platform ToolBox (#120): says
 * which environment the tool works against now, that the previous
 * environment's solution and table were closed, and what happened to the
 * unpublished changes.
 */
export function ConnectionChangedNotice() {
	const notice = useSessionStore((s) => s.connectionNotice);
	const dismiss = useSessionStore((s) => s.dismissConnectionNotice);
	if (!notice) return null;
	const from = `${notice.from.name || notice.from.url} (${notice.from.environment})`;
	const to = `${notice.to.name || notice.to.url} (${notice.to.environment})`;

	return (
		<MessageBar
			intent={
				notice.draftLost
					? "error"
					: notice.to.environment === "Production"
						? "warning"
						: "info"
			}
			layout="multiline"
			role="alert"
			style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000 }}
		>
			<MessageBarBody>
				<MessageBarTitle>Connection changed to {to}</MessageBarTitle>
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
			</MessageBarBody>
			<MessageBarActions
				containerAction={
					<Button
						aria-label="Dismiss"
						appearance="transparent"
						icon={<DismissRegular />}
						onClick={dismiss}
					/>
				}
			/>
		</MessageBar>
	);
}
