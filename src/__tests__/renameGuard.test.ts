/**
 * #33 — a tab or group is renamed only where the rename can be published (the
 * publish plan's rule), and a duplicated group's title is text, never a label
 * token with " (copy)" appended.
 */
import { describe, it, expect } from "vitest";
import { canRenameContainer } from "@/utils/ribbonProvenance";
import { planScope } from "@/services/publishPlan";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const MAIN = "Mscrm.HomepageGrid.contact.MainTab";
const OWN = "mxrm.contact.Own.Group";
const MGMT = `${MAIN}.Management`;
const OWN_TAB = "mxrm.contact.Own.Tab";

function ribbon(): RibbonDefinition {
	return {
		location: "HomepageGrid",
		entityLogicalName: "contact",
		tabs: [
			{
				id: MAIN,
				label: "$Resources:Ribbon.HomepageGrid.MainTab",
				tabDisplayRules: [],
				sequence: 10,
				groups: [
					{
						id: OWN,
						label: "$LocLabels:grp.Title",
						sequence: 10,
						template: "Flexible2",
						buttons: [],
					},
					{
						id: MGMT,
						label: "$Resources:Ribbon.HomepageGrid.MainTab.Management",
						sequence: 20,
						template: "Mscrm.Templates.Flexible2",
						buttons: [],
					},
					{
						id: "mxrm.contact.Literal.Group",
						label: "Literal title",
						sequence: 30,
						template: "Flexible2",
						buttons: [],
					},
				],
			},
			{
				id: OWN_TAB,
				label: "$LocLabels:tab.Title",
				sequence: 20,
				tabDisplayRules: [],
				groups: [],
			},
		],
	};
}

const layer = {
	containerIds: [OWN, OWN_TAB, "mxrm.contact.Literal.Group"],
	locLabelIds: ["grp.Title", "tab.Title"],
};

describe("canRenameContainer (#33)", () => {
	it("allows your own tabs and groups whose title is a label your layer defines", () => {
		expect(canRenameContainer(OWN, ribbon(), layer)).toBe(true);
		expect(canRenameContainer(OWN_TAB, ribbon(), layer)).toBe(true);
	});

	it("refuses out-of-the-box and managed ones, and own ones with a literal title", () => {
		expect(canRenameContainer(MAIN, ribbon(), layer)).toBe(false);
		expect(canRenameContainer(MGMT, ribbon(), layer)).toBe(false);
		expect(canRenameContainer("mxrm.contact.Literal.Group", ribbon(), layer)).toBe(false);
	});

	it("refuses an own one whose label the layer doesn't define, or when the layer wasn't read", () => {
		expect(canRenameContainer(OWN, ribbon(), { containerIds: [OWN], locLabelIds: [] })).toBe(
			false,
		);
		expect(canRenameContainer(OWN, ribbon(), null)).toBe(false);
	});

	it("allows any tab or group created this session", () => {
		expect(canRenameContainer("mxrm.contact.New.Group", ribbon(), null)).toBe(true);
	});

	it("agrees with the publish plan: what it allows publishes, what it refuses is reported", () => {
		const baseline = ribbon();
		for (const id of [OWN, MGMT, "mxrm.contact.Literal.Group"]) {
			const current = ribbon();
			current.tabs[0].groups.find((g) => g.id === id)!.label = "Renamed";
			const plan = planScope({
				locations: [{ current, baseline }],
				commands: [],
				baselineCommands: [],
				enableRules: [],
				baselineEnableRules: [],
				displayRules: [],
				baselineDisplayRules: [],
				locLabels: [
					{ id: "grp.Title", titles: [{ languageCode: 1033, description: "Mine" }] },
					{ id: "tab.Title", titles: [{ languageCode: 1033, description: "My tab" }] },
				],
				layer,
			});
			const refused = plan.unsupported.some((u) => u.includes(`Renaming group ${id}`));
			expect(refused).toBe(!canRenameContainer(id, baseline, layer));
		}
	});
});

describe("duplicating a group (#33)", () => {
	const empty = (location: RibbonLocation): RibbonDefinition => ({
		location,
		entityLogicalName: "contact",
		tabs: [],
	});

	function duplicate(groupId: string) {
		const loaded = ribbon();
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
			locLabels: [
				{
					id: "grp.Title",
					titles: [
						{ languageCode: 1031, description: "Meine Gruppe" },
						{ languageCode: 1033, description: "My group" },
					],
				},
			],
			baseLanguageCode: 1031,
		});
		useRibbonStore.getState().duplicateGroup("HomepageGrid", MAIN, groupId);
		const state = useRibbonStore.getState();
		const copy = state.ribbons.HomepageGrid.tabs[0].groups.find((g) =>
			g.id.startsWith(`${groupId}_copy_`),
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
		const label = doc.querySelector(
			`LocLabel[Id="${title?.replace("$LocLabels:", "")}"] Title`,
		);
		return {
			copy,
			title,
			text: label?.getAttribute("description"),
			lang: label?.getAttribute("languagecode"),
		};
	}

	it("a `$LocLabels:` title becomes its base-language text + (copy)", () => {
		const { copy, title, text, lang } = duplicate(OWN);
		expect(copy.label).toBe("Meine Gruppe (copy)");
		expect(title).toBe(`$LocLabels:${copy.id}.Title`);
		expect(text).toBe("Meine Gruppe (copy)");
		expect(lang).toBe("1031");
	});

	it("a platform `$Resources:` title isn't written as text with the token in it", () => {
		const { copy, text } = duplicate(MGMT);
		expect(copy.label).toBe("Ribbon.HomepageGrid.MainTab.Management (copy)");
		expect(text).toBe("Ribbon.HomepageGrid.MainTab.Management (copy)");
		expect(text).not.toContain("$Resources");
	});
});
