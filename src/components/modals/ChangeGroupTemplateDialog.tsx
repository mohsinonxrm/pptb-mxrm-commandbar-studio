import React, { useState } from "react";
import { Button, Field, Select, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { AppDialog } from "@/components/shared/AppDialog";
import { PLATFORM_GROUP_TEMPLATES, normalizeGroupTemplate } from "@/services/xmlGenerator";

// Replaces window.prompt(), a no-op in PPTB's Electron host (#18). A free-text
// prompt also let any string through; this offers the templates CBS knows.

interface ChangeGroupTemplateDialogProps {
	open: boolean;
	/** The group's template as stored (`Flexible2` or `Mscrm.Templates.Flexible2`). */
	currentTemplate: string;
	/** Templates the workspace's RibbonDiffXml defines, offered after the platform ones. */
	customTemplateIds?: string[];
	/** The group is in the loaded ribbon: publishing doesn't re-template those yet. */
	loadedGroup?: boolean;
	/** Called with the fully-qualified template id; not called when it is unchanged. */
	onChange: (template: string) => void;
	onCancel: () => void;
}

const shortName = (id: string) => id.replace(/^Mscrm\.Templates\./, "");

export const ChangeGroupTemplateDialog: React.FC<ChangeGroupTemplateDialogProps> = ({
	open,
	currentTemplate,
	customTemplateIds = [],
	loadedGroup = false,
	onChange,
	onCancel,
}) => {
	const current = normalizeGroupTemplate(currentTemplate);
	const [value, setValue] = useState(current);
	// The group's own template stays selectable even when CBS doesn't know it.
	const options = [...new Set([...PLATFORM_GROUP_TEMPLATES, ...customTemplateIds, current])];

	const submit = () => {
		if (value === current) onCancel();
		else onChange(value);
	};

	return (
		<AppDialog
			open={open}
			onOpenChange={(o) => !o && onCancel()}
			size="small"
			title="Change group template"
			actions={
				<>
					<Button appearance="secondary" onClick={onCancel}>
						Cancel
					</Button>
					<Button appearance="primary" onClick={submit} disabled={value === current}>
						Change template
					</Button>
				</>
			}
		>
			<Field
				label="Group template"
				hint={
					"How the group's buttons shrink when the classic ribbon is narrow. Unified Interface ignores it."
				}
			>
				<Select value={value} onChange={(_, d) => setValue(d.value)}>
					{options.map((id) => (
						<option key={id} value={id}>
							{shortName(id)}
							{id === current ? " (current)" : ""}
						</option>
					))}
				</Select>
			</Field>
			{loadedGroup && (
				<MessageBar intent="warning" style={{ marginTop: "12px" }}>
					<MessageBarBody>
						This group was loaded from the environment. Publishing can&apos;t change an
						existing group&apos;s template yet (it&apos;s reported as not supported);
						groups you add publish theirs.
					</MessageBarBody>
				</MessageBar>
			)}
		</AppDialog>
	);
};

export default ChangeGroupTemplateDialog;
