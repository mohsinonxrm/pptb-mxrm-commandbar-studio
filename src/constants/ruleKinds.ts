import type { RuleStep } from "@/types/ribbon";

export type RuleKind = RuleStep["kind"];

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
	CommandClientTypeRule: "Client type (Modern/Refresh/Legacy)",
	CrmClientTypeRule: "CRM client type (Web/Outlook)",
	CrmOfflineAccessStateRule: "Offline access state",
	CrmOutlookClientTypeRule: "Outlook client type",
	CrmOutlookClientVersionRule: "Outlook client version",
	CustomRule: "Custom rule (JavaScript)",
	DeviceTypeRule: "Device type",
	EntityPrivilegeRule: "Entity privilege",
	EntityPropertyRule: "Entity property",
	EntityRule: "Entity",
	FormEntityContextRule: "Form entity context",
	FormStateRule: "Form state",
	FormTypeRule: "Form type",
	HideForTabletExperienceRule: "Hide for tablet experience",
	MiscellaneousPrivilegeRule: "Miscellaneous privilege",
	OptionSetRule: "Option set value",
	OrganizationSettingRule: "Organization setting",
	OrRule: "Any of (OR)",
	OutlookItemTrackingRule: "Outlook item tracking",
	OutlookRenderTypeRule: "Outlook render type",
	OutlookVersionRule: "Outlook version",
	PageRule: "Page (URL match)",
	RecordPrivilegeRule: "Record privilege",
	ReferencingAttributeRequiredRule: "Referencing attribute required",
	RelationshipTypeRule: "Relationship type",
	SelectionCountRule: "Selection count",
	ShowOnQuickActionRule: "Show on quick action",
	ShowOnGridAndQuickActionRule: "Show on grid and quick action",
	ShowOnGridRule: "Show on grid",
	SkuRule: "SKU (Online/OnPremise)",
	ValueRule: "Field value",
};

export interface RuleKindGroup {
	label: string;
	kinds: RuleKind[];
}

export const RULE_KIND_GROUPS: RuleKindGroup[] = [
	{
		label: "Client / Presentation",
		kinds: ["CommandClientTypeRule", "CrmClientTypeRule", "CrmOutlookClientVersionRule"],
	},
	{
		label: "Form state",
		kinds: ["FormStateRule", "FormTypeRule", "FormEntityContextRule"],
	},
	{
		label: "Entity",
		kinds: ["EntityRule", "EntityPrivilegeRule", "EntityPropertyRule"],
	},
	{
		label: "Selection",
		kinds: ["SelectionCountRule", "ValueRule", "RecordPrivilegeRule"],
	},
	{
		label: "Misc",
		kinds: [
			"MiscellaneousPrivilegeRule",
			"OrganizationSettingRule",
			"PageRule",
			"SkuRule",
			"HideForTabletExperienceRule",
			"RelationshipTypeRule",
			"ReferencingAttributeRequiredRule",
		],
	},
	{
		label: "Outlook",
		kinds: [
			"CrmOfflineAccessStateRule",
			"CrmOutlookClientTypeRule",
			"OutlookItemTrackingRule",
			"OutlookRenderTypeRule",
			"OutlookVersionRule",
		],
	},
	{
		label: "Quick actions",
		kinds: ["ShowOnQuickActionRule", "ShowOnGridAndQuickActionRule", "ShowOnGridRule"],
	},
	{
		label: "Composite",
		kinds: ["OrRule"],
	},
	{
		label: "Custom",
		kinds: ["CustomRule"],
	},
];

// Rule kinds not valid inside EnableRules
export const DISPLAY_ONLY_RULE_KINDS = new Set<RuleKind>([
	"CrmOutlookClientVersionRule",
	"DeviceTypeRule",
	"EntityPrivilegeRule",
	"EntityPropertyRule",
	"OptionSetRule",
]);
