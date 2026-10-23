/**
 * Read–merge–write support for RibbonDiffXml.
 *
 * Importing a table's `<RibbonDiffXml>` REPLACES that table's entire unmanaged
 * ribbon customization (verified live, #11). So a publish must send the
 * complete diff: everything already in the unmanaged layer, plus CBS's edits.
 *
 * The unmanaged layer is read from the ribbon component tables (`ribbondiffs`,
 * `ribboncommands`, `ribbonrules`), whose rows carry each element's XML
 * verbatim. CBS's per-location deltas are parsed and upserted into that set by
 * element Id, then the whole thing is serialized once per table.
 */

import { canonicalXml } from "@/services/ribbonXmlCanonical";
import type { RibbonDefinition, ScaleStep } from "@/types/ribbon";
import { COMMAND_ATTRIBUTES } from "@/utils/controlKinds";
import {
	resequenceLayerScaling,
	type LayerScaleStep,
	type ScaleKind,
	type ScalingChange,
} from "@/services/scalingSequence";

/** One XML element kept as its serialized string, keyed by its identity. */
type ElementMap = Map<string, string>;

export interface RibbonDiffParts {
	/** `CustomAction` (by Id) and `HideCustomAction` (by HideActionId). */
	customActions: ElementMap;
	/** `RibbonTemplates` children (GroupTemplate etc.), by Id. */
	templates: ElementMap;
	commandDefinitions: ElementMap;
	/** `TabDisplayRule`, by TabCommand. */
	tabDisplayRules: ElementMap;
	displayRules: ElementMap;
	enableRules: ElementMap;
	locLabels: ElementMap;
}

export function emptyRibbonDiffParts(): RibbonDiffParts {
	return {
		customActions: new Map(),
		templates: new Map(),
		commandDefinitions: new Map(),
		tabDisplayRules: new Map(),
		displayRules: new Map(),
		enableRules: new Map(),
		locLabels: new Map(),
	};
}

/** Rows of the unmanaged ribbon component tables for one table (or the application ribbon). */
export interface RibbonTableRows {
	/** `ribbondiffs`: difftype 0 Standard (CustomAction/HideCustomAction), 1 Tab, 2 Layout Template, 3 Localized Label. */
	diffs: Array<{ diffid?: string | null; difftype?: number | null; rdx?: string | null }>;
	/** `ribboncommands` */
	commands: Array<{ command?: string | null; commanddefinition?: string | null }>;
	/** `ribbonrules`: ruletype 1 Enable, 2 Trim (display), 3 Tab Selection (tab display). */
	rules: Array<{ ruleid?: string | null; ruletype?: number | null; ruledefinition?: string | null }>;
}

const serializer = () => new XMLSerializer();

function parseXml(xml: string): Document {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const err = doc.querySelector("parsererror");
	if (err) throw new Error(`Invalid RibbonDiffXml: ${err.textContent ?? "parse error"}`);
	return doc;
}

function directChildren(parent: Element | null | undefined, tag: string): Element[] {
	if (!parent) return [];
	return Array.from(parent.children).filter((c) => c.tagName === tag);
}

function firstChild(parent: Element | null | undefined, tag: string): Element | undefined {
	return directChildren(parent, tag)[0];
}

function customActionKey(el: Element): string | null {
	if (el.tagName === "HideCustomAction") {
		const id = el.getAttribute("HideActionId");
		return id ? `hide:${id}` : null;
	}
	const id = el.getAttribute("Id");
	return id ? `ca:${id}` : null;
}

/** Parses a RibbonDiffXml document/fragment into keyed parts. */
export function parseRibbonDiffParts(xml: string): RibbonDiffParts {
	const parts = emptyRibbonDiffParts();
	const doc = parseXml(xml);
	const root = doc.documentElement;
	if (root.tagName !== "RibbonDiffXml") {
		throw new Error(`Expected <RibbonDiffXml> root, got <${root.tagName}>`);
	}
	const s = serializer();

	for (const el of Array.from(firstChild(root, "CustomActions")?.children ?? [])) {
		const key = customActionKey(el);
		if (key) parts.customActions.set(key, s.serializeToString(el));
	}

	const ribbonTemplates = firstChild(firstChild(root, "Templates"), "RibbonTemplates");
	for (const el of Array.from(ribbonTemplates?.children ?? [])) {
		const id = el.getAttribute("Id");
		if (id) parts.templates.set(id, s.serializeToString(el));
	}

	for (const el of directChildren(firstChild(root, "CommandDefinitions"), "CommandDefinition")) {
		const id = el.getAttribute("Id");
		if (id) parts.commandDefinitions.set(id, s.serializeToString(el));
	}

	const ruleDefs = firstChild(root, "RuleDefinitions");
	for (const el of directChildren(firstChild(ruleDefs, "TabDisplayRules"), "TabDisplayRule")) {
		const id = el.getAttribute("TabCommand");
		if (id) parts.tabDisplayRules.set(id, s.serializeToString(el));
	}
	for (const el of directChildren(firstChild(ruleDefs, "DisplayRules"), "DisplayRule")) {
		const id = el.getAttribute("Id");
		if (id) parts.displayRules.set(id, s.serializeToString(el));
	}
	for (const el of directChildren(firstChild(ruleDefs, "EnableRules"), "EnableRule")) {
		const id = el.getAttribute("Id");
		if (id) parts.enableRules.set(id, s.serializeToString(el));
	}

	for (const el of directChildren(firstChild(root, "LocLabels"), "LocLabel")) {
		const id = el.getAttribute("Id");
		if (id) parts.locLabels.set(id, s.serializeToString(el));
	}

	return parts;
}

/** Wraps a single-element XML string and returns its root element. */
function elementOf(xml: string): Element {
	return parseXml(xml).documentElement;
}

/**
 * Builds parts from the unmanaged ribbon component table rows. Each row's XML
 * is kept verbatim (it is exactly what Dataverse stored from the last import).
 */
export function partsFromRibbonTables(rows: RibbonTableRows): RibbonDiffParts {
	const parts = emptyRibbonDiffParts();

	for (const row of rows.diffs) {
		const rdx = row.rdx?.trim();
		if (!rdx) continue;
		const el = elementOf(rdx);
		switch (row.difftype) {
			case 3: {
				const id = el.getAttribute("Id") ?? row.diffid;
				if (id) parts.locLabels.set(id, rdx);
				break;
			}
			case 2: {
				const id = el.getAttribute("Id") ?? row.diffid;
				if (id) parts.templates.set(id, rdx);
				break;
			}
			default: {
				// 0 Standard and 1 Tab are both CustomAction / HideCustomAction elements.
				const key = customActionKey(el);
				if (key) parts.customActions.set(key, rdx);
			}
		}
	}

	for (const row of rows.commands) {
		const xml = row.commanddefinition?.trim();
		const id = row.command ?? (xml ? elementOf(xml).getAttribute("Id") : null);
		if (xml && id) parts.commandDefinitions.set(id, xml);
	}

	for (const row of rows.rules) {
		const xml = row.ruledefinition?.trim();
		if (!xml) continue;
		const el = elementOf(xml);
		if (row.ruletype === 3 || el.tagName === "TabDisplayRule") {
			const id = el.getAttribute("TabCommand") ?? row.ruleid;
			if (id) parts.tabDisplayRules.set(id, xml);
		} else if (row.ruletype === 1 || el.tagName === "EnableRule") {
			const id = el.getAttribute("Id") ?? row.ruleid;
			if (id) parts.enableRules.set(id, xml);
		} else {
			const id = el.getAttribute("Id") ?? row.ruleid;
			if (id) parts.displayRules.set(id, xml);
		}
	}

	return parts;
}

