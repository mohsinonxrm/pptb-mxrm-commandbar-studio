/**
 * Duplicating a group whose title is a platform text (`$Resources:`) or
 * another solution's label (#137) titled the copy with the key itself
 * ("Ribbon.HomepageGrid.MainTab.Management (copy)"), and that literal text is
 * what published. Like a copied button (#86), the copy now keeps the token, so
 * it shows the same text; other titles still get " (copy)".
 */
import { describe, it, expect } from "vitest";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { planScope } from "@/services/publishPlan";
import { useRibbonStore } from "@/store/ribbonStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { LocLabel, RibbonDefinition, RibbonGroup, RibbonLocation } from "@/types/ribbon";

const MAIN = "Mscrm.HomepageGrid.contact.MainTab";
const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: "contact",
	tabs: [],
});
const group = (id: string, label: string, extra: Partial<RibbonGroup> = {}): RibbonGroup => ({
	id,
	label,
	sequence: 10,
	template: "Mscrm.Templates.Flexible2",
	buttons: [],
	...extra,
});

function duplicate(g: RibbonGroup, locLabels: LocLabel[] = []) {
	const loaded: RibbonDefinition = {
		location: "HomepageGrid",
		entityLogicalName: "contact",
		tabs: [{ id: MAIN, label: "Main", sequence: 10, tabDisplayRules: [], groups: [g] }],
	};
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: loaded,
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels,
	});
	useRibbonStore.getState().duplicateGroup("HomepageGrid", MAIN, g.id);
	const state = useRibbonStore.getState();
	const copy = state.ribbons.HomepageGrid.tabs[0].groups.find((x) =>
		x.id.includes(`${g.id}_copy_`),
	)!;
	const xml = generateRibbonDiffXml({
		current: state.ribbons.HomepageGrid,
		baseline: loaded,
		commands: state.commands,
		enableRules: state.enableRules,
		displayRules: state.displayRules,
		locLabels: state.locLabels,
		entityLogicalName: "contact",
		location: "HomepageGrid",
		languageCode: state.baseLanguageCode,
	});
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const title = doc.querySelector(`Group[Id="${copy.id}"]`)?.getAttribute("Title");
	const labelText = title?.startsWith("$LocLabels:")
		? doc
				.querySelector(`LocLabel[Id="${title.slice("$LocLabels:".length)}"] Title`)
				?.getAttribute("description")
		: undefined;
	const plan = planScope({
		locations: [{ current: state.ribbons.HomepageGrid, baseline: loaded }],
		commands: [],
		baselineCommands: [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		locLabels: state.locLabels,
		baselineLocLabels: locLabels,
	});
	return { copy, title, labelText, xml, plan };
}

describe("duplicating a group keeps a title it can't add (copy) to", () => {
	it("an out-of-the-box group's $Resources: title is kept as the token", () => {
		const { copy, title, xml, plan } = duplicate(
			group(`${MAIN}.Management`, "$Resources:Ribbon.HomepageGrid.MainTab.Management"),
		);
		expect(title).toBe("$Resources:Ribbon.HomepageGrid.MainTab.Management");
		expect(xml).not.toContain("Ribbon.HomepageGrid.MainTab.Management (copy)");
		expect(copy.source?.titleToken).toBe("$Resources:Ribbon.HomepageGrid.MainTab.Management");
		expect(plan.unsupported).toEqual([]);
		// Said in the Console: once published, the copy's title can't be renamed.
		expect(useRuntimeLogStore.getState().entries.at(-1)?.message).toMatch(
			/Rename the copy before you publish/,
		);
	});

	it("renamed before publishing, the copy publishes a label of its own", () => {
		const g = group(`${MAIN}.Actions`, "$Resources:Ribbon.HomepageGrid.MainTab.Actions");
		const { copy } = duplicate(g);
		useRibbonStore.getState().renameGroup("HomepageGrid", MAIN, copy.id, "More actions");
		const state = useRibbonStore.getState();
		const xml = generateRibbonDiffXml({
			current: state.ribbons.HomepageGrid,
			baseline: {
				location: "HomepageGrid",
				entityLogicalName: "contact",
				tabs: [{ id: MAIN, label: "Main", sequence: 10, tabDisplayRules: [], groups: [g] }],
			},
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: state.locLabels,
			entityLogicalName: "contact",
			location: "HomepageGrid",
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		expect(doc.querySelector(`Group[Id="${copy.id}"]`)?.getAttribute("Title")).toBe(
			`$LocLabels:${copy.id}.Title`,
		);
		expect(
			doc.querySelector(`LocLabel[Id="${copy.id}.Title"] Title`)?.getAttribute("description"),
		).toBe("More actions");
	});

	it("another solution's label is kept as the token", () => {
		const { title, xml } = duplicate(group("msdyn.Grp", "$LocLabels:msdyn.Grp.Title"), [
			{ id: "mine.Label", titles: [{ languageCode: 1033, description: "Mine" }] },
		]);
		expect(title).toBe("$LocLabels:msdyn.Grp.Title");
		expect(xml).not.toContain("(copy)");
	});

	it("an imported group's $Resources: title (kept in source) too", () => {
		const { title } = duplicate(
			group("cbs.Imported", "Ribbon.HomepageGrid.MainTab.Management", {
				source: {
					titleToken: "$Resources:Ribbon.HomepageGrid.MainTab.Management",
					attributes: {},
				},
			}),
		);
		expect(title).toBe("$Resources:Ribbon.HomepageGrid.MainTab.Management");
	});

	it("your own label's text and a literal title get (copy), in a label of the copy's own", () => {
		expect(
			duplicate(group("cbs.Own", "$LocLabels:cbs.Own.Title"), [
				{ id: "cbs.Own.Title", titles: [{ languageCode: 1033, description: "Tools" }] },
			]).labelText,
		).toBe("Tools (copy)");
		expect(duplicate(group("cbs.Lit", "Reports")).labelText).toBe("Reports (copy)");
	});
});
