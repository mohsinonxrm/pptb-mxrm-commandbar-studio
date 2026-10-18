import React from "react";
import {
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions,
	Button,
	makeStyles,
	tokens,
} from "@fluentui/react-components";

// Replaces window.confirm(), which PPTB's Electron host doesn't support reliably (#18).

const useStyles = makeStyles({
	destructive: {
		backgroundColor: tokens.colorStatusDangerBackground3,
		color: tokens.colorNeutralForegroundOnBrand,
		":hover": {
			backgroundColor: tokens.colorStatusDangerBackground3Hover,
			color: tokens.colorNeutralForegroundOnBrand,
		},
		":hover:active": {
			backgroundColor: tokens.colorStatusDangerBackground3Pressed,
			color: tokens.colorNeutralForegroundOnBrand,
		},
	},
});

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	children: React.ReactNode;
	/** The confirm button's text — say what it does ("Delete group"), not "OK". */
	confirmLabel: string;
	cancelLabel?: string;
	/** Red confirm button for actions that delete or discard something. */
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	title,
	children,
	confirmLabel,
	cancelLabel = "Cancel",
	destructive = false,
	onConfirm,
	onCancel,
}) => {
	const styles = useStyles();
	return (
		// Escape and the Cancel button (focused first) cancel.
		<Dialog modalType="alert" open={open} onOpenChange={(_, d) => !d.open && onCancel()}>
			<DialogSurface style={{ maxWidth: "480px" }}>
				<DialogBody>
					<DialogTitle>{title}</DialogTitle>
					<DialogContent>{children}</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={onCancel}>
							{cancelLabel}
						</Button>
						<Button
							appearance="primary"
							className={destructive ? styles.destructive : undefined}
							onClick={onConfirm}
						>
							{confirmLabel}
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default ConfirmDialog;
