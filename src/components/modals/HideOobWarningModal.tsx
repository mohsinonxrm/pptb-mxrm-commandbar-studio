import React from "react";
import {
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions,
	Button,
	MessageBar,
	MessageBarBody,
	Text,
} from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";

interface HideOobWarningModalProps {
	open: boolean;
	buttonLabel: string;
	/** The button's command; the display-rule option edits it. */
	commandId?: string;
	/** Set when Delete was pressed on a button that isn't yours (#17): why it can't be deleted. */
	deleteBlockedReason?: string;
	onConfirmHide: () => void;
	onConfirmDisplayRule: () => void;
	onCancel: () => void;
}

export const HideOobWarningModal: React.FC<HideOobWarningModalProps> = ({
	open,
	buttonLabel,
	commandId,
	deleteBlockedReason,
	onConfirmHide,
	onConfirmDisplayRule,
	onCancel,
}) => {
	return (
		<Dialog open={open} onOpenChange={() => onCancel()}>
			<DialogSurface style={{ maxWidth: "560px" }}>
				<DialogTitle>
					<WarningRegular
						style={{
							marginRight: "8px",
							color: "var(--colorStatusWarningForeground1)",
						}}
					/>
					{deleteBlockedReason
						? `Can't delete "${buttonLabel}"`
						: `Hide "${buttonLabel}"`}
				</DialogTitle>
				<DialogBody>
					<DialogContent>
						{deleteBlockedReason && (
							<Text style={{ display: "block", marginBottom: "12px" }}>
								{deleteBlockedReason} Only buttons your solution adds can be deleted
								— you can hide this one instead.
							</Text>
						)}
						<MessageBar intent="warning">
							<MessageBarBody>
								<Text weight="semibold">
									A HideCustomAction removes the button from the ribbon.
								</Text>{" "}
								To show it again, use Unhide under &ldquo;Hidden by
								customizations&rdquo; in the Properties pane; in a managed solution
								a hide can&apos;t be undone with a patch.
							</MessageBarBody>
						</MessageBar>
						<Text style={{ display: "block", marginTop: "12px" }}>
							The reversible alternative adds the display rules{" "}
							<code>Mscrm.HideOnModern</code> + <code>Mscrm.ShowOnlyOnModern</code>{" "}
							(never both true) to the button&apos;s command
							{commandId ? (
								<>
									{" "}
									<code>{commandId}</code>. Every button that uses this command is
									hidden too.
								</>
							) : (
								<>
									. This button has no command, so only the HideCustomAction is
									available.
								</>
							)}
						</Text>
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={onCancel}>
							Cancel
						</Button>
						<Button
							appearance="secondary"
							onClick={onConfirmDisplayRule}
							disabled={!commandId}
						>
							Use display rules (reversible)
						</Button>
						<Button appearance="primary" onClick={onConfirmHide}>
							Use HideCustomAction (permanent)
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default HideOobWarningModal;
