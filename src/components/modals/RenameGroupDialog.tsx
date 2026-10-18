import React, { useState } from "react";
import {
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions,
	Button,
	Field,
	Input,
} from "@fluentui/react-components";

// Replaces window.prompt(), a no-op in PPTB's Electron host (#18).

interface RenameGroupDialogProps {
	open: boolean;
	/** The group's title as the canvas shows it — resolved, never a `$LocLabels:` token. */
	initialLabel: string;
	/** Called with the trimmed new title; not called when it is unchanged. */
	onRename: (label: string) => void;
	onCancel: () => void;
}

export const RenameGroupDialog: React.FC<RenameGroupDialogProps> = ({
	open,
	initialLabel,
	onRename,
	onCancel,
}) => {
	const [value, setValue] = useState(initialLabel);
	const trimmed = value.trim();

	const submit = () => {
		if (!trimmed) return;
		// Unchanged text must not replace a `$LocLabels:` / `$Resources:` title with literal text.
		if (trimmed === initialLabel.trim()) onCancel();
		else onRename(trimmed);
	};

	return (
		<Dialog open={open} onOpenChange={(_, d) => !d.open && onCancel()}>
			<DialogSurface style={{ maxWidth: "440px" }}>
				<DialogBody>
					<DialogTitle>Rename group</DialogTitle>
					<DialogContent>
						<Field
							label="Group title"
							required
							validationState={trimmed ? "none" : "error"}
							validationMessage={trimmed ? undefined : "Enter a title for the group."}
						>
							<Input
								value={value}
								onChange={(_, d) => setValue(d.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										submit();
									}
								}}
								autoFocus
							/>
						</Field>
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={onCancel}>
							Cancel
						</Button>
						<Button appearance="primary" onClick={submit} disabled={!trimmed}>
							Rename
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default RenameGroupDialog;
