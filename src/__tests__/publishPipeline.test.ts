import { describe, it, expect } from "vitest";
import {
	parseRibbonDiffParts,
	partsFromRibbonTables,
	mergeRibbonDiffParts,
	serializeRibbonDiffParts,
	countRibbonDiffParts,
	emptyRibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { verifyRibbonImport } from "@/services/importJobVerification";
import { generateRibbonDiffXml, buildCustomizationsXml } from "@/services/xmlGenerator";
import { parseRibbonXml } from "@/services/xmlParser";
import type { RibbonDefinition, RibbonButton, CommandDefinition, EnableRule } from "@/types/ribbon";

// Rows exactly as returned by ribbondiffs / ribboncommands / ribbonrules for an
// entity whose unmanaged layer already holds a Ribbon Workbench-style hide plus
// a custom button (shapes captured from a live environment).
const existingRows = {
	diffs: [
		{
			diffid: "cca.Mscrm.Form.account.Save.Hide",
			difftype: 0,
			rdx: '<HideCustomAction HideActionId="cca.Mscrm.Form.account.Save.Hide" Location="Mscrm.Form.account.Save" />',
		},
		{
			diffid: "rw.account.Existing.Button.CustomAction",
			difftype: 0,
			rdx: '<CustomAction Id="rw.account.Existing.Button.CustomAction" Location="Mscrm.HomepageGrid.account.MainTab.Management.Controls._children" Sequence="5"><CommandUIDefinition><Button Id="rw.account.Existing.Button" Command="rw.account.Existing.Command" LabelText="$LocLabels:rw.account.Existing.Button.LabelText" TemplateAlias="o1" Sequence="5" /></CommandUIDefinition></CustomAction>',
		},
		{
			diffid: "rw.account.Existing.Button.LabelText",
			difftype: 3,
			rdx: '<LocLabel Id="rw.account.Existing.Button.LabelText"><Titles><Title description="Existing" languagecode="1033" /></Titles></LocLabel>',
		},
	],
	commands: [
		{
			command: "rw.account.Existing.Command",
			commanddefinition:
				'<CommandDefinition Id="rw.account.Existing.Command"><EnableRules><EnableRule Id="rw.account.HasSelection" /></EnableRules><DisplayRules /><Actions><Url Address="https://example.com" /></Actions></CommandDefinition>',
		},
	],
	rules: [
		{
			ruleid: "rw.account.HasSelection",
			ruletype: 1,
			ruledefinition:
				'<EnableRule Id="rw.account.HasSelection"><SelectionCountRule Minimum="1" AppliesTo="SelectedEntity" /></EnableRule>',
		},
	],
};

function button(id: string, extra: Partial<RibbonButton> = {}): RibbonButton {
	return {
		id,
		label: "Hello",
		sequence: 50,
		templateAlias: "o1",
		commandId: id.replace(/\.Button$/, ".Command"),
		kind: "button",
		hidden: false,
		oob: false,
		custom: true,
		managed: false,
		...extra,
	};
}

function ribbonWithGroup(
	location: RibbonDefinition["location"],
	tabId: string,
	groupId: string,
	buttons: RibbonButton[],
): RibbonDefinition {
	return {
		location,
		entityLogicalName: "account",
		tabs: [
			{
				id: tabId,
				label: "Tab",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: groupId,
						label: "Group",
						sequence: 10,
						template: "Mscrm.Templates.Flexible2",
						buttons,
					},
				],
			},
		],
	};
}

const commands: CommandDefinition[] = [
	{
		id: "cbs.account.HomepageGrid.Hello.Command",
		enableRules: ["cbs.account.OneSelected"],
		displayRules: ["Mscrm.HideOnModern"],
		actions: [
			{
				kind: "javascript",
				library: "$webresource:cbs_/scripts/test.js",
				functionName: "CBS.hello",
				params: [{ kind: "CrmParameter", value: "SelectedControl" }],
			},
		],
	},
];
const enableRules: EnableRule[] = [
	{
		id: "cbs.account.OneSelected",
		steps: [{ kind: "SelectionCountRule", minimum: 1, appliesTo: "SelectedEntity" }],
	},
];

function deltaFor(
	location: RibbonDefinition["location"],
	tabId: string,
	groupId: string,
	id: string,
) {
	const baseline = ribbonWithGroup(location, tabId, groupId, []);
	const current = ribbonWithGroup(location, tabId, groupId, [button(id)]);
	return generateRibbonDiffXml({
		current,
		baseline,
		commands: [...commands, { ...commands[0], id: id.replace(/\.Button$/, ".Command") }],
		enableRules,
		displayRules: [],
		locLabels: [],
		entityLogicalName: "account",
		location,
	});
}

