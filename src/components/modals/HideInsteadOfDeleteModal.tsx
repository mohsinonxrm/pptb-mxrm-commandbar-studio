import React from "react";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { findGroupControl } from "@/utils/ribbonMenu";
import { isOwnControl } from "@/utils/ribbonProvenance";
import type { RibbonButton } from "@/types/ribbon";
import { HideOobWarningModal } from "./HideOobWarningModal";

/** Why a button can't be deleted, in words (#17). */
function deleteBlockedReason(button: RibbonButton): string {
	if (button.origin === "oob") return "It's part of the out-of-the-box ribbon.";
	if (button.origin === "managed") {
		return button.solutionName
			? `It comes from the managed solution "${button.solutionName}".`
			: "It comes from a managed solution.";
	}
	if (isOwnControl(button)) return "It was loaded from another solution, or its menu holds items from one.";
	return "It comes from another solution.";
}

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
	if (!target || !button) return null;

	return (
		<HideOobWarningModal
			open
			buttonLabel={button.label}
			commandId={button.commandId}
			deleteBlockedReason={deleteBlockedReason(button)}
			onConfirmHide={() => {
				useRibbonStore.getState().hideOobButton(target.location, target.tabId, target.groupId, target.buttonId);
				announce("Button hidden");
				close();
			}}
			onConfirmDisplayRule={() => {
				if (useRibbonStore.getState().hideWithDisplayRules(button.commandId)) announce("Button hidden");
				close();
			}}
			onCancel={close}
		/>
	);
};

export default HideInsteadOfDeleteModal;
