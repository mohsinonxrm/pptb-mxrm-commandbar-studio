import type {
	CommandDefinition,
	DisplayRule,
	EnableRule,
	LocLabel,
	RibbonButton,
	RibbonDefinition,
	RibbonGroup,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";
import { parseRibbonXml } from "@/services/xmlParser";
import { hasOobOverrideChanges } from "@/services/xmlGenerator";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { applyButtonOrigin } from "@/utils/ribbonProvenance";
import { controlCommandIds, isReadOnlyControlKind, KIND_BY_CONTROL_TAG } from "@/utils/controlKinds";

/**
 * Applies a RibbonDiffXml (e.g. exported by Ribbon Workbench or from a
 * solution) to the session as ordinary edits (#30):
 *
 *   - CommandDefinitions, rules and LocLabels are parsed by the same lossless
 *     parser as a loaded ribbon (xmlParser.ts) and upserted by id.
 *   - A CustomAction at `{group}.Controls._children`, `{tab}.Groups._children`
 *     or `Mscrm.Tabs._children` adds the control / group / tab to the loaded
 *     ribbon, as if created in CBS.
 *   - A CustomAction whose Location is an existing control id (an override)
 *     edits that control; a HideCustomAction hides it.
 *
 * Nothing touches the baseline, so everything imported is a session change
 * that the publish planner picks up. Whatever can't be applied — or won't be
 * published — is listed in `notApplied`, never silently dropped.
 *
 * The scope is the ribbon on screen: a table's (its three locations) or the
 * application ribbon. From a customizations.xml, the RibbonDiffXml of the
 * loaded table (or the root-level one, for the application ribbon) is used.
 */

export interface RibbonDiffImportInput {
	xml: string;
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	commands: CommandDefinition[];
	enableRules: EnableRule[];
	displayRules: DisplayRule[];
	locLabels: LocLabel[];
	/** The loaded table ("" when none). */
	entityLogicalName: string;
	/** Where a new tab goes when its display rules don't say (the location on screen). */
	activeLocation: RibbonLocation;
	/** Organisation base language: imported texts are shown in it (#50). */
	languageCode?: number;
}

export interface RibbonDiffImportResult {
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	commands: CommandDefinition[];
	enableRules: EnableRule[];
	displayRules: DisplayRule[];
	locLabels: LocLabel[];
	/** What was applied, one line each. */
	applied: string[];
	/** What wasn't applied, or won't be published, and why. */
	notApplied: string[];
	/** Things worth knowing that don't lose anything (normalised ids, scope, duplicates). */
	notes: string[];
	/** True when the session changed. */
	changed: boolean;
}

const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];
const LOCATIONS: RibbonLocation[] = [...ENTITY_LOCATIONS, "Application"];
const CONTROL_TAGS = new Set([
	"Button",
	"FlyoutAnchor",
	"SplitButton",
	"TextBox",
	"ComboBox",
	"CheckBox",
]);
const MENU_KINDS = new Set<RibbonButton["kind"]>(["flyout", "splitButton"]);
const ENTITY_PREFIX = /^Mscrm\.(HomepageGrid|SubGrid|Form)\.([^.]+)\./;
const CHILDREN = "._children";
const RULE_REF = /<(EnableRule|DisplayRule)\b[^>]*?\sId="([^"]+)"/;
const LOC_LABEL_REF = /\$LocLabels:([^"'\s<]+)/g;
const IMPORT_TAB = "cbs.import.Tab";
const IMPORT_GROUP = "cbs.import.Group";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function elementChildren(el: Element | null | undefined): Element[] {
	return el ? Array.from(el.children) : [];
}

function attributesOf(el: Element): Record<string, string> {
	return Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));
}

/**
 * The RibbonDiffXml to import: the document itself, or — from a
 * customizations.xml — the loaded table's (`<Entity>` whose `<Name>` is the
 * table) or, for the application ribbon, the root-level one. Anything else is
 * refused rather than guessed: another table's commands would publish to the
 * wrong table.
 */
