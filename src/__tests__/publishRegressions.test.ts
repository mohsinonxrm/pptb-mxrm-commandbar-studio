/**
 * Regression tests for the adversarial review of the publish pipeline
 * (D1–D6): editing / deleting / un-hiding existing buttons, command and rule
 * fidelity, and scope-correct "mark published".
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import {
	partsFromRibbonTables,
	parseRibbonDiffParts,
	mergeScopeChanges,
	serializeRibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { planScope } from "@/services/publishPlan";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonDefinition } from "@/types/ribbon";

// A merged ribbon (RetrieveEntityRibbon shape) with one custom button whose
// caption is a $LocLabels reference — the merged XML carries no LocLabels.
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.HomepageGrid.contact.MainTab" Command="Mscrm.HomepageGrid.contact.MainTab" Sequence="10">
    <Groups Id="Mscrm.HomepageGrid.contact.MainTab.Groups">
      <Group Id="Mscrm.HomepageGrid.contact.MainTab.Management" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="Mscrm.HomepageGrid.contact.MainTab.Management.Controls">
          <Button Id="rw.contact.Existing.Button" Command="rw.contact.Existing.Command" Sequence="900"
            LabelText="$LocLabels:rw.contact.Existing.Button.LabelText" TemplateAlias="o1" ModernImage="Info" Alt="Keep me" SolutionUniqueName="Active" />
          <Button Id="Mscrm.HomepageGrid.contact.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10"
            LabelText="$Resources:Ribbon.HomepageGrid.MainTab.New" Image16by16="/_imgs/ribbon/New_16.png" TemplateAlias="o1" ModernImage="New" SolutionUniqueName="System" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="rw.contact.Existing.Command"><EnableRules><EnableRule Id="rw.contact.Custom"/></EnableRules><DisplayRules/><Actions>
    <JavaScriptFunction Library="$webresource:x.js" FunctionName="X.run"><CrmParameter Value="SelectedControl"/></JavaScriptFunction></Actions></CommandDefinition>
</CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules>
  <EnableRule Id="rw.contact.Custom"><CustomRule Library="$webresource:x.js" FunctionName="X.can"><CrmParameter Value="PrimaryControl"/><StringParameter Value="p"/></CustomRule></EnableRule>
</EnableRules></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

// The same table's unmanaged layer (ribbondiffs / ribboncommands / ribbonrules).
const LAYER = partsFromRibbonTables({
	diffs: [
		{
			diffid: "rw.contact.Existing.Button.CustomAction",
			difftype: 0,
			rdx: '<CustomAction Id="rw.contact.Existing.Button.CustomAction" Location="Mscrm.HomepageGrid.contact.MainTab.Management.Controls._children" Sequence="900"><CommandUIDefinition><Button Id="rw.contact.Existing.Button" Command="rw.contact.Existing.Command" Sequence="900" LabelText="$LocLabels:rw.contact.Existing.Button.LabelText" TemplateAlias="o1" ModernImage="Info" Alt="Keep me" /></CommandUIDefinition></CustomAction>',
		},
		{
			diffid: "rw.contact.Existing.Button.LabelText",
			difftype: 3,
			rdx: '<LocLabel Id="rw.contact.Existing.Button.LabelText"><Titles><Title languagecode="1033" description="Pre-existing (RW)" /><Title languagecode="1031" description="Vorhanden" /></Titles></LocLabel>',
		},
		{
			diffid: "rw.hide.Merge",
			difftype: 0,
			rdx: '<HideCustomAction HideActionId="rw.hide.Merge" Location="Mscrm.HomepageGrid.contact.MergeRecords" />',
		},
	],
	commands: [
		{
			command: "rw.contact.Existing.Command",
			commanddefinition:
				'<CommandDefinition Id="rw.contact.Existing.Command"><EnableRules><EnableRule Id="rw.contact.Custom" /></EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:x.js" FunctionName="X.run"><CrmParameter Value="SelectedControl" /></JavaScriptFunction></Actions></CommandDefinition>',
		},
	],
	rules: [
		{
			ruleid: "rw.contact.Custom",
			ruletype: 1,
			ruledefinition:
				'<EnableRule Id="rw.contact.Custom"><CustomRule Library="$webresource:x.js" FunctionName="X.can"><CrmParameter Value="PrimaryControl" /><StringParameter Value="p" /></CustomRule></EnableRule>',
		},
	],
});

const layerLabels = [
	{
		id: "rw.contact.Existing.Button.LabelText",
		titles: [
			{ languageCode: 1033, description: "Pre-existing (RW)" },
			{ languageCode: 1031, description: "Vorhanden" },
		],
	},
];

function load() {
	return parseRibbonXml(MERGED, "HomepageGrid", "contact", layerLabels);
}

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}

function buttonIn(def: RibbonDefinition, id: string) {
	return def.tabs[0].groups[0].buttons.find((b) => b.id === id)!;
}

function publishXml(baseline: RibbonDefinition, current: RibbonDefinition, parsed = load(), plan = planScope({
	locations: [{ current, baseline }],
	commands: parsed.commands,
	baselineCommands: load().commands,
	enableRules: parsed.enableRules,
	baselineEnableRules: load().enableRules,
	displayRules: parsed.displayRules,
	baselineDisplayRules: load().displayRules,
})) {
	const delta = parseRibbonDiffParts(
		generateRibbonDiffXml({
			current,
			baseline,
			commands: parsed.commands,
			enableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			locLabels: parsed.locLabels,
			entityLogicalName: "contact",
			location: "HomepageGrid",
		}),
	);
	const merged = mergeScopeChanges(LAYER, delta, {
		editedCommandIds: plan.editedCommandIds,
		editedEnableRuleIds: plan.editedEnableRuleIds,
		editedDisplayRuleIds: plan.editedDisplayRuleIds,
		deletedControlIds: plan.deletedButtonIds,
		unhiddenControlIds: plan.unhiddenButtonIds,
	});
	const xml = serializeRibbonDiffParts(merged);
	return { xml, doc: new DOMParser().parseFromString(xml, "application/xml"), plan };
}

describe("D1 — captions survive an edit after reload", () => {
	it("loads the real caption from the unmanaged layer", () => {
		const b = buttonIn(load().ribbon, "rw.contact.Existing.Button");
		expect(b.label).toBe("Pre-existing (RW)");
		expect(b.source?.labelToken).toBe("$LocLabels:rw.contact.Existing.Button.LabelText");
	});

	it("editing only the tooltip keeps the LocLabel reference and its text (all languages)", () => {
		const base = load().ribbon;
		const cur = clone(base);
		buttonIn(cur, "rw.contact.Existing.Button").tooltipTitle = "New tooltip";
		const { doc } = publishXml(base, cur);
		const btn = doc.querySelector('Button[Id="rw.contact.Existing.Button"]')!;
		expect(btn.getAttribute("LabelText")).toBe("$LocLabels:rw.contact.Existing.Button.LabelText");
		const loc = doc.querySelector('LocLabel[Id="rw.contact.Existing.Button.LabelText"]')!;
		expect(loc.querySelector('Title[languagecode="1033"]')?.getAttribute("description")).toBe("Pre-existing (RW)");
		expect(loc.querySelector('Title[languagecode="1031"]')).not.toBeNull();
	});

	it("never lets a LocLabel whose text is its own id replace a real one", () => {
		const delta = parseRibbonDiffParts(
			'<RibbonDiffXml><LocLabels><LocLabel Id="rw.contact.Existing.Button.LabelText"><Titles><Title languagecode="1033" description="rw.contact.Existing.Button.LabelText"/></Titles></LocLabel></LocLabels></RibbonDiffXml>',
		);
		const merged = mergeScopeChanges(LAYER, delta);
		expect(merged.locLabels.get("rw.contact.Existing.Button.LabelText")).toContain("Pre-existing (RW)");
	});

	it("an out-of-the-box override keeps $Resources labels, icons and unmodelled attributes", () => {
		const base = load().ribbon;
		const cur = clone(base);
		buttonIn(cur, "Mscrm.HomepageGrid.contact.NewRecord").tooltipTitle = "Create a contact";
		const { doc } = publishXml(base, cur);
		const btn = doc.querySelector('Button[Id="Mscrm.HomepageGrid.contact.NewRecord"]')!;
		expect(btn.getAttribute("LabelText")).toBe("$Resources:Ribbon.HomepageGrid.MainTab.New");
		expect(btn.getAttribute("ModernImage")).toBe("New");
		expect(btn.getAttribute("Image16by16")).toBe("/_imgs/ribbon/New_16.png");
		expect(btn.getAttribute("SolutionUniqueName")).toBeNull();
	});
});

describe("D2 — edits to own buttons replace them in place", () => {
	it("updates the layer's CustomAction instead of adding an override", () => {
		const base = load().ribbon;
		const cur = clone(base);
		buttonIn(cur, "rw.contact.Existing.Button").tooltipTitle = "New tooltip";
		const { doc } = publishXml(base, cur);
		const defining = Array.from(doc.querySelectorAll("CustomAction")).filter(
			(ca) => ca.querySelector('Button[Id="rw.contact.Existing.Button"]'),
		);
		expect(defining).toHaveLength(1);
		expect(defining[0].getAttribute("Id")).toBe("rw.contact.Existing.Button.CustomAction");
		const btn = defining[0].querySelector("Button")!;
		expect(btn.getAttribute("ModernImage")).toBe("Info");
		expect(btn.getAttribute("Alt")).toBe("Keep me");
		expect(btn.getAttribute("ToolTipTitle")).toMatch(/^\$LocLabels:/);
	});

	it("serializes overrides of other controls after the CustomActions that add controls", () => {
		const base = load().ribbon;
		const cur = clone(base);
		buttonIn(cur, "Mscrm.HomepageGrid.contact.NewRecord").tooltipTitle = "x";
		const { doc } = publishXml(base, cur);
		const locs = Array.from(doc.querySelectorAll("CustomActions > CustomAction")).map((c) => c.getAttribute("Location")!);
		const firstOverride = locs.findIndex((l) => !l.endsWith("._children"));
		expect(locs.slice(firstOverride).every((l) => !l.endsWith("._children"))).toBe(true);
	});
});

describe("D3/D5 — commands and rules", () => {
	it("keeps the layer's verbatim command and rule when they weren't edited", () => {
		const base = load().ribbon;
		const cur = clone(base);
		buttonIn(cur, "rw.contact.Existing.Button").tooltipTitle = "New tooltip";
		const { doc } = publishXml(base, cur);
		const rule = doc.querySelector('RuleDefinitions EnableRule[Id="rw.contact.Custom"] CustomRule')!;
		expect(rule.querySelector('StringParameter[Value="p"]')).not.toBeNull();
		expect(rule.querySelector('CrmParameter[Value="PrimaryControl"]')).not.toBeNull();
	});

	it("publishes an edited command even when no button changed", () => {
		const base = load().ribbon;
		const parsed = load();
		parsed.commands = parsed.commands.map((c) =>
			c.id === "rw.contact.Existing.Command"
				? { ...c, actions: [{ kind: "javascript", library: "$webresource:x.js", functionName: "X.changed", params: [] }] }
				: c,
		);
		const { doc, plan } = publishXml(base, clone(base), parsed, planScope({
			locations: [{ current: base, baseline: base }],
			commands: parsed.commands,
			baselineCommands: load().commands,
			enableRules: parsed.enableRules,
			baselineEnableRules: load().enableRules,
			displayRules: parsed.displayRules,
			baselineDisplayRules: load().displayRules,
		}));
		expect(plan.hasChanges).toBe(true);
		expect(plan.editedCommandIds).toEqual(["rw.contact.Existing.Command"]);
		// The modal/publishService add edited commands to the delta; here we check
		// the merge lets an edited command replace the layer's copy.
		const delta = parseRibbonDiffParts(
			'<RibbonDiffXml><CommandDefinitions><CommandDefinition Id="rw.contact.Existing.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:x.js" FunctionName="X.changed"/></Actions></CommandDefinition></CommandDefinitions></RibbonDiffXml>',
		);
		const merged = mergeScopeChanges(LAYER, delta, { editedCommandIds: plan.editedCommandIds });
		expect(merged.commandDefinitions.get("rw.contact.Existing.Command")).toContain("X.changed");
		expect(doc).toBeTruthy();
	});
});

describe("D5 — deletes, un-hides and unsupported changes", () => {
	it("deleting an unmanaged button removes its CustomAction and LocLabels", () => {
		const base = load().ribbon;
		buttonIn(base, "rw.contact.Existing.Button").origin = "unmanaged";
		const cur = clone(base);
		cur.tabs[0].groups[0].buttons = cur.tabs[0].groups[0].buttons.filter((b) => b.id !== "rw.contact.Existing.Button");
		const { doc, plan } = publishXml(base, cur);
		expect(plan.deletedButtonIds).toEqual(["rw.contact.Existing.Button"]);
		expect(doc.querySelector('Button[Id="rw.contact.Existing.Button"]')).toBeNull();
		expect(doc.querySelector('LocLabel[Id="rw.contact.Existing.Button.LabelText"]')).toBeNull();
		// Other customizations stay.
		expect(doc.querySelector('HideCustomAction[HideActionId="rw.hide.Merge"]')).not.toBeNull();
	});

	it("un-hiding removes the HideCustomAction", () => {
		const base = load().ribbon;
		base.tabs[0].groups[0].buttons.push({
			...buttonIn(base, "Mscrm.HomepageGrid.contact.NewRecord"),
			id: "Mscrm.HomepageGrid.contact.MergeRecords",
			hidden: true,
		});
		const cur = clone(base);
		buttonIn(cur, "Mscrm.HomepageGrid.contact.MergeRecords").hidden = false;
		const { doc, plan } = publishXml(base, cur);
		expect(plan.unhiddenButtonIds).toEqual(["Mscrm.HomepageGrid.contact.MergeRecords"]);
		expect(doc.querySelector('HideCustomAction[HideActionId="rw.hide.Merge"]')).toBeNull();
	});

	it("reports moves of existing buttons and deletes of platform buttons as unsupported", () => {
		const base = load().ribbon;
		const cur = clone(base);
		buttonIn(cur, "rw.contact.Existing.Button").sequence = 5;
		cur.tabs[0].groups[0].buttons = cur.tabs[0].groups[0].buttons.filter(
			(b) => b.id !== "Mscrm.HomepageGrid.contact.NewRecord",
		);
		const { plan } = publishXml(base, cur);
		expect(plan.unsupported.some((u) => u.includes("re-ordering"))).toBe(true);
		expect(plan.unsupported.some((u) => u.includes("Mscrm.HomepageGrid.contact.NewRecord"))).toBe(true);
	});
});

describe("D6 — only published scopes are marked as published", () => {
	beforeEach(() => {
		const parsed = load();
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: parsed.ribbon,
				SubGrid: { location: "SubGrid", entityLogicalName: "contact", tabs: [] },
				Form: { location: "Form", entityLogicalName: "contact", tabs: [] },
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: parsed.commands,
			displayRules: parsed.displayRules,
			enableRules: parsed.enableRules,
			locLabels: parsed.locLabels,
		});
	});

	it("keeps pending changes in locations that were not published", () => {
		const s = useRibbonStore.getState();
		const ribbons = clone(s.ribbons);
		ribbons.Application.tabs.push({ id: "app.tab", label: "App", sequence: 1, tabDisplayRules: [], groups: [] });
		buttonIn(ribbons.HomepageGrid, "rw.contact.Existing.Button").tooltipTitle = "x";
		useRibbonStore.setState({ ribbons, mutationsSincePublish: 2 });

		useRibbonStore.getState().markPublished(["HomepageGrid", "SubGrid", "Form"]);
		const after = useRibbonStore.getState();
		expect(after.baseline.HomepageGrid).toEqual(after.ribbons.HomepageGrid);
		expect(after.baseline.Application.tabs).toHaveLength(0);
		expect(after.mutationsSincePublish).toBeGreaterThan(0);
	});
});

describe("phantom changes found in live testing", () => {
	// Microsoft's application ribbon repeats control ids across tabs.
	const appRibbon = (): RibbonDefinition => {
		const btn = (label: string) => ({
			id: "MailApp.ViewEmailActivity.Button",
			label,
			commandId: "MailApp.ViewEmailActivity",
			sequence: 10,
			templateAlias: "o1",
			hidden: false,
		});
		return {
			location: "Application",
			entityLogicalName: "",
			tabs: [
				{ id: "Mscrm.GlobalTab", label: "Global", sequence: 1, tabDisplayRules: [], groups: [
					{ id: "Mscrm.GlobalTab.New", label: "New", sequence: 1, template: "t", buttons: [btn("Email (global)")] },
				] },
				{ id: "Mscrm.QuickForm.MainTab", label: "Quick", sequence: 2, tabDisplayRules: [], groups: [
					{ id: "Mscrm.QuickForm.MainTab.Actions", label: "Actions", sequence: 1, template: "t", buttons: [btn("Email (quick)")] },
				] },
			],
		} as unknown as RibbonDefinition;
	};

	it("an unchanged ribbon with repeated control ids has no changes and emits nothing", () => {
		const base = appRibbon();
		const cur = clone(base);
		const plan = planScope({
			locations: [{ current: cur, baseline: base }],
			commands: [], baselineCommands: [], enableRules: [], baselineEnableRules: [], displayRules: [], baselineDisplayRules: [],
		});
		expect(plan.hasChanges).toBe(false);
		expect(plan.unsupported).toEqual([]);
		const xml = generateRibbonDiffXml({
			current: cur, baseline: base, commands: [], enableRules: [], displayRules: [], locLabels: [],
			entityLogicalName: "", location: "Application",
		});
		expect(xml).not.toContain("<CustomAction ");
	});

	it("an EnableRule and a DisplayRule sharing an id are not reported as edited", () => {
		const enableRules = [{ id: "Mscrm.CanWritePrimary", steps: [{ kind: "RecordPrivilegeRule", privilegeType: "Write", appliesTo: "PrimaryEntity", invertResult: false }] }];
		const displayRules = [{ id: "Mscrm.CanWritePrimary", steps: [{ kind: "EntityPrivilegeRule", privilegeType: "Write", privilegeDepth: "Basic", appliesTo: "PrimaryEntity", invertResult: false }] }];
		const def = appRibbon();
		const commands = [{ id: "MailApp.ViewEmailActivity", enableRules: ["Mscrm.CanWritePrimary"], displayRules: ["Mscrm.CanWritePrimary"], actions: [] }];
		const plan = planScope({
			locations: [{ current: clone(def), baseline: def }],
			commands: commands as never, baselineCommands: clone(commands) as never,
			enableRules: enableRules as never, baselineEnableRules: clone(enableRules) as never,
			displayRules: displayRules as never, baselineDisplayRules: clone(displayRules) as never,
		});
		expect(plan.editedEnableRuleIds).toEqual([]);
		expect(plan.editedDisplayRuleIds).toEqual([]);
		expect(plan.hasChanges).toBe(false);
	});
});
