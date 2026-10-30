import React from "react";
import { Button } from "@fluentui/react-components";
import { AppDialog, DangerButton } from "@/components/shared/AppDialog";

// Replaces window.confirm(), which PPTB's Electron host doesn't support reliably (#18).

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
}) => (
	// Escape and the Cancel button (focused first) cancel.
	<AppDialog
		open={open}
		onOpenChange={(o) => !o && onCancel()}
		title={title}
		size="small"
		modalType="alert"
		actions={
			<>
				<Button appearance="secondary" onClick={onCancel}>
					{cancelLabel}
				</Button>
				{destructive ? (
					<DangerButton onClick={onConfirm}>{confirmLabel}</DangerButton>
				) : (
					<Button appearance="primary" onClick={onConfirm}>
						{confirmLabel}
					</Button>
				)}
			</>
		}
	>
		{children}
	</AppDialog>
);

export default ConfirmDialog;
