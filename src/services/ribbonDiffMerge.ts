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
