/**
 * Import RibbonDiffXml (#30): commands, rules and labels arrive intact (the
 * loaded-ribbon parser is reused), rule references inside a CommandDefinition
 * don't replace rule definitions, and what is imported is a session change
 * against the unchanged baseline — so the planner and the merge publish it.
 * Anything that can't be applied is reported.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { importRibbonDiffXml, type RibbonDiffImportInput } from "@/services/ribbonDiffImport";
import { emptyRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { planScope } from "@/services/publishPlan";
import {
	generateEnableRule,
	generateCommandDefinition,
	summarizeRibbonDiff,
} from "@/services/xmlGenerator";
import { sameXml } from "@/services/ribbonXmlCanonical";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const MGMT = `${MAIN}.Management`;

// The loaded (merged) ribbon of the table: out-of-the-box buttons, one with a rule.
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10">
    <Groups Id="${MAIN}.Groups">
      <Group Id="${MGMT}" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${MGMT}.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="$Resources:New" TemplateAlias="o1" ModernImage="New" />
          <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="$Resources:Edit" TemplateAlias="o1" ModernImage="Edit" />
          <Button Id="Mscrm.HomepageGrid.${T}.Refresh" Command="Mscrm.RefreshGrid" Sequence="30" LabelText="$Resources:Refresh" TemplateAlias="o1" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="Mscrm.NewRecordFromGrid"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:Main_system_library.js" FunctionName="XrmCore.Commands.Open.openNewRecord"><CrmParameter Value="SelectedEntityTypeName"/></JavaScriptFunction></Actions></CommandDefinition>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules><EnableRule Id="Mscrm.CheckBulkEditSupportForEntity"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:Main_system_library.js" FunctionName="XrmCore.Commands.Edit.editSelectedRecord"/></Actions></CommandDefinition>
  <CommandDefinition Id="Mscrm.RefreshGrid"><EnableRules/><DisplayRules/><Actions/></CommandDefinition>
</CommandDefinitions>
<RuleDefinitions>
  <TabDisplayRules/>
  <DisplayRules/>
  <EnableRules>
    <EnableRule Id="Mscrm.CheckBulkEditSupportForEntity"><OrRule><Or><SelectionCountRule Minimum="1" Maximum="1"/></Or><Or><CustomRule Library="$webresource:Main_system_library.js" FunctionName="XrmCore.Rules.Enabling.isBulkEditEnabledForEntity"><CrmParameter Value="SelectedEntityTypeName"/></CustomRule></Or></OrRule></EnableRule>
  </EnableRules>
</RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const ENABLE_RULE = `<EnableRule Id="cbs.Imp.EnableRule">
  <OrRule>
    <Or>
      <SelectionCountRule Minimum="1" AppliesTo="SelectedEntity"/>
      <CustomRule Library="$webresource:cbs_/scripts/imp.js" FunctionName="Cbs.canRun" InvertResult="true"><CrmParameter Value="SelectedControl"/><StringParameter Value="mode"/></CustomRule>
    </Or>
    <Or>
      <ValueRule Field="statecode" Value="0" InvertResult="true"/>
    </Or>
  </OrRule>
</EnableRule>`;

const COMMAND = `<CommandDefinition Id="cbs.Imp.Command">
  <EnableRules>
    <EnableRule Id="cbs.Imp.EnableRule"/>
    <EnableRule Id="Mscrm.CheckBulkEditSupportForEntity"/>
  </EnableRules>
  <DisplayRules>
    <DisplayRule Id="cbs.Imp.DisplayRule"/>
  </DisplayRules>
  <Actions>
    <JavaScriptFunction Library="$webresource:cbs_/scripts/imp.js" FunctionName="Cbs.run">
      <CrmParameter Value="SelectedControlSelectedItemIds"/>
      <BoolParameter Value="true"/>
    </JavaScriptFunction>
    <Url Address="https://example.com/help" WinMode="1" PassParams="false"/>
  </Actions>
</CommandDefinition>`;

const IMPORT = `<RibbonDiffXml>
  <CustomActions>
    <CustomAction Id="cbs.Imp.Button.CustomAction" Location="${MGMT}.Controls._children" Sequence="25">
      <CommandUIDefinition>
        <Button Id="cbs.Imp.Button" Command="cbs.Imp.Command" Sequence="25" LabelText="$LocLabels:cbs.Imp.Button.LabelText" Alt="$LocLabels:cbs.Imp.Button.LabelText" ToolTipTitle="$LocLabels:cbs.Imp.Button.LabelText" TemplateAlias="o1" ModernImage="$webresource:cbs_/icons/imp.svg"/>
      </CommandUIDefinition>
    </CustomAction>
    <CustomAction Id="cbs.Edit.Override.CustomAction" Location="Mscrm.HomepageGrid.${T}.Edit" Sequence="20">
      <CommandUIDefinition>
        <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="cbs.Imp.Command" Sequence="20" LabelText="$LocLabels:cbs.Edit.LabelText" TemplateAlias="o1" ModernImage="Pencil"/>
      </CommandUIDefinition>
    </CustomAction>
    <HideCustomAction HideActionId="cbs.HideRefresh" Location="Mscrm.HomepageGrid.${T}.Refresh"/>
    <CustomAction Id="cbs.Contact.CustomAction" Location="Mscrm.HomepageGrid.contact.MainTab.Management.Controls._children" Sequence="10">
      <CommandUIDefinition><Button Id="cbs.Contact.Button" Command="cbs.Imp.Command" LabelText="x" TemplateAlias="o1"/></CommandUIDefinition>
    </CustomAction>
    <CustomAction Id="cbs.Nowhere.CustomAction" Location="cbs.NoSuchGroup.Controls._children" Sequence="10">
      <CommandUIDefinition><Button Id="cbs.Nowhere.Button" Command="cbs.Imp.Command" LabelText="x" TemplateAlias="o1"/></CommandUIDefinition>
    </CustomAction>
  </CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions>
    ${COMMAND}
  </CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules/>
    <DisplayRules>
      <DisplayRule Id="cbs.Imp.DisplayRule"><FormStateRule State="Create" InvertResult="true"/></DisplayRule>
    </DisplayRules>
    <EnableRules>
      ${ENABLE_RULE}
    </EnableRules>
  </RuleDefinitions>
  <LocLabels>
    <LocLabel Id="cbs.Imp.Button.LabelText"><Titles><Title languagecode="1033" description="Import me"/><Title languagecode="1036" description="Importez-moi"/></Titles></LocLabel>
    <LocLabel Id="cbs.Edit.LabelText"><Titles><Title languagecode="1033" description="Change"/></Titles></LocLabel>
  </LocLabels>
</RibbonDiffXml>`;

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

function seed() {
	const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: parsed.ribbon,
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
	});
}

function input(
	xml: string,
	activeLocation: RibbonLocation = "HomepageGrid",
): RibbonDiffImportInput {
	const s = useRibbonStore.getState();
	return {
		xml,
		ribbons: s.ribbons,
		commands: s.commands,
		enableRules: s.enableRules,
		displayRules: s.displayRules,
		locLabels: s.locLabels,
		entityLogicalName: T,
		activeLocation,
	};
}

/** Imports into the store, the way the dialog does. */
function importIntoStore(xml: string, activeLocation: RibbonLocation = "HomepageGrid") {
	const result = importRibbonDiffXml(input(xml, activeLocation));
	useRibbonStore.getState().applyImport(result, "test");
	return result;
}

