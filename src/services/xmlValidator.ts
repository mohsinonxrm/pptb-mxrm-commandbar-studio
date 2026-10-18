import type { CommandDefinition, RibbonDefinition, LocLabel, ScalingDefinition } from "@/types/ribbon";
import { parseRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import {
	DISPLAY_ONLY_RULE_TAGS,
	ENABLE_ONLY_RULE_KINDS,
	type RuleContainer,
	type RuleKind,
} from "@/constants/ruleKinds";
import { CRM_PARAMETER_VALUE_SET, isNamedCrmParameterValue } from "@/constants/crmParameters";

export interface ValidationError {
	message: string;
	elementId?: string;
	lineHint?: string;
	/** "warning" does not block an import; undefined means "error". */
	severity?: "error" | "warning";
}

function lineHintFor(xml: string, token: string): string | undefined {
	const idx = xml.indexOf(token);
	if (idx < 0) return undefined;
	const line = xml.slice(0, idx).split(/\r?\n/).length;
	return `Line ${line}`;
}

/**
 * Validates a RibbonDiffXml string for common structural issues before import.
 * Returns an array of user-friendly errors (empty = valid).
 */
export function validateRibbonDiffXml(
	xml: string,
	baselineRibbon?: RibbonDefinition,
	locLabels?: LocLabel[],
): ValidationError[] {
	const errors: ValidationError[] = [];

	// 1. Parseable?
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, "application/xml");
	const parseError = doc.querySelector("parsererror");
	if (parseError) {
		const parseText = parseError.textContent?.trim() ?? "Unknown";
		const lineMatch = parseText.match(/line\s+(\d+)/i);
		errors.push({
			message: `XML parse error: ${parseText}`,
			lineHint: lineMatch ? `Line ${lineMatch[1]}` : undefined,
		});
		return errors; // Can't continue if XML is invalid
	}

	const knownLocLabelIds = new Set(locLabels?.map((l) => l.id) ?? []);

	// 2. Check for IDs with whitespace
	doc.querySelectorAll("[Id]").forEach((el) => {
		const id = el.getAttribute("Id") ?? "";
		if (/\s/.test(id)) {
			const hint = lineHintFor(xml, `Id="${id}"`);
			errors.push({
				message: `Element ID "${id}" contains invalid whitespace characters`,
				elementId: id,
				lineHint: hint,
			});
		}
	});

	// 3. Check $LocLabels references exist
	doc.querySelectorAll("[LabelText]").forEach((el) => {
		const label = el.getAttribute("LabelText") ?? "";
		const match = label.match(/^\$LocLabels:(.+)$/);
		if (match && knownLocLabelIds.size > 0 && !knownLocLabelIds.has(match[1])) {
			const id = el.getAttribute("Id") ?? "";
			const hint = lineHintFor(xml, id ? `Id="${id}"` : `LabelText="${label}"`);
			errors.push({
				message: `Button label reference "$LocLabels:${match[1]}" has no matching LocLabel entry`,
				elementId: id || undefined,
				lineHint: hint,
			});
		}
	});

	// 4. Check for unescaped & in attribute values (DOMParser would have caught true unescaped &)
	// We check string-level for common mistake patterns
	if (xml.includes("& ") || xml.includes("&\n")) {
		errors.push({
			message: 'URL may contain an unescaped "&" — all ampersands in XML must be written as &amp;',
			lineHint: lineHintFor(xml, "& ") ?? lineHintFor(xml, "&\n"),
		});
	}

	// 5. Check for duplicate Sequence values within groups
	doc.querySelectorAll("Group").forEach((groupEl) => {
		const seqs: number[] = [];
		groupEl
			.querySelectorAll(
				":scope > Controls > Button, :scope > Controls > FlyoutAnchor, :scope > Controls > SplitButton",
			)
			.forEach((btnEl) => {
				const seq = parseInt(btnEl.getAttribute("Sequence") ?? "0", 10);
				if (seqs.includes(seq)) {
					const groupId = groupEl.getAttribute("Id") ?? "?";
					errors.push({
						message: `Two elements share Sequence "${seq}" in group "${groupId}"`,
						elementId: groupId,
						lineHint: lineHintFor(xml, `Sequence="${seq}"`),
					});
				}
				seqs.push(seq);
			});
	});

	// 6. Check Location paths against baseline (if available)
	if (baselineRibbon) {
		const baselineIds = new Set<string>();
		for (const tab of baselineRibbon.tabs) {
			baselineIds.add(tab.id);
			for (const group of tab.groups) {
				baselineIds.add(group.id);
				for (const button of group.buttons) {
					baselineIds.add(button.id);
				}
			}
		}

		doc.querySelectorAll("CustomAction").forEach((ca) => {
			const location = ca.getAttribute("Location") ?? "";
			// Remove ._children, .Controls._children, .Groups._children suffixes for lookup
			const baseId = location
				.replace(/\.Controls\._children$/, "")
				.replace(/\.Groups\._children$/, "")
				.replace(/\.Tabs\._children$/, "")
				.replace(/\._children$/, "");

			if (baseId && !baselineIds.has(baseId) && !baseId.includes("{!EntityLogicalName}")) {
				const id = ca.getAttribute("Id") ?? undefined;
				errors.push({
					message: `Location "${location}" does not exist in the current ribbon definition`,
					elementId: id,
					lineHint: lineHintFor(xml, `Location="${location}"`),
				});
			}
		});
	}

	// 7+. Ribbon schema rules (RibbonTypes.xsd / RibbonCore.xsd) for commands,
	// rules, tabs and scaling — #40, #41.
	errors.push(...validateSchemaRules(doc, xml));

	return errors;
}

