/**
 * #33 — a tab or group is renamed only where the rename can be published (the
 * publish plan's rule), and a duplicated group's title is text, never a label
 * token with " (copy)" appended.
 */
import { describe, it, expect } from "vitest";
import { canRenameContainer } from "@/utils/ribbonProvenance";
import { planScope } from "@/services/publishPlan";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { parseRibbonDiffParts } from "@/services/ribbonDiffMerge";
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
		expect(canRenameContainer("group", OWN, ribbon(), layer)).toBe(true);
		expect(canRenameContainer("tab", OWN_TAB, ribbon(), layer)).toBe(true);
	});

	it("refuses out-of-the-box and managed ones, and own ones with a literal title", () => {
		expect(canRenameContainer("tab", MAIN, ribbon(), layer)).toBe(false);
		expect(canRenameContainer("group", MGMT, ribbon(), layer)).toBe(false);
		expect(canRenameContainer("group", "mxrm.contact.Literal.Group", ribbon(), layer)).toBe(
			false,
		);
	});

	it("refuses an own one whose label the layer doesn't define, or when the layer wasn't read", () => {
		expect(
			canRenameContainer("group", OWN, ribbon(), { containerIds: [OWN], locLabelIds: [] }),
		).toBe(false);
		expect(canRenameContainer("group", OWN, ribbon(), null)).toBe(false);
	});

	it("allows any tab or group created this session", () => {
		expect(canRenameContainer("group", "mxrm.contact.New.Group", ribbon(), null)).toBe(true);
		expect(canRenameContainer("tab", "mxrm.contact.New.Tab", ribbon(), null)).toBe(true);
	});

	it("agrees with the publish plan for tabs, groups, new ones and a shared label", () => {
		const labels = [
			{ id: "grp.Title", titles: [{ languageCode: 1033, description: "Mine" }] },
			{ id: "tab.Title", titles: [{ languageCode: 1033, description: "My tab" }] },
		];
		// The own group's label is also another group's title: the plan gives the renamed one its own.
		const shared = (r: RibbonDefinition) => {
			r.tabs[1].groups.push({
				id: "mxrm.contact.Shares.Group",
				label: "$LocLabels:grp.Title",
				sequence: 10,
				template: "Flexible2",
				buttons: [],
			});
			return r;
		};
		const cases: {
			kind: "tab" | "group";
			id: string;
			baseline: RibbonDefinition;
			rename: (r: RibbonDefinition) => void;
		}[] = [
			...[OWN, MGMT, "mxrm.contact.Literal.Group"].map((id) => ({
				kind: "group" as const,
				id,
				baseline: ribbon(),
				rename: (r: RibbonDefinition) =>
					(r.tabs[0].groups.find((g) => g.id === id)!.label = "Renamed"),
			})),
			...[MAIN, OWN_TAB].map((id) => ({
				kind: "tab" as const,
				id,
				baseline: ribbon(),
				rename: (r: RibbonDefinition) =>
					(r.tabs.find((t) => t.id === id)!.label = "Renamed"),
			})),
			{
				kind: "group",
				id: OWN,
				baseline: shared(ribbon()),
				rename: (r) => (r.tabs[0].groups.find((g) => g.id === OWN)!.label = "Renamed"),
			},
		];
		for (const c of cases) {
			const current = JSON.parse(JSON.stringify(c.baseline)) as RibbonDefinition;
			c.rename(current);
			const plan = planScope({
				locations: [{ current, baseline: c.baseline }],
				commands: [],
				baselineCommands: [],
				enableRules: [],
				baselineEnableRules: [],
				displayRules: [],
				baselineDisplayRules: [],
				locLabels: labels,
				layer: {
					...layer,
					containerIds: [...layer.containerIds, "mxrm.contact.Shares.Group"],
				},
			});
			const refused = plan.unsupported.some((u) => u.includes(`Renaming ${c.kind} ${c.id}`));
			const allowed = canRenameContainer(c.kind, c.id, c.baseline, {
				...layer,
				containerIds: [...layer.containerIds, "mxrm.contact.Shares.Group"],
			});
			expect([c.kind, c.id, refused]).toEqual([c.kind, c.id, !allowed]);
		}
	});

	it("a tab or group published from CBS can be renamed without re-reading the layer", () => {
		const empty = (location: RibbonLocation): RibbonDefinition => ({
			location,
			entityLogicalName: "contact",
			tabs: [],
		});
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
			locLabels: [],
			layers: { entity: { controlIds: [], containerIds: [], locLabelIds: [], hides: [] } },
		});
		const NEW = "mxrm.contact.Published.Group";
		const parts = parseRibbonDiffParts(`<RibbonDiffXml><CustomActions>
			<CustomAction Id="${NEW}.CustomAction" Location="${MAIN}.Groups._children" Sequence="40"><CommandUIDefinition><Group Id="${NEW}" Title="$LocLabels:${NEW}.Title" Sequence="40" Template="Mscrm.Templates.Flexible2"><Controls Id="${NEW}.Controls"/></Group></CommandUIDefinition></CustomAction>
		</CustomActions><LocLabels><LocLabel Id="${NEW}.Title"><Titles><Title languagecode="1033" description="Published"/></Titles></LocLabel></LocLabels></RibbonDiffXml>`);
		useRibbonStore.getState().markPublished(undefined, { entity: parts });
		const entityLayer = useRibbonStore.getState().layers.entity;
		expect(entityLayer?.containerIds).toContain(NEW);
		expect(entityLayer?.locLabelIds).toContain(`${NEW}.Title`);
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
			g.id.includes(`${groupId}_copy_`),
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

	it("a platform `$Resources:` title is kept as the token, never written as text", () => {
		// It can't take " (copy)": the copy shows the same text, like a copied button (#86).
		const { copy, title } = duplicate(MGMT);
		expect(title).toBe("$Resources:Ribbon.HomepageGrid.MainTab.Management");
		// No label of the copy's own is written.
		expect(useRibbonStore.getState().locLabels.some((l) => l.id === `${copy.id}.Title`)).toBe(false);
	});
});
