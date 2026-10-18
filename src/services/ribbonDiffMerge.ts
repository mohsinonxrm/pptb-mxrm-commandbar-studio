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

/** Ids of the controls the layer itself adds (`CustomAction Location="…._children"`). */
export function ownControlIds(parts: RibbonDiffParts): Set<string> {
	const out = new Set<string>();
	for (const xml of parts.customActions.values()) {
		const ca = elementOf(xml);
		const id = controlOf(xml)?.getAttribute("Id");
		if (ca.tagName === "CustomAction" && id && isChildrenLocation(ca.getAttribute("Location"))) out.add(id);
	}
	return out;
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

/** `Command` attributes used inside `el` (including `el`). */
function commandsWithin(el: Element): string[] {
	const out: string[] = [];
	for (const d of [el, ...Array.from(el.getElementsByTagName("*"))]) {
		const c = d.getAttribute("Command");
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

const LOC_LABEL_REF = /\$LocLabels:([^"'\s]+)/g;
/** Rule references of a CommandDefinition, wherever they sit (also an `<EnableRule>` inside `<DisplayRules>`). */
const RULE_REF = /<(EnableRule|DisplayRule)\b[^>]*?\sId="([^"]+)"/g;

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

	// Index the layer's own controls (control id → CustomAction key) and its
	// existing overrides of other controls (Location → key).
	const ownControl = new Map<string, string>();
	const overrideAt = new Map<string, string>();
	for (const [key, xml] of existing.customActions) {
		const ctrl = controlOf(xml);
		const ca = elementOf(xml);
		if (ca.tagName !== "CustomAction") continue;
		const location = ca.getAttribute("Location");
		if (ctrl?.getAttribute("Id") && isChildrenLocation(location)) ownControl.set(ctrl.getAttribute("Id")!, key);
		else if (location) overrideAt.set(location, key);
	}

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
		if (ca.tagName === "CustomAction" && ctrl && ctrlId && targetKey && !(adds && container)) {
			// Edit of a control the layer owns → replace it inside its own
			// CustomAction. A control the delta adds again (moved to another
			// location) also takes the new Location: one CustomAction per control,
			// keeping the layer's CustomAction id.
			const target = elementOf(merged.customActions.get(targetKey) ?? existing.customActions.get(targetKey)!);
			const def = firstChild(target, "CommandUIDefinition")!;
			const imported = withChildrenOf(target.ownerDocument.importNode(ctrl, true) as Element, def.firstElementChild);
			def.replaceChild(imported, def.firstElementChild!);
			if (adds) target.setAttribute("Location", ca.getAttribute("Location")!);
			const seq = ctrl.getAttribute("Sequence") ?? (adds ? ca.getAttribute("Sequence") : null);
			if (seq) target.setAttribute("Sequence", seq);
			merged.customActions.set(targetKey, s.serializeToString(target));
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
		const xml = key ? merged.customActions.get(key) : undefined;
		if (!key || !xml) continue;
		const ca = elementOf(xml);
		ca.setAttribute("Location", `${move.groupId}.Controls._children`);
		ca.setAttribute("Sequence", String(move.sequence));
		firstChild(ca, "CommandUIDefinition")?.firstElementChild?.setAttribute("Sequence", String(move.sequence));
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
		const ctrl = controlOf(xml);
		const ctrlId = ctrl?.getAttribute("Id");
		if (ctrlId && deleted.has(ctrlId) && !readded.has(ctrlId) && isChildrenLocation(el.getAttribute("Location"))) {
			merged.customActions.delete(key);
			// Only the labels this control references — not every id that merely
			// starts with its id (#11 review N11).
			for (const m of xml.matchAll(LOC_LABEL_REF)) removedLabels.add(m[1]);
			const commandId = ctrl?.getAttribute("Command");
			if (commandId) removedCommands.add(commandId);
		}
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
	// else uses it any more, so deletes don't leave orphans behind.
	const remainingActions = Array.from(merged.customActions.values()).join("\n");
	for (const commandId of removedCommands) {
		if (retainedCommands.has(commandId) || !merged.commandDefinitions.has(commandId)) continue;
		if (remainingActions.includes(`Command="${commandId}"`)) continue;
		const cmdXml = merged.commandDefinitions.get(commandId)!;
		merged.commandDefinitions.delete(commandId);
		const otherCommands = Array.from(merged.commandDefinitions.values()).join("\n");
		for (const m of cmdXml.matchAll(/<EnableRule\s+Id="([^"]+)"/g)) {
			if (!otherCommands.includes(`Id="${m[1]}"`)) merged.enableRules.delete(m[1]);
		}
		for (const m of cmdXml.matchAll(/<DisplayRule\s+Id="([^"]+)"/g)) {
			if (!otherCommands.includes(`Id="${m[1]}"`)) merged.displayRules.delete(m[1]);
		}
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
		const otherCommands = Array.from(merged.commandDefinitions.values()).join("\n");
		for (const m of cmdXml.matchAll(RULE_REF)) {
			const kind = m[1] as "EnableRule" | "DisplayRule";
			const rules = kind === "EnableRule" ? merged.enableRules : merged.displayRules;
			const fromDelta = (kind === "EnableRule" ? delta.enableRules : delta.displayRules).has(m[2]);
			if (fromDelta || retainedRules[kind].has(m[2])) continue;
			if (otherCommands.includes(`<${kind} Id="${m[2]}"`)) continue;
			rules.delete(m[2]);
		}
	}

	for (const [id, xml] of delta.tabDisplayRules) merged.tabDisplayRules.set(id, xml);
	for (const [id, xml] of delta.templates) merged.templates.set(id, xml);

	// Labels of removed controls / tabs / groups and tab display rules of
	// removed tabs, unless still used.
	const stillUsed = (needle: string) =>
		Array.from(merged.customActions.values()).some((xml) => xml.includes(needle));
	for (const id of removedLabels) {
		if (!delta.locLabels.has(id) && !stillUsed(`$LocLabels:${id}"`)) merged.locLabels.delete(id);
	}
	for (const cmd of removedTabCommandCandidates) {
		if (!delta.tabDisplayRules.has(cmd) && !stillUsed(`Command="${cmd}"`)) merged.tabDisplayRules.delete(cmd);
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
