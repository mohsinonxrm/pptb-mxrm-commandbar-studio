/**
 * Schema rules Dataverse enforces when it imports a RibbonDiffXml
 * (RibbonTypes.xsd), checked before a publish starts writing (#153). The
 * editor can produce each of these: a rule with no steps, an OrRule left with
 * one branch, a JavaScript action with no function, a cleared number field.
 * Full XSD validation is #126; this covers what CBS's own UI writes.
 */

/** RibbonTypes.xsd JavaScriptIdentifier. */
const JS_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z_$0-9.]*$/;
/** EntityRule / tab EntityRule Context. */
const CONTEXT_NAME = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const INTEGER = /^[+-]?\d+$/;
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const BOOLEAN = /^(true|false|1|0)$/;

/** use="required" attributes of rule steps, actions and parameters. */
const REQUIRED: Record<string, string[]> = {
	JavaScriptFunction: ["FunctionName", "Library"],
	Url: ["Address"],
	CustomRule: ["FunctionName", "Library"],
	CommandClientTypeRule: ["Type"],
	CrmClientTypeRule: ["Type"],
	CrmOfflineAccessStateRule: ["State"],
	CrmOutlookClientTypeRule: ["Type"],
	CrmOutlookClientVersionRule: ["Major"],
	DeviceTypeRule: ["Type"],
	EntityPrivilegeRule: ["PrivilegeType", "PrivilegeDepth"],
	EntityPropertyRule: ["PropertyName", "PropertyValue"],
	FeatureControlRule: ["FeatureControlBit", "ExpectedValue"],
	FormEntityContextRule: ["EntityName"],
	FormStateRule: ["State"],
	FormTypeRule: ["Type"],
	MiscellaneousPrivilegeRule: ["PrivilegeName"],
	OptionSetRule: ["OptionSet", "StateCode", "ObjectTypeCode"],
	OrganizationSettingRule: ["Setting"],
	OutlookItemTrackingRule: ["TrackedInCrm"],
	OutlookRenderTypeRule: ["Type"],
	OutlookVersionRule: ["Version"],
	PageRule: ["Address"],
	RecordPrivilegeRule: ["PrivilegeType"],
	RelationshipTypeRule: ["AppliesTo"],
	SkuRule: ["Sku"],
	ValueRule: ["Field", "Value"],
	BoolParameter: ["Value"],
	CrmParameter: ["Value"],
	DecimalParameter: ["Value"],
	IntParameter: ["Value"],
	StringParameter: ["Value"],
};
/** Required attributes an empty value is meaningful for (compare with / pass an empty string). */
const EMPTY_ALLOWED = new Set(["ValueRule.Value", "StringParameter.Value"]);

const INTEGER_ATTRIBUTES: Record<string, string[]> = {
	SelectionCountRule: ["Minimum", "Maximum"],
	CrmOutlookClientVersionRule: ["Major", "Minor", "Build", "Revision"],
	IntParameter: ["Value"],
	Url: ["WinMode"],
};
const DECIMAL_ATTRIBUTES: Record<string, string[]> = { DecimalParameter: ["Value"] };
const BOOLEAN_ATTRIBUTES: Record<string, string[]> = {
	BoolParameter: ["Value"],
	Url: ["PassParams"],
	OutlookItemTrackingRule: ["TrackedInCrm"],
	EntityPropertyRule: ["PropertyValue"],
	FeatureControlRule: ["ExpectedValue"],
	RelationshipTypeRule: ["AllowCustomRelationship", "AllowSystemRelationship"],
};
/** Every rule step allows these two (StandardRuleAttributes). */
const STEP_BOOLEANS = ["Default", "InvertResult"];

const PARAMETER_TAGS = new Set([
	"BoolParameter",
	"CrmParameter",
	"DecimalParameter",
	"IntParameter",
	"StringParameter",
]);

const children = (el: Element) => Array.from(el.children);

