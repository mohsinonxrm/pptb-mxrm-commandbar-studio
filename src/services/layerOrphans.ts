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
import { RECENT_PUBLISH_MINUTES, type RecentPublish } from "@/utils/recentPublish";

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
	/**
	 * The table was published from this window shortly before it was loaded
	 * (annotateRecentPublish): the ribbon may not have caught up yet.
	 * `published`: this very CustomAction was written by that publish.
	 */
	recentPublish?: { minutesAgo: number; published: boolean };
}

/** Control elements the ribbon parser models (xmlParser CONTROL_TAGS): anything else is never on the canvas. */
const CONTROL_TAGS = new Set([
	"Button",
	"FlyoutAnchor",
	"SplitButton",
	"TextBox",
	"ComboBox",
	"CheckBox",
]);
const CONTAINER_TAGS = new Set(["Tab", "Group"]);
const CHILDREN = /^(.+)\._children$/;

function childElements(el: Element | null | undefined): Element[] {
	return el ? Array.from(el.children) : [];
}

/**
 * An id or Location with `{!EntityLogicalName}` resolved. RetrieveEntityRibbon
 * resolves it, but the layer's rows and the tabs rebuilt from them
 * (ribbonService.addLayerTabs) keep the token (#84 review).
 */
export function resolveEntityToken(id: string, entityLogicalName: string | undefined): string {
	return entityLogicalName ? id.split("{!EntityLogicalName}").join(entityLogicalName) : id;
}

/**
 * The `<Controls>` / `<Groups>` collections of a ribbon a `._children`
 * Location can name, by id, with the tab they are on: each group's
 * `{group}.Controls`, each tab's `{tab}.Groups` and each menu section's
 * Controls (#27). Groups and tabs follow the platform's naming (the parser
 * doesn't keep their collections' ids; ribbonDiffMerge assumes the same).
 * With `entityLogicalName`, ids are keyed with the token resolved.
 */
export function ribbonPlaces(
	defs: Iterable<RibbonDefinition>,
	entityLogicalName?: string,
): Map<string, string> {
	const places = new Map<string, string>();
	const put = (id: string, tabId: string) =>
		places.set(resolveEntityToken(id, entityLogicalName), tabId);
	for (const def of defs)
		for (const tab of def.tabs) {
			put(`${tab.id}.Groups`, tab.id);
			for (const group of tab.groups) {
				put(`${group.id}.Controls`, tab.id);
				for (const control of groupControls(group))
					for (const section of control.menu?.sections ?? [])
						put(section.controlsId, tab.id);
			}
		}
	return places;
}

/** Every tab, group and control (menu items included) id of the ribbons, the token resolved. */
function loadedIds(defs: Iterable<RibbonDefinition>, entityLogicalName: string): Set<string> {
	const ids = new Set<string>();
	const add = (id: string) => ids.add(resolveEntityToken(id, entityLogicalName));
	for (const def of defs)
		for (const tab of def.tabs) {
			add(tab.id);
			for (const group of tab.groups) {
				add(group.id);
				for (const control of groupControls(group)) add(control.id);
			}
		}
	return ids;
}

