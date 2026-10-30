import { describe, it, expect } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { planScope } from "@/services/publishPlan";
import { HIDE_DISPLAY_RULES, useRibbonStore } from "@/store/ribbonStore";

const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.Form.contact.MainTab" Command="Mscrm.Form.contact.MainTab" Sequence="10">
    <Groups Id="Mscrm.Form.contact.MainTab.Groups">
      <Group Id="Mscrm.Form.contact.MainTab.Save" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="Mscrm.Form.contact.MainTab.Save.Controls">
          <Button Id="Mscrm.Form.contact.Deactivate" Command="Mscrm.Form.Deactivate" Sequence="30" LabelText="$Resources:Ribbon.HomepageGrid.account.Record.Status.Deactivate" TemplateAlias="o1" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="Mscrm.Form.Deactivate"><EnableRules><EnableRule Id="Mscrm.CanWritePrimary"/></EnableRules><DisplayRules><DisplayRule Id="Mscrm.PrimaryIsActive"/></DisplayRules><Actions>
    <JavaScriptFunction FunctionName="Mscrm.CommandBarActions.changeState" Library="/_static/_common/scripts/CommandBarActions.js"><StringParameter Value="deactivate"/><CrmParameter Value="FirstPrimaryItemId"/></JavaScriptFunction></Actions></CommandDefinition>
</CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules>
  <DisplayRule Id="Mscrm.PrimaryIsActive"><FormStateRule State="Existing"/></DisplayRule>
  <DisplayRule Id="Mscrm.HideOnModern"><CommandClientTypeRule Type="Modern" InvertResult="true"/></DisplayRule>
  <DisplayRule Id="Mscrm.ShowOnlyOnModern"><CommandClientTypeRule Type="Modern"/></DisplayRule>
</DisplayRules><EnableRules><EnableRule Id="Mscrm.CanWritePrimary"><RecordPrivilegeRule PrivilegeType="Write" AppliesTo="PrimaryEntity"/></EnableRule></EnableRules></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

describe("hiding a button with display rules", () => {
	it("adds the two platform display rules to the button's command and publishes the command, not a HideCustomAction", () => {
		const parsed = parseRibbonXml(MERGED, "Form", "contact");
		const empty = (location: "HomepageGrid" | "SubGrid" | "Application") => ({
			location,
			entityLogicalName: "contact",
			tabs: [],
		});
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				Form: parsed.ribbon,
				HomepageGrid: empty("HomepageGrid"),
				SubGrid: empty("SubGrid"),
				Application: empty("Application"),
			},
			commands: parsed.commands,
			displayRules: parsed.displayRules,
			enableRules: parsed.enableRules,
			locLabels: parsed.locLabels,
		});

		expect(useRibbonStore.getState().hideWithDisplayRules("Mscrm.Form.Deactivate")).toBe(true);
		expect(useRibbonStore.getState().hideWithDisplayRules(undefined)).toBe(false);

		const s = useRibbonStore.getState();
		const cmd = s.commands.find((c) => c.id === "Mscrm.Form.Deactivate")!;
		expect(cmd.displayRules).toEqual(["Mscrm.PrimaryIsActive", ...HIDE_DISPLAY_RULES]);
		expect(s.mutationsSincePublish).toBeGreaterThan(0);

		const plan = planScope({
			locations: [{ current: s.ribbons.Form, baseline: s.baseline.Form }],
			commands: s.commands,
			baselineCommands: s.baselineCommands,
			enableRules: s.enableRules,
			baselineEnableRules: s.baselineEnableRules,
			displayRules: s.displayRules,
			baselineDisplayRules: s.baselineDisplayRules,
		});
		expect(plan.editedCommandIds).toEqual(["Mscrm.Form.Deactivate"]);
		expect(plan.editedDisplayRuleIds).toEqual([]);
		expect(plan.unsupported).toEqual([]);

		const xml = generateRibbonDiffXml({
			current: s.ribbons.Form,
			baseline: s.baseline.Form,
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
			entityLogicalName: "contact",
			location: "Form",
		});
		expect(xml).not.toContain("HideCustomAction");
	});

	it("an out-of-the-box command edited for a table isn't published to the application ribbon", () => {
		const parsed = parseRibbonXml(MERGED, "Form", "contact");
		const appRibbon = JSON.parse(JSON.stringify(parsed.ribbon));
		appRibbon.location = "Application";
		appRibbon.tabs[0].groups[0].buttons[0].id = "Mscrm.Form.{!EntityLogicalName}.Deactivate";
		const edited = parsed.commands.map((c) => ({
			...c,
			displayRules: [...c.displayRules, ...HIDE_DISPLAY_RULES],
		}));
		const common = {
			commands: edited,
			baselineCommands: parsed.commands,
			enableRules: parsed.enableRules,
			baselineEnableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			baselineDisplayRules: parsed.displayRules,
		};
		const app = (excludeCommandIds?: Set<string>) =>
			planScope({
				...common,
				locations: [{ current: appRibbon, baseline: appRibbon }],
				excludeCommandIds,
			});
		// Without the table's commands excluded, the shared command leaks into the application scope.
		expect(app().editedCommandIds).toEqual(["Mscrm.Form.Deactivate"]);
		const plan = app(new Set(["Mscrm.Form.Deactivate"]));
		expect(plan.editedCommandIds).toEqual([]);
		expect(plan.hasChanges).toBe(false);
	});
});
