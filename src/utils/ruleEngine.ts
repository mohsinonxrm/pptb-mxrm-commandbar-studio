import type { RuleStep } from "@/types/ribbon";

/**
 * Produces a human-readable English summary of a rule (all steps joined with AND).
 */
export function summarizeRule(steps: RuleStep[]): string {
	if (steps.length === 0)
		return "No steps defined — a rule needs at least one before it can be published.";
	return steps.map(summarizeStep).join(" AND ");
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
			const nested = step.groups
				.map((group) =>
					group.length === 1
						? summarizeStep(group[0])
						: `(${group.map(summarizeStep).join(" AND ")})`,
				)
				.join(" OR ");
			return `(${nested})`;
		}
		case "FeatureControlRule":
			return `${inv}Feature "${step.featureControlBit}" is ${step.expectedValue ? "on" : "off"}`;
		case "RawRule":
			return `${step.tagName} (kept as XML)`;
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
		default:
			return "Unknown rule step";
	}
}

function clientTypeDesc(type: string): string {
	switch (type) {
		case "Modern":
			return "Unified Interface";
		case "Refresh":
			return "legacy updated web client";
		case "Legacy":
			return "Classic ribbon / Outlook list views";
		default:
			return type;
	}
}
