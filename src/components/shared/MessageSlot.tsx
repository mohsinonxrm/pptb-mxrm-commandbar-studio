import React, { useState } from "react";
import {
	Button,
	Link,
	MessageBar,
	MessageBarActions,
	MessageBarBody,
	MessageBarGroup,
	MessageBarTitle,
	makeStyles,
	tokens,
	type MessageBarIntent,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { readPref, writePref } from "@/utils/localPrefs";

/**
 * The one place a surface shows messages that need action (#181, #190). One
 * bar at a time with "+n more"; a dismiss is remembered per scope and message
 * until the message's `signature` changes (e.g. the orphan count). Explanations
 * that never need action belong in an InfoLabel or LocationInfo instead.
 */

export interface SlotMessage {
	/** Stable id within the scope, e.g. "orphans". */
	id: string;
	intent: MessageBarIntent;
	title: string;
	body?: React.ReactNode;
	/** Buttons, e.g. Retry or Review. */
	actions?: React.ReactNode;
	/** Defaults to true. Errors that block work can set false. */
	dismissible?: boolean;
	/** When this changes, a dismissed message shows again. */
	signature?: string;
}

export interface MessageSlotProps {
	/** Where dismissals are remembered, e.g. "canvas:<org>:<table>". */
	scope: string;
	messages: SlotMessage[];
	className?: string;
}

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		flexShrink: 0,
	},
	more: {
		alignSelf: "flex-start",
		fontSize: tokens.fontSizeBase200,
	},
});

type Dismissed = Record<string, string>;

export const MessageSlot: React.FC<MessageSlotProps> = ({ scope, messages, className }) => {
	const styles = useStyles();
	const key = `dismissed.${scope}`;
	const [dismissed, setDismissed] = useState<Dismissed>(() => readPref<Dismissed>(key, {}));
	const [expanded, setExpanded] = useState(false);
	// Re-read when the scope changes (another table).
	const [lastScope, setLastScope] = useState(scope);
	if (lastScope !== scope) {
		setLastScope(scope);
		setDismissed(readPref<Dismissed>(key, {}));
		setExpanded(false);
	}

	const visible = messages.filter((m) => dismissed[m.id] !== (m.signature ?? ""));
	if (visible.length === 0) return null;
	const shown = expanded ? visible : visible.slice(0, 1);

	const dismiss = (m: SlotMessage) => {
		const next = { ...dismissed, [m.id]: m.signature ?? "" };
		setDismissed(next);
		writePref(key, next);
	};

	return (
		<div className={className ? `${styles.root} ${className}` : styles.root}>
			<MessageBarGroup animate="both">
				{shown.map((m) => (
					<MessageBar key={m.id} intent={m.intent} layout="multiline">
						<MessageBarBody>
							<MessageBarTitle>{m.title}</MessageBarTitle>
							{m.body}
						</MessageBarBody>
						{(m.actions || m.dismissible !== false) && (
							<MessageBarActions
								containerAction={
									m.dismissible === false ? undefined : (
										<Button
											appearance="transparent"
											aria-label={`Dismiss: ${m.title}`}
											icon={<DismissRegular />}
											onClick={() => dismiss(m)}
										/>
									)
								}
							>
								{m.actions}
							</MessageBarActions>
						)}
					</MessageBar>
				))}
			</MessageBarGroup>
			{visible.length > 1 && (
				<Link
					as="button"
					className={styles.more}
					aria-expanded={expanded}
					onClick={() => setExpanded((e) => !e)}
				>
					{expanded ? "Show fewer" : `+${visible.length - 1} more`}
				</Link>
			)}
		</div>
	);
};

export default MessageSlot;