const PARAMETER_TAGS = new Set([
	"BoolParameter",
	"CrmParameter",
	"DecimalParameter",
	"IntParameter",
	"StringParameter",
]);

function childElements(el: Element): Element[] {
	return Array.from(el.children);
}

/** True when RibbonTypes.xsd doesn't allow a rule step of this element name in this kind of rule (#41). */
function isMisplacedRuleStep(tagName: string, container: RuleContainer): boolean {
	return container === "enable"
		? DISPLAY_ONLY_RULE_TAGS.has(tagName)
		: ENABLE_ONLY_RULE_KINDS.has(tagName as RuleKind);
}

function validateSchemaRules(doc: Document, xml: string): ValidationError[] {
	const errors: ValidationError[] = [];
	const error = (message: string, token: string, elementId?: string) =>
		errors.push({ message, elementId, lineHint: lineHintFor(xml, token) });
	const warning = (message: string, token: string, elementId?: string) =>
		errors.push({ message, elementId, lineHint: lineHintFor(xml, token), severity: "warning" });

	const ruleDefs = doc.querySelector("RibbonDiffXml > RuleDefinitions");
	const containers: { tag: "EnableRule" | "DisplayRule"; label: string; container: RuleContainer }[] = [
		{ tag: "EnableRule", label: "Enable", container: "enable" },
		{ tag: "DisplayRule", label: "Display", container: "display" },
	];
	for (const { tag, label, container } of containers) {
		ruleDefs?.querySelectorAll(`:scope > ${tag}s > ${tag}`).forEach((ruleEl) => {
			const ruleId = ruleEl.getAttribute("Id") ?? "";
			const steps = childElements(ruleEl);
			// EnableRule / DisplayRule: choice minOccurs="1".
			if (steps.length === 0) {
				error(`${label} rule "${ruleId}" has no steps — the schema requires at least one`, `Id="${ruleId}"`, ruleId);
			}
			const checkPlacement = (step: Element) => {
				if (isMisplacedRuleStep(step.tagName, container)) {
					warning(
						`${label} rule "${ruleId}" contains ${step.tagName}, which RibbonTypes.xsd only allows in ${container === "enable" ? "display" : "enable"} rules`,
						`<${step.tagName}`,
						ruleId,
					);
				}
			};
			for (const step of steps) {
				if (step.tagName !== "OrRule") {
					checkPlacement(step);
					continue;
				}
				const ors = childElements(step);
				if (ors.filter((o) => o.tagName === "Or").length < 2) {
					error(
						`OrRule in ${label.toLowerCase()} rule "${ruleId}" needs at least 2 <Or> children (found ${ors.filter((o) => o.tagName === "Or").length})`,
						"<OrRule",
						ruleId,
					);
				}
				for (const or of ors) {
					const inner = childElements(or);
					if (inner.length === 0) error(`Empty <Or> in rule "${ruleId}"`, "<Or", ruleId);
					for (const s of inner) {
						if (s.tagName === "OrRule") {
							error(`Rule "${ruleId}": an <Or> cannot contain another OrRule`, "<OrRule", ruleId);
						} else {
							checkPlacement(s);
						}
					}
				}
			}
		});
	}

	// Rule placement outside RuleDefinitions (e.g. a lone OrRule fragment) is
	// still checked for the 2-<Or> minimum.
	if (!ruleDefs) {
		doc.querySelectorAll("OrRule").forEach((orEl) => {
			const count = orEl.querySelectorAll(":scope > Or").length;
			if (count < 2) error(`OrRule requires at least 2 <Or> children (found ${count})`, "<OrRule");
		});
	}

	// Action / CustomRule parameters.
	doc.querySelectorAll("JavaScriptFunction, CustomRule").forEach((owner) => {
		for (const p of childElements(owner)) {
			if (!PARAMETER_TAGS.has(p.tagName)) continue;
			if (p.hasAttribute("Name")) {
				error(
					`${p.tagName} inside <${owner.tagName}> must not have a Name attribute (only <Url> parameters are named)`,
					`<${p.tagName} Name=`,
				);
			}
			const value = p.getAttribute("Value") ?? "";
			if (p.tagName === "CrmParameter" && !CRM_PARAMETER_VALUE_SET.has(value)) {
				error(`CrmParameter Value "${value}" is not a valid CrmParameterValue`, `Value="${value}"`);
			}
		}
	});
	doc.querySelectorAll("Url").forEach((url) => {
		for (const p of childElements(url)) {
			if (!PARAMETER_TAGS.has(p.tagName)) continue;
			if (!p.getAttribute("Name")) {
				error(`${p.tagName} inside <Url> requires a Name (the query-string key)`, `<${p.tagName}`);
			}
			const value = p.getAttribute("Value") ?? "";
			if (p.tagName === "CrmParameter" && !isNamedCrmParameterValue(value)) {
				error(
					`CrmParameter Value "${value}" is not allowed in a <Url> action (CrmNamedParameterValue)`,
					`Value="${value}"`,
				);
			}
		}
	});

	// Tabs and scaling (#40).
	if (doc.querySelector("RibbonDiffXml > Scalings")) {
		error(
			"<Scalings> is not allowed in RibbonDiffXml — scaling changes are CustomActions with Location=\"{tabId}.Scaling._children\"",
			"<Scalings",
		);
	}
	doc.querySelectorAll("CustomAction > CommandUIDefinition > Tab").forEach((tab) => {
		const tabId = tab.getAttribute("Id") ?? "";
		const kids = childElements(tab).map((c) => c.tagName);
		const scalingAt = kids.indexOf("Scaling");
		const groupsAt = kids.indexOf("Groups");
		if (scalingAt < 0 || (groupsAt >= 0 && scalingAt > groupsAt)) {
			error(`Tab "${tabId}" needs a <Scaling Id> element before <Groups>`, `Id="${tabId}"`, tabId);
		}
	});
	doc.querySelectorAll("TabDisplayRule > DisplayRules").forEach(() => {
		error("TabDisplayRule rules must be direct children — remove the <DisplayRules> wrapper", "<TabDisplayRule");
	});

	return errors;
}