function pickRibbonDiff(doc: Document, entity: string, application: boolean): Element {
	const top = doc.documentElement;
	if (top.tagName === "RibbonDiffXml") return top;
	const all = Array.from(doc.getElementsByTagName("RibbonDiffXml"));
	const tables = Array.from(doc.querySelectorAll("Entities > Entity")).flatMap((e) => {
		const kids = elementChildren(e);
		const rdx = kids.find((c) => c.tagName === "RibbonDiffXml");
		const name = kids.find((c) => c.tagName === "Name")?.textContent?.trim() ?? "";
		return rdx ? [{ name, rdx }] : [];
	});
	const appRdx = all.find((r) => r.parentElement === top);
	if (tables.length === 0 && !appRdx) {
		if (all.length === 1) return all[0];
		throw new Error(
			all.length === 0
				? "No <RibbonDiffXml> element found."
				: `The XML has ${all.length} <RibbonDiffXml> elements and none belongs to a table or the application ribbon — paste just one.`,
		);
	}
	const found = [
		...tables.map((t) => t.name || "(unnamed table)"),
		...(appRdx ? ["the application ribbon"] : []),
	].join(", ");
	if (application) {
		if (appRdx) return appRdx;
		throw new Error(
			`The XML has no application ribbon RibbonDiffXml (it has: ${found}). Open that table's ribbon to import its customizations.`,
		);
	}
	const match = tables.find((t) => t.name.toLowerCase() === entity.toLowerCase());
	if (match) return match.rdx;
	throw new Error(
		`The XML has no RibbonDiffXml for ${entity || "the loaded table"} (it has: ${found}). Load that table, or open the application ribbon for the application ribbon's customizations.`,
	);
}

function contextLocation(context: string | undefined): RibbonLocation | undefined {
	switch (context) {
		case "HomePageGrid":
			return "HomepageGrid";
		case "Form":
			return "Form";
		case "SubGridStandard":
		case "SubGridAssociated":
			return "SubGrid";
		default:
			return undefined;
	}
}