function buttons(def: RibbonDefinition): RibbonButton[] {
	return def.tabs.flatMap((t) => t.groups.flatMap((g) => g.buttons));
}
const btn = (def: RibbonDefinition, id: string) => buttons(def).find((b) => b.id === id);

function entityPlan() {
	const s = useRibbonStore.getState();
	return planScope({
		locations: (["HomepageGrid", "SubGrid", "Form"] as const).map((l) => ({
			current: s.ribbons[l],
			baseline: s.baseline[l],
		})),
		commands: s.commands,
		baselineCommands: s.baselineCommands,
		enableRules: s.enableRules,
		baselineEnableRules: s.baselineEnableRules,
		displayRules: s.displayRules,
		baselineDisplayRules: s.baselineDisplayRules,
		locLabels: s.locLabels,
		baselineLocLabels: s.baselineLocLabels,
		layer: { containerIds: [], locLabelIds: [] },
	});
}

beforeEach(() => {
	layer = emptyRibbonDiffParts();
	seed();
});

describe("definitions are imported losslessly", () => {
	it("keeps the command's actions and the rules' steps (OrRule groups, InvertResult)", () => {
		const result = importRibbonDiffXml(input(IMPORT));
		const cmd = result.commands.find((c) => c.id === "cbs.Imp.Command")!;
		expect(cmd.actions.map((a) => a.kind)).toEqual(["javascript", "url"]);
		expect(cmd.enableRules).toEqual([
			"cbs.Imp.EnableRule",
			"Mscrm.CheckBulkEditSupportForEntity",
		]);
		expect(sameXml(generateCommandDefinition(cmd), COMMAND)).toBe(true);

		const rule = result.enableRules.find((r) => r.id === "cbs.Imp.EnableRule")!;
		expect(rule.steps[0].kind).toBe("OrRule");
		expect(sameXml(generateEnableRule(rule), ENABLE_RULE)).toBe(true);

		const display = result.displayRules.find((r) => r.id === "cbs.Imp.DisplayRule")!;
		expect(display.steps).toEqual([
			{ kind: "FormStateRule", state: "Create", invertResult: true },
		]);
		expect(
			result.locLabels.find((l) => l.id === "cbs.Imp.Button.LabelText")?.titles,
		).toHaveLength(2);
	});

	it("rule references inside a CommandDefinition don't replace rule definitions", () => {
		const before = useRibbonStore
			.getState()
			.enableRules.find((r) => r.id === "Mscrm.CheckBulkEditSupportForEntity")!;
		expect(before.steps.length).toBeGreaterThan(0);
		const result = importRibbonDiffXml(input(IMPORT));
		// The command references Mscrm.CheckBulkEditSupportForEntity without defining it.
		expect(
			result.enableRules.find((r) => r.id === "Mscrm.CheckBulkEditSupportForEntity"),
		).toEqual(before);
		expect(result.enableRules.filter((r) => r.id === "cbs.Imp.EnableRule")).toHaveLength(1);
		expect(result.enableRules.every((r) => r.steps.length > 0)).toBe(true);
	});

	it("a preview changes nothing", () => {
		const before = JSON.stringify(useRibbonStore.getState().ribbons);
		const result = importRibbonDiffXml(input(IMPORT));
		expect(result.changed).toBe(true);
		expect(JSON.stringify(useRibbonStore.getState().ribbons)).toBe(before);
	});
});