// ---------------------------------------------------------------------------
// Pre-publish validation (#35)
// ---------------------------------------------------------------------------

/** What a pre-publish finding is about (stable, for tests and grouping). */
export type PublishCheckCode =
	| "xml-parse"
	| "dropped-action"
	| "menu-missing"
	| "undefined-command"
	| "undefined-rule"
	| "rule-placement"
	| "id-prefix"
	| "loclabel-missing"
	| "webresource-missing"
	| "webresource-not-in-solution"
	| "webresource-lookup"
	| "scaling-collision"
	| "scaling-size"
	| "duplicate-id";

/** One pre-publish finding. Errors block the publish; warnings don't. */
export interface PublishFinding {
	severity: "error" | "warning";
	code: PublishCheckCode;
	message: string;
	elementId?: string;
}

/** What a `$webresource:` reference resolves to (see webResourceService.lookupWebResources). */
export interface WebResourceStatus {
	exists: boolean;
	/** In the solution being published to. */
	inSolution: boolean;
	managed?: boolean;
}

export interface PublishValidationContext {
	/**
	 * `part:id` of the elements this publish adds or changes in the layer
	 * (ribbonDiffMerge.changedRibbonDiffKeys). A problem only in elements that
	 * are already in the published layer is reported as a warning: that layer
	 * imported before, and this publish didn't introduce it. Omitted = every
	 * element counts as changed.
	 */
	changedKeys?: Iterable<string>;
	/** `part:id` of the elements new to the layer (the publisher-prefix and duplicate-id checks). */
	newKeys?: Iterable<string>;
	/** The commands as edited in CBS: actions the generator can't write are only visible here. */
	commands?: CommandDefinition[];
	/**
	 * What exists outside the layer (the loaded ribbon: platform, managed
	 * solutions and the published layer). Without `commandIds` / rule ids the
	 * "referenced but not defined" checks are skipped.
	 */
	known?: {
		commandIds?: Iterable<string>;
		enableRuleIds?: Iterable<string>;
		displayRuleIds?: Iterable<string>;
		/** Tab, group and control ids of the loaded ribbon. */
		elementIds?: Iterable<string>;
	};
	/** The solution publisher's customization prefix (e.g. `mxrm`). */
	publisherPrefix?: string;
	/** Each tab's scaling as loaded (tab id → steps). */
	tabScaling?: Record<string, ScalingDefinition>;
	/** Group id → template id, as loaded / edited. */
	groupTemplates?: Record<string, string>;
	/** Template id → layout titles. */
	templateLayouts?: Record<string, string[]>;
	/** Lookup results by lower-case web resource name. Names missing here aren't checked. */
	webResources?: Record<string, WebResourceStatus>;
}

