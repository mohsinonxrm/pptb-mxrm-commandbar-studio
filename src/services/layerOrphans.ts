/**
 * What the unmanaged layer adds that isn't on the canvas (#64).
 *
 * A CustomAction can add a control (or group, tab, menu item) at a Location
 * the merged ribbon never returns it at: the Charts tab, which
 * RetrieveEntityRibbon and Unified Interface don't show what is added to; a
 * group or tab that no longer exists; a misspelled Location; a control written
 * in a separate CustomAction that Dataverse dropped (#59). The publish keeps
 * every such CustomAction (the merge preserves the layer), so without this
 * list they would stay in the layer forever, invisible and impossible to
 * delete.
 */

import type { LocLabel, RibbonDefinition } from "@/types/ribbon";
import { hideActionsOf, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { groupControls } from "@/utils/ribbonMenu";

/** Why something the layer adds isn't on the canvas. */
export type LayerOrphanReason =
	/** Its location is on a tab Unified Interface doesn't show (the Charts tab, `AllEntities` tabs). */
	| "hidden-tab"
	/** Its location is loaded, but the ribbon doesn't return it there. */
	| "not-returned"
	/** Its location isn't in the table's ribbon. */
	| "missing-location";

export interface LayerOrphan {
	/** Id of the control, group or tab the layer adds. */
	id: string;
	/** Its element: Button, FlyoutAnchor, Group, Tab, … */
	element: string;
	/** Its label / title for display (`$LocLabels:` resolved). */
	label: string;
	/** Where it is placed, as a Location (`{Controls or Groups id}._children`). */
	location: string;
	/** The CustomAction that adds it. */
	customActionId: string;
	reason: LayerOrphanReason;
	/** Why it isn't on the canvas, for people. */
	why: string;
	/** Controls a delete removes: this one, or those the layer adds into it in CustomActions of their own. */
	deleteControlIds: string[];
	/** Tabs / groups a delete removes (this one, when it is a tab or group). */
	deleteContainerIds: string[];
}

/** Control elements the ribbon parser models (xmlParser CONTROL_TAGS): anything else is never on the canvas. */
const CONTROL_TAGS = new Set(["Button", "FlyoutAnchor", "SplitButton", "TextBox", "ComboBox", "CheckBox"]);
const CONTAINER_TAGS = new Set(["Tab", "Group"]);
const CHILDREN = /^(.+)\._children$/;

function childElements(el: Element | null | undefined): Element[] {
	return el ? Array.from(el.children) : [];
}

/**
 * The `<Controls>` / `<Groups>` collections of a ribbon a `._children`
 * Location can name, by id, with the tab they are on: each group's
 * `{group}.Controls`, each tab's `{tab}.Groups` and each menu section's
 * Controls (#27). Groups and tabs follow the platform's naming (the parser
 * doesn't keep their collections' ids; ribbonDiffMerge assumes the same).
 */
export function ribbonPlaces(defs: Iterable<RibbonDefinition>): Map<string, string> {
	const places = new Map<string, string>();
	for (const def of defs)
		for (const tab of def.tabs) {
			places.set(`${tab.id}.Groups`, tab.id);
			for (const group of tab.groups) {
				places.set(`${group.id}.Controls`, tab.id);
				for (const control of groupControls(group))
					for (const section of control.menu?.sections ?? []) places.set(section.controlsId, tab.id);
			}
		}
	return places;
}

/** Every tab, group and control (menu items included) id of the ribbons. */
function loadedIds(defs: Iterable<RibbonDefinition>): Set<string> {
	const ids = new Set<string>();
	for (const def of defs)
		for (const tab of def.tabs) {
			ids.add(tab.id);
			for (const group of tab.groups) {
				ids.add(group.id);
				for (const control of groupControls(group)) ids.add(control.id);
			}
		}
	return ids;
}

/** Ids of every element inside `el`, itself included. */
function idsWithin(el: Element): string[] {
	return [el, ...Array.from(el.getElementsByTagName("*"))].flatMap((d) => d.getAttribute("Id") ?? []);
}

interface Candidate {
	orphan: LayerOrphan;
	/** The collection it is placed in (`location` without `._children`). */
	parent: string;
	/** Ids inside its element (an orphan placed in one of them is listed and deleted with it). */
	inside: Set<string>;
}

/**
 * The tabs, groups and controls `parts` adds (`._children` CustomActions,
 * and the controls written inside the layer's own tabs / groups / flyouts)
 * that none of `ribbons` has (#64). Only elements the canvas can show are
 * considered (tabs, groups and the control kinds the parser models), and
 * nothing the layer hides (listed under "Hidden by customizations" instead)
 * or places inside something it hides. What is placed inside another orphan
 * is listed with it, and deleted with it.
 *
 * For a table's layer only: an application-ribbon CustomAction can target
 * any table's locations, and only one table is loaded.
 */
export function findLayerOrphans(
	parts: RibbonDiffParts,
	ribbons: Iterable<RibbonDefinition>,
	entityLogicalName: string,
	locLabels: LocLabel[] = [],
	languageCode = 1033,
): LayerOrphan[] {
	const defs = [...ribbons];
	const loaded = loadedIds(defs);
	const places = ribbonPlaces(defs);
	const norm = (id: string) => id.split("{!EntityLogicalName}").join(entityLogicalName);
	const hidden = hideActionsOf(parts).map((h) => norm(h.location));
	// Inside something the layer hides (by the platform's naming: what is in
	// X has an id starting with `X.`).
	const underHide = (id: string) => hidden.some((h) => id === h || id.startsWith(`${h}.`));
	const tabCollections = new Set(["Mscrm.Tabs", `Mscrm.SubGrid.${entityLogicalName}.ContextualTabs`]);

	const reasonFor = (element: string, parent: string): { reason: LayerOrphanReason; why: string } => {
		const tab = places.get(parent);
		if (tab && isHiddenOnUnifiedInterface(tab)) {
			return {
				reason: "hidden-tab",
				why: `It is on the tab ${tab}, which Unified Interface doesn't show; the ribbon doesn't return what is added there.`,
			};
		}
		if (tab || tabCollections.has(parent)) {
			return {
				reason: "not-returned",
				why:
					element === "Tab"
						? `The ribbon doesn't return this tab at ${parent}, so Command Bar Studio can't place it (it may still show in Unified Interface).`
						: `${parent} is on the canvas, but the ribbon doesn't return this ${element.toLowerCase()} there (for example a control added to a new group in a separate CustomAction).`,
			};
		}
		return {
			reason: "missing-location",
			why: `${parent} isn't in this table's ribbon: the group, tab or menu was removed or renamed, or the Location is misspelled.`,
		};
	};

	const labelOf = (el: Element) => {
		const token = el.getAttribute("LabelText") ?? el.getAttribute("Title") ?? el.getAttribute("Alt") ?? "";
		return resolveDisplayLabel(token, locLabels, languageCode) || (el.getAttribute("Id") ?? "");
	};

	const candidates: Candidate[] = [];
	const add = (el: Element, location: string, customActionId: string) => {
		const id = el.getAttribute("Id") ?? "";
		const parent = CHILDREN.exec(location)?.[1] ?? location;
		if (!id || loaded.has(norm(id)) || underHide(norm(id)) || underHide(norm(parent))) return;
		const container = CONTAINER_TAGS.has(el.tagName);
		candidates.push({
			orphan: {
				id,
				element: el.tagName,
				label: labelOf(el),
				location,
				customActionId,
				...reasonFor(el.tagName, norm(parent)),
				deleteControlIds: container ? [] : [id],
				deleteContainerIds: container ? [id] : [],
			},
			parent,
			inside: new Set(idsWithin(el)),
		});
	};

	for (const xml of parts.customActions.values()) {
		const ca = new DOMParser().parseFromString(xml, "application/xml").documentElement;
		if (ca.tagName !== "CustomAction") continue;
		const location = ca.getAttribute("Location") ?? "";
		if (!CHILDREN.test(location) || /\.Scaling\._children$/.test(location)) continue;
		const root = childElements(childElements(ca).find((c) => c.tagName === "CommandUIDefinition"))[0];
		const rootId = root?.getAttribute("Id");
		if (!root || !rootId || !(CONTAINER_TAGS.has(root.tagName) || CONTROL_TAGS.has(root.tagName))) continue;
		const caId = ca.getAttribute("Id") ?? "";
		if (!loaded.has(norm(rootId))) {
			add(root, location, caId);
			continue;
		}
		// On the canvas: so should be what is written inside it (a tab's groups,
		// a tab / group's controls, a flyout's menu items).
		for (const el of Array.from(root.getElementsByTagName("*"))) {
			const collection = el.parentElement;
			if (collection?.tagName !== "Controls" && collection?.tagName !== "Groups") continue;
			if (!CONTAINER_TAGS.has(el.tagName) && !CONTROL_TAGS.has(el.tagName)) continue;
			add(el, `${collection.getAttribute("Id") ?? ""}._children`, caId);
		}
	}

	// What is placed inside another orphan goes with it: listed once, and its
	// delete removes both (e.g. a button added in its own CustomAction to a
	// group whose tab is gone).
	const host = (c: Candidate) => candidates.find((o) => o !== c && o.inside.has(c.parent) && !c.inside.has(o.parent));
	const top = (c: Candidate) => {
		const seen = new Set<Candidate>([c]);
		let at = c;
		for (let next = host(at); next && !seen.has(next); next = host(at)) {
			seen.add(next);
			at = next;
		}
		return at;
	};
	const listed = candidates.filter((c) => !host(c));
	for (const c of candidates) {
		const t = top(c);
		if (t === c || !listed.includes(t)) continue;
		const merge = (into: string[], ids: string[]) => ids.forEach((id) => into.includes(id) || into.push(id));
		merge(t.orphan.deleteControlIds, c.orphan.deleteControlIds);
		merge(t.orphan.deleteContainerIds, c.orphan.deleteContainerIds);
	}
	return listed.map((c) => c.orphan);
}