/** Problems with one rule step, action or parameter's attributes. */
function attributeProblems(el: Element, where: string, isStep: boolean): string[] {
	const out: string[] = [];
	const tag = el.tagName;
	for (const name of REQUIRED[tag] ?? []) {
		const value = el.getAttribute(name);
		if (value === null || (!value.trim() && !EMPTY_ALLOWED.has(`${tag}.${name}`))) {
			out.push(`${where}: ${tag} has no ${name}`);
		}
	}
	const check = (names: string[] | undefined, pattern: RegExp, what: string) => {
		for (const name of names ?? []) {
			const value = el.getAttribute(name);
			if (value === null || (value === "" && REQUIRED[tag]?.includes(name))) continue;
			if (!pattern.test(value.trim()))
				out.push(`${where}: ${tag} ${name}="${value}" is not ${what}`);
		}
	};
	check(INTEGER_ATTRIBUTES[tag], INTEGER, "a whole number");
	check(DECIMAL_ATTRIBUTES[tag], DECIMAL, "a number");
	check(BOOLEAN_ATTRIBUTES[tag], BOOLEAN, "true or false");
	if (isStep) check(STEP_BOOLEANS, BOOLEAN, "true or false");
	if (tag === "JavaScriptFunction" || tag === "CustomRule") {
		const fn = el.getAttribute("FunctionName");
		if (fn?.trim() && !JS_IDENTIFIER.test(fn)) {
			out.push(
				`${where}: FunctionName "${fn}" isn't a JavaScript function name (letters, digits, _, $ and dots)`,
			);
		}
	}
	if (
		(tag === "JavaScriptFunction" || tag === "CustomRule") &&
		/^\$webresource:\s*$/i.test(el.getAttribute("Library") ?? "")
	) {
		out.push(`${where}: ${tag} Library names no web resource`);
	}
	if (tag === "EntityRule") {
		const context = el.getAttribute("Context");
		if (context !== null && !CONTEXT_NAME.test(context))
			out.push(`${where}: EntityRule Context "${context}" isn't valid`);
	}
	if (tag === "Url" && /^https?:\/\/$/i.test(el.getAttribute("Address")?.trim() ?? "")) {
		out.push(`${where}: Url has no address`);
	}
	// Parameters: named in a Url (the query-string key), unnamed elsewhere.
	for (const p of children(el).filter((c) => PARAMETER_TAGS.has(c.tagName))) {
		if (tag === "Url" && !p.getAttribute("Name")?.trim())
			out.push(`${where}: a ${p.tagName} of the Url has no Name`);
		if (tag !== "Url" && p.hasAttribute("Name"))
			out.push(`${where}: a ${p.tagName} of ${tag} can't have a Name`);
		out.push(...attributeProblems(p, where, false));
	}
	return out;
}

/**
 * Schema problems of one CommandDefinition, EnableRule or DisplayRule, as
 * messages that name it. Empty when it imports.
 */
export function schemaProblems(el: Element): string[] {
	const id = el.getAttribute("Id") ?? "";
	if (el.tagName === "CommandDefinition") {
		const where = `Command ${id}`;
		const actions = children(el).find((c) => c.tagName === "Actions");
		return children(actions ?? el)
			.filter((a) => a.tagName === "JavaScriptFunction" || a.tagName === "Url")
			.flatMap((a) => attributeProblems(a, where, false));
	}
	if (el.tagName !== "EnableRule" && el.tagName !== "DisplayRule") return [];
	const where = `${el.tagName === "EnableRule" ? "Enable" : "Display"} rule ${id}`;
	const steps = children(el);
	// EnableRule / DisplayRule: choice minOccurs="1".
	if (steps.length === 0)
		return [`${where} has no steps — add one, or remove the rule from its commands`];
	const out: string[] = [];
	for (const step of steps) {
		if (step.tagName !== "OrRule") {
			out.push(...attributeProblems(step, where, true));
			continue;
		}
		const ors = children(step).filter((o) => o.tagName === "Or");
		if (ors.length < 2)
			out.push(`${where}: an OrRule needs at least 2 alternatives (it has ${ors.length})`);
		for (const or of ors) {
			const inner = children(or);
			if (inner.length === 0) out.push(`${where}: an alternative of its OrRule has no steps`);
			for (const s of inner) {
				if (s.tagName === "OrRule")
					out.push(`${where}: an OrRule can't contain another OrRule`);
				else out.push(...attributeProblems(s, where, true));
			}
		}
	}
	return out;
}
