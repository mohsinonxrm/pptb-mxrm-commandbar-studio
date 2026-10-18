import type { RibbonDefinition, LocLabel } from "@/types/ribbon";
import {
	DISPLAY_ONLY_RULE_TAGS,
	ENABLE_ONLY_RULE_KINDS,
	type RuleContainer,
	type RuleKind,
} from "@/constants/ruleKinds";
import { CRM_PARAMETER_VALUE_SET, isNamedCrmParameterValue } from "@/constants/crmParameters";
import { groupControls } from "@/utils/ribbonMenu";

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
				for (const button of groupControls(group)) {
					baselineIds.add(button.id);
					// Menus (#27): new items go to `{section Controls}._children`.
					if (button.menu) baselineIds.add(button.menu.id);
					for (const section of button.menu?.sections ?? []) {
						baselineIds.add(section.id);
						baselineIds.add(section.controlsId);
						baselineIds.add(section.controlsId.replace(/\.Controls$/, ""));
					}
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
				const wrongPlace =
					container === "enable"
						? DISPLAY_ONLY_RULE_TAGS.has(step.tagName)
						: ENABLE_ONLY_RULE_KINDS.has(step.tagName as RuleKind);
				if (wrongPlace) {
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
