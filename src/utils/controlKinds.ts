import type { RibbonButtonKind } from "@/types/ribbon";

/**
 * The control elements of a group's `<Controls>` (RibbonWSS.xsd ControlsType)
 * and the RibbonButton kind each one is parsed as.
 */
export const CONTROL_TAG_BY_KIND: Record<RibbonButtonKind, string> = {
	button: "Button",
	flyout: "FlyoutAnchor",
	splitButton: "SplitButton",
	textBox: "TextBox",
	comboBox: "ComboBox",
	checkBox: "CheckBox",
	toggleButton: "ToggleButton",
	label: "Label",
	dropDown: "DropDown",
	mruSplitButton: "MRUSplitButton",
	spinner: "Spinner",
	galleryButton: "GalleryButton",
};

export const KIND_BY_CONTROL_TAG: Record<string, RibbonButtonKind> = Object.fromEntries(
	Object.entries(CONTROL_TAG_BY_KIND).map(([kind, tag]) => [tag, kind as RibbonButtonKind]),
);

/**
 * Kinds CBS shows but doesn't edit (#42): they are drawn on the canvas, can be
 * hidden / unhidden, and moved or deleted when your customizations add them;
 * their element is kept as loaded (`source.xml`) and written back verbatim.
 */
export const READ_ONLY_CONTROL_KINDS: ReadonlySet<RibbonButtonKind> = new Set<RibbonButtonKind>([
	"toggleButton",
	"label",
	"dropDown",
	"mruSplitButton",
	"spinner",
	"galleryButton",
]);

export function isReadOnlyControlKind(kind: string | undefined): boolean {
	return !!kind && READ_ONLY_CONTROL_KINDS.has(kind as RibbonButtonKind);
}

/** Display name of a control kind. */
export const CONTROL_KIND_LABELS: Record<RibbonButtonKind, string> = {
	button: "Button",
	flyout: "Flyout",
	splitButton: "Split button",
	textBox: "Text box",
	comboBox: "Combo box",
	checkBox: "Check box",
	toggleButton: "Toggle button",
	label: "Label",
	dropDown: "Drop-down",
	mruSplitButton: "MRU split button",
	spinner: "Spinner",
	galleryButton: "Gallery button",
};
