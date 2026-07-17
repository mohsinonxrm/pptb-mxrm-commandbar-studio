import type { GroupTemplate } from "@/types/ribbon";

// Standard Dataverse group templates.
// Layout "Title" values are case-sensitive — they map to TemplateAlias in scaling.
export const KNOWN_GROUP_TEMPLATES: GroupTemplate[] = [
	{
		id: "Mscrm.Templates.Flexible2",
		name: "Flexible2",
		layouts: [
			{ title: "LargeLarge", templateAlias: "o1", isOverflow: false },
			{ title: "LargeMediumSmall", templateAlias: "o1", isOverflow: false },
			{ title: "MediumSmall", templateAlias: "o1", isOverflow: false },
			{ title: "Popup", templateAlias: "isv", isOverflow: true },
		],
	},
	{
		id: "Mscrm.Templates.Layout3",
		name: "Layout3",
		layouts: [
			{ title: "LargeLargeLarge", templateAlias: "o1", isOverflow: false },
			{ title: "Popup", templateAlias: "isv", isOverflow: true },
		],
	},
	{
		id: "Mscrm.Templates.Layout3Popup",
		name: "Layout3Popup",
		layouts: [
			{ title: "LargeLargeLarge", templateAlias: "o1", isOverflow: false },
			{ title: "Popup", templateAlias: "isv", isOverflow: true },
		],
	},
];
