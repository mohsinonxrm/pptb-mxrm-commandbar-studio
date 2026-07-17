import type { RibbonDefinition, LocLabel } from "@/types/ribbon";

export interface ValidationError {
	message: string;
	elementId?: string;
	lineHint?: string;
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

	// 7. Validate EnableRule does not contain display-only rule kinds
	const DISPLAY_ONLY_TAGS = new Set([
		"EntityPrivilegeRule",
		"EntityPropertyRule",
		"DeviceTypeRule",
		"OptionSetRule",
		"CrmOutlookClientVersionRule",
	]);

	doc.querySelectorAll("EnableRules > EnableRule").forEach((ruleEl) => {
		const ruleId = ruleEl.getAttribute("Id") ?? "";
		DISPLAY_ONLY_TAGS.forEach((tagName) => {
			if (ruleEl.querySelector(tagName)) {
				errors.push({
					message: `Enable rule "${ruleId}" contains "${tagName}" which is only valid in DisplayRules per the schema`,
					elementId: ruleId,
					lineHint: lineHintFor(xml, `<${tagName}`),
				});
			}
		});
	});

	// 8. OrRule must have at least 2 Or children
	doc.querySelectorAll("OrRule").forEach((orEl) => {
		const count = orEl.querySelectorAll(":scope > Or").length;
		if (count < 2) {
			errors.push({
				message: `OrRule requires at least 2 <Or> children (found ${count})`,
				lineHint: lineHintFor(xml, "<OrRule"),
			});
		}
	});

	return errors;
}
