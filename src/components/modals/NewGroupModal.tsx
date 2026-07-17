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
	Select,
	Text,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";

export const NewGroupModal: React.FC = () => {
	const newGroupOpen = useUIStore((s) => s.newGroupOpen);
	const closeNewGroup = useUIStore((s) => s.closeNewGroup);
	const createGroup = useRibbonStore((s) => s.createGroup);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const activeLocation = useSelectionStore((s) => s.location);
	const activeTabId = useSelectionStore((s) => s.tabId);
	const activeEntity = useSessionStore((s) => s.activeEntity);

	const [label, setLabel] = useState("New Group");
	const [template, setTemplate] = useState("Flexible2");

	const handleCreate = () => {
		if (!activeLocation || !activeTabId) return;

		const prefix = publisherPrefix || "new";
		const entityName = activeEntity?.logicalName ?? "global";
		const safeName = label.replace(/\s+/g, "");
		const id = `${prefix}.${entityName}.${safeName}.Group`;

		createGroup({
			location: activeLocation,
			tabId: activeTabId,
			group: {
				id,
				label,
				sequence: 50,
				template,
				buttons: [],
			},
		});

		setLabel("New Group");
		setTemplate("Flexible2");
		closeNewGroup();
	};

	return (
		<Dialog open={newGroupOpen} onOpenChange={() => closeNewGroup()}>
			<DialogSurface>
				<DialogTitle>New group</DialogTitle>
				<DialogBody>
					<DialogContent>
						<Field label="Label" required>
							<Input value={label} onChange={(_, d) => setLabel(d.value)} autoFocus />
						</Field>
						<Field label="Group template">
							<Select value={template} onChange={(_, d) => setTemplate(d.value)}>
								<option value="Flexible2">Flexible2 (recommended)</option>
								<option value="Flexible">Flexible</option>
								<option value="Layout2">Layout2</option>
								<option value="Layout3">Layout3</option>
								<option value="Layout4">Layout4</option>
							</Select>
						</Field>
						<Text size={200} style={{ display: "block", marginTop: "8px" }}>
							The group template defines how buttons scale when the ribbon is resized.
						</Text>
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={closeNewGroup}>
							Cancel
						</Button>
						<Button appearance="primary" onClick={handleCreate} disabled={!label.trim()}>
							Create group
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default NewGroupModal;