describe("CustomActions are applied to the loaded ribbon", () => {
	it("adds a new button where its Location says, as your own unmanaged button", () => {
		importIntoStore(IMPORT);
		const s = useRibbonStore.getState();
		const group = s.ribbons.HomepageGrid.tabs[0].groups[0];
		expect(group.buttons.map((b) => b.id)).toEqual([
			`Mscrm.HomepageGrid.${T}.NewRecord`,
			`Mscrm.HomepageGrid.${T}.Edit`,
			"cbs.Imp.Button",
			`Mscrm.HomepageGrid.${T}.Refresh`,
		]);
		const b = btn(s.ribbons.HomepageGrid, "cbs.Imp.Button")!;
		expect(b).toMatchObject({
			label: "Import me",
			commandId: "cbs.Imp.Command",
			origin: "unmanaged",
			custom: true,
			sequence: 25,
		});
		// The baseline is untouched: the button is a session change.
		expect(btn(s.baseline.HomepageGrid, "cbs.Imp.Button")).toBeUndefined();
		expect(s.mutationsSincePublish).toBeGreaterThan(0);
	});

	it("an override of an existing control becomes an edit of it", () => {
		importIntoStore(IMPORT);
		const s = useRibbonStore.getState();
		const edit = btn(s.ribbons.HomepageGrid, `Mscrm.HomepageGrid.${T}.Edit`)!;
		expect(edit).toMatchObject({
			label: "Change",
			commandId: "cbs.Imp.Command",
			hidden: false,
		});
		expect(edit.origin).toBe("oob");
		expect(btn(s.baseline.HomepageGrid, `Mscrm.HomepageGrid.${T}.Edit`)?.commandId).toBe(
			"Mscrm.EditSelectedRecord",
		);
	});

	it("a HideCustomAction of an existing control becomes a hide", () => {
		importIntoStore(IMPORT);
		const s = useRibbonStore.getState();
		expect(btn(s.ribbons.HomepageGrid, `Mscrm.HomepageGrid.${T}.Refresh`)?.hidden).toBe(true);
		expect(summarizeRibbonDiff(s.ribbons.HomepageGrid, s.baseline.HomepageGrid)).toMatchObject({
			newButtons: 1,
			overriddenButtons: 1,
			hiddenButtons: 1,
		});
	});

	it("reports Locations that aren't in the loaded ribbon instead of dropping them", () => {
		const result = importIntoStore(IMPORT);
		expect(
			result.notApplied.some(
				(m) =>
					m.includes("cbs.Contact.Button") && m.includes("belongs to the contact table"),
			),
		).toBe(true);
		expect(
			result.notApplied.some(
				(m) =>
					m.includes("cbs.Nowhere.Button") &&
					m.includes("cbs.NoSuchGroup.Controls._children"),
			),
		).toBe(true);
		const ids = buttons(useRibbonStore.getState().ribbons.HomepageGrid).map((b) => b.id);
		expect(ids).not.toContain("cbs.Contact.Button");
		expect(ids).not.toContain("cbs.Nowhere.Button");
	});

	it("adds a new tab (on the location its display rule names) and a new group", () => {
		const xml = `<RibbonDiffXml><CustomActions>
      <CustomAction Id="cbs.Tab.CustomAction" Location="Mscrm.Tabs._children" Sequence="500">
        <CommandUIDefinition>
          <Tab Id="cbs.Tab" Command="cbs.Tab.Command" Title="$LocLabels:cbs.Tab.Title" Sequence="500">
            <Scaling Id="cbs.Tab.Scaling"><MaxSize Id="cbs.Tab.G.MaxSize" GroupId="cbs.Tab.G" Sequence="10" Size="LargeLarge"/></Scaling>
            <Groups Id="cbs.Tab.Groups">
              <Group Id="cbs.Tab.G" Title="$LocLabels:cbs.Tab.G.Title" Sequence="10" Template="Mscrm.Templates.Flexible2">
                <Controls Id="cbs.Tab.G.Controls">
                  <Button Id="cbs.Tab.B" Command="cbs.Imp.Command" Sequence="10" LabelText="In tab" TemplateAlias="o1"/>
                </Controls>
              </Group>
            </Groups>
          </Tab>
        </CommandUIDefinition>
      </CustomAction>
      <CustomAction Id="cbs.Grp.CustomAction" Location="${MAIN}.Groups._children" Sequence="100">
        <CommandUIDefinition>
          <Group Id="cbs.Grp" Title="My group" Sequence="100" Template="Mscrm.Templates.Flexible2">
            <Controls Id="cbs.Grp.Controls">
              <Button Id="cbs.Grp.B" Command="cbs.Imp.Command" Sequence="10" LabelText="In group" TemplateAlias="o1"/>
              <FlyoutAnchor Id="cbs.Grp.Fly" Command="cbs.Imp.Command" Sequence="20" LabelText="Menu" TemplateAlias="o1">
                <Menu Id="cbs.Grp.Fly.Menu"><MenuSection Id="cbs.Grp.Fly.S"><Controls Id="cbs.Grp.Fly.S.Controls"><Button Id="cbs.Grp.Fly.B" Command="cbs.Imp.Command" LabelText="Item"/></Controls></MenuSection></Menu>
              </FlyoutAnchor>
            </Controls>
          </Group>
        </CommandUIDefinition>
      </CustomAction>
    </CustomActions>
    <CommandDefinitions>${COMMAND}</CommandDefinitions>
    <RuleDefinitions>
      <TabDisplayRules><TabDisplayRule TabCommand="cbs.Tab.Command"><EntityRule EntityName="${T}" Context="Form" AppliesTo="PrimaryEntity"/></TabDisplayRule></TabDisplayRules>
      <DisplayRules><DisplayRule Id="cbs.Imp.DisplayRule"><FormStateRule State="Create"/></DisplayRule></DisplayRules>
      <EnableRules>${ENABLE_RULE}</EnableRules>
    </RuleDefinitions>
    <LocLabels>
      <LocLabel Id="cbs.Tab.Title"><Titles><Title languagecode="1033" description="Imported tab"/></Titles></LocLabel>
      <LocLabel Id="cbs.Tab.G.Title"><Titles><Title languagecode="1033" description="Imported group"/></Titles></LocLabel>
    </LocLabels></RibbonDiffXml>`;
		const result = importIntoStore(xml);
		const s = useRibbonStore.getState();
		const tab = s.ribbons.Form.tabs.find((t) => t.id === "cbs.Tab")!;
		expect(tab).toMatchObject({ label: "Imported tab", commandId: "cbs.Tab.Command" });
		expect(tab.tabDisplayRules[0].rules[0]).toMatchObject({
			kind: "EntityRule",
			context: "Form",
		});
		expect(tab.groups[0]).toMatchObject({ id: "cbs.Tab.G", label: "Imported group" });
		expect(tab.groups[0].buttons.map((b) => b.id)).toEqual(["cbs.Tab.B"]);

		const group = s.ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === "cbs.Grp")!;
		expect(group.label).toBe("My group");
		// The flyout and its menu button are reported, not flattened into the group.
		expect(group.buttons.map((b) => b.id)).toEqual(["cbs.Grp.B"]);
		expect(
			result.notApplied.some((m) => m.startsWith("cbs.Grp.Fly:") && m.includes("#27")),
		).toBe(true);
		// The tab's display rule came with the tab.
		expect(result.notApplied.some((m) => m.includes("TabDisplayRule"))).toBe(false);

		const plan = entityPlan();
		expect(plan.unsupported).toEqual([]);
		expect(plan.hasChanges).toBe(true);
	});

	it("reports what it can't apply: unused definitions, scaling, group hides", () => {
		const xml = `<RibbonDiffXml><CustomActions>
      <CustomAction Id="cbs.Scale" Location="${MAIN}.Scaling._children" Sequence="10"><CommandUIDefinition><MaxSize Id="x" GroupId="${MGMT}" Sequence="10" Size="Large"/></CommandUIDefinition></CustomAction>
      <HideCustomAction HideActionId="cbs.HideGroup" Location="${MGMT}"/>
    </CustomActions>
    <CommandDefinitions><CommandDefinition Id="cbs.Orphan.Command"><EnableRules/><DisplayRules/><Actions/></CommandDefinition></CommandDefinitions>
    <RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules><EnableRule Id="cbs.Orphan.Rule"><FormStateRule State="Create"/></EnableRule></EnableRules></RuleDefinitions>
    <LocLabels/></RibbonDiffXml>`;
		const result = importRibbonDiffXml(input(xml));
		expect(result.notApplied).toEqual(
			expect.arrayContaining([
				expect.stringContaining("<MaxSize> scaling isn't imported"),
				expect.stringContaining(
					`Hiding ${MGMT}: hiding whole groups or tabs isn't supported`,
				),
				expect.stringContaining(
					"Command cbs.Orphan.Command was imported but no button on the loaded ribbon uses it",
				),
				expect.stringContaining(
					"Enable rule cbs.Orphan.Rule was imported but no command a button uses references it",
				),
			]),
		);
	});

	it("warns about labels nothing defines, and about controls that already live elsewhere", () => {
		const xml = `<RibbonDiffXml><CustomActions>
      <CustomAction Id="a" Location="${MGMT}.Controls._children" Sequence="40"><CommandUIDefinition><Button Id="cbs.Dangling" Command="Mscrm.RefreshGrid" LabelText="$LocLabels:cbs.Missing.Label" TemplateAlias="o1"/></CommandUIDefinition></CustomAction>
      <CustomAction Id="b" Location="cbs.Other.Controls._children" Sequence="10"><CommandUIDefinition><Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" LabelText="Edit it" TemplateAlias="o1"/></CommandUIDefinition></CustomAction>
    </CustomActions></RibbonDiffXml>`;
		const result = importRibbonDiffXml(input(xml));
		expect(result.notApplied).toEqual(
			expect.arrayContaining([
				expect.stringContaining("references label cbs.Missing.Label"),
				expect.stringContaining(
					`already in group ${MGMT} — updated there, not moved to cbs.Other`,
				),
			]),
		);
		expect(btn(result.ribbons.HomepageGrid, `Mscrm.HomepageGrid.${T}.Edit`)?.label).toBe(
			"Edit it",
		);
	});

	it("an override that changes nothing CBS publishes leaves the control as loaded", () => {
		const xml = `<RibbonDiffXml><CustomActions>
      <CustomAction Id="o" Location="Mscrm.HomepageGrid.${T}.NewRecord" Sequence="10"><CommandUIDefinition><Button Id="Mscrm.HomepageGrid.${T}.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="$Resources:New" TemplateAlias="o1" ModernImage="New" Alt="Create"/></CommandUIDefinition></CustomAction>
    </CustomActions></RibbonDiffXml>`;
		const result = importRibbonDiffXml(input(xml));
		expect(result.changed).toBe(false);
		expect(result.ribbons).toBe(useRibbonStore.getState().ribbons);
		expect(result.notApplied).toEqual([
			expect.stringContaining("only changes attributes CBS doesn't publish"),
		]);
	});

	it("re-importing the same XML changes nothing", () => {
		importIntoStore(IMPORT);
		const again = importRibbonDiffXml(input(IMPORT));
		expect(again.changed).toBe(false);
		expect(again.applied).toEqual([expect.stringMatching(/already up to date/)]);
	});
});