/** Ids of every element inside `el`, itself included. */
function idsWithin(el: Element): string[] {
	return [el, ...Array.from(el.getElementsByTagName("*"))].flatMap(
		(d) => d.getAttribute("Id") ?? [],
	);
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
 * nothing hidden (listed under "Hidden by customizations" instead) or placed
 * inside something hidden — by this layer, or by `otherHides` (the
 * application layer's). What is placed inside another orphan is listed with
 * it, and deleted with it.
 *
 * For a table's layer only: an application-ribbon CustomAction can target
 * any table's locations, and only one table is loaded.
 */
export function findLayerOrphans(
	parts: RibbonDiffParts,
	ribbons: Iterable<RibbonDefinition>,
	entityLogicalName: string,
	options: {
		locLabels?: LocLabel[];
		languageCode?: number;
		/** Locations other layers hide (HideCustomAction Location): the application ribbon's. */
		otherHides?: string[];
	} = {},
): LayerOrphan[] {
	const { locLabels = [], languageCode = 1033 } = options;
	const defs = [...ribbons];
	const norm = (id: string) => resolveEntityToken(id, entityLogicalName);
	const loaded = loadedIds(defs, entityLogicalName);
	const places = ribbonPlaces(defs, entityLogicalName);
	const hidden = [
		...hideActionsOf(parts).map((h) => h.location),
		...(options.otherHides ?? []),
	].map(norm);
	const hiddenSet = new Set(hidden);
	// What is written inside an element the layer adds that is hidden (a group
	// of a hidden tab keeps its own id, e.g. Ribbon Workbench's).
	const insideHidden = new Set<string>();
	const docs = [...parts.customActions.values()].map(
		(xml) => new DOMParser().parseFromString(xml, "application/xml").documentElement,
	);
	for (const ca of docs) {
		if (ca.tagName !== "CustomAction") continue;
		for (const el of Array.from(ca.getElementsByTagName("*"))) {
			if (hiddenSet.has(norm(el.getAttribute("Id") ?? "")))
				idsWithin(el).forEach((id) => insideHidden.add(norm(id)));
		}
	}
	// Hidden, or inside something hidden: by the platform's naming (what is in
	// X has an id starting with `X.`), or written inside it.
	const underHide = (id: string) =>
		insideHidden.has(id) || hidden.some((h) => id === h || id.startsWith(`${h}.`));
	const tabCollections = new Set([
		"Mscrm.Tabs",
		`Mscrm.SubGrid.${entityLogicalName}.ContextualTabs`,
	]);

	const reasonFor = (
		element: string,
		parent: string,
	): { reason: LayerOrphanReason; why: string } => {
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
		// A platform location can't be misspelled by CBS's own writes, but
		// another solution (managed, or the application ribbon) can hide it,
		// and that isn't visible from here (#84 review).
		return {
			reason: "missing-location",
			why: /^(Mscrm|Microsoft)\./.test(parent)
				? `${parent} isn't in this table's ribbon as loaded: it is not shown — possibly hidden by another solution — or it was removed.`
				: `${parent} isn't in this table's ribbon as loaded: the group, tab or menu was removed or renamed, the Location is misspelled, or it is hidden by another solution.`,
		};
	};

	const labelOf = (el: Element) => {
		const token =
			el.getAttribute("LabelText") ??
			el.getAttribute("Title") ??
			el.getAttribute("Alt") ??
			"";
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

	for (const ca of docs) {
		if (ca.tagName !== "CustomAction") continue;
		const location = ca.getAttribute("Location") ?? "";
		if (!CHILDREN.test(location) || /\.Scaling\._children$/.test(location)) continue;
		const root = childElements(
			childElements(ca).find((c) => c.tagName === "CommandUIDefinition"),
		)[0];
		const rootId = root?.getAttribute("Id");
		if (
			!root ||
			!rootId ||
			!(CONTAINER_TAGS.has(root.tagName) || CONTROL_TAGS.has(root.tagName))
		)
			continue;
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
	const host = (c: Candidate) =>
		candidates.find((o) => o !== c && o.inside.has(c.parent) && !c.inside.has(o.parent));
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
		const merge = (into: string[], ids: string[]) =>
			ids.forEach((id) => into.includes(id) || into.push(id));
		merge(t.orphan.deleteControlIds, c.orphan.deleteControlIds);
		merge(t.orphan.deleteContainerIds, c.orphan.deleteContainerIds);
	}
	return listed.map((c) => c.orphan);
}

/**
 * Marks the orphans of a table published from this window less than
 * RECENT_PUBLISH_MINUTES before it was loaded (utils/recentPublish — the
 * ribbon can be the one from before a publish for 10+ minutes, #84 review):
 * what a recent publish wrote (`published`) is most likely just not loaded
 * yet, so it isn't offered for deletion; anything else gets a confirmation
 * first. Evaluated at load: the reason says when, relative to the load, and a
 * reload evaluates it again.
 */
export function annotateRecentPublish(
	orphans: LayerOrphan[],
	recent: RecentPublish | null,
	now = Date.now(),
): LayerOrphan[] {
	if (!recent) return orphans;
	const window = RECENT_PUBLISH_MINUTES * 60_000;
	const minutes = (at: number) => Math.max(0, Math.floor((now - at) / 60_000));
	return orphans.map((o) => {
		const at = recent.publishedAt[o.customActionId];
		if (at !== undefined && now - at < window) {
			const minutesAgo = minutes(at);
			return {
				...o,
				recentPublish: { minutesAgo, published: true },
				why: `Published from here ${minutesAgo} min before this table was loaded: the ribbon may not have caught up yet (it can lag 10 minutes or more). Reload the table later before deleting it. ${o.why}`,
			};
		}
		if (now - recent.at >= window) return o;
		const minutesAgo = minutes(recent.at);
		return {
			...o,
			recentPublish: { minutesAgo, published: false },
			why: `The table was published from here ${minutesAgo} min before this table was loaded, and the ribbon may not have caught up yet. ${o.why}`,
		};
	});
}
