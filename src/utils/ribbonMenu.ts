import { sourceForCopy } from "@/utils/copyButton";
import { isPlatformText } from "@/utils/displayLabel";
import type { RibbonButton, RibbonGroup, RibbonMenu, RibbonMenuSection } from "@/types/ribbon";

/**
 * Helpers for the menus of FlyoutAnchor / SplitButton controls (#27). Menu
 * items are RibbonButtons nested in `button.menu.sections[].controls`, so
 * anything that has to see every control of a group (provenance, command
 * usage, selection, publish) walks them with these.
 */

/** Kinds whose `<Menu>` CBS lets you edit. */
export const isMenuKind = (kind?: string) => kind === "flyout" || kind === "splitButton";

/**
 * The kinds a menu item can be (#154): RibbonWSS.xsd's MenuSectionControlsType
 * allows Button, FlyoutAnchor, ToggleButton, ColorPicker and InsertTable, and
 * CBS edits the first two. A check box, text box, combo box or split button in
 * a menu fails the import.
 */
export const MENU_ITEM_KINDS: readonly RibbonButton["kind"][] = ["button", "flyout"];

/**
 * Whether a `PopulateDynamically` value turns the menu dynamic (filled at runtime by its
 * PopulateQueryCommand, no static `<Menu>`): an xs:boolean, so "true" or "1" (#101).
 */
export const isDynamicMenuValue = (value?: string | null) =>
	["true", "1"].includes(value?.trim().toLowerCase() ?? "");

/** Every control inside a button's menu (depth first, in section / control order). */
export function menuItemsOf(button: RibbonButton): RibbonButton[] {
	const out: RibbonButton[] = [];
	for (const section of button.menu?.sections ?? [])
		for (const item of section.controls) {
			out.push(item);
			out.push(...menuItemsOf(item));
		}
	return out;
}

/** The given buttons followed (depth first) by their menu items. */
export function withMenuItems(buttons: RibbonButton[]): RibbonButton[] {
	return buttons.flatMap((b) => [b, ...menuItemsOf(b)]);
}

/** Every control of a group, including menu items. */
export function groupControls(group: RibbonGroup): RibbonButton[] {
	return withMenuItems(group.buttons);
}

/** Where a menu item lives: its flyout, section and position. */
export interface MenuItemPlace {
	parent: RibbonButton;
	section: RibbonMenuSection;
	index: number;
}

function findInMenus(buttons: RibbonButton[], id: string): MenuItemPlace | undefined {
	for (const parent of buttons) {
		for (const section of parent.menu?.sections ?? []) {
			const index = section.controls.findIndex((c) => c.id === id);
			if (index >= 0) return { parent, section, index };
			const nested = findInMenus(section.controls, id);
			if (nested) return nested;
		}
	}
	return undefined;
}

/** The flyout / section a menu item belongs to, or undefined for a top-level button. */
export function menuItemPlace(group: RibbonGroup, id: string): MenuItemPlace | undefined {
	if (group.buttons.some((b) => b.id === id)) return undefined;
	return findInMenus(group.buttons, id);
}

/** A control of the group by id: a top-level button first, then a menu item. */
export function findGroupControl(
	group: RibbonGroup | undefined,
	id: string | null | undefined,
): RibbonButton | undefined {
	if (!group || !id) return undefined;
	const top = group.buttons.find((b) => b.id === id);
	if (top) return top;
	const place = findInMenus(group.buttons, id);
	return place?.section.controls[place.index];
}

/** The top-level button of the group whose menu contains `id` (or the button `id` itself). */
export function rootControlOf(
	group: RibbonGroup | undefined,
	id: string | null | undefined,
): RibbonButton | undefined {
	if (!group || !id) return undefined;
	return group.buttons.find((b) => b.id === id || menuItemsOf(b).some((m) => m.id === id));
}

/** Removes a menu item from the group's menus. Returns true when it was found. */
export function removeMenuItem(group: RibbonGroup, id: string): boolean {
	const place = findInMenus(group.buttons, id);
	if (!place) return false;
	place.section.controls.splice(place.index, 1);
	return true;
}

/** Ids for a new menu of `buttonId`, following the platform's naming (`X.Menu`, `X.MenuSection…`). */
export function newMenu(buttonId: string): RibbonMenu {
	return { id: `${buttonId}.Menu`, sections: [newMenuSection(buttonId, [])] };
}

/** A new section for the menu of `buttonId`, with an id not used by `existing`. */
export function newMenuSection(
	buttonId: string,
	existing: RibbonMenuSection[],
	title?: string,
): RibbonMenuSection {
	let n = existing.length + 1;
	const used = new Set(existing.map((s) => s.id));
	while (used.has(`${buttonId}.MenuSection${n}`)) n++;
	const id = `${buttonId}.MenuSection${n}`;
	return {
		id,
		title,
		sequence: n * 10,
		displayMode: "Menu16",
		controlsId: `${id}.Controls`,
		controls: [],
	};
}

/**
 * A copy of `button`'s menu for a copy of the button with id `newId`: every
 * menu, section, Controls and item id is re-based on the new id (ids must be
 * unique in a ribbon), and items lose their loaded tokens (#11 review N5).
 */
