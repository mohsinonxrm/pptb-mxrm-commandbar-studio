import type {
	RibbonButton,
	RibbonGroup,
	RibbonMenu,
	RibbonMenuSection,
	RibbonTab,
	RibbonDefinition,
	RibbonLocation,
	CommandDefinition,
	EnableRule,
	DisplayRule,
	LocLabel,
	TabDisplayRule,
	RuleStep,
	ActionParameter,
	JavaScriptAction,
	UrlAction,
	RibbonAction,
	RawAction,
	RawRuleStep,
	StandardRuleAttributes,
	CrmParameterValue,
	EntityProperty,
	ScalingDefinition,
	ScaleStep,
} from "@/types/ribbon";
import { generateAction, generateRuleStep } from "@/services/xmlGenerator";
import { canonicalXml, parseXmlElement, sameXml } from "@/services/ribbonXmlCanonical";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { applyButtonOrigin, heuristicOrigin } from "@/utils/ribbonProvenance";
import { groupControls } from "@/utils/ribbonMenu";
import { isReadOnlyControlKind, KIND_BY_CONTROL_TAG } from "@/utils/controlKinds";

/**
 * Parses a fully-merged ribbon XML (from RetrieveEntityRibbon / RetrieveApplicationRibbon)
 * into the CBS internal data model.
 */
export function parseRibbonXml(
	xml: string,
	location: RibbonLocation,
	entityLogicalName: string,
	/** LocLabels from the unmanaged layer (ribbondiffs difftype 3). The merged
	 * RetrieveEntityRibbon output carries none, so without these every
	 * `$LocLabels:` caption resolves to its id (#12). */
	extraLocLabels: LocLabel[] = [],
): {
	ribbon: RibbonDefinition;
	commands: CommandDefinition[];
	displayRules: DisplayRule[];
	enableRules: EnableRule[];
	locLabels: LocLabel[];
} {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "application/xml");

	const parseError = doc.querySelector("parsererror");
	if (parseError) {
		throw new Error(`Ribbon XML parse error: ${parseError.textContent ?? "Unknown"}`);
	}

	const tabs = parseTabs(doc);
	const scalingByTab = parseScaling(doc);
	// TabDisplayRules live at document root under RuleDefinitions > TabDisplayRules,
	// not inside <Tab> elements. Apply them after all tabs are built.
	applyTabDisplayRules(doc, tabs);
	const verifier = new LosslessVerifier();
	const commands = parseCommands(doc, verifier);
	const enableRules = parseEnableRules(doc, verifier);
	const displayRules = parseDisplayRules(doc, verifier);
	verifier.flush();
	const locLabels = [...parseLocLabels(doc)];
	for (const l of extraLocLabels) if (!locLabels.some((x) => x.id === l.id)) locLabels.push(l);

	// Build set of customized element IDs from CustomAction elements
	const customActionIds = new Set<string>();
	const hideActionIds = new Set<string>();

	doc.querySelectorAll("CustomAction").forEach((ca) => {
		const def = ca.querySelector("CommandUIDefinition");
		if (def?.firstElementChild) {
			const id = def.firstElementChild.getAttribute("Id") ?? "";
			if (id) customActionIds.add(id);
		}
	});

	doc.querySelectorAll("HideCustomAction").forEach((h) => {
		const loc = h.getAttribute("Location") ?? "";
		if (loc) hideActionIds.add(loc);
	});

	// Mark provenance (heuristic — refined later by solution-layer data) and
	// resolve label / tooltip text.
	//
	// Labels arrive as raw ribbon tokens (`$LocLabels:<id>`, `$Resources:<key>`,
	// or literal). We resolve them to human-readable text here (now that
	// `locLabels` is parsed) so `button.label` is ALWAYS display text — the
	// canvas shows "Save", not "Mscrm.…LabelText", and the generator can
	// round-trip a loaded custom button's label back into a proper <LocLabel>.
	//
	// Provenance is a best-effort heuristic at parse time; authoritative
	// OOB/managed/unmanaged comes from ribbonProvenanceService and is overlaid
	// after load (see applyProvenanceToRibbons).
	for (const tab of tabs) {
		for (const group of tab.groups) {
			for (const button of groupControls(group)) {
				const inCustomAction = customActionIds.has(button.id);
				applyButtonOrigin(button, {
					origin: heuristicOrigin(button.id, inCustomAction),
				});
				button.hidden = hideActionIds.has(button.id);
				if (button.source) {
					button.source.labelToken = button.source.attributes["LabelText"];
					button.source.tooltipTitleToken = button.source.attributes["ToolTipTitle"];
					button.source.tooltipBodyToken = button.source.attributes["ToolTipDescription"];
				}
				button.label = resolveDisplayLabel(button.label, locLabels);
				if (button.tooltipTitle) {
					button.tooltipTitle = resolveDisplayLabel(button.tooltipTitle, locLabels);
				}
				if (button.tooltipBody) {
					button.tooltipBody = resolveDisplayLabel(button.tooltipBody, locLabels);
				}
				// Menu section titles, like labels: the raw token stays in `attributes`.
				for (const section of button.menu?.sections ?? []) {
					if (section.title)
						section.title = resolveDisplayLabel(section.title, locLabels);
				}
			}
		}
	}

	// Layout titles of the templates the groups use, for the pre-publish check (#35).
	const templateLayouts = parseTemplateLayouts(doc, tabs);
	return {
		ribbon: {
			location,
			entityLogicalName,
			tabs,
			...(Object.keys(scalingByTab).length > 0 ? { scalingByTab } : {}),
			...(Object.keys(templateLayouts).length ? { templateLayouts } : {}),
		},
		commands,
		displayRules,
		enableRules,
		locLabels,
	};
}