describe("ribbonDiffMerge", () => {
	it("reads the unmanaged layer from ribbon table rows, keyed by id", () => {
		const parts = partsFromRibbonTables(existingRows);
		expect(parts.customActions.has("hide:cca.Mscrm.Form.account.Save.Hide")).toBe(true);
		expect(parts.customActions.has("ca:rw.account.Existing.Button.CustomAction")).toBe(true);
		expect(parts.commandDefinitions.has("rw.account.Existing.Command")).toBe(true);
		expect(parts.enableRules.has("rw.account.HasSelection")).toBe(true);
		expect(parts.locLabels.has("rw.account.Existing.Button.LabelText")).toBe(true);
	});

	it("preserves existing customizations and adds new buttons from every location in ONE diff (#11)", () => {
		const existing = partsFromRibbonTables(existingRows);
		let delta = emptyRibbonDiffParts();
		delta = mergeRibbonDiffParts(
			delta,
			parseRibbonDiffParts(
				deltaFor(
					"HomepageGrid",
					"Mscrm.HomepageGrid.account.MainTab",
					"Mscrm.HomepageGrid.account.MainTab.Management",
					"cbs.account.HomepageGrid.Hello.Button",
				),
			),
		);
		delta = mergeRibbonDiffParts(
			delta,
			parseRibbonDiffParts(
				deltaFor(
					"Form",
					"Mscrm.Form.account.MainTab",
					"Mscrm.Form.account.MainTab.Save",
					"cbs.account.Form.Hello.Button",
				),
			),
		);
		delta = mergeRibbonDiffParts(
			delta,
			parseRibbonDiffParts(
				deltaFor(
					"SubGrid",
					"Mscrm.SubGrid.account.MainTab",
					"Mscrm.SubGrid.account.MainTab.Management",
					"cbs.account.SubGrid.Hello.Button",
				),
			),
		);

		const xml = serializeRibbonDiffParts(mergeRibbonDiffParts(existing, delta));
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		expect(doc.querySelector("parsererror")).toBeNull();

		const caIds = Array.from(doc.querySelectorAll("CustomActions > CustomAction")).map((e) =>
			e.getAttribute("Id"),
		);
		expect(caIds).toEqual(
			expect.arrayContaining([
				"rw.account.Existing.Button.CustomAction",
				"cbs.account.HomepageGrid.Hello.Button.CustomAction",
				"cbs.account.Form.Hello.Button.CustomAction",
				"cbs.account.SubGrid.Hello.Button.CustomAction",
			]),
		);
		expect(
			doc.querySelector('HideCustomAction[HideActionId="cca.Mscrm.Form.account.Save.Hide"]'),
		).not.toBeNull();
		expect(
			doc.querySelector('CommandDefinition[Id="rw.account.Existing.Command"]'),
		).not.toBeNull();
		expect(
			doc.querySelector('CommandDefinition[Id="cbs.account.Form.Hello.Command"]'),
		).not.toBeNull();
		expect(
			doc.querySelector(
				'RuleDefinitions > EnableRules > EnableRule[Id="rw.account.HasSelection"]',
			),
		).not.toBeNull();
		expect(
			doc.querySelector(
				'RuleDefinitions > EnableRules > EnableRule[Id="cbs.account.OneSelected"]',
			),
		).not.toBeNull();
		expect(
			doc.querySelector('LocLabel[Id="rw.account.Existing.Button.LabelText"]'),
		).not.toBeNull();
		expect(
			doc.querySelector('LocLabel[Id="cbs.account.SubGrid.Hello.Button.LabelText"]'),
		).not.toBeNull();
		// The shared rule is emitted once, not three times.
		expect(doc.querySelectorAll('EnableRule[Id="cbs.account.OneSelected"]').length).toBe(1 + 3);
		expect(
			doc.querySelectorAll('RuleDefinitions EnableRule[Id="cbs.account.OneSelected"]').length,
		).toBe(1);
	});

	it("lets the session's version of an element replace the stored one", () => {
		const existing = partsFromRibbonTables(existingRows);
		const delta = parseRibbonDiffParts(
			`<RibbonDiffXml><CustomActions/><CommandDefinitions><CommandDefinition Id="rw.account.Existing.Command"><EnableRules/><DisplayRules/><Actions><Url Address="https://changed.example.com"/></Actions></CommandDefinition></CommandDefinitions></RibbonDiffXml>`,
		);
		const merged = mergeRibbonDiffParts(existing, delta);
		expect(merged.commandDefinitions.get("rw.account.Existing.Command")).toContain(
			"changed.example.com",
		);
		expect(countRibbonDiffParts(merged)).toBe(countRibbonDiffParts(existing));
	});

	it("serializes an empty layer as a valid, empty RibbonDiffXml", () => {
		const xml = serializeRibbonDiffParts(emptyRibbonDiffParts());
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		expect(doc.querySelector("parsererror")).toBeNull();
		expect(doc.documentElement.tagName).toBe("RibbonDiffXml");
	});

	it("round-trips through buildCustomizationsXml as a parseable document", () => {
		const xml = serializeRibbonDiffParts(partsFromRibbonTables(existingRows));
		const wrapped = buildCustomizationsXml({
			entities: [{ schemaName: "Account", localizedName: "Account", ribbonDiffXml: xml }],
		});
		const doc = new DOMParser().parseFromString(wrapped, "application/xml");
		expect(doc.querySelector("parsererror")).toBeNull();
		expect(doc.querySelectorAll("Entity > RibbonDiffXml HideCustomAction").length).toBe(1);
	});
});

