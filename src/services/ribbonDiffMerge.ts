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

	for (const [key, xml] of delta.customActions) {
		const ca = elementOf(xml);
		const ctrl = controlOf(xml);
		const ctrlId = ctrl?.getAttribute("Id") ?? null;
		const targetKey = ctrlId ? ownControl.get(ctrlId) : undefined;
		if (ca.tagName === "CustomAction" && ctrl && ctrlId && targetKey && !isChildrenLocation(ca.getAttribute("Location"))) {
			// Edit of a control the layer owns → replace it inside its own CustomAction.
			const target = elementOf(existing.customActions.get(targetKey)!);
			const def = firstChild(target, "CommandUIDefinition")!;
			const imported = withChildrenOf(target.ownerDocument.importNode(ctrl, true) as Element, def.firstElementChild);
			def.replaceChild(imported, def.firstElementChild!);
			const seq = ctrl.getAttribute("Sequence");
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

	// Removals.
	const removedCommands = new Set<string>();
	for (const [key, xml] of Array.from(merged.customActions)) {
		const el = elementOf(xml);
		if (el.tagName === "HideCustomAction") {
			if (unhidden.has(el.getAttribute("Location") ?? "")) merged.customActions.delete(key);
			continue;
		}
		const ctrl = controlOf(xml);
		const ctrlId = ctrl?.getAttribute("Id");
		if (ctrlId && deleted.has(ctrlId) && isChildrenLocation(el.getAttribute("Location"))) {
			merged.customActions.delete(key);
			// Only the labels this control references — not every id that merely
			// starts with its id (#11 review N11).
			for (const m of xml.matchAll(LOC_LABEL_REF)) merged.locLabels.delete(m[1]);
			const commandId = ctrl?.getAttribute("Command");
			if (commandId) removedCommands.add(commandId);
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
	for (const [id, xml] of delta.tabDisplayRules) merged.tabDisplayRules.set(id, xml);
	for (const [id, xml] of delta.templates) merged.templates.set(id, xml);

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