// ---------------------------------------------------------------------------
// Tabs / Groups / Buttons
// ---------------------------------------------------------------------------

/**
 * The tabs of the ribbon (RibbonWSS.xsd RibbonType): `Ribbon > Tabs` and the
 * contextual groups of `Ribbon > ContextualTabs`. A `<Tab>` anywhere else — in
 * a CustomAction of a RibbonDiffXml or of a layer fragment — is a change, not
 * a tab of the ribbon (#42).
 */
const TAB_SELECTOR = "Ribbon > Tabs > Tab, Ribbon > ContextualTabs > ContextualGroup > Tab";

/** `{ description }` when the element has a Description (never invented, #42). */
function descriptionOf(el: Element): { description?: string } {
	const description = el.getAttribute("Description");
	return description === null ? {} : { description };
}

function parseTabs(doc: Document): RibbonTab[] {
	const tabs: RibbonTab[] = [];

	doc.querySelectorAll(TAB_SELECTOR).forEach((tabEl) => {
		const id = tabEl.getAttribute("Id") ?? "";
		if (!id) return;
		const label = tabEl.getAttribute("Title") ?? id;

		const groups: RibbonGroup[] = [];
		tabEl.querySelectorAll(":scope > Groups > Group").forEach((groupEl) => {
			const groupId = groupEl.getAttribute("Id") ?? "";
			if (!groupId) return;
			// Raw token like the tab's Title (`$LocLabels:…` is resolved for display).
			const groupLabel =
				groupEl.getAttribute("Title") ?? groupEl.getAttribute("Label") ?? groupId;
			const groupSeq = parseInt(groupEl.getAttribute("Sequence") ?? "0", 10);
			const template = groupEl.getAttribute("Template") ?? "";

			// Only the group's own controls: the items of a FlyoutAnchor /
			// SplitButton `<Menu>` belong to that control's menu (#27), not to the
			// group (a descendant selector flattened them into it).
			const buttons: RibbonButton[] = [];
			groupEl.querySelectorAll(":scope > Controls > *").forEach((btnEl) => {
				if (KIND_BY_CONTROL_TAG[btnEl.tagName]) parseButtonElement(btnEl, buttons);
			});

			groups.push({
				id: groupId,
				label: groupLabel,
				sequence: groupSeq,
				template,
				...descriptionOf(groupEl),
				buttons,
			});
		});

		// No `Template`: TabType has none (RibbonWSS.xsd), and it was never written back (#42).
		tabs.push({
			id,
			label,
			sequence: parseInt(tabEl.getAttribute("Sequence") ?? "0", 10),
			commandId: tabEl.getAttribute("Command") ?? undefined,
			...descriptionOf(tabEl),
			tabDisplayRules: [], // populated later by applyTabDisplayRules()
			groups,
		});
	});

	return tabs.sort((a, b) => a.sequence - b.sequence);
}

/**
 * Each tab's `<Scaling>` (MaxSize / Scale steps in document order). A new
 * group's MaxSize needs a Sequence no other step of the tab uses: a collision
 * made Unified Interface drop every custom control of the table (#66 review).
 */
