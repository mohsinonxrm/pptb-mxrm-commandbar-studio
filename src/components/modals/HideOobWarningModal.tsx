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
	onConfirmHide: () => void;
	onConfirmDisplayRule: () => void;
	onCancel: () => void;
}

export const HideOobWarningModal: React.FC<HideOobWarningModalProps> = ({
	open,
	buttonLabel,
	onConfirmHide,
	onConfirmDisplayRule,
	onCancel,
}) => {
	return (
		<Dialog open={open} onOpenChange={() => onCancel()}>
			<DialogSurface style={{ maxWidth: "560px" }}>
				<DialogTitle>
					<WarningRegular
						style={{ marginRight: "8px", color: "var(--colorStatusWarningForeground1)" }}
					/>
					Hide "{buttonLabel}"
				</DialogTitle>
				<DialogBody>
					<DialogContent>
						<MessageBar intent="warning">
							<MessageBarBody>
								<Text weight="semibold">⚠ HideCustomAction cannot be undone with a patch.</Text>{" "}
								Removing this element requires creating a new updated solution version.
							</MessageBarBody>
						</MessageBar>
						<Text style={{ display: "block", marginTop: "12px" }}>
							Consider using a DisplayRule with conflicting rules (e.g.{" "}
							<code>Mscrm.HideOnModern</code> + <code>Mscrm.ShowOnlyOnModern</code>) to effectively
							hide a button without permanently removing it from the definition.
						</Text>
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={onCancel}>
							Cancel
						</Button>
						<Button appearance="secondary" onClick={onConfirmDisplayRule}>
							Use DisplayRule (recommended — reversible)
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
