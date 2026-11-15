import type { RibbonButton, RibbonButtonKind } from "@/types/ribbon";

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
 * TextBox, ComboBox and CheckBox joined them with #37: Unified Interface
 * doesn't draw them, so there's nothing to author.
 */
export const READ_ONLY_CONTROL_KINDS: ReadonlySet<RibbonButtonKind> = new Set<RibbonButtonKind>([
	"toggleButton",
	"label",
	"dropDown",
	"mruSplitButton",
	"spinner",
	"galleryButton",
	"textBox",
	"comboBox",
	"checkBox",
]);

/**
 * Controls Unified Interface doesn't draw (#37). They're valid RibbonXML and
 * import fine, but the command bar renders each as an empty, zero-size menu
 * item, so nobody can see or click it. Checked live on 2026-10-28 (Dataverse
 * 9.2.26092, Sales Hub, the contact main grid, with Command Checker): see #37.
 * MRUSplitButton and GalleryButton weren't part of that check.
 */
export const UNRENDERED_IN_UCI_KINDS: ReadonlySet<RibbonButtonKind> = new Set<RibbonButtonKind>([
	"label",
	"toggleButton",
	"dropDown",
	"checkBox",
	"spinner",
	"comboBox",
	"textBox",
]);

export function isUnrenderedInUci(kind: string | undefined): boolean {
	return !!kind && UNRENDERED_IN_UCI_KINDS.has(kind as RibbonButtonKind);
}

/** The element names of the controls Unified Interface doesn't draw (#37). */
export const UNRENDERED_IN_UCI_TAGS: ReadonlySet<string> = new Set(
	[...UNRENDERED_IN_UCI_KINDS].map((kind) => CONTROL_TAG_BY_KIND[kind]),
);

/** What a "Not rendered in Unified Interface" mark means (#37). */
export const UNRENDERED_IN_UCI_NOTE =
	"Unified Interface doesn't draw this kind of control: it shows an empty, zero-size item, so users can't see or click it.";

export function isReadOnlyControlKind(kind: string | undefined): boolean {
	return !!kind && READ_ONLY_CONTROL_KINDS.has(kind as RibbonButtonKind);
}

/** Attributes of a control (RibbonWSS.xsd) that name a command. */
export const COMMAND_ATTRIBUTES = [
	"Command",
	"QueryCommand",
	"MenuCommand",
	"PopulateQueryCommand",
	"CommandMenuOpen",
	"CommandMenuClose",
	"CommandPreview",
	"CommandPreviewRevert",
	"CommandRevert",
] as const;

const COMMAND_ATTRIBUTE_VALUE = new RegExp(`\\s(?:${COMMAND_ATTRIBUTES.join("|")})="([^"]+)"`, "g");

/**
 * Every command a control uses: its `Command`, and for a control written
 * verbatim (#42) the other commands its XML names — a ToggleButton's
 * QueryCommand, a DropDown's CommandMenuOpen, its menu items' commands.
 */
export function controlCommandIds(button: RibbonButton): string[] {
	const out = new Set<string>(button.commandId ? [button.commandId] : []);
	// A dynamic flyout / split button's populate command (#133): a copy carries it.
	const populate = button.source?.attributes["PopulateQueryCommand"];
	if (populate && (button.kind === "flyout" || button.kind === "splitButton")) out.add(populate);
	if (isReadOnlyControlKind(button.kind))
		for (const m of button.source?.xml?.matchAll(COMMAND_ATTRIBUTE_VALUE) ?? []) out.add(m[1]);
	return [...out];
}

/**
 * The XML of a verbatim control with every command attribute naming `oldId`
 * pointing at `newId` instead (a command rename, #42).
 */
export function renameCommandInXml(xml: string, oldId: string, newId: string): string {
	const escape = (v: string) =>
		v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
	return xml.replace(COMMAND_ATTRIBUTE_VALUE, (match, value: string) =>
		value === oldId || value === escape(oldId)
			? match.replace(`"${value}"`, `"${escape(newId)}"`)
			: match,
	);
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