function parseScaling(doc: Document): Record<string, ScalingDefinition> {
	const out: Record<string, ScalingDefinition> = {};
	doc.querySelectorAll(TAB_SELECTOR).forEach((tabEl) => {
		const tabId = tabEl.getAttribute("Id");
		const scalingEl = Array.from(tabEl.children).find((c) => c.tagName === "Scaling");
		if (!tabId || !scalingEl || out[tabId]) return;
		const step = (el: Element): ScaleStep => ({
			id: el.getAttribute("Id") ?? "",
			groupId: el.getAttribute("GroupId") ?? "",
			size: el.getAttribute("Size") ?? "",
			sequence: parseInt(el.getAttribute("Sequence") ?? "0", 10),
			...(el.getAttribute("PopupSize") ? { popupSize: el.getAttribute("PopupSize")! } : {}),
		});
		const kids = Array.from(scalingEl.children);
		out[tabId] = {
			tabId,
			maxSizes: kids.filter((k) => k.tagName === "MaxSize").map(step),
			scales: kids.filter((k) => k.tagName === "Scale").map(step),
		};
	});
	return out;
}

/** Layout titles of the group templates the tabs' groups use (`GroupTemplate` > `Layout Title`). */
function parseTemplateLayouts(doc: Document, tabs: RibbonTab[]): Record<string, string[]> {
	const used = new Set(tabs.flatMap((t) => t.groups.map((g) => g.template)).filter(Boolean));
	const out: Record<string, string[]> = {};
	doc.querySelectorAll("GroupTemplate").forEach((el) => {
		const id = el.getAttribute("Id");
		if (!id || !used.has(id)) return;
		out[id] = Array.from(el.querySelectorAll(":scope > Layout"))
			.map((l) => l.getAttribute("Title") ?? "")
			.filter(Boolean);
	});
	return out;
}

/**
 * TabDisplayRules are stored at document root under
 * <RuleDefinitions><TabDisplayRules> — NOT inside <Tab> elements.
 * They bind to a tab by matching TabCommand → Tab.commandId.
 * This function overlays them onto the already-parsed tabs.
 */
function applyTabDisplayRules(doc: Document, tabs: RibbonTab[]): void {
	const tabsByCommandId = new Map<string, RibbonTab>();
	for (const tab of tabs) {
		if (tab.commandId) tabsByCommandId.set(tab.commandId, tab);
	}

	doc.querySelectorAll("RuleDefinitions > TabDisplayRules > TabDisplayRule").forEach((tdr) => {
		const tabCommand = tdr.getAttribute("TabCommand") ?? "";
		const target = tabsByCommandId.get(tabCommand);
		if (!target) return;

		// In document order. Several TabDisplayRules for one tab are one rule
		// (any step shows the tab), as they're published (#155).
		const rules: TabDisplayRule["rules"] = [];
		for (const step of Array.from(tdr.children)) {
			if (step.tagName === "EntityRule") {
				rules.push({
					kind: "EntityRule",
					entityName: step.getAttribute("EntityName") ?? undefined,
					appliesTo: (step.getAttribute("AppliesTo") ?? undefined) as
						"PrimaryEntity" | "SelectedEntity" | undefined,
					context: (step.getAttribute("Context") ?? undefined) as
						| "Form"
						| "HomePageGrid"
						| "SubGridStandard"
						| "SubGridAssociated"
						| undefined,
				});
			} else if (step.tagName === "PageRule") {
				rules.push({ kind: "PageRule", address: step.getAttribute("Address") ?? "" });
			}
		}
		if (rules.length === 0) return;
		const existing = target.tabDisplayRules.find((r) => r.tabCommand === tabCommand);
		if (existing) existing.rules.push(...rules);
		else target.tabDisplayRules.push({ tabCommand, rules });
	});
}

