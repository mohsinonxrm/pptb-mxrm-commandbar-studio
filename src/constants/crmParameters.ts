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
		description: "The primary Xrm.Page / FormContext / GridControl",
	},
	{
		value: "PrimaryControlId",
		group: "Context",
		label: "Primary Control ID",
		description: "ID of the primary control",
	},
	{
		value: "SelectedControl",
		group: "Context",
		label: "Selected Control",
		description: "The currently selected grid or form control",
	},
	{
		value: "CommandProperties",
		group: "Context",
		label: "Command Properties",
		description: "Properties of the command that triggered the action",
	},
	// Record
	{
		value: "PrimaryEntityTypeCode",
		group: "Record",
		label: "Primary Entity Type Code",
		description: "Object type code of the primary entity",
	},
	{
		value: "PrimaryEntityTypeName",
		group: "Record",
		label: "Primary Entity Type Name",
		description: "Logical name of the primary entity",
	},
	{
		value: "FirstPrimaryItemId",
		group: "Record",
		label: "First Primary Item ID",
		description: "GUID of the first selected record (primary entity)",
	},
	{
		value: "PrimaryItemIds",
		group: "Record",
		label: "Primary Item IDs",
		description: "Array of GUIDs of all selected records (primary entity)",
	},
	// Selection context
	{
		value: "SelectedEntityTypeCode",
		group: "Selection context",
		label: "Selected Entity Type Code",
		description: "Object type code of the selected entity in the grid",
	},
	{
		value: "SelectedEntityTypeName",
		group: "Selection context",
		label: "Selected Entity Type Name",
		description: "Logical name of the selected entity in the grid",
	},
	{
		value: "FirstSelectedItemId",
		group: "Selection context",
		label: "First Selected Item ID",
		description: "GUID of the first selected row in the grid",
	},
	// Grid selection
	{
		value: "SelectedControlSelectedItemCount",
		group: "Grid selection",
		label: "Selected Item Count",
		description: "Number of selected rows in the grid",
	},
	{
		value: "SelectedControlSelectedItemIds",
		group: "Grid selection",
		label: "Selected Item IDs",
		description: "Array of GUIDs of selected rows",
	},
	{
		value: "SelectedControlSelectedItemReferences",
		group: "Grid selection",
		label: "Selected Item References",
		description: "Entity references for selected rows",
	},
	{
		value: "SelectedControlAllItemCount",
		group: "Grid selection",
		label: "All Item Count",
		description: "Total number of rows in the grid",
	},
	{
		value: "SelectedControlAllItemIds",
		group: "Grid selection",
		label: "All Item IDs",
		description: "Array of GUIDs of all rows in the grid",
	},
	{
		value: "SelectedControlAllItemReferences",
		group: "Grid selection",
		label: "All Item References",
		description: "Entity references for all rows",
	},
	{
		value: "SelectedControlUnselectedItemCount",
		group: "Grid selection",
		label: "Unselected Item Count",
		description: "Number of unselected rows in the grid",
	},
	{
		value: "SelectedControlUnselectedItemIds",
		group: "Grid selection",
		label: "Unselected Item IDs",
		description: "Array of GUIDs of unselected rows",
	},
	{
		value: "SelectedControlUnselectedItemReferences",
		group: "Grid selection",
		label: "Unselected Item References",
		description: "Entity references for unselected rows",
	},
	// Org / User
	{
		value: "OrgName",
		group: "Org/User",
		label: "Org Name",
		description: "Unique name of the Dataverse organization",
	},
	{
		value: "OrgLcid",
		group: "Org/User",
		label: "Org LCID",
		description: "Organization's base language LCID",
	},
	{
		value: "UserLcid",
		group: "Org/User",
		label: "User LCID",
		description: "Current user's language LCID",
	},
];
