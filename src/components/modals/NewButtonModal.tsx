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
import type { RibbonButton } from "@/types/ribbon";

export const NewButtonModal: React.FC = () => {
	const newButtonGroupId = useUIStore((s) => s.newButtonGroupId);
	const closeNewButton = useUIStore((s) => s.closeNewButton);
	const createButton = useRibbonStore((s) => s.createButton);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const sessionPublisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const activeLocation = useSelectionStore((s) => s.location);
	const selectedTabId = useSelectionStore((s) => s.tabId);
	const activeEntity = useSessionStore((s) => s.activeEntity);

	const isOpen = newButtonGroupId !== null;

	const [label, setLabel] = useState("New Button");
	const [kind, setKind] = useState<RibbonButton["kind"]>("button");

	const handleCreate = () => {
		if (!newButtonGroupId || !activeLocation) return;

		// Use the active solution's publisher prefix so generated IDs match
		// the solution we're publishing into. Fall back to the session-store
		// value (legacy), then to a sane default. The previous "new" hardcode
		// produced IDs like `new.account.MyButton.Button` that imported under
		// the wrong publisher in Dataverse.
		const prefix =
			activeSolution?.publisherPrefix?.trim() ||
			sessionPublisherPrefix?.trim() ||
			"new";
		const entityName = activeEntity?.logicalName ?? "global";
		const safeName = label.replace(/\s+/g, "");
		const id = `${prefix}.${entityName}.${safeName}.Button`;
		const commandId = `${prefix}.${entityName}.${safeName}.Command`;

		createButton({
			location: activeLocation,
			tabId: selectedTabId,
			groupId: newButtonGroupId,
			button: {
				id,
				label,
				kind,
				sequence: 50,
				templateAlias: "o1",
				commandId,
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
			},
		});

		// Also create a CommandDefinition for this button. Without it, the
		// published RibbonDiffXml references a command that doesn't exist
		// anywhere in the solution, and Unified Interface silently refuses
		// to render the button (this was the "publish succeeds but button
		// doesn't appear in CRM" bug). The command starts empty; the user
		// fills in actions / enable / display rules via the Command Editor
		// or the properties pane.
		upsertCommand({
			id: commandId,
			enableRules: [],
			displayRules: [],
			actions: [],
		});

		// Select the newly-created button so it's immediately visible in the
		// canvas / properties pane and the user can confirm it landed.
		selectButtonInContext(activeLocation, selectedTabId, newButtonGroupId, id);

		setLabel("New Button");
		setKind("button");
		closeNewButton();
	};

	return (
		<Dialog open={isOpen} onOpenChange={() => closeNewButton()}>
			<DialogSurface>
				<DialogTitle>New button</DialogTitle>
				<DialogBody>
					<DialogContent>
						<Field label="Label" required>
							<Input value={label} onChange={(_, d) => setLabel(d.value)} autoFocus />
						</Field>
						<Field label="Kind">
							<Select value={kind} onChange={(_, d) => setKind(d.value as RibbonButton["kind"])}>
								<option value="button">Button</option>
								<option value="flyout">Flyout anchor</option>
								<option value="splitButton">Split button</option>
							</Select>
						</Field>
						<Text size={200} style={{ display: "block", marginTop: "8px" }}>
							A command definition will be created automatically. You can edit it in the Command
							Editor.
						</Text>
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={closeNewButton}>
							Cancel
						</Button>
						<Button appearance="primary" onClick={handleCreate} disabled={!label.trim()}>
							Create button
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default NewButtonModal;