function parseButtonElement(el: Element, out: RibbonButton[]) {
	const id = el.getAttribute("Id") ?? "";
	if (!id) return;

	const kind: RibbonButton["kind"] = KIND_BY_CONTROL_TAG[el.tagName] ?? "button";
	// ToggleButton, Label, DropDown, … are shown read-only: their element is
	// kept whole and written back verbatim, `<Menu>` / `<Unit>` children included (#42).
	const readOnly = isReadOnlyControlKind(kind);

	// Keep the raw LabelText token (`$LocLabels:…` / `$Resources:…` / literal);
	// it is resolved to display text in parseRibbonXml once LocLabels are known.
	const label = el.getAttribute("LabelText") ?? id;
	const icon = normalizeFluentIconName(el.getAttribute("ModernImage") ?? undefined);
	const sequence = parseInt(el.getAttribute("Sequence") ?? "0", 10);
	const templateAlias = el.getAttribute("TemplateAlias") ?? "";
	const commandId = el.getAttribute("Command") ?? "";

	out.push({
		id,
		label,
		icon,
		sequence,
		templateAlias,
		commandId,
		kind,
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		tooltipTitle: el.getAttribute("ToolTipTitle") ?? undefined,
		tooltipBody: el.getAttribute("ToolTipDescription") ?? undefined,
		image16: el.getAttribute("Image16by16") ?? undefined,
		image32: el.getAttribute("Image32by32") ?? undefined,
		source: {
			modernImage: el.getAttribute("ModernImage") ?? undefined,
			attributes: attributesOf(el),
			...(readOnly ? { xml: xmlSerializer().serializeToString(el) } : {}),
		},
		menu: readOnly ? undefined : parseMenu(el),
	});
}

/**
 * Controls CBS models inside a menu section (#27). The other controls a menu
 * section allows (ToggleButton, ColorPicker, InsertTable) are kept as raw XML.
 */
const CONTROL_TAGS = new Set([
	"Button",
	"FlyoutAnchor",
	"SplitButton",
	"TextBox",
	"ComboBox",
	"CheckBox",
]);

function attributesOf(el: Element): Record<string, string> {
	return Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value]));
}

/**
 * The `<Menu>` of a FlyoutAnchor / SplitButton / ComboBox (#27):
 * `<Menu Id><MenuSection Id Title Sequence DisplayMode><Controls Id>…`. Items
 * are parsed like group controls (so a nested FlyoutAnchor gets its own menu);
 * section children CBS doesn't model are kept as raw XML. A control populated
 * dynamically (`PopulateDynamically` / `PopulateQueryCommand`, kept in its
 * source attributes) usually has no static `<Menu>` at all.
 */
function parseMenu(el: Element): RibbonMenu | undefined {
	const menuEl = elementChildren(el).find((c) => c.tagName === "Menu");
	if (!menuEl) return undefined;
	const attributes = attributesOf(menuEl);
	const sections: RibbonMenuSection[] = [];
	for (const sectionEl of elementChildren(menuEl)) {
		if (sectionEl.tagName !== "MenuSection") continue;
		const sectionId = sectionEl.getAttribute("Id") ?? "";
		const controlsEl = elementChildren(sectionEl).find((c) => c.tagName === "Controls");
		const controls: RibbonButton[] = [];
		const rawControls: NonNullable<RibbonMenuSection["rawControls"]> = [];
		elementChildren(controlsEl).forEach((c, index) => {
			if (CONTROL_TAGS.has(c.tagName) && c.getAttribute("Id"))
				parseButtonElement(c, controls);
			else rawControls.push({ index, xml: xmlSerializer().serializeToString(c) });
		});
		const sectionAttributes = attributesOf(sectionEl);
		sections.push({
			id: sectionId,
			title: sectionEl.getAttribute("Title") ?? undefined,
			sequence: parseInt(sectionEl.getAttribute("Sequence") ?? "0", 10),
			displayMode: sectionEl.getAttribute("DisplayMode") ?? undefined,
			controlsId: controlsEl?.getAttribute("Id") ?? `${sectionId}.Controls`,
			controls,
			attributes: sectionAttributes,
			...(rawControls.length ? { rawControls } : {}),
			// A Gallery (or an empty section) instead of <Controls>.
			...(controlsEl
				? {}
				: {
						rawContent: elementChildren(sectionEl)
							.map((c) => xmlSerializer().serializeToString(c))
							.join(""),
					}),
		});
	}
	return {
		id: menuEl.getAttribute("Id") ?? `${el.getAttribute("Id")}.Menu`,
		sections,
		attributes,
	};
}

function normalizeFluentIconName(iconName?: string): string | undefined {
	if (!iconName) return undefined;
	if (iconName.includes("_")) return iconName.toLowerCase();
	return iconName
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.toLowerCase();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
//
// Fidelity contract (#29, #42): every action and rule step is parsed into the
// model AND checked by regenerating it and comparing the canonical XML with the
// source element (ribbonXmlCanonical.ts). Anything the model cannot reproduce
// exactly — an unknown element, an unexpected attribute or child, a value the
// parser would have to default — is kept as a raw passthrough (RawAction /
// RawRule) holding the original XML, which the generator writes back verbatim.
// Re-emitting a parsed command or rule therefore never changes its meaning.

const xmlSerializer = () => new XMLSerializer();

function elementChildren(el: Element | null | undefined): Element[] {
	if (!el) return [];
	return Array.from(el.childNodes).filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE);
}

