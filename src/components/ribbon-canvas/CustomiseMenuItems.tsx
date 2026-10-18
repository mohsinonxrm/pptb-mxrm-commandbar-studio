import { MenuItem } from "@fluentui/react-components";
import { CodeRegular, CopyAddRegular } from "@fluentui/react-icons";
import { canCustomiseButton, useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useCommandProvenance } from "@/hooks/useCommandProvenance";
import type { RibbonButton, RibbonLocation } from "@/types/ribbon";

interface CustomiseMenuItemsProps {
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	button: RibbonButton;
	/** Called after an item ran (closes the menu). */
	onDone: () => void;
}

/**
 * Ribbon Workbench's "Customise Button" and "Customise Command" (#26, #31)
 * for a button that isn't yours, in the canvas context menus.
 */
export function CustomiseMenuItems({
	location,
	tabId,
	groupId,
	button,
	onDone,
}: CustomiseMenuItemsProps) {
	const customiseButton = useRibbonStore((s) => s.customiseButton);
	const customiseCommand = useRibbonStore((s) => s.customiseCommand);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const sessionPrefix = useSessionStore((s) => s.publisherPrefix);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const command = useCommandProvenance(button.commandId || undefined);

	return (
		<>
			{button.origin !== "unmanaged" && (
				<MenuItem
					icon={<CopyAddRegular />}
					disabled={!canCustomiseButton(location, tabId, button)}
					onClick={() => {
						const prefix =
							activeSolution?.publisherPrefix?.trim() ||
							sessionPrefix?.trim() ||
							"new";
						const id = customiseButton(location, tabId, groupId, button.id, prefix);
						if (id) selectButtonInContext(location, tabId, groupId, id);
						onDone();
					}}
				>
					Customise button (copy, hide original)
				</MenuItem>
			)}
			{command?.provenance === "oob" && (
				<MenuItem
					icon={<CodeRegular />}
					onClick={() => {
						if (customiseCommand(button.commandId)) openCommandEditor(button.commandId);
						onDone();
					}}
				>
					Customise command
				</MenuItem>
			)}
		</>
	);
}

export default CustomiseMenuItems;
