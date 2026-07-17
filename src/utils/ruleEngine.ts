import type { RuleStep } from "@/types/ribbon";

export interface RuleContext {
	selectionCount?: number;
	entityName?: string;
	formState?: "Create" | "Existing" | "ReadOnly" | "Disabled" | "BulkEdit";
	clientType?: "Modern" | "Refresh" | "Legacy";
	crmClientType?: "Web" | "Outlook";
	formType?:
		| "Main"
		| "Preview"
		| "AppointmentBook"
		| "Dashboard"
		| "Quick"
		| "QuickCreate"
		| "Card"
		| "MainInteractionCentric";
	fieldValues?: Record<string, string | number | boolean | undefined>;
}

/**
 * Produces a human-readable English summary of a rule (all steps joined with AND).
 */
export function summarizeRule(steps: RuleStep[]): string {
	if (steps.length === 0) return "No steps defined — rule always passes.";
	return steps.map(summarizeStep).join(" AND ");
}

/**
 * Evaluates rule steps with AND semantics at the top level.
 * Unsupported step kinds are treated as true in preview mode.
 */
export function evaluateRule(steps: RuleStep[], context: RuleContext): boolean {
	if (steps.length === 0) return true;
	return steps.every((step) => evaluateStep(step, context));
}

function evaluateStep(step: RuleStep, context: RuleContext): boolean {
	let result = true;

	switch (step.kind) {
		case "SelectionCountRule": {
			const count = context.selectionCount ?? 0;
			const minOk = step.minimum === undefined || count >= step.minimum;
			const maxOk = step.maximum === undefined || count <= step.maximum;
			result = minOk && maxOk;
			break;
		}
		case "EntityRule": {
			result = !step.entityName || context.entityName === step.entityName;
			break;
		}
		case "FormStateRule": {
			result = context.formState === step.state;
			break;
		}
		case "CommandClientTypeRule": {
			result = context.clientType === step.type;
			break;
		}
		case "CrmClientTypeRule": {
			result = context.crmClientType === step.type;
			break;
		}
		case "FormTypeRule": {
			result = context.formType === step.type;
			break;
		}
		case "ValueRule": {
			const value = context.fieldValues?.[step.field];
			result = String(value ?? "") === step.value;
			break;
		}
		case "OrRule": {
			result = step.rules.some((nested) => evaluateStep(nested, context));
			break;
		}
		default:
			result = true;
	}

	if ("invertResult" in step && step.invertResult) {
		return !result;
	}

	return result;
}

function summarizeStep(step: RuleStep): string {
	const inv = "invertResult" in step && step.invertResult ? "NOT " : "";
	switch (step.kind) {
		case "SelectionCountRule": {
			const min = step.minimum !== undefined ? `at least ${step.minimum}` : null;
			const max = step.maximum !== undefined ? `at most ${step.maximum}` : null;
			const count = [min, max].filter(Boolean).join(" and ");
			const entity = step.appliesTo ? ` (${step.appliesTo})` : "";
			return `${inv}Selection count is ${count}${entity}`;
		}
		case "EntityRule": {
			const entity = step.entityName ?? "any entity";
			const ctx = step.context ? ` in ${step.context} context` : "";
			const applies = step.appliesTo ? ` (${step.appliesTo})` : "";
			return `${inv}Entity is "${entity}"${ctx}${applies}`;
		}
		case "FormStateRule":
			return `${inv}Form state is "${step.state}"`;
		case "CommandClientTypeRule":
			return `${inv}Client type is "${step.type}" (${clientTypeDesc(step.type)})`;
		case "CrmClientTypeRule":
			return `${inv}CRM client type is "${step.type}"`;
		case "CustomRule":
			return `${inv}Custom rule: ${step.functionName}() from ${step.library}`;
		case "OrRule": {
			const nested = step.rules.map(summarizeStep).join(" OR ");
			return `(${nested})`;
		}
		case "MiscellaneousPrivilegeRule": {
			const depth = step.privilegeDepth ? ` at ${step.privilegeDepth} depth` : "";
			return `${inv}User has "${step.privilegeName}" privilege${depth}`;
		}
		case "EntityPrivilegeRule": {
			const entity = step.entityName ? ` on "${step.entityName}"` : "";
			const applies = step.appliesTo ? ` (${step.appliesTo})` : "";
			return `${inv}User has ${step.privilegeType} privilege${entity} at ${step.privilegeDepth} depth${applies}`;
		}
		case "EntityPropertyRule": {
			const entity = step.entityName ? ` for "${step.entityName}"` : "";
			return `${inv}Entity property "${step.propertyName}" is ${step.propertyValue}${entity}`;
		}
		case "FormTypeRule":
			return `${inv}Form type is "${step.type}"`;
		case "FormEntityContextRule":
			return `${inv}Form entity context is "${step.entityName}"`;
		case "ValueRule":
			return `${inv}Field "${step.field}" equals "${step.value}"`;
		case "SkuRule":
			return `${inv}SKU is "${step.sku}"`;
		case "HideForTabletExperienceRule":
			return `${inv}Hide for tablet experience`;
		case "OrganizationSettingRule":
			return `${inv}Organization setting "${step.setting}" is enabled`;
		case "PageRule":
			return `${inv}Page address matches "${step.address}"`;
		case "RecordPrivilegeRule": {
			const applies = step.appliesTo ? ` (${step.appliesTo})` : "";
			return `${inv}User has ${step.privilegeType} privilege on current record${applies}`;
		}
		case "RelationshipTypeRule": {
			const relType = step.relationshipType ?? "any";
			return `${inv}Relationship type is "${relType}" (${step.appliesTo})`;
		}
		case "ReferencingAttributeRequiredRule":
			return `${inv}Referencing attribute is required`;
		case "OutlookItemTrackingRule":
			return `${inv}Outlook item is ${step.trackedInCrm ? "" : "not "}tracked in CRM`;
		case "OutlookRenderTypeRule":
			return `${inv}Outlook render type is "${step.type}"`;
		case "OutlookVersionRule":
			return `${inv}Outlook version is "${step.version}"`;
		case "CrmOfflineAccessStateRule":
			return `${inv}CRM offline state is "${step.state}"`;
		case "CrmOutlookClientTypeRule":
			return `${inv}CRM Outlook client type is "${step.type}"`;
		case "CrmOutlookClientVersionRule":
			return `${inv}CRM Outlook client version is ${step.major}.${step.minor ?? 0}+`;
		case "DeviceTypeRule":
			return `${inv}Device type is "${step.type}"`;
		case "OptionSetRule":
			return `${inv}Option set "${step.optionSet}" state code is "${step.stateCode}"`;
		case "ShowOnQuickActionRule":
			return "Show on quick action (references Mscrm.ShowOnQuickAction)";
		case "ShowOnGridAndQuickActionRule":
			return "Show on grid and quick action (references Mscrm.ShowOnGridAndQuickAction)";
		case "ShowOnGridRule":
			return "Show on grid (references Mscrm.ShowOnGrid)";
		default:
			return "Unknown rule step";
	}
}

function clientTypeDesc(type: string): string {
	switch (type) {
		case "Modern":
			return "Dynamics 365 tablets";
		case "Refresh":
			return "Unified Interface / modern web";
		case "Legacy":
			return "Classic ribbon / Outlook list views";
		default:
			return type;
	}
}