describe("the import publishes", () => {
	it("shows up as changes the planner classifies as publishable", () => {
		importIntoStore(IMPORT);
		const plan = entityPlan();
		expect(plan.unsupported).toEqual([]);
		expect(plan.hasChanges).toBe(true);
		expect(plan.editedCommandIds).toEqual(["cbs.Imp.Command"]);
		expect(plan.editedEnableRuleIds).toEqual(["cbs.Imp.EnableRule"]);
		expect(plan.editedDisplayRuleIds).toEqual(["cbs.Imp.DisplayRule"]);
	});

	it("buildMergedRibbonDiffXml writes the button, override, hide, command, rules and labels", async () => {
		importIntoStore(IMPORT);
		const s = useRibbonStore.getState();
		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		const plan = entityPlan();
		const { xml } = await buildMergedRibbonDiffXml({
			entity: { logicalName: T },
			locations: (["HomepageGrid", "SubGrid", "Form"] as const).map((l) => ({
				current: s.ribbons[l],
				baseline: s.baseline[l],
			})),
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
			plan,
			languageCode: 1033,
		});
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const added = doc.querySelector(
			`CustomAction[Location="${MGMT}.Controls._children"] Button[Id="cbs.Imp.Button"]`,
		);
		expect(added?.getAttribute("LabelText")).toBe("$LocLabels:cbs.Imp.Button.LabelText");
		expect(added?.getAttribute("Alt")).toBe("$LocLabels:cbs.Imp.Button.LabelText");
		expect(added?.getAttribute("ModernImage")).toBe("$webresource:cbs_/icons/imp.svg");
		const override = doc.querySelector(
			`CustomAction[Location="Mscrm.HomepageGrid.${T}.Edit"] Button`,
		);
		expect(override?.getAttribute("Command")).toBe("cbs.Imp.Command");
		expect(override?.getAttribute("LabelText")).toBe("$LocLabels:cbs.Edit.LabelText");
		// The override's own ModernImage is written as is.
		expect(override?.getAttribute("ModernImage")).toBe("Pencil");
		expect(
			doc.querySelector(`HideCustomAction[Location="Mscrm.HomepageGrid.${T}.Refresh"]`),
		).not.toBeNull();

		expect(
			sameXml(doc.querySelector('CommandDefinition[Id="cbs.Imp.Command"]')!, COMMAND),
		).toBe(true);
		expect(
			sameXml(
				doc.querySelector(
					'RuleDefinitions > EnableRules > EnableRule[Id="cbs.Imp.EnableRule"]',
				)!,
				ENABLE_RULE,
			),
		).toBe(true);
		expect(
			doc
				.querySelector(
					'RuleDefinitions > DisplayRules > DisplayRule[Id="cbs.Imp.DisplayRule"] > FormStateRule',
				)
				?.getAttribute("InvertResult"),
		).toBe("true");
		// Out-of-the-box rules the command only references are not copied into the layer.
		expect(
			doc.querySelector(
				'RuleDefinitions EnableRule[Id="Mscrm.CheckBulkEditSupportForEntity"]',
			),
		).toBeNull();
		const titles = Array.from(
			doc.querySelectorAll('LocLabel[Id="cbs.Imp.Button.LabelText"] Title'),
		).map((t) => t.getAttribute("languagecode"));
		expect(titles.sort()).toEqual(["1033", "1036"]);
		expect(
			doc
				.querySelector('LocLabel[Id="cbs.Edit.LabelText"] Title')
				?.getAttribute("description"),
		).toBe("Change");
	});
});

