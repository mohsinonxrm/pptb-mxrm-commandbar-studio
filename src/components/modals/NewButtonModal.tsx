import React, { useState } from "react";
import { Button, Field, Input, Select } from "@fluentui/react-components";
import { AppDialog } from "@/components/shared/AppDialog";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { RibbonButton } from "@/types/ribbon";
import { groupControls } from "@/utils/ribbonMenu";
import { newButtonIds } from "@/utils/idGenerator";

export const NewButtonModal: React.FC = () => {
	const newButtonGroupId = useUIStore((s) => s.newButtonGroupId);
	const closeNewButton = useUIStore((s) => s.closeNewButton);
	const createButton = useRibbonStore((s) => s.createButton);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const batch = useRibbonStore((s) => s.batch);
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
			activeSolution?.publisherPrefix?.trim() || sessionPublisherPrefix?.trim() || "new";
		const entityName = activeEntity?.logicalName ?? "global";
		// De-duplicate against everything already loaded (menu items included).
		const ribbons = useRibbonStore.getState().ribbons;
		const commands = useRibbonStore.getState().commands;
		const existingIds = new Set<string>(commands.map((c) => c.id));
		for (const r of Object.values(ribbons))
			for (const t of r.tabs)
				for (const g of t.groups) for (const b of groupControls(g)) existingIds.add(b.id);
		const { id, commandId } = newButtonIds(
			prefix,
			entityName,
			activeLocation,
			label,
			existingIds,
		);

		// Resolve the tab from the target group rather than trusting the
		// selection: after switching location the selected tab id can still
		// belong to the previous location, and createButton then silently
		// dropped the new button.
		const targetTabId =
			ribbons[activeLocation].tabs.find((t) =>
				t.groups.some((g) => g.id === newButtonGroupId),
			)?.id ?? selectedTabId;
		if (!ribbons[activeLocation].tabs.some((t) => t.id === targetTabId)) {
			useRuntimeLogStore
				.getState()
				.logError(
					"canvas",
					`Could not add the button: group ${newButtonGroupId} was not found.`,
				);
			closeNewButton();
			return;
		}

		// The button and its command are one undo step (#34).
		batch(() => {
			createButton({
				location: activeLocation,
				tabId: targetTabId,
				groupId: newButtonGroupId,
				button: {
					id,
					label,
					kind,
					// No sequence: the store places it after the group's last button.
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
		});

		// Select the newly-created button so it's immediately visible in the
		// canvas / properties pane and the user can confirm it landed.
		selectButtonInContext(activeLocation, targetTabId, newButtonGroupId, id);

		setLabel("New Button");
		setKind("button");
		closeNewButton();
	};

	return (
		<AppDialog
			open={isOpen}
			onOpenChange={(o) => !o && closeNewButton()}
			size="small"
			title="New button"
			actions={
				<>
					<Button appearance="secondary" onClick={closeNewButton}>
						Cancel
					</Button>
					<Button appearance="primary" onClick={handleCreate} disabled={!label.trim()}>
						Create button
					</Button>
				</>
			}
		>
			<Field
				label="Label"
				required
				hint="A command is created with it; edit it in the command editor."
			>
				<Input value={label} onChange={(_, d) => setLabel(d.value)} data-autofocus />
			</Field>
			<Field label="Kind">
				<Select value={kind} onChange={(_, d) => setKind(d.value as RibbonButton["kind"])}>
					<option value="button">Button</option>
					<option value="flyout">Flyout</option>
					<option value="splitButton">Split button</option>
				</Select>
			</Field>
		</AppDialog>
	);
};

export default NewButtonModal;
