import { copyControl } from "@/utils/ribbonMenu";
import type { RibbonButton } from "@/types/ribbon";

/**
 * A copy of one of your buttons to add to another group (#60, #194): the whole
 * button (icon, images, command, tooltips) as a new control with an id of its
 * own, no LocLabel tokens of the original, and a menu with ids of its own
 * (#27). It has no Sequence: the store places it after the group's last
 * button, where it's shown (#164).
 */
export function reusedButton(
	source: RibbonButton,
	loadedLabelIds: ReadonlySet<string> | undefined,
	stamp = `_copy_${Date.now()}`,
): Omit<RibbonButton, "sequence"> & { sequence?: number } {
	return {
		...copyControl(source, `${source.id}${stamp}`, loadedLabelIds),
		label: source.label ?? "New Button",
		kind: source.kind ?? "button",
		sequence: undefined,
		templateAlias: source.templateAlias ?? "o1",
		commandId: source.commandId ?? "",
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
	};
}
