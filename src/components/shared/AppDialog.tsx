import React from "react";
import {
	Button,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	DialogTrigger,
	makeStyles,
	mergeClasses,
	tokens,
	type ButtonProps,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";

/**
 * The one dialog shell every modal uses (#190, #187): DialogSurface ›
 * DialogBody › DialogTitle / DialogContent / DialogActions, three widths, and
 * only the content scrolls so the actions never leave the surface.
 */

export type AppDialogSize = "small" | "medium" | "large";

const APP_DIALOG_WIDTH: Record<AppDialogSize, number> = {
	small: 440,
	medium: 600,
	large: 960,
};

const useStyles = makeStyles({
	surface: {
		width: "calc(100vw - 32px)",
		maxHeight: "calc(100vh - 48px)",
		display: "flex",
		flexDirection: "column",
	},
	small: { maxWidth: `${APP_DIALOG_WIDTH.small}px` },
	medium: { maxWidth: `${APP_DIALOG_WIDTH.medium}px` },
	large: { maxWidth: `${APP_DIALOG_WIDTH.large}px` },
	body: {
		maxHeight: "calc(100vh - 96px)",
		minHeight: 0,
	},
	content: {
		minHeight: 0,
		overflowY: "auto",
	},
	danger: {
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

export interface AppDialogProps {
	open: boolean;
	/** Called with `false` when the dialog asks to close (Escape, the close button, the backdrop). */
	onOpenChange: (open: boolean) => void;
	/** Sentence case, says what the dialog does ("Import RibbonDiffXml"). */
	title: React.ReactNode;
	size?: AppDialogSize;
	/** `alert` blocks Escape-to-close on the backdrop and hides the close button. */
	modalType?: "modal" | "alert" | "non-modal";
	/** Right-aligned actions: secondary first, then the primary that says what it does. */
	actions?: React.ReactNode;
	/** A left-aligned extra action, such as "View XML". */
	startActions?: React.ReactNode;
	children: React.ReactNode;
	contentClassName?: string;
}

export const AppDialog: React.FC<AppDialogProps> = ({
	open,
	onOpenChange,
	title,
	size = "medium",
	modalType = "modal",
	actions,
	startActions,
	children,
	contentClassName,
}) => {
	const styles = useStyles();
	const showClose = modalType !== "alert";
	return (
		<Dialog modalType={modalType} open={open} onOpenChange={(_, d) => onOpenChange(d.open)}>
			<DialogSurface className={mergeClasses(styles.surface, styles[size])}>
				<DialogBody className={styles.body}>
					<DialogTitle
						action={
							showClose ? (
								<DialogTrigger action="close">
									<Button
										appearance="subtle"
										aria-label="Close"
										icon={<DismissRegular />}
									/>
								</DialogTrigger>
							) : undefined
						}
					>
						{title}
					</DialogTitle>
					<DialogContent className={mergeClasses(styles.content, contentClassName)}>
						{children}
					</DialogContent>
					{(actions || startActions) && (
						<>
							{startActions && (
								<DialogActions position="start">{startActions}</DialogActions>
							)}
							<DialogActions position="end">{actions}</DialogActions>
						</>
					)}
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export interface DangerButtonProps {
	children: React.ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	icon?: ButtonProps["icon"];
	className?: string;
}

/** A primary button styled for actions that delete or discard something. */
export const DangerButton: React.FC<DangerButtonProps> = ({ className, children, ...props }) => {
	const styles = useStyles();
	return (
		<Button {...props} appearance="primary" className={mergeClasses(styles.danger, className)}>
			{children}
		</Button>
	);
};

export default AppDialog;