export function copyMenu(
	menu: RibbonMenu | undefined,
	oldId: string,
	newId: string,
	loadedLabelIds?: ReadonlySet<string>,
): RibbonMenu | undefined {
	if (!menu) return undefined;
	// Ids that don't start with the original's (an out-of-the-box menu's items)
	// get `{newId}.{last segment}`, not `{newId}.{whole id}`: whole ids made item
	// ids of 150+ characters whose label ids broke PublishXml (#86).
	const used = new Set<string>();
	const rebased = new Map<string, string>();
	const rebase = (id: string) => {
		const known = rebased.get(id);
		if (known) return known;
		let next = id.startsWith(oldId)
			? `${newId}${id.slice(oldId.length)}`
			: `${newId}.${id.split(".").pop() || "Item"}`;
		for (let n = 2; used.has(next); n++) next = `${next.replace(/_\d+$/, "")}_${n}`;
		used.add(next);
		rebased.set(id, next);
		return next;
	};
	// Controls kept as raw XML (ToggleButton, Gallery, …) get new ids too (#62 review m3).
	const rebaseXml = (xml: string) =>
		xml.replace(
			/(\sId=")([^"]*)(")/g,
			(_, a: string, id: string, b: string) => `${a}${rebase(id)}${b}`,
		);
	return {
		...menu,
		id: rebase(menu.id),
		sections: menu.sections.map((s) => ({
			...s,
			id: rebase(s.id),
			controlsId: rebase(s.controlsId),
			controls: s.controls.map((c) => copyControl(c, rebase(c.id), loadedLabelIds)),
			...(s.rawControls
				? { rawControls: s.rawControls.map((r) => ({ ...r, xml: rebaseXml(r.xml) })) }
				: {}),
			...(s.rawContent !== undefined ? { rawContent: rebaseXml(s.rawContent) } : {}),
		})),
	};
}

/**
 * Every `Id` in `xml` re-based from `oldId` to `newId`, as copyMenu does for a
 * menu's raw controls — and an MRUSplitButton's `InitialItem`, which names one
 * of its menu items.
 */
function rebaseIds(xml: string, oldId: string, newId: string): string {
	return xml.replace(
		/(\s(?:Id|InitialItem)=")([^"]*)(")/g,
		(_, a: string, id: string, b: string) =>
			`${a}${id.startsWith(oldId) ? `${newId}${id.slice(oldId.length)}` : `${newId}.${id}`}${b}`,
	);
}

/** Attributes that make a menu populate itself at runtime; a copy keeps them (#62 review m6). */
const DYNAMIC_MENU_ATTRIBUTES = ["PopulateDynamically", "PopulateOnlyOnce", "PopulateQueryCommand"];

/**
 * A `$LocLabels:` text whose label the session doesn't have: another solution
 * defines it (often a managed one), so its text isn't known here (#137).
 */
export function isOtherSolutionLabel(
	token: string | undefined,
	loadedLabelIds?: ReadonlySet<string>,
): boolean {
	return (
		!!loadedLabelIds &&
		!!token?.startsWith("$LocLabels:") &&
		!loadedLabelIds.has(token.slice("$LocLabels:".length))
	);
}

/**
 * A copy of a control as a new, unmanaged control with id `newId` (menu included).
 * `loadedLabelIds`: the session's LocLabels, to tell another solution's labels (#137).
 */
export function copyControl(
	control: RibbonButton,
	newId: string,
	loadedLabelIds?: ReadonlySet<string>,
): RibbonButton {
	const dynamic = DYNAMIC_MENU_ATTRIBUTES.filter(
		(a) => control.source?.attributes[a] !== undefined,
	);
	// The copy must not reuse the original's tokens / attributes — except its
	// icon (#60), how its menu is populated (#62 review m6) and platform texts
	// (`$Resources:`), which aren't the original's to own: without them the copy
	// got new labels reading the raw resource key (#86). Another solution's
	// labels are kept the same way: their text isn't loaded, so a label of the
	// copy's own would read the label's id (#137).
	const icon = sourceForCopy(control.source);
	const attributes = {
		...(icon?.attributes ?? {}),
		...Object.fromEntries(dynamic.map((a) => [a, control.source!.attributes[a]])),
	};
	const platform = (token?: string) =>
		isPlatformText(token) || isOtherSolutionLabel(token, loadedLabelIds) ? token : undefined;
	const texts = {
		labelToken: platform(control.source?.labelToken),
		tooltipTitleToken: platform(control.source?.tooltipTitleToken),
		tooltipBodyToken: platform(control.source?.tooltipBodyToken),
	};
	const keptTexts = Object.fromEntries(Object.entries(texts).filter(([, v]) => v !== undefined));
	// A control kept as loaded (ToggleButton, DropDown, … — #42) is copied whole, with ids of its own.
	const xml = control.source?.xml ? rebaseIds(control.source.xml, control.id, newId) : undefined;
	return {
		...control,
		id: newId,
		source:
			Object.keys(attributes).length + Object.keys(keptTexts).length > 0 || xml
				? {
						...(icon?.modernImage ? { modernImage: icon.modernImage } : {}),
						...keptTexts,
						attributes,
						...(xml ? { xml } : {}),
					}
				: undefined,
		custom: true,
		oob: false,
		managed: false,
		origin: "unmanaged",
		solutionName: undefined,
		publisherName: undefined,
		menu: copyMenu(control.menu, control.id, newId, loadedLabelIds),
	};
}