// ── Adversarial review of #68 ──────────────────────────────────────────────

async function publishedXml(): Promise<Document> {
	const s = useRibbonStore.getState();
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const { xml } = await buildMergedRibbonDiffXml({
		entity: { logicalName: T },
		locations: (["HomepageGrid", "SubGrid", "Form"] as const).map((l) => ({
			current: s.ribbons[l],
			baseline: s.baseline[l],
		})),
		commands: s.commands,
		enableRules: s.enableRules,
		displayRules: s.displayRules,
		locLabels: s.locLabels,
		plan: entityPlan(),
		languageCode: 1033,
	});
	return new DOMParser().parseFromString(xml, "application/xml");
}

const CAPTIONED = `<RibbonDiffXml><CustomActions>
  <CustomAction Id="cbs.Tab.CustomAction" Location="Mscrm.Tabs._children" Sequence="500">
    <CommandUIDefinition>
      <Tab Id="cbs.Tab" Command="cbs.Tab.Command" Title="$LocLabels:cbs.TabCaption" Description="$LocLabels:cbs.TabCaption" Sequence="500">
        <Scaling Id="cbs.Tab.Scaling"/>
        <Groups Id="cbs.Tab.Groups">
          <Group Id="cbs.Tab.G" Title="$LocLabels:cbs.GroupCaption" Image32by32Popup="$webresource:cbs_/g.svg" Sequence="10" Template="Mscrm.Templates.Flexible2">
            <Controls Id="cbs.Tab.G.Controls"><Button Id="cbs.Tab.B" Command="Mscrm.RefreshGrid" Sequence="10" LabelText="In tab" TemplateAlias="o1"/></Controls>
          </Group>
        </Groups>
      </Tab>
    </CommandUIDefinition>
  </CustomAction>
  <CustomAction Id="cbs.Grp.CustomAction" Location="${MAIN}.Groups._children" Sequence="100">
    <CommandUIDefinition>
      <Group Id="cbs.Grp" Title="$Resources:Ribbon.HomepageGrid.MainTab.Management" Description="Mine" Sequence="100" Template="Mscrm.Templates.Flexible2">
        <Controls Id="cbs.Grp.Controls"><Button Id="cbs.Grp.B" Command="Mscrm.RefreshGrid" Sequence="10" LabelText="In group" TemplateAlias="o1"/></Controls>
      </Group>
    </CommandUIDefinition>
  </CustomAction>
</CustomActions>
<RuleDefinitions><TabDisplayRules><TabDisplayRule TabCommand="cbs.Tab.Command"><EntityRule EntityName="${T}" Context="HomePageGrid"/></TabDisplayRule></TabDisplayRules><DisplayRules/><EnableRules/></RuleDefinitions>
<LocLabels>
  <LocLabel Id="cbs.TabCaption"><Titles><Title languagecode="1033" description="Caption"/><Title languagecode="1036" description="Légende"/></Titles></LocLabel>
  <LocLabel Id="cbs.GroupCaption"><Titles><Title languagecode="1033" description="Group caption"/><Title languagecode="1036" description="Légende du groupe"/></Titles></LocLabel>
</LocLabels></RibbonDiffXml>`;

