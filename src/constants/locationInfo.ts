import type { RibbonLocation } from "@/types/ribbon";

/**
 * What each ribbon location is, in the words Unified Interface uses (#180, #181).
 * Shown behind "About this location" instead of permanent banners above the canvas.
 */
export interface LocationInfo {
	/** Tab label in the location row. */
	label: string;
	/** Popover title. */
	title: string;
	/** Popover text: what this command bar is and how Unified Interface shows it. */
	body: string;
	/** The ribbon id, with `{table}` for the table's logical name. */
	ribbonId: string;
}

export const LOCATION_INFO: Record<RibbonLocation, LocationInfo> = {
	HomepageGrid: {
		label: "Main grid",
		title: "Main grid",
		body: "The command bar above the table's full-page list of records. Unified Interface shows this ribbon as one flat bar: tabs, group layout and scaling are ignored, and commands that don't fit move under More commands (⋮).",
		ribbonId: "Mscrm.HomepageGrid.{table}",
	},
	Form: {
		label: "Main form",
		title: "Main form",
		body: "The command bar at the top of the table's main form. Unified Interface shows it as one flat bar: tab layout and scaling are ignored, but button visibility and command actions work as configured, as in Ribbon Workbench. Microsoft doesn't support the tabbed ribbon on Unified Interface.",
		ribbonId: "Mscrm.Form.{table}",
	},
	SubGrid: {
		label: "Sub-grid",
		title: "Sub-grid",
		body: "The command bar on this table's sub-grids on other tables' forms, and on the Related tab's associated view. A sub-grid has room for only a few commands before More commands. Of the built-in controls, only Add, Show List and Delete are supported, and their icons can't be changed.",
		ribbonId: "Mscrm.SubGrid.{table}",
	},
	Application: {
		label: "Application",
		title: "Application ribbon",
		body: "Changes here apply to every table. Buttons on GlobalTab appear in the global command bar at the top of every page. Built-in GlobalTab buttons are read-only.",
		ribbonId: "Application ribbon",
	},
};

/** The ribbon id for a location and table, e.g. "Mscrm.Form.account". */
export function locationRibbonId(location: RibbonLocation, table?: string): string {
	return LOCATION_INFO[location].ribbonId.replace("{table}", table || "<table>");
}
