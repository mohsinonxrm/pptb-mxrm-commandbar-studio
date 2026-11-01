import type { RuleStep } from "@/types/ribbon";

export type RuleKind = RuleStep["kind"];

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
	CommandClientTypeRule: "Client (Unified Interface / legacy)",
	CrmClientTypeRule: "Client (web / Outlook)",
	CrmOfflineAccessStateRule: "Offline access",
	CrmOutlookClientTypeRule: "Outlook client",
	CrmOutlookClientVersionRule: "Outlook client version",
	CustomRule: "Your JavaScript",
	DeviceTypeRule: "Device",
	EntityPrivilegeRule: "Table privilege",
	EntityPropertyRule: "Table property",
	EntityRule: "Table",
	FeatureControlRule: "Feature control bit",
	FormEntityContextRule: "Form's table",
	FormStateRule: "Form state",
	FormTypeRule: "Form type",
	HideForTabletExperienceRule: "Hide on tablets",
	MiscellaneousPrivilegeRule: "Other privilege",
	OptionSetRule: "Choice value",
	OrganizationSettingRule: "Organization setting",
	OrRule: "Any of (Or)",
	OutlookItemTrackingRule: "Outlook item tracking",
	OutlookRenderTypeRule: "Outlook or web",
	OutlookVersionRule: "Outlook version",
	PageRule: "Page address",
	RawRule: "Other rule (kept as XML)",
	RecordPrivilegeRule: "Record privilege",
	ReferencingAttributeRequiredRule: "Referencing column required",
	RelationshipTypeRule: "Relationship type",
	SelectionCountRule: "Selected records",
	SkuRule: "Deployment (online / on-premises)",
	ValueRule: "Column value",
};

export interface RuleKindGroup {
	label: string;
	kinds: RuleKind[];
}

/**
 * Kinds offered by the rule picker. The ShowOn* "rules" are not schema
 * elements: show-on-grid / quick-action behaviour comes from referencing the
 * out-of-the-box enable rules `Mscrm.ShowOnGrid`, `Mscrm.ShowOnQuickAction` and
 * `Mscrm.ShowOnGridAndQuickAction` from the command (#41;
 * https://learn.microsoft.com/power-apps/developer/model-driven-apps/define-ribbon-enable-rules).
 */
export const RULE_KIND_GROUPS: RuleKindGroup[] = [
	{
		label: "Client and device",
		kinds: [
			"CommandClientTypeRule",
			"CrmClientTypeRule",
			"DeviceTypeRule",
			"CrmOutlookClientVersionRule",
		],
	},
	{
		label: "Form",
		kinds: ["FormStateRule", "FormTypeRule", "FormEntityContextRule"],
	},
	{
		label: "Table",
		kinds: ["EntityRule", "EntityPrivilegeRule", "EntityPropertyRule", "OptionSetRule"],
	},
	{
		label: "Selection and record",
		kinds: ["SelectionCountRule", "ValueRule", "RecordPrivilegeRule"],
	},
	{
		label: "Other",
		kinds: [
			"MiscellaneousPrivilegeRule",
			"OrganizationSettingRule",
			"FeatureControlRule",
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
		label: "Combine steps",
		kinds: ["OrRule"],
	},
	{
		label: "Your code",
		kinds: ["CustomRule"],
	},
];

/**
 * Rule placement per RibbonTypes.xsd (#41): `EnableRulesGroup` lists the kinds
 * allowed in an `<EnableRule>`, `DisplayRulesGroup` those allowed in a
 * `<DisplayRule>`; an `<Or>` accepts the same kinds as its parent rule, but no
 * nested OrRule. Kinds in only one group are enable-only or display-only.
 *
 * Note: Microsoft's own RetrieveEntityRibbon output breaks this in places (a few
 * out-of-the-box display rules use CustomRule, a few enable rules use
 * FeatureControlRule), so the validator reports placement as a warning, and the
 * picker only restricts what CBS lets you ADD.
 */
export const ENABLE_ONLY_RULE_KINDS = new Set<RuleKind>([
	"CustomRule",
	"OutlookItemTrackingRule",
	"RecordPrivilegeRule",
	"SelectionCountRule",
]);

export const DISPLAY_ONLY_RULE_KINDS = new Set<RuleKind>([
	"CrmOutlookClientVersionRule",
	"DeviceTypeRule",
	"EntityPrivilegeRule",
	"EntityPropertyRule",
	"FeatureControlRule",
	"FormEntityContextRule",
	"FormTypeRule",
	"HideForTabletExperienceRule",
	"MiscellaneousPrivilegeRule",
	"OptionSetRule",
	"OrganizationSettingRule",
	"OutlookRenderTypeRule",
	"ReferencingAttributeRequiredRule",
	"RelationshipTypeRule",
]);

/** Element names (as in the XML) of the display-only rules, including the unmodelled HideIf* family. */
export const DISPLAY_ONLY_RULE_TAGS = new Set<string>([
	...Array.from(DISPLAY_ONLY_RULE_KINDS),
	"HideIfNetBreezeNotAvailableRule",
	"HideIfServiceMetadataAvailableRule",
	"HideIfSharepointS2SConfigurationEnabledRule",
	"HideIfExportToExcelNotEnabledRule",
	"IsExportToExcelOnlineEnabledRule",
	"HideIfDisabledForMobileRule",
	"HideIfHybridSSSNotEnabledRule",
	"HideIfEmailSignatureNotEnabledRule",
	"HideIfReverseHybridSSSNotEnabledRule",
	"HideIfDelveNotAvailableRule",
	"HideIfTestExchangeServerNotEnabledRule",
	"HideIfSSSTroubleshootingNotEnabledRule",
	"HideIfCurrentUserIsNotSystemAdministratorRule",
	"HideIfPowerBITileNotAvailableRule",
	"HideIfProcessActiveRule",
	"HideIfProcessInactiveRule",
	"HideIfProcessUnificationIsDisabledRule",
	"HideIfO365UserDoesNotHaveExchangeSubscriptionsRule",
	"HideIfEmailIsApprovedByAdminRule",
	"HideIfUserIsNotTenantAdminRule",
	"HideIfEmailIsApprovedByAdminBasedOnESPRule",
	"HideIfProductRecommendationsNotEnabledRule",
]);

export type RuleContainer = "enable" | "display";

/** Whether a rule kind may be added to an enable / display rule (and inside an `<Or>`). */
export function isRuleKindAllowed(
	kind: RuleKind,
	container: RuleContainer,
	insideOr = false,
): boolean {
	if (kind === "RawRule") return false;
	if (insideOr && kind === "OrRule") return false;
	if (container === "enable") return !DISPLAY_ONLY_RULE_KINDS.has(kind);
	return !ENABLE_ONLY_RULE_KINDS.has(kind);
}