describe("#68 review 1 — tab and group titles and attributes publish as imported", () => {
	it("keeps Title tokens (with every language), $Resources titles and other attributes", async () => {
		const result = importIntoStore(CAPTIONED);
		const s = useRibbonStore.getState();
		const tab = s.ribbons.HomepageGrid.tabs.find((t) => t.id === "cbs.Tab")!;
		expect(tab.label).toBe("Caption");
		expect(s.ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === "cbs.Grp")?.label).toBe(
			"Ribbon.HomepageGrid.MainTab.Management",
		);
		expect(entityPlan().unsupported).toEqual([]);

		const doc = await publishedXml();
		const tabEl = doc.querySelector('Tab[Id="cbs.Tab"]')!;
		expect(tabEl.getAttribute("Title")).toBe("$LocLabels:cbs.TabCaption");
		expect(tabEl.getAttribute("Description")).toBe("$LocLabels:cbs.TabCaption");
		const titles = (id: string) =>
			Array.from(doc.querySelectorAll(`LocLabel[Id="${id}"] Title`))
				.map((t) => t.getAttribute("languagecode"))
				.sort();
		expect(titles("cbs.TabCaption")).toEqual(["1033", "1036"]);
		expect(titles("cbs.GroupCaption")).toEqual(["1033", "1036"]);
		expect(doc.querySelector('LocLabel[Id="cbs.Tab.Title"]')).toBeNull();
		const nested = doc.querySelector('Group[Id="cbs.Tab.G"]')!;
		expect(nested.getAttribute("Title")).toBe("$LocLabels:cbs.GroupCaption");
		expect(nested.getAttribute("Image32by32Popup")).toBe("$webresource:cbs_/g.svg");
		const grp = doc.querySelector('Group[Id="cbs.Grp"]')!;
		expect(grp.getAttribute("Title")).toBe("$Resources:Ribbon.HomepageGrid.MainTab.Management");
		expect(grp.getAttribute("Description")).toBe("Mine");
		expect(doc.querySelector('LocLabel[Id="cbs.Grp.Title"]')).toBeNull();

		// The tab's Command had no definition in the XML: an empty one is added and published.
		expect(result.notes).toEqual(
			expect.arrayContaining([
				expect.stringContaining("cbs.Tab.Command has no CommandDefinition"),
			]),
		);
		const tabCmd = doc.querySelector('CommandDefinition[Id="cbs.Tab.Command"]');
		expect(tabCmd).not.toBeNull();
		expect(tabCmd!.querySelector("Actions")?.children.length ?? 0).toBe(0);
		expect(doc.querySelector('TabDisplayRule[TabCommand="cbs.Tab.Command"]')).not.toBeNull();
	});

	it("a renamed imported tab keeps its label id and other languages; a duplicated group keeps its platform title", async () => {
		importIntoStore(CAPTIONED);
		useRibbonStore.getState().renameTab("HomepageGrid", "cbs.Tab", "Renamed");
		useRibbonStore.getState().duplicateGroup("HomepageGrid", MAIN, "cbs.Grp");
		const doc = await publishedXml();
		expect(doc.querySelector('Tab[Id="cbs.Tab"]')?.getAttribute("Title")).toBe(
			"$LocLabels:cbs.TabCaption",
		);
		const caption = Array.from(doc.querySelectorAll('LocLabel[Id="cbs.TabCaption"] Title')).map(
			(t) => [t.getAttribute("languagecode"), t.getAttribute("description")],
		);
		expect(caption).toEqual(
			expect.arrayContaining([
				["1033", "Renamed"],
				["1036", "Légende"],
			]),
		);
		const copy = Array.from(doc.querySelectorAll("Group")).find((g) =>
			g.getAttribute("Id")?.includes("cbs.Grp_copy_"),
		);
		// A platform title is kept as the token: it can't take " (copy)" (like a copied button, #86).
		expect(copy?.getAttribute("Title")).toBe(
			"$Resources:Ribbon.HomepageGrid.MainTab.Management",
		);
		expect(copy?.getAttribute("Description")).toBeNull();
	});
});

