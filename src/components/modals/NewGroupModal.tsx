import React, { useState } from "react";
import { Button, Field, Input, Select } from "@fluentui/react-components";
import { AppDialog } from "@/components/shared/AppDialog";
import { PLATFORM_GROUP_TEMPLATES } from "@/services/xmlGenerator";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";

// The platform's templates, as Change template offers them (#187).
const DEFAULT_TEMPLATE = "Mscrm.Templates.Flexible2";

export const NewGroupModal: React.FC = () => {
	const newGroupOpen = useUIStore((s) => s.newGroupOpen);
	const closeNewGroup = useUIStore((s) => s.closeNewGroup);
	const createGroup = useRibbonStore((s) => s.createGroup);
	const activeLocation = useSelectionStore((s) => s.location);
	const activeTabId = useSelectionStore((s) => s.tabId);

	const [label, setLabel] = useState("New Group");
	const [template, setTemplate] = useState(DEFAULT_TEMPLATE);

	const handleCreate = () => {
		if (!activeLocation || !activeTabId) return;

		// The store gives the group a unique {prefix}.{table}.{Location}.{Label}.Group
		// id and a sequence after the tab's last group.
		createGroup({
			location: activeLocation,
			tabId: activeTabId,
			group: {
				label,
				template,
				buttons: [],
			},
		});

		setLabel("New Group");
		setTemplate(DEFAULT_TEMPLATE);
		closeNewGroup();
	};

	return (
		<AppDialog
			open={newGroupOpen}
			onOpenChange={(o) => !o && closeNewGroup()}
			size="small"
			title="New group"
			actions={
				<>
					<Button appearance="secondary" onClick={closeNewGroup}>
						Cancel
					</Button>
					<Button appearance="primary" onClick={handleCreate} disabled={!label.trim()}>
						Create group
					</Button>
				</>
			}
		>
			<Field label="Label" required>
				<Input value={label} onChange={(_, d) => setLabel(d.value)} autoFocus />
			</Field>
			<Field
				label="Group template"
				hint={
					"How the group's buttons shrink when the classic ribbon is narrow. Unified Interface ignores it."
				}
			>
				<Select value={template} onChange={(_, d) => setTemplate(d.value)}>
					{PLATFORM_GROUP_TEMPLATES.map((id) => (
						<option key={id} value={id}>
							{id.replace(/^Mscrm\.Templates\./, "")}
							{id === DEFAULT_TEMPLATE ? " (recommended)" : ""}
						</option>
					))}
				</Select>
			</Field>
		</AppDialog>
	);
};

export default NewGroupModal;
