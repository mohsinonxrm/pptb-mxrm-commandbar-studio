import type { CrmParameterValue } from "@/types/ribbon";

export interface CrmParameterInfo {
	value: CrmParameterValue;
	label: string;
	group: string;
	description: string;
}

export const CRM_PARAMETER_VALUES: CrmParameterInfo[] = [
	// Context
	{
		value: "PrimaryControl",
		group: "Context",
		label: "Primary Control",
		description: "The form's context (formContext) on a form. On a grid, use SelectedControl.",
	},
	{
		value: "PrimaryControlId",
		group: "Context",
		label: "Primary Control ID",
		description: "The id of the primary control.",
	},
	{
		value: "SelectedControl",
		group: "Context",
		label: "Selected Control",
		description:
			"The grid's context (gridContext): the main grid or the sub-grid the command runs on.",
	},
	{
		value: "CommandProperties",
		group: "Context",
		label: "Command Properties",
		description:
			"Details of the ribbon control that ran the command, for one function serving several buttons.",
	},
	// Record
	{
		value: "PrimaryEntityTypeCode",
		group: "Record",
		label: "Primary Entity Type Code",
		description: "Deprecated: use PrimaryEntityTypeName. The type code of the record's table.",
	},
	{
		value: "PrimaryEntityTypeName",
		group: "Record",
		label: "Primary Entity Type Name",
		description:
			"The logical name of the table of the record being viewed (on a form) or of the main grid.",
	},
	{
		value: "FirstPrimaryItemId",
		group: "Record",
		label: "First Primary Item ID",
		description:
			"The id of the record being viewed. Empty on a main grid: use the grid selection values there.",
	},
	{
		value: "PrimaryItemIds",
		group: "Record",
		label: "Primary Item IDs",
		description: "On a main grid, the ids of the records it displays.",
	},
	// Selection context
	{
		value: "SelectedEntityTypeCode",
		group: "Selection context",
		label: "Selected Entity Type Code",
		description: "Deprecated: use SelectedEntityTypeName. The type code of the grid's table.",
	},
	{
		value: "SelectedEntityTypeName",
		group: "Selection context",
		label: "Selected Entity Type Name",
		description: "The logical name of the grid's table (main grid or sub-grid).",
	},
	{
		value: "FirstSelectedItemId",
		group: "Selection context",
		label: "First Selected Item ID",
		description: "The id of the first selected row of the grid.",
	},
	// Grid selection
	{
		value: "SelectedControlSelectedItemCount",
		group: "Grid selection",
		label: "Selected Item Count",
		description: "How many rows of the grid are selected.",
	},
	{
		value: "SelectedControlSelectedItemIds",
		group: "Grid selection",
		label: "Selected Item IDs",
		description: "The ids of the selected rows.",
	},
	{
		value: "SelectedControlSelectedItemReferences",
		group: "Grid selection",
		label: "Selected Item References",
		description: "References (id, table, name) of the selected rows.",
	},
	{
		value: "SelectedControlAllItemCount",
		group: "Grid selection",
		label: "All Item Count",
		description: "How many rows the grid shows.",
	},
	{
		value: "SelectedControlAllItemIds",
		group: "Grid selection",
		label: "All Item IDs",
		description: "The ids of every row the grid shows.",
	},
	{
		value: "SelectedControlAllItemReferences",
		group: "Grid selection",
		label: "All Item References",
		description: "References (id, table, name) of every row the grid shows.",
	},
	{
		value: "SelectedControlUnselectedItemCount",
		group: "Grid selection",
		label: "Unselected Item Count",
		description: "How many rows of the grid aren't selected.",
	},
	{
		value: "SelectedControlUnselectedItemIds",
		group: "Grid selection",
		label: "Unselected Item IDs",
		description: "The ids of the rows that aren't selected.",
	},
	{
		value: "SelectedControlUnselectedItemReferences",
		group: "Grid selection",
		label: "Unselected Item References",
		description: "References (id, table, name) of the rows that aren't selected.",
	},
	// Org / User
	{
		value: "OrgName",
		group: "Org/User",
		label: "Org Name",
		description: "The organization's unique name.",
	},
	{
		value: "OrgLcid",
		group: "Org/User",
		label: "Org LCID",
		description: "The organization's base language (LCID).",
	},
	{
		value: "UserLcid",
		group: "Org/User",
		label: "User LCID",
		description: "The user's language (LCID).",
	},
];

/**
 * `CrmParameter` values allowed in a `<Url>` action. RibbonTypes.xsd's
 * `CrmNamedParameterValue` is `CrmParameterValue` without the three
 * `…ItemReferences` values, which only a JavaScriptFunction / CustomRule can take (#41).
 */
/** Values Microsoft marks deprecated, with what to use instead (#161). */
export const DEPRECATED_CRM_PARAMETER_VALUES: Record<string, string> = {
	PrimaryEntityTypeCode: "PrimaryEntityTypeName",
	SelectedEntityTypeCode: "SelectedEntityTypeName",
};

/** What a CrmParameter value passes, in words (#161); undefined for one CBS doesn't list. */
export function crmParameterDescription(value: string): string | undefined {
	return CRM_PARAMETER_VALUES.find((p) => p.value === value)?.description;
}

export const URL_INVALID_CRM_PARAMETER_VALUES = new Set<string>([
	"SelectedControlSelectedItemReferences",
	"SelectedControlAllItemReferences",
	"SelectedControlUnselectedItemReferences",
]);

/**
 * The query string parameters an HTML web resource accepts (#160): "Pass parameters to HTML web
 * resources" (pagemode, security and tabSet are for internal use). Your own values go in `data`.
 * https://learn.microsoft.com/power-apps/developer/model-driven-apps/webpage-html-web-resources
 */
export const WEB_RESOURCE_URL_PARAMETERS = [
	"data",
	"typename",
	"type",
	"id",
	"orgname",
	"userlcid",
	"orglcid",
	"formid",
	"entrypoint",
];

/** The values RibbonTypes.xsd allows for an unnamed (JavaScriptFunction / CustomRule) CrmParameter. */
export const CRM_PARAMETER_VALUE_SET = new Set<string>(CRM_PARAMETER_VALUES.map((p) => p.value));

export function isNamedCrmParameterValue(value: string): boolean {
	return CRM_PARAMETER_VALUE_SET.has(value) && !URL_INVALID_CRM_PARAMETER_VALUES.has(value);
}