describe("#68 review 2 — undo takes back the definitions an import changed", () => {
	const REFRESH = `<RibbonDiffXml><CommandDefinitions><CommandDefinition Id="Mscrm.RefreshGrid"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs_/x.js" FunctionName="refresh"/></Actions></CommandDefinition></CommandDefinitions></RibbonDiffXml>`;

	it("undo / redo of an import restore commands; a later edit is an undo step of its own (#69)", () => {
		const before = useRibbonStore.getState().commands.find((c) => c.id === "Mscrm.RefreshGrid");
		importIntoStore(REFRESH);
		expect(entityPlan().editedCommandIds).toEqual(["Mscrm.RefreshGrid"]);
		// A later edit of another command: with #69's workspace history it has
		// its own entry, undone first.
		const other = useRibbonStore
			.getState()
			.commands.find((c) => c.id === "Mscrm.NewRecordFromGrid")!;
		useRibbonStore.getState().upsertCommand({ ...other, actions: [] });

		useRibbonStore.getState().undo();
		let s = useRibbonStore.getState();
		expect(s.commands.find((c) => c.id === "Mscrm.NewRecordFromGrid")).toEqual(other);
		expect(s.commands.find((c) => c.id === "Mscrm.RefreshGrid")?.actions).toHaveLength(1);
		expect(entityPlan().editedCommandIds).toEqual(["Mscrm.RefreshGrid"]);

		useRibbonStore.getState().undo();
		s = useRibbonStore.getState();
		expect(s.commands.find((c) => c.id === "Mscrm.RefreshGrid")).toEqual(before);
		expect(entityPlan().editedCommandIds).toEqual([]);

		useRibbonStore.getState().redo();
		s = useRibbonStore.getState();
		expect(s.commands.find((c) => c.id === "Mscrm.RefreshGrid")?.actions).toHaveLength(1);
		expect(entityPlan().editedCommandIds).toEqual(["Mscrm.RefreshGrid"]);

		useRibbonStore.getState().redo();
		s = useRibbonStore.getState();
		expect(s.commands.find((c) => c.id === "Mscrm.NewRecordFromGrid")?.actions).toEqual([]);
		expect(entityPlan().editedCommandIds.sort()).toEqual([
			"Mscrm.NewRecordFromGrid",
			"Mscrm.RefreshGrid",
		]);
	});

	it("undo removes definitions the import added, and the controls with them", () => {
		importIntoStore(IMPORT);
		useRibbonStore.getState().undo();
		const s = useRibbonStore.getState();
		expect(s.commands.some((c) => c.id === "cbs.Imp.Command")).toBe(false);
		expect(s.enableRules.some((r) => r.id === "cbs.Imp.EnableRule")).toBe(false);
		expect(s.locLabels.some((l) => l.id === "cbs.Imp.Button.LabelText")).toBe(false);
		expect(btn(s.ribbons.HomepageGrid, "cbs.Imp.Button")).toBeUndefined();
		expect(entityPlan().hasChanges).toBe(false);
	});
});

describe("#68 review 3 — a customizations.xml imports the loaded table's part only", () => {
	const entityXml = (name: string, fn: string) =>
		`<Entity><Name LocalizedName="${name}" OriginalName="${name}">${name}</Name><EntityInfo/>
    <RibbonDiffXml><CustomActions/><CommandDefinitions><CommandDefinition Id="cbs.Shared.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:cbs_/x.js" FunctionName="${fn}"/></Actions></CommandDefinition></CommandDefinitions><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions><LocLabels/></RibbonDiffXml></Entity>`;
	const customizations = (...entities: string[]) =>
		`<ImportExportXml><Entities>${entities.join("")}</Entities><Roles/>
    <RibbonDiffXml><CustomActions/><CommandDefinitions><CommandDefinition Id="cbs.App.Command"><EnableRules/><DisplayRules/><Actions/></CommandDefinition></CommandDefinitions><RuleDefinitions/><LocLabels/></RibbonDiffXml></ImportExportXml>`;

	it("picks the <Entity> whose Name is the loaded table, not the first one", () => {
		const result = importRibbonDiffXml(
			input(customizations(entityXml("contact", "contactFn"), entityXml(T, "tableFn"))),
		);
		const cmd = result.commands.find((c) => c.id === "cbs.Shared.Command")!;
		expect(cmd.actions[0]).toMatchObject({ functionName: "tableFn" });
		expect(result.commands.some((c) => c.id === "cbs.App.Command")).toBe(false);
	});

	it("refuses when the loaded table isn't in it, listing what is", () => {
		expect(() =>
			importRibbonDiffXml(
				input(customizations(entityXml("contact", "c"), entityXml("account", "a"))),
			),
		).toThrow(
			/no RibbonDiffXml for cbstest_ribbontest \(it has: contact, account, the application ribbon\)/,
		);
	});

	it("uses the root-level RibbonDiffXml for the application ribbon", () => {
		const result = importRibbonDiffXml(
			input(customizations(entityXml(T, "tableFn")), "Application"),
		);
		expect(result.commands.some((c) => c.id === "cbs.App.Command")).toBe(true);
		expect(result.commands.some((c) => c.id === "cbs.Shared.Command")).toBe(false);
	});
});