interface PendingCheck {
	source: Element;
	/** Generates the model's XML; called at flush time, after nested replacements. */
	generate: () => string;
	/** Swaps the modelled item for its raw passthrough. */
	fallback: () => void;
	/** 0 = leaf steps and actions; 1 = OrRules (checked after their nested steps). */
	phase: 0 | 1;
}

/**
 * Collects every modelled action / rule step and checks them in bulk: the
 * generated XML of a whole phase is parsed with ONE DOMParser call (parsing
 * each step separately made loading a ribbon several times slower).
 */
class LosslessVerifier {
	private pending: PendingCheck[] = [];

	add(check: PendingCheck) {
		this.pending.push(check);
	}

	flush() {
		for (const phase of [0, 1] as const) {
			const batch = this.pending.filter((p) => p.phase === phase);
			if (batch.length === 0) continue;
			const generated = batch.map((p) => p.generate());
			let roots: Element[] | null = null;
			try {
				const wrapper = parseXmlElement(
					`<v>${generated.map((g) => `<i>${g}</i>`).join("")}</v>`,
				);
				roots = elementChildren(wrapper).map((i) => elementChildren(i)[0]);
			} catch {
				roots = null; // a malformed item: fall back to checking one by one
			}
			batch.forEach((p, i) => {
				const ok = roots
					? !!roots[i] && canonicalXml(roots[i]) === canonicalXml(p.source)
					: sameXml(generated[i], p.source);
				if (!ok) p.fallback();
			});
		}
		this.pending = [];
	}
}

function parseCommands(doc: Document, verifier: LosslessVerifier): CommandDefinition[] {
	const commands: CommandDefinition[] = [];

	doc.querySelectorAll("CommandDefinition").forEach((cmdEl) => {
		const id = cmdEl.getAttribute("Id") ?? "";
		if (!id) return;

		const sections = elementChildren(cmdEl);
		const section = (tag: string) => sections.find((c) => c.tagName === tag);

		const rawRuleRefs: NonNullable<CommandDefinition["rawRuleRefs"]> = [];
		const refs = (container: "EnableRules" | "DisplayRules", tag: string): string[] => {
			const ids: string[] = [];
			elementChildren(section(container)).forEach((r, index) => {
				const rid = r.getAttribute("Id");
				// Only a plain `<EnableRule Id/>` / `<DisplayRule Id/>` is modelled.
				if (
					r.tagName === tag &&
					rid &&
					r.attributes.length === 1 &&
					elementChildren(r).length === 0
				) {
					ids.push(rid);
				} else {
					rawRuleRefs.push({
						container,
						index,
						xml: xmlSerializer().serializeToString(r),
					});
				}
			});
			return ids;
		};
		const enableRules = refs("EnableRules", "EnableRule");
		const displayRules = refs("DisplayRules", "DisplayRule");

		// Actions in document order — a command may mix JavaScriptFunction, Url
		// and OutlookCommand actions, and their order is significant.
		const actions: RibbonAction[] = [];
		elementChildren(section("Actions")).forEach((el, i) => {
			const action = parseAction(el);
			if (!action) {
				actions.push(rawAction(el));
				return;
			}
			actions.push(action);
			verifier.add({
				source: el,
				generate: () => generateAction(action),
				fallback: () => (actions[i] = rawAction(el)),
				phase: 0,
			});
		});

		commands.push({
			id,
			enableRules,
			displayRules,
			actions,
			...(rawRuleRefs.length > 0 ? { rawRuleRefs } : {}),
		});
	});

	return commands;
}

function rawAction(el: Element): RawAction {
	return { kind: "raw", tagName: el.tagName, xml: xmlSerializer().serializeToString(el) };
}

