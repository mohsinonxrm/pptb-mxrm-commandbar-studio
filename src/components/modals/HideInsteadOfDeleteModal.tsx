import React from "react";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { findGroupControl } from "@/utils/ribbonMenu";
import { deleteBlockedReason } from "@/utils/ribbonProvenance";
import { HideOobWarningModal } from "./HideOobWarningModal";
import { useDisplayText } from "@/hooks/useDisplayText";

/**
 * Delete pressed on a button that isn't yours (#17): explains why it can't be
 * deleted and offers the same two hides as the canvas context menu.
 */
export const HideInsteadOfDeleteModal: React.FC = () => {
	const target = useUIStore((s) => s.hideInsteadOfDelete);
	const close = useUIStore((s) => s.closeHideInsteadOfDelete);
	const announce = useUIStore((s) => s.announce);
	const button = useRibbonStore((s) =>
		target
			? findGroupControl(
					s.ribbons[target.location].tabs
						.find((t) => t.id === target.tabId)
						?.groups.find((g) => g.id === target.groupId),
					target.buttonId,
				)
			: undefined,
	);
	const baseline = useRibbonStore((s) => (target ? s.baseline[target.location] : undefined));
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	if (!target || !button || !baseline) return null;

	return (
		<HideOobWarningModal
			open
			buttonLabel={captionOf(button.label, locLabels, undefined, button.source?.labelToken)}
			commandId={button.commandId}
			deleteBlockedReason={deleteBlockedReason(button, baseline)}
			onConfirmHide={() => {
				useRibbonStore
					.getState()
					.hideOobButton(target.location, target.tabId, target.groupId, target.buttonId);
				announce("Button hidden");
				close();
			}}
			onConfirmDisplayRule={() => {
				if (useRibbonStore.getState().hideWithDisplayRules(button.commandId))
					announce("Button hidden");
				close();
			}}
			onCancel={close}
		/>
	);
};

export default HideInsteadOfDeleteModal;