/**
 * Upserts every element of `delta` into a copy of `base` (delta wins on Id
 * collisions). Elements only present in `base` are preserved — this is what
 * keeps existing customizations (Ribbon Workbench, earlier CBS publishes, other
 * locations) alive across a publish.
 */
export function mergeRibbonDiffParts(base: RibbonDiffParts, delta: RibbonDiffParts): RibbonDiffParts {
	const merged = emptyRibbonDiffParts();
	for (const key of Object.keys(merged) as (keyof RibbonDiffParts)[]) {
		for (const [id, xml] of base[key]) merged[key].set(id, xml);
		for (const [id, xml] of delta[key]) merged[key].set(id, xml);
	}
	return merged;
}

/** Serializes parts as a complete RibbonDiffXml in schema order. */
export function serializeRibbonDiffParts(parts: RibbonDiffParts): string {
	const join = (m: ElementMap, indent: string) =>
		Array.from(m.values())
			.map((x) => `${indent}${x}`)
			.join("\n");
	return `<RibbonDiffXml>
  <CustomActions>
${join(parts.customActions, "    ")}
  </CustomActions>
  <Templates>
    <RibbonTemplates Id="Mscrm.Templates">
${join(parts.templates, "      ")}
    </RibbonTemplates>
  </Templates>
  <CommandDefinitions>
${join(parts.commandDefinitions, "    ")}
  </CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules>
${join(parts.tabDisplayRules, "      ")}
    </TabDisplayRules>
    <DisplayRules>
${join(parts.displayRules, "      ")}
    </DisplayRules>
    <EnableRules>
${join(parts.enableRules, "      ")}
    </EnableRules>
  </RuleDefinitions>
  <LocLabels>
${join(parts.locLabels, "    ")}
  </LocLabels>
</RibbonDiffXml>`;
}

/**
 * `JavaScriptFunction`s calling a platform library. Dataverse rewrites these on
 * import (e.g. `/_static/_common/scripts/CommandBarActions.js` +
 * `Mscrm.CommandBarActions.*` is stored as `$webresource:Main_system_library.js`
 * + `XrmCore.Commands.*`), so their library, function and parameters can't be
 * compared — only that an action is there.
 */
function isPlatformAction(el: Element): boolean {
	if (el.tagName !== "JavaScriptFunction") return false;
	const library = (el.getAttribute("Library") ?? "").trim();
	const fn = el.getAttribute("FunctionName") ?? "";
	return (
		library.startsWith("/_") ||
		/^\$webresource:Main_system_library\.js$/i.test(library) ||
		/^(XrmCore|Mscrm)\./.test(fn)
	);
}

/**
 * The part of an element's XML that survives an import unchanged: canonical
 * form (attribute order, whitespace, boolean spelling, command containers),
 * LocLabel titles in language order, and platform-library actions reduced to
 * their presence.
 */
export function stableElementXml(part: keyof RibbonDiffParts, xml: string): string {
	const el = elementOf(xml);
	if (part === "commandDefinitions") {
		for (const fn of Array.from(el.getElementsByTagName("JavaScriptFunction"))) {
			if (!isPlatformAction(fn)) continue;
			fn.parentNode?.replaceChild(el.ownerDocument.createElement("PlatformJavaScriptFunction"), fn);
		}
	}
	if (part === "locLabels") {
		for (const titles of Array.from(el.getElementsByTagName("Titles"))) {
			const sorted = Array.from(titles.children).sort(
				(a, b) => Number(a.getAttribute("languagecode")) - Number(b.getAttribute("languagecode")),
			);
			for (const t of sorted) titles.appendChild(t);
		}
	}
	return canonicalXml(el, { normalizeCommands: part === "commandDefinitions" });
}

const sameStable = (part: keyof RibbonDiffParts, a: string, b: string) => {
	try {
		return stableElementXml(part, a) === stableElementXml(part, b);
	} catch {
		return a === b;
	}
};