describe("verifyRibbonImport", () => {
	const ok =
		'<importexportxml><entities><entity id="Account" processed="true"><result result="success" /></entity></entities>' +
		'<entityRibbon LocalizedName="Account" id="Account" processed="true"><result result="success" errorcode="0" errortext="" /></entityRibbon></importexportxml>';

	it("accepts a processed, successful entityRibbon (case-insensitive name match)", () => {
		expect(verifyRibbonImport(ok, { kind: "entity", names: ["account"] }).ok).toBe(true);
	});

	it("fails when Dataverse silently skipped the ribbon (#8 symptom)", () => {
		const skipped = "<importexportxml><entities /></importexportxml>";
		const v = verifyRibbonImport(skipped, { kind: "entity", names: ["Account", "account"] });
		expect(v.ok).toBe(false);
		expect(v.message).toMatch(/did not apply a ribbon/);
	});

	it("surfaces a ribbon import failure", () => {
		const failed =
			'<entityRibbon id="Account" processed="true"><result result="failure" errorcode="0x80040203" errortext="Bad LocLabel" /></entityRibbon>';
		const v = verifyRibbonImport(failed, { kind: "entity", names: ["Account"] });
		expect(v.ok).toBe(false);
		expect(v.message).toContain("Bad LocLabel");
	});

	it("verifies the application ribbon", () => {
		const app =
			'<ribbons><ribbon LocalizedName="Application Ribbons" processed="true"><result result="success" /></ribbon></ribbons>';
		expect(verifyRibbonImport(app, { kind: "application" }).ok).toBe(true);
		expect(verifyRibbonImport("<ribbons />", { kind: "application" }).ok).toBe(false);
	});
});

describe("parser rule definitions (#39)", () => {
	it("keeps real rule definitions instead of the command's empty references", () => {
		const xml = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs/></Ribbon></UI>
			<CommandDefinitions>
				<CommandDefinition Id="cmd"><EnableRules><EnableRule Id="rule.enable"/></EnableRules><DisplayRules><DisplayRule Id="rule.display"/></DisplayRules><Actions/></CommandDefinition>
			</CommandDefinitions>
			<RuleDefinitions>
				<TabDisplayRules/>
				<DisplayRules><DisplayRule Id="rule.display"><FormStateRule State="Create"/></DisplayRule></DisplayRules>
				<EnableRules><EnableRule Id="rule.enable"><SelectionCountRule Minimum="1"/></EnableRule></EnableRules>
			</RuleDefinitions>
		</RibbonDefinition></RibbonDefinitions>`;
		const parsed = parseRibbonXml(xml, "HomepageGrid", "account");
		expect(parsed.enableRules).toHaveLength(1);
		expect(parsed.enableRules[0].steps).toHaveLength(1);
		expect(parsed.displayRules).toHaveLength(1);
		expect(parsed.displayRules[0].steps).toHaveLength(1);
	});
});

describe("tab display rules (#40)", () => {
	it("are not re-emitted for tabs that already existed", () => {
		const tab = {
			id: "Mscrm.HomepageGrid.account.MainTab",
			label: "Main",
			sequence: 10,
			commandId: "Mscrm.HomepageGrid.account.MainTab",
			tabDisplayRules: [
				{
					tabCommand: "Mscrm.HomepageGrid.account.MainTab",
					rules: [{ kind: "EntityRule" as const, entityName: "account" }],
				},
			],
			groups: [],
		};
		const def: RibbonDefinition = {
			location: "HomepageGrid",
			entityLogicalName: "account",
			tabs: [tab],
		};
		const xml = generateRibbonDiffXml({
			current: def,
			baseline: def,
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: "account",
			location: "HomepageGrid",
		});
		expect(xml).not.toContain("<TabDisplayRule ");
	});

	it("are emitted for new tabs without a <DisplayRules> wrapper", () => {
		const tab = {
			id: "cbs.account.NewTab",
			label: "New tab",
			sequence: 10,
			commandId: "cbs.account.NewTab.Command",
			tabDisplayRules: [
				{
					tabCommand: "cbs.account.NewTab.Command",
					rules: [{ kind: "EntityRule" as const, entityName: "account" }],
				},
			],
			groups: [],
		};
		const xml = generateRibbonDiffXml({
			current: { location: "HomepageGrid", entityLogicalName: "account", tabs: [tab] },
			baseline: { location: "HomepageGrid", entityLogicalName: "account", tabs: [] },
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			entityLogicalName: "account",
			location: "HomepageGrid",
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const tdr = doc.querySelector("TabDisplayRules > TabDisplayRule");
		expect(tdr).not.toBeNull();
		expect(tdr!.querySelector(":scope > DisplayRules")).toBeNull();
		expect(tdr!.querySelector(":scope > EntityRule")).not.toBeNull();
	});
});
