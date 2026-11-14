import React, { useState } from "react";
import { Button, Field, Input } from "@fluentui/react-components";
import { AppDialog } from "@/components/shared/AppDialog";

// Replaces window.prompt(), a no-op in PPTB's Electron host (#18).

interface RenameGroupDialogProps {
	open: boolean;
	/** The group's title as the canvas shows it — resolved, never a `$LocLabels:` token. */
	initialLabel: string;
	/** Called with the trimmed new title; not called when it is unchanged. */
	onRename: (label: string) => void;
	onCancel: () => void;
	/** What is renamed: a group, or a tab from the Structure tree (#194). */
	noun?: "group" | "tab";
}

export const RenameGroupDialog: React.FC<RenameGroupDialogProps> = ({
	open,
	initialLabel,
	onRename,
	onCancel,
	noun = "group",
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
		<AppDialog
			open={open}
			onOpenChange={(o) => !o && onCancel()}
			size="small"
			title={`Rename ${noun}`}
			actions={
				<>
					<Button appearance="secondary" onClick={onCancel}>
						Cancel
					</Button>
					<Button appearance="primary" onClick={submit} disabled={!trimmed}>
						Rename
					</Button>
				</>
			}
		>
			<Field
				label={noun === "tab" ? "Tab title" : "Group title"}
				required
				validationState={trimmed ? "none" : "error"}
				validationMessage={trimmed ? undefined : `Enter a title for the ${noun}.`}
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
					data-autofocus
				/>
			</Field>
		</AppDialog>
	);
};

export default RenameGroupDialog;