export function importRibbonDiffXml(input: RibbonDiffImportInput): RibbonDiffImportResult {
	const lang = input.languageCode ?? 1033;
	const entity = input.entityLogicalName;
	const doc = new DOMParser().parseFromString(input.xml, "application/xml");
	if (doc.querySelector("parsererror")) throw new Error("The XML is not well-formed.");
	const onApplication = input.activeLocation === "Application";
	const root = pickRibbonDiff(doc, entity, onApplication);
	const serializer = new XMLSerializer();
	const rdx = serializer.serializeToString(root);

	const applied: string[] = [];
	const notApplied: string[] = [];
	const notes: string[] = [];
	// The scope: the ribbon on screen, except that a bare RibbonDiffXml whose
	// Locations name the loaded table is that table's, wherever it is pasted.
	const namesTable =
		!!entity &&
		new RegExp(
			`Mscrm\\.(HomepageGrid|SubGrid|Form)\\.${entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`,
			"i",
		).test(rdx);
	const application = onApplication && !(root === doc.documentElement && namesTable);
	if (root !== doc.documentElement) {
		notes.push(
			`Imported the RibbonDiffXml of ${application ? "the application ribbon" : entity} from the document.`,
		);
	} else if (onApplication && !application) {
		notes.push(
			`The XML's Locations name the ${entity} table, so it was imported as that table's customizations, not the application ribbon's.`,
		);
	}
	/** Where a table import's unprefixed ids and new tabs go first. */
	const home: RibbonLocation = application
		? "Application"
		: ENTITY_LOCATIONS.includes(input.activeLocation)
			? input.activeLocation
			: "HomepageGrid";

	// ── Commands, rules, labels: the loaded-ribbon parser, so nothing is lost ──
	const parsed = parseRibbonXml(rdx, input.activeLocation, entity);
	const upsert = <T extends { id: string }>(current: T[], all: T[], what: string) => {
		// A definition the XML repeats: the last one is used (once), and said so.
		const byId = new Map<string, T>();
		const count = new Map<string, number>();
		for (const item of all) {
			byId.set(item.id, item);
			count.set(item.id, (count.get(item.id) ?? 0) + 1);
		}
		for (const [id, n] of count) {
			if (n > 1)
				notes.push(
					`${what} ${id} is defined ${n} times in the XML — the last one was used.`,
				);
		}
		const incoming = Array.from(byId.values());
		const out = [...current];
		const changedIds: string[] = [];
		let unchanged = 0;
		for (const item of incoming) {
			const i = out.findIndex((x) => x.id === item.id);
			if (i >= 0 && same(out[i], item)) {
				unchanged++;
				continue;
			}
			applied.push(`${what} ${item.id} ${i >= 0 ? "updated" : "added"}`);
			if (i >= 0) out[i] = item;
			else out.push(item);
			changedIds.push(item.id);
		}
		return { out, changedIds, unchanged };
	};
	const cmd = upsert(input.commands, parsed.commands, "Command");
	const enable = upsert(input.enableRules, parsed.enableRules, "Enable rule");
	const display = upsert(input.displayRules, parsed.displayRules, "Display rule");
	const labels = upsert(input.locLabels, parsed.locLabels, "Label");
	const locLabels = labels.out;
	const unchanged = cmd.unchanged + enable.unchanged + display.unchanged + labels.unchanged;

	const text = (token: string | null | undefined, fallback: string) =>
		token ? resolveDisplayLabel(token, locLabels, lang) || fallback : fallback;

	const ribbons: Record<RibbonLocation, RibbonDefinition> = JSON.parse(
		JSON.stringify(input.ribbons),
	);
	let ribbonChanged = false;
	/** Controls that were already as imported. */
	let upToDate = 0;
	/** Commands of the tabs this import adds (their TabDisplayRules come along). */
	const addedTabCommands = new Set<string>();

	// ── Lookup ──
	/** Locations to search for a Location / control id, most likely first. */
	/**
	 * The scope's own locations come first: a table import looks in the table's
	 * locations (the one its id names first) and only then in the application
	 * ribbon; an application import the other way round (see noteScope).
	 */
	const searchOrder = (id: string): RibbonLocation[] => {
		if (application) return LOCATIONS.slice().reverse();
		const m = ENTITY_PREFIX.exec(id);
		const first = m && m[2] !== "{!EntityLogicalName}" ? (m[1] as RibbonLocation) : home;
		return [first, ...ENTITY_LOCATIONS.filter((l) => l !== first), "Application"];
	};
	/** Says so when a change lands outside the ribbon being imported into. */
	const noteScope = (location: RibbonLocation, id: string) => {
		if (application && location !== "Application") {
			notes.push(
				`${id} is on the table's ribbon (${location}), not the application ribbon: the change is published with the table.`,
			);
		} else if (!application && location === "Application") {
			notes.push(
				`${id} was found only on the application ribbon: the change is published to the application ribbon and affects every table.`,
			);
		}
	};
	/** Ids the publish writes in CBS's convention, not as in the XML (item kept for the report). */
	const normalised: string[] = [];
	const noteId = (actual: string | null, expected: string) => {
		if (actual && actual !== expected) normalised.push(actual);
	};
	const findGroup = (groupId: string) => {
		for (const location of searchOrder(groupId))
			for (const tab of ribbons[location].tabs) {
				const group = tab.groups.find((g) => g.id === groupId);
				if (group) return { location, tab, group };
			}
		return undefined;
	};
	const findTab = (tabId: string) => {
		for (const location of searchOrder(tabId)) {
			const tab = ribbons[location].tabs.find((t) => t.id === tabId);
			if (tab) return { location, tab };
		}
		return undefined;
	};
	/** Every occurrence of a control in the first location that has it. */
	const findControl = (id: string) => {
		for (const location of searchOrder(id)) {
			const found: { group: RibbonGroup; button: RibbonButton }[] = [];
			for (const tab of ribbons[location].tabs)
				for (const group of tab.groups)
					for (const button of group.buttons)
						if (button.id === id) found.push({ group, button });
			if (found.length > 0) return { location, found };
		}
		return undefined;
	};
	const unknownLocation = (what: string, location: string) => {
		const m = ENTITY_PREFIX.exec(location);
		let hint = "it isn't in the loaded ribbon";
		if (m && m[2] !== "{!EntityLogicalName}" && entity && m[2] !== entity) {
			hint = `it belongs to the ${m[2]} table, but ${entity} is loaded`;
		} else if (m?.[2] === "{!EntityLogicalName}" || location.startsWith("Mscrm.Global")) {
			hint = "it belongs to the application ribbon, which isn't loaded with it";
		}
		notApplied.push(`${what}: Location "${location}" not found — ${hint}.`);
	};

	// ── Controls, groups and tabs as the parser models them ──
	/**
	 * Parses a fragment (a Tab, or Groups / Controls content) with the
	 * loaded-ribbon parser: placed where a ribbon's tabs are (the parser reads
	 * no tab from a CustomAction, #42), with the XML's TabDisplayRules.
	 */
	const tabDisplayRulesXml = elementChildren(root.querySelector(":scope > RuleDefinitions > TabDisplayRules"))
		.map((e) => serializer.serializeToString(e))
		.join("");
	const parseFragment = (tabXml: string): RibbonTab | undefined =>
		parseRibbonXml(
			`<RibbonDiffXml><UI><Ribbon><Tabs>${tabXml}</Tabs></Ribbon></UI>` +
				`<RuleDefinitions><TabDisplayRules>${tabDisplayRulesXml}</TabDisplayRules></RuleDefinitions></RibbonDiffXml>`,
			input.activeLocation,
			entity,
			locLabels,
		).ribbon.tabs[0];
	const xmlOf = (el: Element) => serializer.serializeToString(el);
	const parseControl = (el: Element): RibbonButton | undefined =>
		parseFragment(
			`<Tab Id="${IMPORT_TAB}"><Groups><Group Id="${IMPORT_GROUP}"><Controls>${xmlOf(el)}</Controls></Group></Groups></Tab>`,
		)?.groups[0]?.buttons.find((b) => b.id === el.getAttribute("Id"));

	/** Display texts in the base language (the parser resolves 1033), as ribbonService does on load. */
	const resolveTexts = (button: RibbonButton) => {
		const src = button.source;
		if (!src) return;
		button.label = text(src.labelToken, button.id);
		if (src.tooltipTitleToken) button.tooltipTitle = text(src.tooltipTitleToken, "");
		if (src.tooltipBodyToken) button.tooltipBody = text(src.tooltipBodyToken, "");
	};
	/** `$LocLabels:` references neither the XML nor the session defines: the import would fail. */
	const checkLabels = (item: { id: string; source?: { attributes: Record<string, string>; xml?: string } }) => {
		// A control kept verbatim (#42): its children's references too.
		for (const v of item.source?.xml ? [item.source.xml] : Object.values(item.source?.attributes ?? {}))
			for (const [, id] of v.matchAll(LOC_LABEL_REF))
				if (!locLabels.some((l) => l.id === id)) {
					notApplied.push(
						`${item.id}: references label ${id}, which neither the XML nor the loaded ribbon defines — add its <LocLabel> or the publish will fail.`,
					);
				}
	};
	/** A tab / group element as imported: its Title token and attributes are written back (#30 review). */
	const containerSource = (el: Element) => ({
		titleToken: el.getAttribute("Title") ?? undefined,
		attributes: attributesOf(el),
	});
	/** A control new to the session: yours, unmanaged, not hidden. */
	const asNew = (button: RibbonButton, sequence?: number): RibbonButton => {
		applyButtonOrigin(button, { origin: "unmanaged" });
		button.hidden = false;
		if (sequence !== undefined && !button.source?.attributes["Sequence"])
			button.sequence = sequence;
		resolveTexts(button);
		checkLabels(button);
		return button;
	};
	const menuSkipped = (id: string) =>
		notApplied.push(
			`${id}: flyout / split buttons and their menus can't be imported yet (#27).`,
		);
	/**
	 * Controls of a group element the session can take: menu anchors (and the
	 * buttons of their menus, which the parser lists alongside) are reported.
	 */
	const groupControls = (
		groupEl: Element,
		parsedGroup: RibbonGroup | undefined,
	): RibbonButton[] => {
		const inMenus = new Set(
			Array.from(groupEl.querySelectorAll("Menu *"))
				.map((e) => e.getAttribute("Id"))
				.filter((id): id is string => !!id),
		);
		const out: RibbonButton[] = [];
		for (const b of parsedGroup?.buttons ?? []) {
			if (inMenus.has(b.id)) continue;
			if (MENU_KINDS.has(b.kind)) menuSkipped(b.id);
			else out.push(asNew(b));
		}
		return out;
	};
	const insertBySequence = <T extends { sequence: number }>(list: T[], item: T) => {
		const at = list.findIndex((x) => x.sequence > item.sequence);
		list.splice(at < 0 ? list.length : at, 0, item);
	};

	// ── Applying ──
	const editControl = (id: string, el: Element, caSequence: number | undefined) => {
		const hit = findControl(id);
		const incoming = parseControl(el);
		if (!hit || !incoming) return false;
		resolveTexts(incoming);
		checkLabels(incoming);
		noteScope(hit.location, id);
		for (const { group, button } of hit.found) {
			if (incoming.kind !== button.kind) {
				notApplied.push(
					`${id}: changing a <${el.tagName}> into another kind of control isn't supported.`,
				);
				return true;
			}
			if (MENU_KINDS.has(button.kind)) {
				menuSkipped(id);
				return true;
			}
			const before = JSON.parse(JSON.stringify(button)) as RibbonButton;
			Object.assign(button, {
				label: incoming.label,
				tooltipTitle: incoming.tooltipTitle,
				tooltipBody: incoming.tooltipBody,
				icon: incoming.icon,
				image16: incoming.image16,
				image32: incoming.image32,
				commandId: incoming.commandId,
				templateAlias: incoming.templateAlias || button.templateAlias,
				source: structuredClone(incoming.source),
			});
			const sequence = incoming.source?.attributes["Sequence"]
				? incoming.sequence
				: caSequence;
			if (sequence !== undefined && sequence !== button.sequence) {
				// Only your own buttons can be re-ordered (publishPlan).
				if (button.origin === "unmanaged") {
					group.buttons.splice(group.buttons.indexOf(button), 1);
					button.sequence = sequence;
					insertBySequence(group.buttons, button);
				} else {
					notApplied.push(
						`${id}: Sequence ${sequence} not applied — only your own buttons can be re-ordered.`,
					);
				}
			}
			if (hasOobOverrideChanges(before, button) || before.sequence !== button.sequence) {
				ribbonChanged = true;
				applied.push(`Updated ${button.label} (${id}) on ${hit.location}`);
				if (!incoming.templateAlias) {
					notes.push(
						`${id}: the override has no TemplateAlias — ${button.templateAlias} from the loaded control is kept.`,
					);
				}
			} else {
				// Nothing CBS publishes changed: keep the control exactly as loaded.
				Object.assign(button, before);
				if (!same(before.source?.attributes, incoming.source?.attributes)) {
					notApplied.push(
						`${id}: the override only changes attributes CBS doesn't publish yet (label, tooltip, icon, command and template alias are).`,
					);
				} else {
					upToDate++;
				}
			}
		}
		return true;
	};

	const addControl = (
		ca: Element,
		el: Element,
		groupId: string,
		caSequence: number | undefined,
	) => {
		const id = el.getAttribute("Id");
		if (!id)
			return notApplied.push(`CustomAction ${ca.getAttribute("Id")}: the control has no Id.`);
		const existing = findControl(id);
		if (existing) {
			if (!existing.found.some((f) => f.group.id === groupId)) {
				notApplied.push(
					`${id}: already in group ${existing.found[0].group.id} — updated there, not moved to ${groupId}.`,
				);
			}
			if (editControl(id, el, caSequence))
				noteId(ca.getAttribute("Id"), `${id}.Override.CustomAction`);
			return;
		}
		const target = findGroup(groupId);
		if (!target) return unknownLocation(`${id}`, ca.getAttribute("Location") ?? "");
		const button = parseControl(el);
		if (!button) return notApplied.push(`${id}: couldn't read the <${el.tagName}>.`);
		if (MENU_KINDS.has(button.kind)) return menuSkipped(id);
		insertBySequence(target.group.buttons, asNew(button, caSequence));
		noteScope(target.location, id);
		noteId(ca.getAttribute("Id"), `${id}.CustomAction`);
		ribbonChanged = true;
		applied.push(`Added ${button.label} (${id}) to ${target.group.id} on ${target.location}`);
	};

	const groupFrom = (
		groupEl: Element,
		caSequence: number | undefined,
	): RibbonGroup | undefined => {
		const parsedGroup = parseFragment(
			`<Tab Id="${IMPORT_TAB}"><Groups>${xmlOf(groupEl)}</Groups></Tab>`,
		)?.groups[0];
		if (!parsedGroup) return undefined;
		const source = containerSource(groupEl);
		checkLabels({ id: parsedGroup.id, source });
		return {
			...parsedGroup,
			label: text(source.titleToken, parsedGroup.id),
			source,
			sequence:
				groupEl.getAttribute("Sequence") === null
					? (caSequence ?? parsedGroup.sequence)
					: parsedGroup.sequence,
			buttons: groupControls(groupEl, parsedGroup),
		};
	};

	const addGroup = (ca: Element, el: Element, tabId: string, caSequence: number | undefined) => {
		const id = el.getAttribute("Id");
		if (!id)
			return notApplied.push(`CustomAction ${ca.getAttribute("Id")}: the group has no Id.`);
		const existing = findGroup(id);
		if (existing) {
			notApplied.push(
				`Group ${id} already exists — it was left as is (re-titling groups isn't supported).`,
			);
			for (const control of elementChildren(el.querySelector(":scope > Controls"))) {
				if (CONTROL_TAGS.has(control.tagName)) addControl(ca, control, id, undefined);
				else if (isReadOnlyControlKind(KIND_BY_CONTROL_TAG[control.tagName])) {
					notApplied.push(
						`${control.getAttribute("Id") ?? "(no Id)"}: adding a <${control.tagName}> to an existing group isn't supported — Command Bar Studio shows it read-only.`,
					);
				}
			}
			return;
		}
		const target = findTab(tabId);
		if (!target) return unknownLocation(`Group ${id}`, ca.getAttribute("Location") ?? "");
		const group = groupFrom(el, caSequence);
		if (!group) return notApplied.push(`Group ${id}: couldn't read the <Group>.`);
		insertBySequence(target.tab.groups, group);
		noteScope(target.location, id);
		noteId(ca.getAttribute("Id"), `${id}.CustomAction`);
		ribbonChanged = true;
		applied.push(
			`Added group ${group.label} (${id}) with ${group.buttons.length} control(s) to ${tabId} on ${target.location}`,
		);
	};

	const addTab = (ca: Element, el: Element, caSequence: number | undefined) => {
		const id = el.getAttribute("Id");
		if (!id)
			return notApplied.push(`CustomAction ${ca.getAttribute("Id")}: the tab has no Id.`);
		if (findTab(id)) return notApplied.push(`Tab ${id} already exists — it was left as is.`);
		// Parsed with the XML's TabDisplayRules, which bind to its Command.
		const parsedTab = parseFragment(xmlOf(el));
		if (!parsedTab) return notApplied.push(`Tab ${id}: couldn't read the <Tab>.`);
		const contexts = parsedTab.tabDisplayRules.flatMap((r) =>
			r.rules.map((s) => (s.kind === "EntityRule" ? contextLocation(s.context) : undefined)),
		);
		const location: RibbonLocation = application
			? "Application"
			: (contexts.find((c): c is RibbonLocation => !!c) ??
				(ENTITY_PREFIX.exec(id)?.[1] as RibbonLocation | undefined) ??
				home);
		const groupEls = Array.from(el.querySelectorAll(":scope > Groups > Group"));
		const groups = groupEls
			.map((g) => groupFrom(g, undefined))
			.filter((g): g is RibbonGroup => !!g);
		const source = containerSource(el);
		checkLabels({ id, source });
		const tab: RibbonTab = {
			...parsedTab,
			label: text(source.titleToken, id),
			source,
			sequence:
				el.getAttribute("Sequence") === null
					? (caSequence ?? parsedTab.sequence)
					: parsedTab.sequence,
			groups,
		};
		insertBySequence(ribbons[location].tabs, tab);
		noteId(ca.getAttribute("Id"), `${id}.CustomAction`);
		if (tab.commandId) {
			addedTabCommands.add(tab.commandId);
			// A tab's display rules refer to its Command, which must be defined:
			// an empty one when the XML has none (as for tabs created in CBS).
			if (!cmd.out.some((c) => c.id === tab.commandId)) {
				cmd.out.push({ id: tab.commandId, enableRules: [], displayRules: [], actions: [] });
				cmd.changedIds.push(tab.commandId);
				notes.push(
					`Tab ${id}: its Command ${tab.commandId} has no CommandDefinition in the XML — an empty one was added.`,
				);
			}
		}
		ribbonChanged = true;
		applied.push(
			`Added tab ${tab.label} (${id}) with ${groups.length} group(s) to ${location}`,
		);
		if (el.querySelector(":scope > Scaling > Scale")) {
			notApplied.push(
				`Tab ${id}: its <Scale> steps weren't imported — CBS writes a default MaxSize for each group.`,
			);
		}
	};

	const hideControl = (el: Element) => {
		const location = el.getAttribute("Location") ?? "";
		const hit = findControl(location);
		if (hit) {
			const visible = hit.found.filter((f) => !f.button.hidden);
			for (const f of visible) f.button.hidden = true;
			if (visible.length > 0) {
				noteScope(hit.location, location);
				noteId(el.getAttribute("HideActionId"), `${location}.HideAction`);
				ribbonChanged = true;
				applied.push(`Hid ${visible[0].button.label} (${location}) on ${hit.location}`);
			} else {
				upToDate++;
			}
			return;
		}
		if (findGroup(location) || findTab(location)) {
			return notApplied.push(
				`Hiding ${location}: hiding whole groups or tabs isn't supported yet — hide their buttons.`,
			);
		}
		notApplied.push(
			`Hiding ${location}: not found in the loaded ribbon (it may belong to another table, or already be hidden by your customizations).`,
		);
	};

	const applyCustomAction = (ca: Element) => {
		const caId = ca.getAttribute("Id") ?? "(no Id)";
		const location = ca.getAttribute("Location") ?? "";
		const seqAttr = ca.getAttribute("Sequence");
		const caSequence = seqAttr === null ? undefined : parseInt(seqAttr, 10);
		const def = elementChildren(ca.querySelector(":scope > CommandUIDefinition"))[0];
		if (!def) return notApplied.push(`CustomAction ${caId}: no <CommandUIDefinition> content.`);
		const tag = def.tagName;

		if (location.endsWith(CHILDREN)) {
			const parent = location.slice(0, -CHILDREN.length);
			if (parent.endsWith(".Controls") && CONTROL_TAGS.has(tag)) {
				return addControl(ca, def, parent.slice(0, -".Controls".length), caSequence);
			}
			if (parent.endsWith(".Groups") && tag === "Group") {
				return addGroup(ca, def, parent.slice(0, -".Groups".length), caSequence);
			}
			if (parent === "Mscrm.Tabs" && tag === "Tab") return addTab(ca, def, caSequence);
			if (parent.endsWith(".Scaling") && (tag === "MaxSize" || tag === "Scale")) {
				return notApplied.push(
					`CustomAction ${caId}: <${tag}> scaling isn't imported — CBS writes a default MaxSize for each new group.`,
				);
			}
			return notApplied.push(
				`CustomAction ${caId}: a <${tag}> at "${location}" isn't supported.`,
			);
		}

		// Location is an existing element: an override.
		if (CONTROL_TAGS.has(tag) && def.getAttribute("Id") === location) {
			if (editControl(location, def, caSequence)) {
				noteId(caId, `${location}.Override.CustomAction`);
				return;
			}
			return unknownLocation(`Override ${caId}`, location);
		}
		if (findControl(location) || findGroup(location) || findTab(location)) {
			return notApplied.push(
				`CustomAction ${caId}: replacing ${location} with a <${tag}> isn't supported — only overriding a control with the same Id is.`,
			);
		}
		return unknownLocation(`CustomAction ${caId}`, location);
	};

	const customActions = elementChildren(root.querySelector(":scope > CustomActions"));
	for (const el of customActions) {
		if (el.tagName === "CustomAction") applyCustomAction(el);
		else if (el.tagName === "HideCustomAction") hideControl(el);
		else notApplied.push(`<${el.tagName}> in CustomActions isn't supported.`);
	}

	// ── What won't be published (the planner only writes what buttons use) ──
	const usedCommands = new Set<string>();
	for (const location of LOCATIONS)
		for (const tab of ribbons[location].tabs)
			for (const group of tab.groups)
				for (const b of group.buttons) for (const id of controlCommandIds(b)) usedCommands.add(id);
	for (const c of addedTabCommands) usedCommands.add(c);
	const usedEnable = new Set<string>();
	const usedDisplay = new Set<string>();
	for (const c of cmd.out) {
		if (!usedCommands.has(c.id)) continue;
		c.enableRules.forEach((r) => usedEnable.add(r));
		c.displayRules.forEach((r) => usedDisplay.add(r));
		for (const raw of c.rawRuleRefs ?? []) {
			const m = RULE_REF.exec(raw.xml);
			if (m) (m[1] === "EnableRule" ? usedEnable : usedDisplay).add(m[2]);
		}
	}
	const unused = (ids: string[], used: Set<string>, what: string, why: string) => {
		for (const id of ids)
			if (!used.has(id))
				notApplied.push(`${what} ${id} was imported but ${why}, so it won't be published.`);
	};
	unused(cmd.changedIds, usedCommands, "Command", "no button on the loaded ribbon uses it");
	unused(enable.changedIds, usedEnable, "Enable rule", "no command a button uses references it");
	unused(
		display.changedIds,
		usedDisplay,
		"Display rule",
		"no command a button uses references it",
	);
	const usedLabels = new Set(Array.from(xmlOf(root).matchAll(LOC_LABEL_REF), (m) => m[1]));
	for (const location of LOCATIONS)
		for (const tab of ribbons[location].tabs)
			for (const group of tab.groups)
				for (const b of group.buttons)
					for (const v of Object.values(b.source?.attributes ?? {}))
						for (const m of v.matchAll(LOC_LABEL_REF)) usedLabels.add(m[1]);
	unused(labels.changedIds, usedLabels, "Label", "nothing references it");

	const tabRules = Array.from(
		root.querySelectorAll(":scope > RuleDefinitions > TabDisplayRules > TabDisplayRule"),
	);
	for (const tdr of tabRules) {
		const command = tdr.getAttribute("TabCommand") ?? "";
		if (!addedTabCommands.has(command)) {
			notApplied.push(
				`TabDisplayRule for ${command}: only the display rules of tabs this import adds are imported.`,
			);
		}
		const other = elementChildren(tdr).filter(
			(r) => r.tagName !== "EntityRule" && r.tagName !== "PageRule",
		);
		if (other.length > 0) {
			notApplied.push(
				`TabDisplayRule for ${command}: ${other.map((r) => `<${r.tagName}>`).join(", ")} not imported — only EntityRule and PageRule are supported.`,
			);
		}
	}

	if (normalised.length > 0) {
		notes.push(
			`Ids normalised: CBS publishes CustomAction / HideCustomAction ids as {control}.CustomAction, {control}.Override.CustomAction and {control}.HideAction, so ${normalised.join(", ")} will be written under those ids.`,
		);
	}
	if (unchanged + upToDate > 0) {
		applied.push(`${unchanged + upToDate} control(s) / definition(s) were already up to date`);
	}
	const changed =
		ribbonChanged ||
		cmd.changedIds.length +
			enable.changedIds.length +
			display.changedIds.length +
			labels.changedIds.length >
			0;
	return {
		ribbons: ribbonChanged ? ribbons : input.ribbons,
		commands: cmd.out,
		enableRules: enable.out,
		displayRules: display.out,
		locLabels,
		applied,
		notApplied,
		notes,
		changed,
	};
}