describe("#68 review 4/5 — duplicates and normalised ids are reported", () => {
	it("a definition the XML repeats is reported once and the last one is used", () => {
		const xml = `<RibbonDiffXml><CommandDefinitions>
      <CommandDefinition Id="cbs.Dup"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:a.js" FunctionName="first"/></Actions></CommandDefinition>
      <CommandDefinition Id="cbs.Dup"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:a.js" FunctionName="second"/></Actions></CommandDefinition>
    </CommandDefinitions></RibbonDiffXml>`;
		const result = importRibbonDiffXml(input(xml));
		expect(result.commands.filter((c) => c.id === "cbs.Dup")).toHaveLength(1);
		expect(result.commands.find((c) => c.id === "cbs.Dup")?.actions[0]).toMatchObject({
			functionName: "second",
		});
		expect(result.applied.filter((m) => m.includes("cbs.Dup"))).toEqual([
			"Command cbs.Dup added",
		]);
		expect(result.notes).toEqual([
			expect.stringContaining(
				"Command cbs.Dup is defined 2 times in the XML — the last one was used",
			),
		]);
	});

	it("says which CustomAction / HideCustomAction ids are written in CBS's convention, and a missing TemplateAlias", () => {
		const xml = IMPORT.replace(
			' TemplateAlias="o1" ModernImage="Pencil"',
			' ModernImage="Pencil"',
		);
		expect(xml).not.toBe(IMPORT);
		const result = importRibbonDiffXml(input(xml));
		const ids = result.notes.find((n) => n.startsWith("Ids normalised"));
		expect(ids).toContain("cbs.Edit.Override.CustomAction");
		expect(ids).toContain("cbs.HideRefresh");
		expect(ids).not.toContain("cbs.Imp.Button.CustomAction");
		expect(result.notes).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					`Mscrm.HomepageGrid.${T}.Edit: the override has no TemplateAlias — o1`,
				),
			]),
		);
	});
});

describe("#68 review 6 — a table import stays on the table", () => {
	const SHARED = "cbs.Shared.Button";
	const sharedButton = (location: RibbonLocation): RibbonDefinition => ({
		location,
		entityLogicalName: T,
		tabs: [
			{
				id: `${location}.Tab`,
				label: "Tab",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: `${location}.Group`,
						label: "Group",
						sequence: 10,
						template: "Flexible2",
						buttons: [
							{
								id: SHARED,
								label: "Shared",
								kind: "button",
								sequence: 10,
								templateAlias: "o1",
								commandId: "Mscrm.RefreshGrid",
								hidden: false,
								oob: false,
								custom: false,
								managed: true,
								origin: "managed",
							},
						],
					},
				],
			},
		],
	});
	const reload = (ribbons: Record<RibbonLocation, RibbonDefinition>) => {
		const s = useRibbonStore.getState();
		useRibbonStore.getState().loadWorkspace({
			ribbons,
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
		});
	};

	it("viewing the application ribbon, a table export's hide lands on the table, not the application ribbon", () => {
		const s = useRibbonStore.getState();
		reload({
			...s.ribbons,
			HomepageGrid: {
				...s.ribbons.HomepageGrid,
				tabs: [...s.ribbons.HomepageGrid.tabs, ...sharedButton("HomepageGrid").tabs],
			},
			Application: sharedButton("Application"),
		});
		const xml = `<RibbonDiffXml><CustomActions>
      <HideCustomAction HideActionId="h1" Location="Mscrm.HomepageGrid.${T}.Refresh"/>
      <HideCustomAction HideActionId="h2" Location="${SHARED}"/>
    </CustomActions></RibbonDiffXml>`;
		const result = importRibbonDiffXml(input(xml, "Application"));
		expect(btn(result.ribbons.HomepageGrid, SHARED)?.hidden).toBe(true);
		expect(btn(result.ribbons.Application, SHARED)?.hidden).toBe(false);
		expect(result.notes).toEqual(
			expect.arrayContaining([expect.stringContaining(`name the ${T} table`)]),
		);
	});

	it("an id found only on the application ribbon is applied there with an explicit note", () => {
		reload({ ...useRibbonStore.getState().ribbons, Application: sharedButton("Application") });
		const xml = `<RibbonDiffXml><CustomActions><HideCustomAction HideActionId="h" Location="${SHARED}"/></CustomActions></RibbonDiffXml>`;
		const result = importRibbonDiffXml(input(xml));
		expect(btn(result.ribbons.Application, SHARED)?.hidden).toBe(true);
		expect(result.notes).toEqual(
			expect.arrayContaining([
				expect.stringContaining(`${SHARED} was found only on the application ribbon`),
			]),
		);
	});
});