/** Action kinds a classic ribbon `<CommandDefinition>` can't express: the generator drops them (#28). */
export const DROPPED_ACTION_KINDS: ReadonlySet<string> = new Set(["powerFx", "customApi"]);

const DROPPED_ACTION_LABELS: Record<string, string> = {
	powerFx: "Power Fx",
	customApi: "Custom API",
};

/** The action kinds of a command that a classic ribbon command can't run. */
export function droppedActionKinds(command: CommandDefinition): string[] {
	return [
		...new Set(command.actions.map((a) => a.kind).filter((k) => DROPPED_ACTION_KINDS.has(k))),
	];
}

const LOC_LABEL_REF = /^\$LocLabels:(.+)$/;
const WEB_RESOURCE_REF = /^\$webresource:(.+)$/i;
/** Platform library Dataverse writes into commands itself (ribbonDiffMerge.isPlatformAction); not a solution web resource. */
const PLATFORM_WEB_RESOURCES = new Set(["main_system_library.js"]);
const MENU_CONTROL_TAGS = new Set(["FlyoutAnchor", "SplitButton"]);
const SCALING_LOCATION = /^(.+)\.Scaling\._children$/;
const isPlatformId = (id: string) => /^(Mscrm|Microsoft)\./.test(id);

interface PartElement {
	part: keyof RibbonDiffParts;
	/** `part:id`, as changedRibbonDiffKeys. */
	key: string;
	el: Element;
}

function partElements(parts: RibbonDiffParts): {
	elements: PartElement[];
	errors: PublishFinding[];
} {
	const elements: PartElement[] = [];
	const errors: PublishFinding[] = [];
	const parser = new DOMParser();
	for (const part of Object.keys(parts) as (keyof RibbonDiffParts)[]) {
		for (const [id, xml] of parts[part]) {
			const doc = parser.parseFromString(xml, "application/xml");
			if (doc.querySelector("parsererror")) {
				errors.push({
					severity: "error",
					code: "xml-parse",
					message: `${part} element ${id} is not well-formed XML`,
					elementId: id,
				});
				continue;
			}
			elements.push({ part, key: `${part}:${id}`, el: doc.documentElement });
		}
	}
	return { elements, errors };
}

/** Every element of `root`, itself included. */
function selfAndDescendants(root: Element): Element[] {
	return [root, ...Array.from(root.getElementsByTagName("*"))];
}