function parseAction(el: Element): RibbonAction | null {
	switch (el.tagName) {
		case "JavaScriptFunction": {
			const params = parseActionParams(el);
			if (!params) return null;
			const action: JavaScriptAction = {
				kind: "javascript",
				library: el.getAttribute("Library") ?? "",
				functionName: el.getAttribute("FunctionName") ?? "",
				params,
			};
			return action;
		}
		case "Url": {
			const params = parseActionParams(el);
			if (!params) return null;
			const winMode = el.getAttribute("WinMode");
			const action: UrlAction = {
				kind: "url",
				address: el.getAttribute("Address") ?? "",
				passParams: parseBool(el.getAttribute("PassParams")),
				winMode: winMode === null ? undefined : (Number(winMode) as 0 | 1 | 2),
				winParams: el.getAttribute("WinParams") ?? undefined,
				params,
			};
			return action;
		}
		case "OutlookCommand":
			return {
				kind: "outlookCommand",
				actionType: el.getAttribute("ActionType") ?? "",
				data: el.getAttribute("Data") ?? undefined,
			};
		default:
			return null;
	}
}

/**
 * xs:boolean: `true`/`1` and `false`/`0`. undefined when the attribute is
 * absent (or not a boolean — the self-check then keeps the element raw).
 */
function parseBool(value: string | null): boolean | undefined {
	if (value === null) return undefined;
	const v = value.trim();
	if (v === "true" || v === "1") return true;
	if (v === "false" || v === "0") return false;
	return undefined;
}