const titlesOf = (xml: string) =>
	Array.from(elementOf(xml).getElementsByTagName("Title")).map(
		(t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description") ?? ""}`,
	);

/**
 * True when `actual` holds what was imported as `expected`. A LocLabel only
 * needs a subset of its titles: an organisation without a language pack may
 * not keep that language's title.
 */
function landed(part: keyof RibbonDiffParts, expected: string, actual: string): boolean {
	if (part !== "locLabels") return sameStable(part, expected, actual);
	try {
		const want = new Set(titlesOf(expected));
		const got = titlesOf(actual);
		return got.length > 0 && got.every((t) => want.has(t));
	} catch {
		return expected === actual;
	}
}

/** `part:id` of every element of `after` that is new or whose content differs from `before`. */
export function changedRibbonDiffKeys(before: RibbonDiffParts, after: RibbonDiffParts): string[] {
	const out: string[] = [];
	for (const part of Object.keys(after) as (keyof RibbonDiffParts)[]) {
		for (const [id, xml] of after[part]) {
			const prev = before[part].get(id);
			if (prev === undefined || !sameStable(part, prev, xml)) out.push(`${part}:${id}`);
		}
	}
	return out;
}

export interface RibbonDiffComparison {
	/** Expected elements the actual layer doesn't have (`part:id`). */
	missing: string[];
	/** Elements of the actual layer that weren't expected. */
	unexpected: string[];
	/** Elements listed in `contentKeys` present on both sides whose content differs. */
	differing: string[];
}

/**
 * Element-level comparison of two layers, used to verify a publish (#46).
 * Every element is compared by identity (`part:id`); the elements in
 * `contentKeys` (what the publish changed) are also compared by content, in
 * the form that survives an import (stableElementXml) — so a rule, command or
 * label edit that never landed is reported, not "verified".
 */
export function compareRibbonDiffParts(
	expected: RibbonDiffParts,
	actual: RibbonDiffParts,
	options: { contentKeys?: Iterable<string> } = {},
): RibbonDiffComparison {
	const missing: string[] = [];
	const unexpected: string[] = [];
	const differing: string[] = [];
	const content = new Set(options.contentKeys ?? []);
	for (const part of Object.keys(expected) as (keyof RibbonDiffParts)[]) {
		for (const [id, xml] of expected[part]) {
			const got = actual[part].get(id);
			if (got === undefined) missing.push(`${part}:${id}`);
			else if (content.has(`${part}:${id}`) && !landed(part, xml, got)) differing.push(`${part}:${id}`);
		}
		for (const id of actual[part].keys()) if (!expected[part].has(id)) unexpected.push(`${part}:${id}`);
	}
	return { missing, unexpected, differing };
}

export function countRibbonDiffParts(parts: RibbonDiffParts): number {
	return Object.values(parts).reduce((n, m: ElementMap) => n + m.size, 0);
}

// ---------------------------------------------------------------------------
// Scope-aware merge (edits in place, removals, guards)
// ---------------------------------------------------------------------------

/** The control element (Button, FlyoutAnchor, …) defined by a CustomAction, if any. */
function controlOf(customActionXml: string): Element | null {
	const el = elementOf(customActionXml);
	if (el.tagName !== "CustomAction") return null;
	return firstChild(el, "CommandUIDefinition")?.firstElementChild ?? null;
}

function isChildrenLocation(location: string | null): boolean {
	return !!location && location.endsWith("._children");
}

/** A control the layer moves (Location / Sequence of the CustomAction that adds it). */
export interface MovedControl {
	id: string;
	/** The group the control now belongs to. */
	groupId: string;
	sequence: number;
	/** For a menu item (#27): the `<Controls>` of the menu section it now belongs to. */
	controlsId?: string;
}

export interface ScopeMergeOptions {
	/** Commands the user edited this session — only these may replace the layer's copy. */
	editedCommandIds?: Iterable<string>;
	/** Enable rules the user edited this session. */
	editedEnableRuleIds?: Iterable<string>;
	/** Display rules the user edited this session (ids may repeat an enable rule's). */
	editedDisplayRuleIds?: Iterable<string>;
	/** Buttons deleted this session: their own CustomAction is removed from the layer. */
	deletedControlIds?: Iterable<string>;
	/** Buttons un-hidden this session: HideCustomActions targeting them are removed. */
	unhiddenControlIds?: Iterable<string>;
	/**
	 * Commands still used by a button in the edited ribbon. A deleted control's
	 * command (and its now-unused rules) is removed from the layer unless it is
	 * listed here or another control in the layer still uses it.
	 */
	retainedCommandIds?: Iterable<string>;
	/**
	 * Tabs and groups deleted this session (#48). The layer's CustomActions that
	 * add them are removed together with everything placed inside them (child
	 * CustomActions, overrides / hides / scaling of their controls) and the
	 * LocLabels, commands and tab display rules nothing else uses any more. A
	 * group nested inside a tab CustomAction is removed from that tab in place.
	 */
	deletedContainerIds?: Iterable<string>;
	/** Controls the layer adds that were moved or re-sequenced this session (#26). */
	movedControls?: Iterable<MovedControl>;
	/** TabDisplayRules (by TabCommand) the session removed from a tab the layer adds (#49). */
	removedTabCommands?: Iterable<string>;
	/**
	 * Commands the user uncustomised (#31): the layer's CommandDefinition is
	 * removed (the out-of-the-box / other solution's command applies again),
	 * together with the layer's rules that only it used.
	 */
	uncustomisedCommandIds?: Iterable<string>;
	/**
	 * Rules still used by a command of the edited ribbon: never removed with an
	 * uncustomised command, even when only that command references them in the
	 * layer (e.g. a customised `Mscrm.*` rule other out-of-the-box commands use).
	 */
	retainedEnableRuleIds?: Iterable<string>;
	retainedDisplayRuleIds?: Iterable<string>;
}

/** Elements of a `<Menu>` that are containers, not controls. */
const MENU_CONTAINER_TAGS = new Set(["Menu", "MenuSection", "Controls"]);

/**
 * The controls inside a control's `<Menu>` (#27): the items of a FlyoutAnchor
 * / SplitButton written inline in the same CustomAction (how CBS and Ribbon
 * Workbench write a new flyout), nested flyouts' items included.
 */
function menuControlsWithin(ctrl: Element): Element[] {
	if (ctrl.tagName === "Tab" || ctrl.tagName === "Group") return [];
	return Array.from(ctrl.getElementsByTagName("*")).filter(
		(d) => !MENU_CONTAINER_TAGS.has(d.tagName) && !!d.getAttribute("Id") && d.parentElement?.tagName === "Controls",
	);
}

const isContainer = (el: Element | null | undefined): el is Element => el?.tagName === "Tab" || el?.tagName === "Group";

const escapeAttr = (v: string) =>
	v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The controls written inside a Tab / Group element: the children of its
 * `<Controls>` collections (a new tab or group carries the controls created
 * with it inline — #58, #59).
 */
function nestedControls(container: Element): Element[] {
	return Array.from(container.getElementsByTagName("Controls")).flatMap((c) => Array.from(c.children));
}

/** The element with this Id inside `root` (including `root`). */
function findById(root: Element, id: string): Element | null {
	if (root.getAttribute("Id") === id) return root;
	for (const d of Array.from(root.getElementsByTagName("*"))) if (d.getAttribute("Id") === id) return d;
	return null;
}

/**
 * The controls written inside a CustomAction's root element besides the root
 * itself: a tab / group's controls (#58, #59 — menu items of flyouts in them
 * included) or a flyout / split button's menu items (#27).
 */
function innerControls(root: Element): Element[] {
	return isContainer(root) ? nestedControls(root) : menuControlsWithin(root);
}

/**
 * Ids of the controls the layer itself adds: the control of a
 * `CustomAction Location="…._children"`, the controls written inside a tab
 * or group such a CustomAction adds, and the menu items written inline in
 * such a control (#27).
 */
export function ownControlIds(parts: RibbonDiffParts): Set<string> {
	const out = new Set<string>();
	for (const xml of parts.customActions.values()) {
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction" || !isChildrenLocation(ca.getAttribute("Location"))) continue;
		const ctrl = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
		const id = ctrl?.getAttribute("Id");
		if (id) out.add(id);
		if (ctrl) {
			for (const c of innerControls(ctrl)) {
				const cid = c.getAttribute("Id");
				if (cid) out.add(cid);
			}
		}
	}
	return out;
}

/**
 * Moves every `X.Controls._children` / `X.Groups._children` /
 * `X.Scaling._children` CustomAction whose X is a group or tab ANOTHER
 * CustomAction of the layer adds into that container, in place (#59).
 *
 * Dataverse files each CustomAction under a tab. For a container the layer
 * adds, a separate child CustomAction was filed under the concrete entity tab
 * while the container is filed under the `{!EntityLogicalName}` template tab,
 * so Dataverse dropped the child (the "empty new group" of #59). Written
 * inside the container, it is part of the same element.
 *
 * `touched` (CustomAction keys) limits this to what the session writes: a
 * child is folded only when it or its container's CustomAction is new or
 * changed, so another tool's rows are never rewritten by an unrelated publish
 * (#66 review m5); a container one child is folded into takes the rest of
 * its separate children too. Without `touched` everything is folded (reading).
 */
export function foldIntoOwnContainers(customActions: ElementMap, touched?: ReadonlySet<string>): ElementMap {
	const out = new Map(customActions);
	const s = serializer();
	// A container something is folded into is touched too, so the rest of its
	// separate children follow (that repairs layers written before #59).
	const hot = touched ? new Set(touched) : undefined;
	for (let folded = true; folded; ) {
		folded = false;
		// Containers (tab / group id) → key of the CustomAction that adds them.
		const host = new Map<string, string>();
		for (const [key, xml] of out) {
			const ca = elementOf(xml);
			if (ca.tagName !== "CustomAction" || !isChildrenLocation(ca.getAttribute("Location"))) continue;
			const root = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
			if (!isContainer(root)) continue;
			for (const el of [root, ...Array.from(root.getElementsByTagName("Group"))]) {
				const id = el.getAttribute("Id");
				if (id && !host.has(id)) host.set(id, key);
			}
		}
		for (const [key, xml] of out) {
			const ca = elementOf(xml);
			if (ca.tagName !== "CustomAction") continue;
			const m = /^(.+)\.(Controls|Groups|Scaling)\._children$/.exec(ca.getAttribute("Location") ?? "");
			const child = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
			const hostKey = m ? host.get(m[1]) : undefined;
			if (!m || !child || !hostKey || hostKey === key) continue;
			if (hot && !hot.has(key) && !hot.has(hostKey)) continue;
			const [, parentId, slot] = m;
			const hostCa = elementOf(out.get(hostKey)!);
			const container = findById(hostCa, parentId);
			if (!container || container.tagName !== (slot === "Controls" ? "Group" : "Tab")) continue;
			const doc = hostCa.ownerDocument;
			let slotEl = firstChild(container, slot);
			if (!slotEl) {
				slotEl = doc.createElement(slot);
				slotEl.setAttribute("Id", `${parentId}.${slot}`);
				// RibbonCore.xsd TabType: Scaling comes before Groups.
				const groups = slot === "Scaling" ? firstChild(container, "Groups") : undefined;
				container.insertBefore(slotEl, groups ?? null);
			}
			const imported = doc.importNode(child, true) as Element;
			const seq = ca.getAttribute("Sequence");
			if (!imported.getAttribute("Sequence") && seq) imported.setAttribute("Sequence", seq);
			// Scaling is applied in document order: every MaxSize before any Scale (#40).
			const firstScale = imported.tagName === "MaxSize" ? firstChild(slotEl, "Scale") : undefined;
			slotEl.insertBefore(imported, firstScale ?? null);
			out.set(hostKey, s.serializeToString(hostCa));
			hot?.add(hostKey);
			out.delete(key);
			folded = true;
			break;
		}
	}
	return out;
}

/**
 * The element with `Id="id"` in a CustomAction's CommandUIDefinition: the
 * control itself, a menu item (#27) or a control written inside a tab / group (#59).
 */
function controlIn(ca: Element, id: string): Element | null {
	const ctrl = firstChild(ca, "CommandUIDefinition")?.firstElementChild ?? null;
	if (!ctrl) return null;
	if (ctrl.getAttribute("Id") === id) return ctrl;
	return innerControls(ctrl).find((d) => d.getAttribute("Id") === id) ?? null;
}

/**
 * Ids of the tabs and groups the layer itself adds: the `Tab` / `Group` of a
 * `…._children` CustomAction, plus the groups declared inline inside such a tab
 * (that is how CBS and Ribbon Workbench write a new tab).
 */
export function ownContainerIds(parts: RibbonDiffParts): Set<string> {
	const out = new Set<string>();
	for (const xml of parts.customActions.values()) {
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction" || !isChildrenLocation(ca.getAttribute("Location"))) continue;
		const ctrl = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
		if (!ctrl || (ctrl.tagName !== "Tab" && ctrl.tagName !== "Group")) continue;
		const id = ctrl.getAttribute("Id");
		if (id) out.add(id);
		for (const g of Array.from(ctrl.getElementsByTagName("Group"))) {
			const gid = g.getAttribute("Id");
			if (gid) out.add(gid);
		}
	}
	return out;
}

/** A `HideCustomAction` in the layer: `location` is the id of the hidden control / group / tab. */
export interface LayerHide {
	hideActionId: string;
	location: string;
}

/** Every `HideCustomAction` of the layer (#47: the merged ribbon has them applied, so the hidden controls are invisible). */
export function hideActionsOf(parts: RibbonDiffParts): LayerHide[] {
	const out: LayerHide[] = [];
	for (const xml of parts.customActions.values()) {
		const el = elementOf(xml);
		if (el.tagName !== "HideCustomAction") continue;
		const location = el.getAttribute("Location");
		if (location) out.push({ hideActionId: el.getAttribute("HideActionId") ?? "", location });
	}
	return out;
}

/** Ids of every element with an `Id` inside `el` (including `el`). */
function idsWithin(el: Element): string[] {
	const out: string[] = [];
	const own = el.getAttribute("Id");
	if (own) out.push(own);
	for (const d of Array.from(el.getElementsByTagName("*"))) {
		const id = d.getAttribute("Id");
		if (id) out.push(id);
	}
	return out;
}

/** Commands used inside `el` (including `el`): `Command`, and QueryCommand, CommandMenuOpen, … (#42). */
function commandsWithin(el: Element): string[] {
	const out: string[] = [];
	for (const d of [el, ...Array.from(el.getElementsByTagName("*"))])
		for (const name of COMMAND_ATTRIBUTES) {
			const c = d.getAttribute(name);
			if (c) out.push(c);
		}
	return out;
}

/**
 * Commands the layer's own CustomActions use — controls / tabs it adds and
 * overrides of other controls (#31). A command used there that isn't a
 * platform (`Mscrm.` / `Microsoft.`) command may exist nowhere but in the
 * layer, so removing the layer's definition ("Uncustomise") could leave those
 * controls without a command.
 */
export function layerCommandRefs(parts: RibbonDiffParts): Set<string> {
	const out = new Set<string>();
	for (const xml of parts.customActions.values()) {
		const el = elementOf(xml);
		if (el.tagName !== "CustomAction") continue;
		for (const c of commandsWithin(el)) out.add(c);
	}
	return out;
}

/** Platform command / rule ids: they always have a definition below any layer. */
export function isPlatformRibbonId(id: string): boolean {
	return /^(Mscrm|Microsoft)\./.test(id);
}

/**
 * Whether the layer's CommandDefinition can be removed with "Uncustomise"
 * (#31): another definition must apply once it's gone — a platform command,
 * or one no control of the layer uses (so the controls using it come from
 * other solutions, which define it themselves).
 */
export function canUncustomiseCommand(commandId: string, layerCommandRefIds: Iterable<string>): boolean {
	if (isPlatformRibbonId(commandId)) return true;
	for (const id of layerCommandRefIds) if (id === commandId) return false;
	return true;
}

/** The container a `…._children` location adds to (`X.Controls._children` → X). */
function childrenParent(location: string | null): string | null {
	const m = location?.match(/^(.+)\.(?:Controls|Groups)\._children$/);
	return m ? m[1] : null;
}

/**
 * Generated controls are always self-closing; when the control being replaced
 * has children (a FlyoutAnchor / SplitButton `<Menu>`), keep them so an
 * attribute edit doesn't delete the menu.
 */
function withChildrenOf(replacement: Element, original: Element | null): Element {
	if (!original || replacement.children.length > 0 || original.children.length === 0) return replacement;
	for (const child of Array.from(original.children)) {
		replacement.appendChild(replacement.ownerDocument.importNode(child, true));
	}
	return replacement;
}

/** Replaces every attribute of `to` with those of `from`. */
function copyAttributes(from: Element, to: Element): void {
	for (const a of Array.from(to.attributes)) to.removeAttribute(a.name);
	for (const a of Array.from(from.attributes)) to.setAttribute(a.name, a.value);
}

/**
 * A control your layer adds that the delta writes again in full because it
 * was moved to another location (#57). Its attributes come from the delta but
 * its `<Menu>` stays the layer's: the delta's copy is built from the merged
 * ribbon, where RetrieveEntityRibbon has already removed hidden items, so
 * replacing the menu would delete them (#62 review M1 / M2). The delta's
 * sections and items update the layer's in place (attributes only) or are
 * added where they belong; deleted items are removed later, with their
 * commands and labels. Items for which `elsewhere(id)` holds are left out
 * (the layer adds them with CustomActions of their own).
 */
function mergeMovedMenu(original: Element, imported: Element, elsewhere: (id: string) => boolean): Element {
	const layerMenu = directChildren(original, "Menu")[0];
	const deltaMenu = directChildren(imported, "Menu")[0];
	if (!layerMenu) {
		for (const item of menuControlsWithin(imported)) {
			if (elsewhere(item.getAttribute("Id") ?? "")) item.parentNode?.removeChild(item);
		}
		return withChildrenOf(imported, original);
	}
	const menu = layerMenu.cloneNode(true) as Element;
	const find = (tag: string | null, id: string) =>
		[menu, ...Array.from(menu.getElementsByTagName("*"))].find(
			(e) => e.getAttribute("Id") === id && (tag ? e.tagName === tag : e.parentElement?.tagName === "Controls"),
		);
	if (deltaMenu) {
		for (const section of Array.from(deltaMenu.getElementsByTagName("MenuSection"))) {
			const existing = find("MenuSection", section.getAttribute("Id") ?? "");
			if (existing) {
				copyAttributes(section, existing);
				continue;
			}
			const parentMenu = find("Menu", section.parentElement?.getAttribute("Id") ?? "");
			if (!parentMenu) continue; // inside a new nested flyout: added with it below
			const copy = section.cloneNode(true) as Element;
			for (const item of Array.from(copy.getElementsByTagName("*"))) {
				if (item.parentElement?.tagName === "Controls" && elsewhere(item.getAttribute("Id") ?? "")) {
					item.parentNode?.removeChild(item);
				}
			}
			parentMenu.appendChild(copy);
		}
		for (const item of menuControlsWithin(imported)) {
			const id = item.getAttribute("Id") ?? "";
			if (elsewhere(id)) continue;
			const existing = find(null, id);
			if (existing) {
				copyAttributes(item, existing);
				continue;
			}
			const controls = find("Controls", item.parentElement?.getAttribute("Id") ?? "");
			if (controls) controls.appendChild(item.cloneNode(true));
		}
	}
	for (const m of directChildren(imported, "Menu")) imported.removeChild(m);
	imported.appendChild(menu);
	return imported;
}

const LOC_LABEL_REF = /\$LocLabels:([^"'\s]+)/g;
/** Rule references of a CommandDefinition, wherever they sit (also an `<EnableRule>` inside `<DisplayRules>`). */
/** Commands any of the CustomActions references, by any command attribute (#108). */
function commandsReferenced(customActions: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const xml of customActions) for (const id of commandsWithin(elementOf(xml))) out.add(id);
	return out;
}

/** `$LocLabels:` labels any attribute of the CustomActions uses, exactly (#108). */
function labelsReferenced(customActions: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const xml of customActions) {
		const root = elementOf(xml);
		for (const el of [root, ...Array.from(root.getElementsByTagName("*"))])
			for (const attr of Array.from(el.attributes))
				if (attr.value.startsWith("$LocLabels:")) out.add(attr.value.slice("$LocLabels:".length));
	}
	return out;
}

/** Rules the commands reference: `<EnableRule Id>` / `<DisplayRule Id>`, wherever `Id` sits (#108). */
function rulesReferenced(commandDefinitions: Iterable<string>): Record<"EnableRule" | "DisplayRule", Set<string>> {
	const out = { EnableRule: new Set<string>(), DisplayRule: new Set<string>() };
	for (const xml of commandDefinitions) {
		const el = elementOf(xml);
		for (const kind of ["EnableRule", "DisplayRule"] as const)
			for (const ref of Array.from(el.getElementsByTagName(kind))) {
				const id = ref.getAttribute("Id");
				if (id) out[kind].add(id);
			}
	}
	return out;
}

/**
 * Merges this session's delta into the existing unmanaged layer:
 *  - an "override" CustomAction (Location = control id) for a control the layer
 *    itself adds (Location = `…._children`) REPLACES that control in place,
 *    keeping the layer's CustomAction id/location — two CustomActions defining
 *    the same control made the result depend on row order (#11 review D2);
 *  - commands / rules the user did not edit keep the layer's verbatim XML (the
 *    parser's copy is lossy — CustomRule parameters etc.);
 *  - a generated LocLabel whose text is just its own id never replaces a real one;
 *  - deleted controls lose their CustomAction; un-hidden controls lose their hide.
 */
export function mergeScopeChanges(
	existing: RibbonDiffParts,
	delta: RibbonDiffParts,
	options: ScopeMergeOptions = {},
): RibbonDiffParts {
	const editedCommands = new Set(options.editedCommandIds ?? []);
	const editedEnableRules = new Set(options.editedEnableRuleIds ?? []);
	const editedDisplayRules = new Set(options.editedDisplayRuleIds ?? []);
	const deleted = new Set(options.deletedControlIds ?? []);
	const unhidden = new Set(options.unhiddenControlIds ?? []);
	const retainedCommands = new Set(options.retainedCommandIds ?? []);
	const s = serializer();

	const merged = mergeRibbonDiffParts(existing, emptyRibbonDiffParts());

	// Index the layer's own controls (control id → CustomAction key; menu items
	// written inline map to their flyout's CustomAction, #27) and its existing
	// overrides of other controls (Location → key).
	const ownControl = new Map<string, string>();
	const overrideAt = new Map<string, string>();
	const ownInline: [string, string][] = [];
	for (const [key, xml] of existing.customActions) {
		const ctrl = controlOf(xml);
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction") continue;
		const location = ca.getAttribute("Location");
		if (ctrl?.getAttribute("Id") && isChildrenLocation(location)) {
			ownControl.set(ctrl.getAttribute("Id")!, key);
			// Menu items written inline (#27) and controls written inside a tab /
			// group the layer adds (#59).
			for (const item of innerControls(ctrl)) {
				const id = item.getAttribute("Id");
				if (id) ownInline.push([id, key]);
			}
		} else if (location) overrideAt.set(location, key);
	}
	// A control with its own CustomAction wins over an inline copy of the same id.
	for (const [id, key] of ownInline) if (!ownControl.has(id)) ownControl.set(id, key);
	// The control with this id inside the CustomAction stored under `key`: its
	// root control, or one written inside its tab / group or its menu (`nested`).
	const locate = (key: string, id: string) => {
		const xml = merged.customActions.get(key);
		if (!xml) return { ca: null, el: null, nested: false };
		const ca = elementOf(xml);
		const el = controlIn(ca, id);
		return { ca, el, nested: !!el && el.parentElement?.tagName !== "CommandUIDefinition" };
	};

	// Controls the delta adds (`…._children`): never removed below, whatever
	// the deletes say — a control cut from one location and pasted into another
	// is deleted there and re-added here (#57 review).
	const readded = new Set<string>();

	for (const [key, xml] of delta.customActions) {
		const ca = elementOf(xml);
		const ctrl = controlOf(xml);
		const ctrlId = ctrl?.getAttribute("Id") ?? null;
		const targetKey = ctrlId ? ownControl.get(ctrlId) : undefined;
		const adds = ca.tagName === "CustomAction" && isChildrenLocation(ca.getAttribute("Location"));
		if (adds && ctrlId) readded.add(ctrlId);
		const container = ctrl?.tagName === "Tab" || ctrl?.tagName === "Group";
		if (adds && container) {
			// A new tab / group with controls written inside it. One of them may be
			// your own control moved here from another location of the table: it
			// is defined here now, so its previous definition goes.
			for (const c of nestedControls(ctrl!)) {
				const id = c.getAttribute("Id");
				if (!id) continue;
				readded.add(id);
				const prevKey = ownControl.get(id);
				const prev = prevKey ? locate(prevKey, id) : null;
				if (!prevKey || !prev?.ca || !prev.el) continue;
				if (prev.nested) {
					prev.el.parentNode!.removeChild(prev.el);
					merged.customActions.set(prevKey, s.serializeToString(prev.ca));
				} else {
					merged.customActions.delete(prevKey);
				}
			}
		}
		const owned = ca.tagName === "CustomAction" && ctrl && ctrlId && targetKey && !(adds && container);
		const found = owned ? locate(targetKey!, ctrlId!) : null;
		if (owned && found?.ca && found.el && found.nested) {
			// A control written inside the layer's own tab / group. Edited → replaced
			// where it is; added again elsewhere (moved) → taken out here, and the
			// delta's CustomAction places it (folded in below when that's a
			// container of the layer too).
			const { ca: target, el } = found;
			if (adds) {
				el.parentNode!.removeChild(el);
				merged.customActions.set(key, xml);
			} else {
				const imported = withChildrenOf(target.ownerDocument.importNode(ctrl!, true) as Element, el);
				el.parentNode!.replaceChild(imported, el);
			}
			merged.customActions.set(targetKey!, s.serializeToString(target));
			continue;
		}
		if (owned && found?.ca && found.el) {
			// Edit of a control the layer owns → replace it inside its own
			// CustomAction, where it is: the CustomAction's control, a control
			// written inside the layer's own tab / group (#58, #59), or a menu item
			// inside its flyout's menu (#27). A control the delta adds again
			// (moved to another location) also takes the new Location: one
			// CustomAction per control, keeping the layer's CustomAction id (#57
			// review). One written inside a tab / group / menu leaves it, and the
			// delta's CustomAction places it (folded in below when that's a
			// container of the layer too).
			const { ca: target, el: original, nested } = found;
			if (adds && nested) {
				original.parentNode!.removeChild(original);
				merged.customActions.set(targetKey!, s.serializeToString(target));
				merged.customActions.set(key, xml);
				continue;
			}
			let imported = target.ownerDocument.importNode(ctrl!, true) as Element;
			if (adds) {
				// A moved flyout: the layer's menu stays, the delta's items update it.
				// Items the layer adds with CustomActions of their own stay there
				// (and move with them), so they aren't defined twice.
				imported = mergeMovedMenu(original, imported, (id) => {
					const itemKey = ownControl.get(id);
					return !!itemKey && itemKey !== targetKey;
				});
			} else imported = withChildrenOf(imported, original);
			original.parentNode!.replaceChild(imported, original);
			if (!nested) {
				if (adds) target.setAttribute("Location", ca.getAttribute("Location")!);
				const seq = ctrl!.getAttribute("Sequence") ?? (adds ? ca.getAttribute("Sequence") : null);
				if (seq) target.setAttribute("Sequence", seq);
			}
			merged.customActions.set(targetKey!, s.serializeToString(target));
			continue;
		}
		const location = ca.getAttribute("Location");
		const priorKey = ca.tagName === "CustomAction" && location ? overrideAt.get(location) : undefined;
		if (priorKey && ctrl) {
			// The layer already overrides this control (e.g. a Ribbon Workbench
			// customisation): replace that override instead of adding a second
			// one whose precedence would depend on row order (#11 review N7).
			const priorCtrl = controlOf(existing.customActions.get(priorKey)!);
			const el = elementOf(xml);
			const def = firstChild(el, "CommandUIDefinition");
			if (def?.firstElementChild) withChildrenOf(def.firstElementChild, priorCtrl);
			merged.customActions.delete(priorKey);
			merged.customActions.set(key, s.serializeToString(el));
			continue;
		}
		merged.customActions.set(key, xml);
	}

	// Moves / re-sequencing of controls the layer adds (#26): the control keeps
	// its CustomAction, which now places it in its new group at its new sequence.
	for (const move of options.movedControls ?? []) {
		const key = ownControl.get(move.id);
		const found = key ? locate(key, move.id) : null;
		if (!key || !found?.ca || !found.el) {
			// Already placed by the delta (written inside a new tab / group, #58).
			if (readded.has(move.id)) continue;
			// Never a silent no-op: the plan only moves controls the layer adds.
			throw new Error(`Can't move ${move.id}: it isn't in this table's unmanaged customizations.`);
		}
		const { ca, el: ctrl } = found;
		const container = move.controlsId ?? `${move.groupId}.Controls`;
		ctrl.setAttribute("Sequence", String(move.sequence));
		if (!found.nested) {
			ca.setAttribute("Location", `${container}._children`);
			ca.setAttribute("Sequence", String(move.sequence));
		} else if (ctrl.parentElement?.getAttribute("Id") !== container) {
			// Written inside the layer's tab / group (#59) or inline in a flyout's
			// menu (#27) and now placed elsewhere: into that `<Controls>` when it is
			// in the same CustomAction, otherwise into a CustomAction of its own
			// (folded into the destination below when that is a container of the
			// layer too).
			const target = Array.from(ca.getElementsByTagName("Controls")).find((c) => c.getAttribute("Id") === container);
			ctrl.parentNode!.removeChild(ctrl);
			if (target) target.appendChild(ctrl);
			else {
				let caId = `${move.id}.CustomAction`;
				while (merged.customActions.has(`ca:${caId}`)) caId += "_";
				merged.customActions.set(
					`ca:${caId}`,
					`<CustomAction Id="${escapeAttr(caId)}" Location="${escapeAttr(`${container}._children`)}" Sequence="${move.sequence}"><CommandUIDefinition>${s.serializeToString(ctrl)}</CommandUIDefinition></CustomAction>`,
				);
			}
		}
		merged.customActions.set(key, s.serializeToString(ca));
	}

	// Removals. Labels of removed controls are dropped further down, once no
	// remaining control references them.
	const removedCommands = new Set<string>();
	const removedLabels = new Set<string>();
	for (const [key, xml] of Array.from(merged.customActions)) {
		const el = elementOf(xml);
		if (el.tagName === "HideCustomAction") {
			if (unhidden.has(el.getAttribute("Location") ?? "")) merged.customActions.delete(key);
			continue;
		}
		// The control of THIS parsed CustomAction: menu items are removed from it in place.
		const ctrl = firstChild(el, "CommandUIDefinition")?.firstElementChild ?? null;
		const ctrlId = ctrl?.getAttribute("Id");
		if (!ctrl || !isChildrenLocation(el.getAttribute("Location"))) continue;
		if (ctrlId && deleted.has(ctrlId) && !readded.has(ctrlId)) {
			merged.customActions.delete(key);
			// Only the labels this control references — not every id that merely
			// starts with its id (#11 review N11) — and only when unused.
			for (const m of xml.matchAll(LOC_LABEL_REF)) removedLabels.add(m[1]);
			// Its menu items' commands too (#27).
			for (const c of commandsWithin(ctrl)) removedCommands.add(c);
			continue;
		}
		// Controls written inside the layer's own tab / group (#59) and menu items
		// written inline in a flyout the layer adds (#27): removed in place; their
		// labels go unless something else still uses them.
		const items = innerControls(ctrl).filter((d) => {
			const id = d.getAttribute("Id") ?? "";
			return deleted.has(id) && !readded.has(id);
		});
		if (items.length === 0) continue;
		for (const item of items) {
			const itemXml = s.serializeToString(item);
			for (const m of itemXml.matchAll(LOC_LABEL_REF)) removedLabels.add(m[1]);
			for (const c of commandsWithin(item)) removedCommands.add(c);
			item.parentNode?.removeChild(item);
		}
		merged.customActions.set(key, s.serializeToString(el));
	}

	// Deleted tabs / groups (#48), and everything placed inside them.
	const removedTabCommandCandidates = new Set<string>();
	const gone = new Set(options.deletedContainerIds ?? []);
	const forget = (el: Element, xml: string) => {
		for (const id of idsWithin(el)) gone.add(id);
		for (const c of commandsWithin(el)) removedCommands.add(c);
		for (const t of [el, ...Array.from(el.getElementsByTagName("Tab"))]) {
			const c = t.tagName === "Tab" ? t.getAttribute("Command") : null;
			if (c) removedTabCommandCandidates.add(c);
		}
		for (const m of xml.matchAll(LOC_LABEL_REF)) removedLabels.add(m[1]);
	};
	for (let changed = gone.size > 0; changed; ) {
		changed = false;
		for (const [key, xml] of Array.from(merged.customActions)) {
			const el = elementOf(xml);
			const location = el.getAttribute("Location");
			if (el.tagName === "HideCustomAction") {
				// A hide of something that no longer exists.
				if (location && gone.has(location)) {
					merged.customActions.delete(key);
					changed = true;
				}
				continue;
			}
			const ctrl = firstChild(el, "CommandUIDefinition")?.firstElementChild ?? null;
			const ctrlId = ctrl?.getAttribute("Id") ?? null;
			const parent = childrenParent(location);
			const removeWhole =
				(!!ctrlId && gone.has(ctrlId) && isChildrenLocation(location)) || // the container itself
				(!!parent && gone.has(parent)) || // placed inside a deleted container
				(!isChildrenLocation(location) && !!location && gone.has(location)) || // override of a removed control
				(!!ctrl?.getAttribute("GroupId") && gone.has(ctrl.getAttribute("GroupId")!)); // MaxSize / Scale of a removed group
			if (removeWhole) {
				merged.customActions.delete(key);
				if (ctrl) forget(ctrl, xml);
				changed = true;
				continue;
			}
			if (ctrl?.tagName !== "Tab") continue;
			// Groups (and their scaling) declared inline in a tab the layer adds.
			const inline = Array.from(ctrl.getElementsByTagName("*")).filter((d) => {
				if (d.tagName === "Group") return gone.has(d.getAttribute("Id") ?? "");
				return (d.tagName === "MaxSize" || d.tagName === "Scale") && gone.has(d.getAttribute("GroupId") ?? "");
			});
			if (inline.length === 0) continue;
			for (const d of inline) {
				forget(d, s.serializeToString(d));
				d.parentNode?.removeChild(d);
			}
			merged.customActions.set(key, s.serializeToString(el));
			changed = true;
		}
	}

	// Children of the layer's own tabs / groups go inside them (#59) — only
	// where this publish writes the child or its container (#66 review m5).
	const touched = new Set<string>();
	for (const [key, xml] of merged.customActions) if (existing.customActions.get(key) !== xml) touched.add(key);
	merged.customActions = foldIntoOwnContainers(merged.customActions, touched);

	const keepUnlessEdited = (key: "commandDefinitions" | "enableRules" | "displayRules", edited: Set<string>) => {
		for (const [id, xml] of delta[key]) {
			if (existing[key].has(id) && !edited.has(id)) continue;
			merged[key].set(id, xml);
		}
	};
	keepUnlessEdited("commandDefinitions", editedCommands);
	keepUnlessEdited("enableRules", editedEnableRules);
	keepUnlessEdited("displayRules", editedDisplayRules);

	// Drop a deleted control's command (and rules only it used) when nothing
	// else uses it any more, so deletes don't leave orphans behind. References
	// are read from the elements, not matched as text (#108).
	const commandsInUse = commandsReferenced(merged.customActions.values());
	for (const commandId of removedCommands) {
		if (retainedCommands.has(commandId) || !merged.commandDefinitions.has(commandId)) continue;
		if (commandsInUse.has(commandId)) continue;
		const cmdXml = merged.commandDefinitions.get(commandId)!;
		merged.commandDefinitions.delete(commandId);
		const ownRules = rulesReferenced([cmdXml]);
		const otherRules = rulesReferenced(merged.commandDefinitions.values());
		for (const id of ownRules.EnableRule) if (!otherRules.EnableRule.has(id)) merged.enableRules.delete(id);
		for (const id of ownRules.DisplayRule) if (!otherRules.DisplayRule.has(id)) merged.displayRules.delete(id);
	}
	// Uncustomised commands (#31): the layer's copy goes, and with it the
	// layer's rules nothing else uses any more.
	const retainedRules = {
		EnableRule: new Set(options.retainedEnableRuleIds ?? []),
		DisplayRule: new Set(options.retainedDisplayRuleIds ?? []),
	};
	const layerRefs = layerCommandRefs(merged);
	for (const commandId of options.uncustomisedCommandIds ?? []) {
		const cmdXml = merged.commandDefinitions.get(commandId);
		if (cmdXml === undefined || delta.commandDefinitions.has(commandId)) continue;
		// Your own command (no definition below the layer): never removed here.
		if (!canUncustomiseCommand(commandId, layerRefs)) continue;
		merged.commandDefinitions.delete(commandId);
		const otherRules = rulesReferenced(merged.commandDefinitions.values());
		const ownRules = rulesReferenced([cmdXml]);
		for (const kind of ["EnableRule", "DisplayRule"] as const)
			for (const id of ownRules[kind]) {
				const rules = kind === "EnableRule" ? merged.enableRules : merged.displayRules;
				const fromDelta = (kind === "EnableRule" ? delta.enableRules : delta.displayRules).has(id);
				if (fromDelta || retainedRules[kind].has(id) || otherRules[kind].has(id)) continue;
				rules.delete(id);
			}
	}

	for (const [id, xml] of delta.tabDisplayRules) merged.tabDisplayRules.set(id, xml);
	for (const [id, xml] of delta.templates) merged.templates.set(id, xml);

	// Labels of removed controls / tabs / groups and tab display rules of
	// removed tabs, unless still used.
	const labelsInUse = labelsReferenced(merged.customActions.values());
	for (const id of removedLabels) {
		if (!delta.locLabels.has(id) && !labelsInUse.has(id)) merged.locLabels.delete(id);
	}
	const tabCommandsInUse = commandsReferenced(merged.customActions.values());
	for (const cmd of removedTabCommandCandidates) {
		if (!delta.tabDisplayRules.has(cmd) && !tabCommandsInUse.has(cmd)) merged.tabDisplayRules.delete(cmd);
	}
	for (const cmd of options.removedTabCommands ?? []) {
		if (!delta.tabDisplayRules.has(cmd)) merged.tabDisplayRules.delete(cmd);
	}

	for (const [id, xml] of delta.locLabels) {
		const prev = existing.locLabels.get(id);
		if (prev) {
			const titles = Array.from(elementOf(xml).querySelectorAll("Title")).map((t) => t.getAttribute("description"));
			if (titles.length > 0 && titles.every((d) => d === id)) continue;
		}
		merged.locLabels.set(id, xml);
	}

	return merged;
}

/** True for a CustomAction that targets an existing control id (an override), not `…._children`. */
export function isOverrideCustomAction(xml: string): boolean {
	const el = elementOf(xml);
	return el.tagName === "CustomAction" && !isChildrenLocation(el.getAttribute("Location"));
}

/** Sets the Title of a tab / group the layer adds (inline in its CustomAction or a tab's). */
export function setContainerTitle(parts: RibbonDiffParts, containerId: string, title: string): RibbonDiffParts {
	const out = mergeRibbonDiffParts(parts, emptyRibbonDiffParts());
	for (const [key, xml] of out.customActions) {
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction" || !isChildrenLocation(ca.getAttribute("Location"))) continue;
		const root = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
		if (!isContainer(root)) continue;
		const el = findById(root, containerId);
		if (!el || !isContainer(el)) continue;
		el.setAttribute("Title", title);
		out.customActions.set(key, serializer().serializeToString(ca));
		break;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Scaling Sequences (#66 review)
// ---------------------------------------------------------------------------

/** A MaxSize / Scale step the layer writes, with the tab it scales and the CustomAction holding it. */
export interface LayerScalingStep extends LayerScaleStep {
	tabId: string;
	size: string;
	/** Key of the CustomAction: the tab's own (inline `<Scaling>`) or a `{tab}.Scaling._children` one. */
	key: string;
}

/** Every MaxSize / Scale step of the layer: inline in a tab it adds, or a `{tab}.Scaling._children` CustomAction. */
export function layerScalingSteps(parts: RibbonDiffParts): LayerScalingStep[] {
	const out: LayerScalingStep[] = [];
	const step = (el: Element, tabId: string, key: string): LayerScalingStep => ({
		id: el.getAttribute("Id") ?? "",
		kind: el.tagName as ScaleKind,
		groupId: el.getAttribute("GroupId") ?? "",
		sequence: Number(el.getAttribute("Sequence") ?? "0"),
		size: el.getAttribute("Size") ?? "",
		tabId,
		key,
	});
	for (const [key, xml] of parts.customActions) {
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction") continue;
		const root = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
		if (!root) continue;
		const m = /^(.+)\.Scaling\._children$/.exec(ca.getAttribute("Location") ?? "");
		if (m && (root.tagName === "MaxSize" || root.tagName === "Scale")) out.push(step(root, m[1], key));
		if (root.tagName === "Tab" && isChildrenLocation(ca.getAttribute("Location"))) {
			const tabId = root.getAttribute("Id") ?? "";
			for (const el of Array.from(firstChild(root, "Scaling")?.children ?? [])) {
				if (el.tagName === "MaxSize" || el.tagName === "Scale") out.push(step(el, tabId, key));
			}
		}
	}
	return out;
}

/**
 * Re-sequences the layer's scaling steps so that, per tab, no two steps (the
 * platform's included) share a Sequence and every layer MaxSize comes before
 * the first Scale (scalingSequence.resequenceLayerScaling). `platform` is each
 * tab's scaling without the layer's steps. Returns the changes made and what
 * couldn't be placed; the caller must not import when there are problems.
 */
export function normalizeLayerScaling(
	parts: RibbonDiffParts,
	platform: Record<string, { maxSizes: number[]; scales: number[] }>,
): { parts: RibbonDiffParts; changes: ScalingChange[]; problems: string[] } {
	const steps = layerScalingSteps(parts);
	const byTab = new Map<string, LayerScalingStep[]>();
	for (const st of steps) byTab.set(st.tabId, [...(byTab.get(st.tabId) ?? []), st]);
	const changes: ScalingChange[] = [];
	const problems: string[] = [];
	for (const [tabId, list] of byTab) {
		const r = resequenceLayerScaling(tabId, platform[tabId] ?? { maxSizes: [], scales: [] }, list);
		changes.push(...r.changes);
		problems.push(...r.problems);
	}
	if (changes.length === 0) return { parts, changes, problems };
	const out = mergeRibbonDiffParts(parts, emptyRibbonDiffParts());
	const s = serializer();
	for (const c of changes) {
		const st = steps.find((x) => x.id === c.id && x.kind === c.kind && x.tabId === c.tabId)!;
		const ca = elementOf(out.customActions.get(st.key)!);
		const root = firstChild(ca, "CommandUIDefinition")!.firstElementChild!;
		const el =
			root.tagName === "Tab"
				? Array.from(firstChild(root, "Scaling")?.children ?? []).find(
						(e) => e.tagName === c.kind && e.getAttribute("Id") === c.id,
					)
				: root;
		el?.setAttribute("Sequence", String(c.to));
		if (root.tagName !== "Tab") ca.setAttribute("Sequence", String(c.to));
		out.customActions.set(st.key, s.serializeToString(ca));
	}
	return { parts: out, changes, problems };
}

/**
 * Brings a published ribbon location in line with the layer it was published
 * as (#66 review B1, m4): tabs / groups the layer adds take their `Title`
 * token (`$LocLabels:…`, so a later rename edits that label), and each tab's
 * scaling takes the layer's steps with the Sequences they were written with.
 * Without this, a second publish in the same session reused the MaxSize
 * Sequence the first one wrote. Mutates `def`.
 */
export function applyPublishedLayer(def: RibbonDefinition, parts: RibbonDiffParts): void {
	const titles = new Map<string, string>();
	for (const xml of parts.customActions.values()) {
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction" || !isChildrenLocation(ca.getAttribute("Location"))) continue;
		const root = firstChild(ca, "CommandUIDefinition")?.firstElementChild;
		if (!isContainer(root)) continue;
		for (const el of [root, ...Array.from(root.getElementsByTagName("Group"))]) {
			const id = el.getAttribute("Id");
			const title = el.getAttribute("Title");
			if (id && title?.startsWith("$LocLabels:")) titles.set(id, title);
		}
	}
	for (const tab of def.tabs) {
		const t = titles.get(tab.id);
		if (t) tab.label = t;
		for (const g of tab.groups) {
			const gt = titles.get(g.id);
			if (gt) g.label = gt;
		}
	}

	const tabIds = new Set(def.tabs.map((t) => t.id));
	for (const st of layerScalingSteps(parts)) {
		if (!tabIds.has(st.tabId)) continue;
		def.scalingByTab = def.scalingByTab ?? {};
		const scaling = (def.scalingByTab[st.tabId] = def.scalingByTab[st.tabId] ?? { tabId: st.tabId, maxSizes: [], scales: [] });
		const list = st.kind === "MaxSize" ? scaling.maxSizes : scaling.scales;
		const step: ScaleStep = { id: st.id, groupId: st.groupId, size: st.size, sequence: st.sequence };
		const i = list.findIndex((x) => x.id === st.id);
		if (i >= 0) list[i] = step;
		else list.push(step);
	}
}