function toParts(input: RibbonDiffParts | string): RibbonDiffParts {
	return typeof input === "string" ? parseRibbonDiffParts(input) : input;
}

/** `$webresource:` names referenced anywhere in a RibbonDiffXml (de-duplicated, ignoring case). */
export function webResourceReferences(input: RibbonDiffParts | string): string[] {
	let parts: RibbonDiffParts;
	try {
		parts = toParts(input);
	} catch {
		return [];
	}
	const seen = new Map<string, string>();
	for (const { el } of partElements(parts).elements) {
		for (const node of selfAndDescendants(el)) {
			for (const attr of Array.from(node.attributes)) {
				const name = WEB_RESOURCE_REF.exec(attr.value.trim())?.[1];
				const lower = name?.toLowerCase();
				if (name && lower && !PLATFORM_WEB_RESOURCES.has(lower) && !seen.has(lower))
					seen.set(lower, name);
			}
		}
	}
	return [...seen.values()];
}

const qualifiedTemplate = (template: string) => {
	const t = template.trim();
	return t && !t.includes(".") ? `Mscrm.Templates.${t}` : t;
};

interface ScalingStepRef {
	id: string;
	tag: "MaxSize" | "Scale";
	groupId: string;
	size: string;
	sequence: number;
	/** The layer element that adds the step; undefined for a step only in the loaded ribbon. */
	key?: string;
}

/**
 * Checks the RibbonDiffXml a publish will import — the MERGED layer
 * (publishService.buildMergedRibbonDiffXml), not only this session's delta —
 * the way Ribbon Workbench checks before it publishes (#35). Pure: anything
 * that needs Dataverse (web resources, the loaded ribbon) comes in `context`.
 */