/** Parameter children of a JavaScriptFunction / Url / CustomRule; null if one is not a known parameter. */
function parseActionParams(el: Element): ActionParameter[] | null {
	const params: ActionParameter[] = [];
	for (const c of elementChildren(el)) {
		const name = c.getAttribute("Name") ?? undefined;
		const value = c.getAttribute("Value") ?? "";
		switch (c.tagName) {
			case "CrmParameter":
				params.push({ kind: "CrmParameter", name, value: value as CrmParameterValue });
				break;
			case "BoolParameter":
				params.push({ kind: "BoolParameter", name, value: parseBool(value) ?? false });
				break;
			case "IntParameter":
				params.push({ kind: "IntParameter", name, value: parseInt(value, 10) });
				break;
			case "DecimalParameter":
				params.push({ kind: "DecimalParameter", name, value: parseFloat(value) });
				break;
			case "StringParameter":
				params.push({ kind: "StringParameter", name, value });
				break;
			default:
				return null;
		}
	}
	return params;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function parseEnableRules(doc: Document, verifier: LosslessVerifier): EnableRule[] {
	const rules: EnableRule[] = [];
	// Scope to RuleDefinitions: `EnableRules > EnableRule` alone also matches the
	// `<EnableRule Id="…"/>` references inside every CommandDefinition, which produced
	// empty duplicate definitions that won the dedupe and replaced the real ones (#39).
	doc.querySelectorAll("RuleDefinitions > EnableRules > EnableRule").forEach((rEl) => {
		const id = rEl.getAttribute("Id") ?? "";
		if (!id) return;
		rules.push({ id, steps: parseRuleSteps(rEl, verifier) });
	});
	return rules;
}

function parseDisplayRules(doc: Document, verifier: LosslessVerifier): DisplayRule[] {
	const rules: DisplayRule[] = [];
	// Scoped to RuleDefinitions for the same reason as parseEnableRules (#39).
	doc.querySelectorAll("RuleDefinitions > DisplayRules > DisplayRule").forEach((rEl) => {
		const id = rEl.getAttribute("Id") ?? "";
		if (!id) return;
		rules.push({ id, steps: parseRuleSteps(rEl, verifier) });
	});
	return rules;
}

/**
 * The steps of a rule (or of one `<Or>` group). Each modelled step is queued
 * for the lossless check; a step that fails it is replaced in place by a
 * verbatim RawRule.
 */
function parseRuleSteps(parent: Element, verifier: LosslessVerifier): RuleStep[] {
	const steps: RuleStep[] = [];
	elementChildren(parent).forEach((el, i) => {
		const step = parseRuleStep(el, verifier);
		if (!step) {
			steps.push(rawRule(el));
			return;
		}
		steps.push(step);
		verifier.add({
			source: el,
			generate: () => generateRuleStep(steps[i]),
			fallback: () => (steps[i] = rawRule(el)),
			phase: step.kind === "OrRule" ? 1 : 0,
		});
	});
	return steps;
}

function rawRule(el: Element): RawRuleStep {
	return { kind: "RawRule", tagName: el.tagName, xml: xmlSerializer().serializeToString(el) };
}

/** `Default` / `InvertResult` (StandardRuleAttributes), only when present. */
function standardAttributes(el: Element): StandardRuleAttributes {
	const out: StandardRuleAttributes = {};
	const def = parseBool(el.getAttribute("Default"));
	const inv = parseBool(el.getAttribute("InvertResult"));
	if (def !== undefined) out.default = def;
	if (inv !== undefined) out.invertResult = inv;
	return out;
}

function optInt(el: Element, name: string): number | undefined {
	const v = el.getAttribute(name);
	return v === null ? undefined : parseInt(v, 10);
}

function optStr<T extends string = string>(el: Element, name: string): T | undefined {
	return (el.getAttribute(name) ?? undefined) as T | undefined;
}

function reqStr<T extends string = string>(el: Element, name: string): T {
	return (el.getAttribute(name) ?? "") as T;
}

type AppliesTo = "PrimaryEntity" | "SelectedEntity";
type PrivilegeType = Extract<RuleStep, { kind: "RecordPrivilegeRule" }>["privilegeType"];
type PrivilegeDepth = Extract<RuleStep, { kind: "EntityPrivilegeRule" }>["privilegeDepth"];

function parseRuleStep(el: Element, verifier: LosslessVerifier): RuleStep | null {
	const std = standardAttributes(el);
	switch (el.tagName) {
		case "OrRule": {
			// Each <Or> is an AND-group of one or more rules (RibbonTypes.xsd
			// OrEnableRuleType / OrDisplayRuleType). Keeping the groups intact is
			// what preserves `(A and B) or C` (#29).
			const children = elementChildren(el);
			if (children.some((c) => c.tagName !== "Or")) return null;
			return {
				kind: "OrRule",
				groups: children.map((orEl) => parseRuleSteps(orEl, verifier)),
			};
		}
		case "SelectionCountRule":
			return {
				kind: "SelectionCountRule",
				minimum: optInt(el, "Minimum"),
				maximum: optInt(el, "Maximum"),
				appliesTo: optStr<AppliesTo>(el, "AppliesTo"),
				...std,
			};
		case "EntityRule":
			return {
				kind: "EntityRule",
				entityName: optStr(el, "EntityName"),
				context: optStr(el, "Context"),
				appliesTo: optStr<AppliesTo>(el, "AppliesTo"),
				...std,
			};
		case "FormStateRule":
			return { kind: "FormStateRule", state: reqStr(el, "State"), ...std };
		case "CommandClientTypeRule":
			return { kind: "CommandClientTypeRule", type: reqStr(el, "Type"), ...std };
		case "CustomRule": {
			const params = parseActionParams(el);
			if (!params) return null;
			return {
				kind: "CustomRule",
				library: reqStr(el, "Library"),
				functionName: reqStr(el, "FunctionName"),
				...(params.length > 0 ? { params } : {}),
				...std,
			};
		}
		case "FeatureControlRule": {
			const expected = parseBool(el.getAttribute("ExpectedValue"));
			if (expected === undefined) return null;
			return {
				kind: "FeatureControlRule",
				featureControlBit: reqStr(el, "FeatureControlBit"),
				expectedValue: expected,
				...std,
			};
		}
		case "MiscellaneousPrivilegeRule":
			return {
				kind: "MiscellaneousPrivilegeRule",
				privilegeName: reqStr(el, "PrivilegeName"),
				privilegeDepth: optStr<PrivilegeDepth>(el, "PrivilegeDepth"),
				...std,
			};
		case "CrmClientTypeRule":
			return { kind: "CrmClientTypeRule", type: reqStr(el, "Type"), ...std };
		case "FormTypeRule":
			return { kind: "FormTypeRule", type: reqStr(el, "Type"), ...std };
		case "ValueRule":
			return {
				kind: "ValueRule",
				field: reqStr(el, "Field"),
				value: reqStr(el, "Value"),
				...std,
			};
		case "SkuRule":
			return { kind: "SkuRule", sku: reqStr(el, "Sku"), ...std };
		case "HideForTabletExperienceRule":
			return { kind: "HideForTabletExperienceRule", ...std };
		case "OrganizationSettingRule":
			return { kind: "OrganizationSettingRule", setting: reqStr(el, "Setting"), ...std };
		case "EntityPrivilegeRule":
			return {
				kind: "EntityPrivilegeRule",
				entityName: optStr(el, "EntityName"),
				appliesTo: optStr<AppliesTo>(el, "AppliesTo"),
				privilegeType: reqStr<PrivilegeType>(el, "PrivilegeType"),
				// Required by the schema; a missing value fails the self-check → raw.
				privilegeDepth: reqStr<PrivilegeDepth>(el, "PrivilegeDepth"),
				...std,
			};
		case "EntityPropertyRule": {
			const value = parseBool(el.getAttribute("PropertyValue"));
			if (value === undefined) return null;
			return {
				kind: "EntityPropertyRule",
				entityName: optStr(el, "EntityName"),
				appliesTo: optStr<AppliesTo>(el, "AppliesTo"),
				propertyName: reqStr<EntityProperty>(el, "PropertyName"),
				propertyValue: value,
				...std,
			};
		}
		case "DeviceTypeRule":
			return { kind: "DeviceTypeRule", type: reqStr(el, "Type"), ...std };
		case "OptionSetRule":
			return {
				kind: "OptionSetRule",
				optionSet: reqStr(el, "OptionSet"),
				stateCode: reqStr(el, "StateCode"),
				objectTypeCode: reqStr(el, "ObjectTypeCode"),
				...std,
			};
		case "RecordPrivilegeRule":
			return {
				kind: "RecordPrivilegeRule",
				privilegeType: reqStr<PrivilegeType>(el, "PrivilegeType"),
				appliesTo: optStr<"PrimaryEntity">(el, "AppliesTo"),
				...std,
			};
		case "FormEntityContextRule":
			return { kind: "FormEntityContextRule", entityName: reqStr(el, "EntityName"), ...std };
		case "PageRule":
			return { kind: "PageRule", address: reqStr(el, "Address"), ...std };
		case "RelationshipTypeRule":
			return {
				kind: "RelationshipTypeRule",
				// Required (always SelectedEntity); a missing value fails the self-check → raw.
				appliesTo: "SelectedEntity",
				relationshipType: optStr<"OneToMany" | "ManyToMany" | "NoRelationship">(
					el,
					"RelationshipType",
				),
				allowCustomRelationship: parseBool(el.getAttribute("AllowCustomRelationship")),
				allowSystemRelationship: parseBool(el.getAttribute("AllowSystemRelationship")),
				...std,
			};
		case "ReferencingAttributeRequiredRule":
			return { kind: "ReferencingAttributeRequiredRule", ...std };
		case "OutlookItemTrackingRule": {
			const tracked = parseBool(el.getAttribute("TrackedInCrm"));
			if (tracked === undefined) return null;
			return {
				kind: "OutlookItemTrackingRule",
				trackedInCrm: tracked,
				appliesTo: optStr<"PrimaryEntity">(el, "AppliesTo"),
				...std,
			};
		}
		case "OutlookRenderTypeRule":
			return { kind: "OutlookRenderTypeRule", type: reqStr(el, "Type"), ...std };
		case "OutlookVersionRule":
			return { kind: "OutlookVersionRule", version: reqStr(el, "Version"), ...std };
		case "CrmOfflineAccessStateRule":
			return { kind: "CrmOfflineAccessStateRule", state: reqStr(el, "State"), ...std };
		case "CrmOutlookClientTypeRule":
			return { kind: "CrmOutlookClientTypeRule", type: reqStr(el, "Type"), ...std };
		case "CrmOutlookClientVersionRule":
			return {
				kind: "CrmOutlookClientVersionRule",
				major: parseInt(reqStr(el, "Major"), 10),
				minor: optInt(el, "Minor"),
				build: optInt(el, "Build"),
				revision: optInt(el, "Revision"),
				...std,
			};
		default:
			// Unmodelled (HideIf*Rule, IsExportToExcelOnlineEnabledRule,
			// ContextTypeRule, …) → kept verbatim as a RawRule.
			return null;
	}
}

// ---------------------------------------------------------------------------
// LocLabels
// ---------------------------------------------------------------------------

function parseLocLabels(doc: Document): LocLabel[] {
	const labels: LocLabel[] = [];
	doc.querySelectorAll("LocLabel").forEach((lEl) => {
		const id = lEl.getAttribute("Id") ?? "";
		if (!id) return;
		const titles: LocLabel["titles"] = [];
		lEl.querySelectorAll("Title").forEach((t) => {
			const langCode = parseInt(t.getAttribute("languagecode") ?? "1033", 10);
			const description = t.getAttribute("description") ?? "";
			titles.push({ languageCode: langCode, description });
		});
		labels.push({ id, titles });
	});
	return labels;
}