export function validatePublishRibbonDiff(
	input: RibbonDiffParts | string,
	context: PublishValidationContext = {},
): PublishFinding[] {
	let parts: RibbonDiffParts;
	try {
		parts = toParts(input);
	} catch (err) {
		return [
			{
				severity: "error",
				code: "xml-parse",
				message: err instanceof Error ? err.message : String(err),
			},
		];
	}
	const { elements, errors: findings } = partElements(parts);
	const changed = context.changedKeys ? new Set(context.changedKeys) : null;
	const isChanged = (key: string) => !changed || changed.has(key);
	const newKeys = new Set(context.newKeys ?? []);

	/**
	 * An error when one of `keys` is added or changed by this publish; a
	 * warning (noted as already published) otherwise. `warningOnly` forces a warning.
	 */
	const add = (
		code: PublishCheckCode,
		keys: string | string[],
		message: string,
		elementId?: string,
		warningOnly = false,
	) => {
		const introduced = (Array.isArray(keys) ? keys : [keys]).some(isChanged);
		findings.push({
			severity: warningOnly || !introduced ? "warning" : "error",
			code,
			message: introduced ? message : `${message} (already in the published customizations)`,
			elementId,
		});
	};

	const customActions = elements.filter((e) => e.part === "customActions");
	const commandDefs = elements.filter((e) => e.part === "commandDefinitions");

	// Dropped action kinds (#28): the command would be written without them.
	// In the publish dialog the plan (publishPlan.planScope) already blocks
	// these; this is the same rule for every other caller of publishRibbon.
	const commandsById = new Map((context.commands ?? []).map((c) => [c.id, c] as const));
	for (const { key, el } of commandDefs) {
		const id = el.getAttribute("Id") ?? "";
		const cmd = commandsById.get(id);
		if (!cmd || !isChanged(key)) continue;
		const kinds = droppedActionKinds(cmd);
		if (kinds.length === 0) continue;
		add(
			"dropped-action",
			key,
			`Command ${id} has a ${kinds.map((k) => DROPPED_ACTION_LABELS[k] ?? k).join(" / ")} action — classic ribbon commands can't run it, so it would be dropped; remove the action`,
			id,
		);
	}

	// A flyout / split button without its <Menu> publishes as an empty drop-down.
	for (const { key, el } of customActions) {
		for (const node of Array.from(el.getElementsByTagName("*"))) {
			if (!MENU_CONTROL_TAGS.has(node.tagName)) continue;
			if (childElements(node).some((c) => c.tagName === "Menu")) continue;
			const id = node.getAttribute("Id") ?? "";
			add(
				"menu-missing",
				key,
				`${node.tagName} ${id} has no <Menu> — it would publish as an empty drop-down`,
				id,
			);
		}
	}

	// Commands and rules referenced but defined neither in the merged layer nor
	// in the loaded ribbon. A platform (`Mscrm.`) id the loaded ribbon happens
	// not to include can still exist, so those are warnings only.
	if (context.known?.commandIds) {
		const known = new Set([...parts.commandDefinitions.keys(), ...context.known.commandIds]);
		for (const { key, el } of customActions) {
			for (const node of Array.from(el.getElementsByTagName("*"))) {
				const command = node.getAttribute("Command");
				if (!command || known.has(command)) continue;
				const id = node.getAttribute("Id") ?? "";
				add(
					"undefined-command",
					key,
					`${node.tagName} ${id} uses command ${command}, which is defined neither in the customizations nor in the loaded ribbon`,
					id,
					isPlatformId(command),
				);
			}
		}
	}
	const knownRules: Record<string, Set<string> | null> = {
		EnableRule: context.known?.enableRuleIds
			? new Set([...parts.enableRules.keys(), ...context.known.enableRuleIds])
			: null,
		DisplayRule: context.known?.displayRuleIds
			? new Set([...parts.displayRules.keys(), ...context.known.displayRuleIds])
			: null,
	};
	for (const { key, el } of commandDefs) {
		const commandId = el.getAttribute("Id") ?? "";
		const refs = childElements(el)
			.filter((c) => c.tagName === "EnableRules" || c.tagName === "DisplayRules")
			.flatMap(childElements);
		for (const ref of refs) {
			const known = knownRules[ref.tagName];
			const ruleId = ref.getAttribute("Id");
			if (!known || !ruleId || known.has(ruleId)) continue;
			add(
				"undefined-rule",
				key,
				`Command ${commandId} uses ${ref.tagName === "EnableRule" ? "enable" : "display"} rule ${ruleId}, which is defined neither in the customizations nor in the loaded ribbon`,
				commandId,
				isPlatformId(ruleId),
			);
		}
	}

	// Display-only rule kinds in an enable rule, and the reverse (RibbonTypes.xsd, #41).
	for (const { part, key, el } of elements) {
		if (part !== "enableRules" && part !== "displayRules") continue;
		const container: RuleContainer = part === "enableRules" ? "enable" : "display";
		const ruleId = el.getAttribute("Id") ?? "";
		const steps = childElements(el).flatMap((s) =>
			s.tagName === "OrRule"
				? childElements(s)
						.filter((o) => o.tagName === "Or")
						.flatMap(childElements)
				: [s],
		);
		for (const step of steps) {
			if (!isMisplacedRuleStep(step.tagName, container)) continue;
			add(
				"rule-placement",
				key,
				`${container === "enable" ? "Enable" : "Display"} rule ${ruleId} contains ${step.tagName}, which the ribbon schema only allows in ${container === "enable" ? "display" : "enable"} rules`,
				ruleId,
			);
		}
	}

	// `$LocLabels:` references without a <LocLabel> in the same RibbonDiffXml.
	for (const { key, el } of elements) {
		if (el.tagName === "LocLabel") continue;
		for (const node of selfAndDescendants(el)) {
			for (const attr of Array.from(node.attributes)) {
				const labelId = LOC_LABEL_REF.exec(attr.value)?.[1];
				if (!labelId || parts.locLabels.has(labelId)) continue;
				const id = node.getAttribute("Id") ?? undefined;
				add(
					"loclabel-missing",
					key,
					`${[node.tagName, id, attr.name].filter(Boolean).join(" ")} references $LocLabels:${labelId}, which has no <LocLabel> — the import would fail`,
					id,
				);
			}
		}
	}

	// `$webresource:` references (one finding per web resource).
	if (context.webResources) {
		const reported = new Set<string>();
		for (const { el } of elements) {
			for (const node of selfAndDescendants(el)) {
				for (const attr of Array.from(node.attributes)) {
					const name = WEB_RESOURCE_REF.exec(attr.value.trim())?.[1];
					const lower = name?.toLowerCase();
					if (!name || !lower || PLATFORM_WEB_RESOURCES.has(lower) || reported.has(lower))
						continue;
					const status = context.webResources[lower];
					if (!status) continue;
					const elementId = node.getAttribute("Id") ?? undefined;
					if (!status.exists) {
						reported.add(lower);
						findings.push({
							severity: "warning",
							code: "webresource-missing",
							message: `Web resource ${name} (${node.tagName} ${attr.name}) doesn't exist in this environment`,
							elementId,
						});
					} else if (!status.inSolution && !status.managed) {
						reported.add(lower);
						findings.push({
							severity: "warning",
							code: "webresource-not-in-solution",
							message: `Web resource ${name} isn't in the selected solution — the ribbon won't import into another environment without it`,
							elementId,
						});
					}
				}
			}
		}
	}

	// Scaling: the steps as loaded, overlaid by the layer's (same Id → the layer's).
	const stepsByTab = new Map<string, Map<string, ScalingStepRef>>();
	const tabSteps = (tabId: string) => {
		let steps = stepsByTab.get(tabId);
		if (!steps) stepsByTab.set(tabId, (steps = new Map()));
		return steps;
	};
	for (const [tabId, scaling] of Object.entries(context.tabScaling ?? {})) {
		for (const s of scaling.maxSizes) tabSteps(tabId).set(s.id, { ...s, tag: "MaxSize" });
		for (const s of scaling.scales) tabSteps(tabId).set(s.id, { ...s, tag: "Scale" });
	}
	const groupTemplates = new Map<string, string>(
		Object.entries(context.groupTemplates ?? {}).map(([g, t]) => [g, qualifiedTemplate(t)]),
	);
	const templateLayouts = new Map<string, string[]>(
		Object.entries(context.templateLayouts ?? {}),
	);
	for (const { part, el } of elements) {
		if (part !== "templates") continue;
		for (const t of selfAndDescendants(el).filter((n) => n.tagName === "GroupTemplate")) {
			const titles = childElements(t)
				.filter((l) => l.tagName === "Layout")
				.map((l) => l.getAttribute("Title") ?? "");
			templateLayouts.set(t.getAttribute("Id") ?? "", titles);
		}
	}
	const layerSteps: ScalingStepRef[] = [];
	for (const { key, el } of customActions) {
		for (const g of Array.from(el.getElementsByTagName("Group"))) {
			const t = g.getAttribute("Template");
			if (t) groupTemplates.set(g.getAttribute("Id") ?? "", qualifiedTemplate(t));
		}
		const placed: [string, Element][] = [];
		const scalingTab = SCALING_LOCATION.exec(el.getAttribute("Location") ?? "")?.[1];
		const definition = childElements(el).find((c) => c.tagName === "CommandUIDefinition");
		if (scalingTab && definition)
			for (const node of childElements(definition)) placed.push([scalingTab, node]);
		for (const tab of Array.from(el.getElementsByTagName("Tab"))) {
			for (const scaling of childElements(tab).filter((c) => c.tagName === "Scaling")) {
				for (const node of childElements(scaling))
					placed.push([tab.getAttribute("Id") ?? "", node]);
			}
		}
		for (const [tabId, node] of placed) {
			if (node.tagName !== "MaxSize" && node.tagName !== "Scale") continue;
			const step: ScalingStepRef = {
				id: node.getAttribute("Id") ?? "",
				tag: node.tagName,
				groupId: node.getAttribute("GroupId") ?? "",
				size: node.getAttribute("Size") ?? "",
				sequence: parseInt(node.getAttribute("Sequence") ?? "", 10),
				key,
			};
			tabSteps(tabId).set(step.id, step);
			layerSteps.push(step);
		}
	}
	// MaxSize and Scale steps of a tab share one sequence: two steps on the same
	// Sequence make Unified Interface silently drop every custom control of
	// the table (verified live).
	for (const [tabId, steps] of stepsByTab) {
		const bySequence = new Map<number, ScalingStepRef[]>();
		for (const s of steps.values()) {
			if (!Number.isNaN(s.sequence))
				bySequence.set(s.sequence, [...(bySequence.get(s.sequence) ?? []), s]);
		}
		for (const [sequence, same] of bySequence) {
			const keys = [...new Set(same.flatMap((s) => (s.key ? [s.key] : [])))];
			// Steps that are only in the loaded ribbon aren't the customization's to fix.
			if (same.length < 2 || keys.length === 0) continue;
			add(
				"scaling-collision",
				keys,
				`Scaling of tab ${tabId}: ${same.map((s) => `${s.tag} ${s.id}`).join(" and ")} have the same Sequence ${sequence} — Unified Interface then drops every custom control of the table; give each step its own Sequence`,
				same.find((s) => s.key)?.id,
			);
		}
	}
	for (const s of layerSteps) {
		const template = groupTemplates.get(s.groupId);
		const layouts = template ? templateLayouts.get(template) : undefined;
		if (!layouts?.length || layouts.includes(s.size)) continue;
		add(
			"scaling-size",
			s.key ?? [],
			`${s.tag} ${s.id} has Size "${s.size}", which isn't a layout of template ${template} used by group ${s.groupId} (${layouts.join(", ")})`,
			s.id,
			true,
		);
	}

	// Duplicate ids: a tab / group / control added (`._children`) by more than
	// one CustomAction, or added as new while the loaded ribbon already has it.
	const knownElements = new Set(context.known?.elementIds ?? []);
	const addedBy = new Map<string, string[]>();
	for (const { key, el } of customActions) {
		if (!(el.getAttribute("Location") ?? "").endsWith("._children")) continue;
		const definition = childElements(el).find((c) => c.tagName === "CommandUIDefinition");
		const root = definition ? childElements(definition)[0] : undefined;
		if (!root || root.tagName === "MaxSize" || root.tagName === "Scale") continue;
		for (const node of selfAndDescendants(root)) {
			const id = node.getAttribute("Id");
			if (!id || node.closest("Scaling")) continue;
			const keys = addedBy.get(id) ?? [];
			if (!keys.includes(key)) addedBy.set(id, [...keys, key]);
		}
	}
	for (const [id, keys] of addedBy) {
		if (keys.length > 1) {
			add(
				"duplicate-id",
				keys,
				`Id ${id} is added by more than one CustomAction (${keys.map((k) => k.replace(/^customActions:ca:/, "")).join(", ")})`,
				id,
			);
		} else if (newKeys.has(keys[0]) && knownElements.has(id)) {
			add(
				"duplicate-id",
				keys,
				`Id ${id} is added as a new element, but the ribbon already has an element with this id`,
				id,
			);
		}
	}

	// Publisher prefix on the ids CBS creates: elements new to the layer whose
	// id isn't named after an existing element (`Mscrm.X.Override.CustomAction`,
	// `Mscrm.X.LabelText` change Mscrm.X; they don't define a new element).
	const prefix = context.publisherPrefix?.trim().toLowerCase();
	if (prefix && newKeys.size > 0) {
		const knownIds = new Set<string>([
			...knownElements,
			...(context.known?.commandIds ?? []),
			...(context.known?.enableRuleIds ?? []),
			...(context.known?.displayRuleIds ?? []),
		]);
		const namedAfterKnown = (id: string) => {
			const segments = id.split(".");
			for (let i = segments.length; i > 0; i--)
				if (knownIds.has(segments.slice(0, i).join("."))) return true;
			return false;
		};
		const hasPrefix = (id: string) => {
			const lower = id.toLowerCase();
			return lower.startsWith(`${prefix}.`) || lower.startsWith(`${prefix}_`);
		};
		const reported = new Set<string>();
		for (const { part, key, el } of elements) {
			if (!newKeys.has(key) || part === "templates" || part === "tabDisplayRules") continue;
			for (const node of selfAndDescendants(el)) {
				// Inside actions, rules and references, Id attributes refer to other elements.
				if (
					node !== el &&
					node.closest("Actions, EnableRules, DisplayRules, EnableRule, DisplayRule")
				)
					continue;
				const id = node.getAttribute("Id") ?? node.getAttribute("HideActionId");
				if (!id || reported.has(id) || hasPrefix(id) || namedAfterKnown(id)) continue;
				reported.add(id);
				findings.push({
					severity: "warning",
					code: "id-prefix",
					message: `${node.tagName} id ${id} doesn't start with the publisher prefix "${prefix}." — ids without it can collide with other solutions`,
					elementId: id,
				});
			}
		}
	}

	return findings;
}
