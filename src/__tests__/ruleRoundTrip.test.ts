/**
 * Lossless round-trip of commands and rules (#29, #42, #41, #7).
 *
 * Publishing re-generates every command / rule the user edited from CBS's
 * model, so parse → generate must reproduce the source exactly (compared in
 * canonical form: attribute order, insignificant whitespace and the lexical
 * form of xs:boolean values don't matter — see ribbonXmlCanonical.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseRibbonXml } from "@/services/xmlParser";
import {
	generateCommandDefinition,
	generateDisplayRule,
	generateEnableRule,
	generateRuleStep,
	normalizeLibrary,
} from "@/services/xmlGenerator";
import { canonicalXml, parseXmlElement, sameXml } from "@/services/ribbonXmlCanonical";
import { validateRibbonDiffXml } from "@/services/xmlValidator";
import type { CommandDefinition, EnableRule, RuleStep } from "@/types/ribbon";

// ── Helpers ────────────────────────────────────────────────────────────────

function ribbonDoc(parts: { commands?: string; enable?: string; display?: string }): string {
	return `<RibbonDefinitions><RibbonDefinition>
  <CommandDefinitions>${parts.commands ?? ""}</CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules/>
    <DisplayRules>${parts.display ?? ""}</DisplayRules>
    <EnableRules>${parts.enable ?? ""}</EnableRules>
  </RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;
}

function parse(xml: string) {
	return parseRibbonXml(xml, "HomepageGrid", "account");
}

/** Every direct child element of `parent` matching `tag`, in a parsed fixture. */
function sourceElements(xml: string, selector: string): Element[] {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	return Array.from(doc.querySelectorAll(selector));
}

function expectSame(generated: string, source: string | Element, normalizeCommands = false) {
	expect(canonicalXml(generated, { normalizeCommands })).toBe(
		canonicalXml(source, { normalizeCommands }),
	);
}

const fixture = (name: string) =>
	readFileSync(resolve(__dirname, "../__fixtures__/ribbon", name), "utf-8");

// ── Rule kinds: table-driven round trip ────────────────────────────────────

type RuleCase = [
	name: string,
	container: "enable" | "display",
	xml: string,
	kind: RuleStep["kind"],
];

const RULE_CASES: RuleCase[] = [
	// Every modelled kind, with and without StandardRuleAttributes.
	[
		"CommandClientTypeRule",
		"display",
		`<CommandClientTypeRule Type="Modern"/>`,
		"CommandClientTypeRule",
	],
	[
		"CommandClientTypeRule + InvertResult",
		"display",
		`<CommandClientTypeRule Type="Refresh" InvertResult="true"/>`,
		"CommandClientTypeRule",
	],
	[
		"CommandClientTypeRule + Default",
		"enable",
		`<CommandClientTypeRule Type="Legacy" Default="true"/>`,
		"CommandClientTypeRule",
	],
	[
		"CrmClientTypeRule",
		"enable",
		`<CrmClientTypeRule Type="Web" InvertResult="true"/>`,
		"CrmClientTypeRule",
	],
	[
		"CrmOfflineAccessStateRule",
		"display",
		`<CrmOfflineAccessStateRule State="Offline" InvertResult="true"/>`,
		"CrmOfflineAccessStateRule",
	],
	[
		"CrmOutlookClientTypeRule",
		"enable",
		`<CrmOutlookClientTypeRule Type="CrmForOutlookOfflineAccess"/>`,
		"CrmOutlookClientTypeRule",
	],
	[
		"CrmOutlookClientVersionRule",
		"display",
		`<CrmOutlookClientVersionRule Major="5" Minor="0" Build="2" Revision="3" InvertResult="true"/>`,
		"CrmOutlookClientVersionRule",
	],
	[
		"CrmOutlookClientVersionRule major only",
		"display",
		`<CrmOutlookClientVersionRule Major="9"/>`,
		"CrmOutlookClientVersionRule",
	],
	[
		"CustomRule",
		"enable",
		`<CustomRule FunctionName="Contoso.isOk" Library="$webresource:new_/rules.js"/>`,
		"CustomRule",
	],
	[
		"CustomRule Default=false InvertResult=false",
		"enable",
		`<CustomRule FunctionName="f" Library="$webresource:a.js" Default="false" InvertResult="false"/>`,
		"CustomRule",
	],
	[
		"CustomRule with every parameter type",
		"enable",
		`<CustomRule FunctionName="Contoso.check" Library="$webresource:new_/rules.js" Default="true">
			<CrmParameter Value="PrimaryControl"/>
			<CrmParameter Value="SelectedControlSelectedItemReferences"/>
			<StringParameter Value="a &amp; &quot;b&quot; &lt;c&gt;"/>
			<BoolParameter Value="false"/>
			<BoolParameter Value="true"/>
			<IntParameter Value="42"/>
			<IntParameter Value="-7"/>
			<DecimalParameter Value="1.5"/>
		</CustomRule>`,
		"CustomRule",
	],
	[
		"DeviceTypeRule",
		"display",
		`<DeviceTypeRule Type="Phone" InvertResult="true"/>`,
		"DeviceTypeRule",
	],
	[
		"EntityPrivilegeRule",
		"display",
		`<EntityPrivilegeRule PrivilegeType="Create" PrivilegeDepth="Basic" EntityName="contact"/>`,
		"EntityPrivilegeRule",
	],
	[
		"EntityPrivilegeRule AppliesTo",
		"display",
		`<EntityPrivilegeRule AppliesTo="SelectedEntity" PrivilegeType="AppendTo" PrivilegeDepth="Global" InvertResult="true"/>`,
		"EntityPrivilegeRule",
	],
	[
		"EntityPropertyRule",
		"display",
		`<EntityPropertyRule AppliesTo="PrimaryEntity" PropertyName="HasStateCode" PropertyValue="true" Default="false"/>`,
		"EntityPropertyRule",
	],
	[
		"EntityPropertyRule false",
		"display",
		`<EntityPropertyRule EntityName="account" PropertyName="IsBPFEntity" PropertyValue="false"/>`,
		"EntityPropertyRule",
	],
	[
		"EntityRule",
		"enable",
		`<EntityRule EntityName="contact" AppliesTo="SelectedEntity" Context="SubGridStandard" Default="false" InvertResult="true"/>`,
		"EntityRule",
	],
	["EntityRule bare", "display", `<EntityRule/>`, "EntityRule"],
	[
		"FeatureControlRule",
		"display",
		`<FeatureControlRule FeatureControlBit="FCB.ExportToExcelOnline" ExpectedValue="true"/>`,
		"FeatureControlRule",
	],
	[
		"FeatureControlRule full",
		"display",
		`<FeatureControlRule FeatureControlBit="FCB.X" ExpectedValue="false" InvertResult="true" Default="false"/>`,
		"FeatureControlRule",
	],
	[
		"FormEntityContextRule",
		"display",
		`<FormEntityContextRule EntityName="contact" Default="false" InvertResult="true"/>`,
		"FormEntityContextRule",
	],
	[
		"FormStateRule",
		"enable",
		`<FormStateRule State="Create" InvertResult="true"/>`,
		"FormStateRule",
	],
	[
		"FormTypeRule",
		"display",
		`<FormTypeRule Type="QuickCreate" InvertResult="true"/>`,
		"FormTypeRule",
	],
	[
		"HideForTabletExperienceRule",
		"display",
		`<HideForTabletExperienceRule/>`,
		"HideForTabletExperienceRule",
	],
	[
		"MiscellaneousPrivilegeRule",
		"display",
		`<MiscellaneousPrivilegeRule PrivilegeName="ExportToExcel"/>`,
		"MiscellaneousPrivilegeRule",
	],
	[
		"MiscellaneousPrivilegeRule PrivilegeDepth",
		"display",
		`<MiscellaneousPrivilegeRule PrivilegeName="BulkDelete" PrivilegeDepth="Global" Default="false" InvertResult="false"/>`,
		"MiscellaneousPrivilegeRule",
	],
	[
		"OptionSetRule",
		"display",
		`<OptionSetRule OptionSet="statuscode" StateCode="1" ObjectTypeCode="2"/>`,
		"OptionSetRule",
	],
	[
		"OrganizationSettingRule",
		"display",
		`<OrganizationSettingRule Setting="IsSOPIntegrationEnabled" InvertResult="true"/>`,
		"OrganizationSettingRule",
	],
	[
		"OutlookItemTrackingRule",
		"enable",
		`<OutlookItemTrackingRule TrackedInCrm="false" AppliesTo="PrimaryEntity"/>`,
		"OutlookItemTrackingRule",
	],
	[
		"OutlookRenderTypeRule",
		"display",
		`<OutlookRenderTypeRule Type="Web"/>`,
		"OutlookRenderTypeRule",
	],
	[
		"OutlookVersionRule",
		"enable",
		`<OutlookVersionRule Version="2007" InvertResult="true"/>`,
		"OutlookVersionRule",
	],
	[
		"PageRule",
		"enable",
		`<PageRule Address="/main.aspx?a=1&amp;b=2" InvertResult="true"/>`,
		"PageRule",
	],
	[
		"RecordPrivilegeRule",
		"enable",
		`<RecordPrivilegeRule PrivilegeType="Write" AppliesTo="PrimaryEntity"/>`,
		"RecordPrivilegeRule",
	],
	[
		"ReferencingAttributeRequiredRule",
		"display",
		`<ReferencingAttributeRequiredRule Default="false" InvertResult="true"/>`,
		"ReferencingAttributeRequiredRule",
	],
	[
		"RelationshipTypeRule",
		"display",
		`<RelationshipTypeRule AppliesTo="SelectedEntity" RelationshipType="ManyToMany" AllowCustomRelationship="false" InvertResult="true"/>`,
		"RelationshipTypeRule",
	],
	[
		"RelationshipTypeRule both flags",
		"display",
		`<RelationshipTypeRule AppliesTo="SelectedEntity" AllowCustomRelationship="true" AllowSystemRelationship="false"/>`,
		"RelationshipTypeRule",
	],
	[
		"SelectionCountRule",
		"enable",
		`<SelectionCountRule AppliesTo="SelectedEntity" Minimum="1" Maximum="250"/>`,
		"SelectionCountRule",
	],
	[
		"SelectionCountRule min only + Default",
		"enable",
		`<SelectionCountRule AppliesTo="SelectedEntity" Minimum="0" Default="false" InvertResult="true"/>`,
		"SelectionCountRule",
	],
	["SkuRule", "display", `<SkuRule Sku="OnPremise" InvertResult="true"/>`, "SkuRule"],
	[
		"ValueRule",
		"enable",
		`<ValueRule Field="statecode" Value="0" InvertResult="true"/>`,
		"ValueRule",
	],
	// xs:boolean "1"/"0" lexical forms are accepted (and written back as true/false).
	[
		"InvertResult=1",
		"enable",
		`<FormStateRule State="Existing" InvertResult="1"/>`,
		"FormStateRule",
	],
	["Default=0", "display", `<EntityRule EntityName="contact" Default="0"/>`, "EntityRule"],
	// OrRule: AND-groups inside each <Or>, InvertResult on nested steps (#29).
	[
		"OrRule single-step groups",
		"enable",
		`<OrRule><Or><FormStateRule State="Create"/></Or><Or><FormStateRule State="Existing"/></Or></OrRule>`,
		"OrRule",
	],
	[
		"OrRule with AND groups and nested InvertResult",
		"display",
		`<OrRule>
			<Or>
				<CommandClientTypeRule Type="Modern" InvertResult="true"/>
				<EntityPrivilegeRule PrivilegeType="Write" PrivilegeDepth="Basic" AppliesTo="PrimaryEntity"/>
				<FeatureControlRule FeatureControlBit="FCB.A" ExpectedValue="true"/>
			</Or>
			<Or>
				<PageRule Address="/userdefined/edit.aspx" InvertResult="true"/>
			</Or>
			<Or>
				<CrmClientTypeRule Type="Outlook"/>
				<HideIfDelveNotAvailableRule/>
			</Or>
		</OrRule>`,
		"OrRule",
	],
	[
		"OrRule with CustomRule parameters inside",
		"enable",
		`<OrRule>
			<Or><CustomRule FunctionName="a" Library="$webresource:x.js"><CrmParameter Value="PrimaryControl"/><StringParameter Value="v"/></CustomRule></Or>
			<Or><SelectionCountRule AppliesTo="SelectedEntity" Minimum="1"/><FormStateRule State="Existing" InvertResult="true"/></Or>
		</OrRule>`,
		"OrRule",
	],
	// Unmodelled elements → verbatim RawRule.
	["HideIf* rule", "display", `<HideIfNetBreezeNotAvailableRule/>`, "RawRule"],
	[
		"HideIfSolutionNotInstalledRule (not in XSD)",
		"display",
		`<HideIfSolutionNotInstalledRule SolutionName="msdynce_Sales"/>`,
		"RawRule",
	],
	[
		"IsExportToExcelOnlineEnabledRule",
		"display",
		`<IsExportToExcelOnlineEnabledRule InvertResult="true"/>`,
		"RawRule",
	],
	[
		"ContextTypeRule (not in XSD)",
		"enable",
		`<ContextTypeRule ContextType="QuickActionCommand"/>`,
		"RawRule",
	],
	["ShowOnGridRule pseudo-rule", "enable", `<ShowOnGridRule/>`, "RawRule"],
	// Known kinds the model can't reproduce exactly → verbatim RawRule.
	["unknown attribute", "enable", `<FormStateRule State="Create" Foo="bar"/>`, "RawRule"],
	[
		"missing required PrivilegeDepth",
		"display",
		`<EntityPrivilegeRule PrivilegeType="Read"/>`,
		"RawRule",
	],
	[
		"missing required AppliesTo",
		"display",
		`<RelationshipTypeRule RelationshipType="OneToMany"/>`,
		"RawRule",
	],
	["non-canonical integer", "enable", `<SelectionCountRule Minimum="01"/>`, "RawRule"],
	[
		"non-boolean InvertResult",
		"enable",
		`<FormStateRule State="Create" InvertResult="yes"/>`,
		"RawRule",
	],
	[
		"Name on a CustomRule parameter",
		"enable",
		`<CustomRule FunctionName="f" Library="$webresource:a.js"><StringParameter Name="x" Value="y"/></CustomRule>`,
		"RawRule",
	],
	[
		"unknown CustomRule child",
		"enable",
		`<CustomRule FunctionName="f" Library="$webresource:a.js"><EnumParameter Value="A"/></CustomRule>`,
		"RawRule",
	],
	[
		"decimal with trailing zero",
		"enable",
		`<CustomRule FunctionName="f" Library="$webresource:a.js"><DecimalParameter Value="1.50"/></CustomRule>`,
		"RawRule",
	],
];

describe("rule round trip — every rule kind", () => {
	it.each(RULE_CASES)("%s", (_name, container, stepXml, kind) => {
		const ruleXml =
			container === "enable"
				? `<EnableRule Id="new.Test.Rule">${stepXml}</EnableRule>`
				: `<DisplayRule Id="new.Test.Rule">${stepXml}</DisplayRule>`;
		const parsed = parse(
			ribbonDoc(container === "enable" ? { enable: ruleXml } : { display: ruleXml }),
		);
		const rule = (container === "enable" ? parsed.enableRules : parsed.displayRules)[0];
		expect(rule.steps).toHaveLength(1);
		expect(rule.steps[0].kind).toBe(kind);

		const generated =
			container === "enable" ? generateEnableRule(rule) : generateDisplayRule(rule);
		expectSame(generated, ruleXml);
	});
});

// ── Semantics of the model ─────────────────────────────────────────────────

describe("rule model semantics", () => {
	it("keeps each <Or> as an AND-group (#29)", () => {
		const { enableRules } = parse(
			ribbonDoc({
				enable: `<EnableRule Id="r"><OrRule>
					<Or><FormStateRule State="Create"/><SelectionCountRule Minimum="1"/></Or>
					<Or><ValueRule Field="a" Value="1" InvertResult="true"/></Or>
				</OrRule></EnableRule>`,
			}),
		);
		const step = enableRules[0].steps[0];
		expect(step.kind).toBe("OrRule");
		if (step.kind !== "OrRule") return;
		expect(step.groups.map((g) => g.map((s) => s.kind))).toEqual([
			["FormStateRule", "SelectionCountRule"],
			["ValueRule"],
		]);
		// InvertResult on a step inside an <Or> survives (#29).
		expect(step.groups[1][0]).toMatchObject({ kind: "ValueRule", invertResult: true });
	});

	it("never invents Default / InvertResult attributes (#42)", () => {
		const { enableRules } = parse(
			ribbonDoc({
				enable: `<EnableRule Id="r"><CustomRule FunctionName="f" Library="$webresource:a.js"/><CommandClientTypeRule Type="Refresh"/></EnableRule>`,
			}),
		);
		const [custom, client] = enableRules[0].steps;
		expect(custom).not.toHaveProperty("default");
		expect(custom).not.toHaveProperty("invertResult");
		expect(client).not.toHaveProperty("default");
		const xml = generateEnableRule(enableRules[0]);
		expect(xml).not.toContain("Default=");
		expect(xml).not.toContain("InvertResult=");
	});

	it('keeps an explicit false (Default="false" / InvertResult="false")', () => {
		const { enableRules } = parse(
			ribbonDoc({
				enable: `<EnableRule Id="r"><CustomRule FunctionName="f" Library="$webresource:a.js" Default="false" InvertResult="false"/></EnableRule>`,
			}),
		);
		expect(enableRules[0].steps[0]).toMatchObject({ default: false, invertResult: false });
	});

	it("models CustomRule parameters of every type (#29)", () => {
		const { enableRules } = parse(
			ribbonDoc({
				enable: `<EnableRule Id="r"><CustomRule FunctionName="f" Library="$webresource:a.js">
					<CrmParameter Value="PrimaryControl"/><StringParameter Value="s"/><BoolParameter Value="1"/>
					<IntParameter Value="3"/><DecimalParameter Value="2.25"/>
				</CustomRule></EnableRule>`,
			}),
		);
		expect(enableRules[0].steps[0]).toMatchObject({
			kind: "CustomRule",
			params: [
				{ kind: "CrmParameter", value: "PrimaryControl" },
				{ kind: "StringParameter", value: "s" },
				{ kind: "BoolParameter", value: true },
				{ kind: "IntParameter", value: 3 },
				{ kind: "DecimalParameter", value: 2.25 },
			],
		});
	});

	it("editing one step of a rule keeps every other step, raw ones included, intact", () => {
		const source = `<DisplayRule Id="r">
			<EntityPrivilegeRule PrivilegeType="Read" PrivilegeDepth="Basic"/>
			<HideIfPowerBITileNotAvailableRule/>
			<OrRule><Or><PageRule Address="/a" InvertResult="true"/><FormTypeRule Type="Main"/></Or><Or><DeviceTypeRule Type="Web"/></Or></OrRule>
		</DisplayRule>`;
		const { displayRules } = parse(ribbonDoc({ display: source }));
		const rule = displayRules[0];
		const edited = {
			...rule,
			steps: rule.steps.map((s) =>
				s.kind === "EntityPrivilegeRule" ? { ...s, privilegeDepth: "Global" as const } : s,
			),
		};
		expectSame(
			generateDisplayRule(edited),
			source.replace('PrivilegeDepth="Basic"', 'PrivilegeDepth="Global"'),
		);
	});

	it("re-emits a RawRule byte-for-byte", () => {
		const raw = `<HideIfSolutionNotInstalledRule SolutionName="msdynce_Sales"/>`;
		const { displayRules } = parse(
			ribbonDoc({ display: `<DisplayRule Id="r">${raw}</DisplayRule>` }),
		);
		expect(generateRuleStep(displayRules[0].steps[0])).toBe(raw);
	});
});

// ── Actions and parameters ─────────────────────────────────────────────────

type ActionCase = [name: string, actionsXml: string, kinds: string[]];

const ACTION_CASES: ActionCase[] = [
	[
		"JavaScriptFunction with every parameter type",
		`<JavaScriptFunction FunctionName="XrmCore.Commands.Open.openNewRecord" Library="$webresource:Main_system_library.js">
			<CrmParameter Value="SelectedEntityTypeName"/>
			<CrmParameter Value="SelectedControlAllItemReferences"/>
			<StringParameter Value="x&amp;y"/>
			<BoolParameter Value="true"/>
			<IntParameter Value="2"/>
			<DecimalParameter Value="0.5"/>
		</JavaScriptFunction>`,
		["javascript"],
	],
	[
		"$Webresource: (capital W) library is kept as is",
		`<JavaScriptFunction FunctionName="f" Library="$Webresource:Ribbon_main_system_library.js"/>`,
		["javascript"],
	],
	[
		"/_static library path",
		`<JavaScriptFunction FunctionName="Mscrm.RibbonActions.f" Library="/_static/_common/scripts/RibbonActions.js"><CrmParameter Value="PrimaryControl"/></JavaScriptFunction>`,
		["javascript"],
	],
	[
		"Url with named parameters, WinMode, WinParams and PassParams",
		`<Url Address="/tools/x.aspx" PassParams="true" WinMode="1" WinParams="dialogWidth:640px;dialogHeight:658px">
			<CrmParameter Name="id" Value="FirstPrimaryItemId"/>
			<StringParameter Name="mode" Value="edit"/>
			<BoolParameter Name="b" Value="false"/>
			<IntParameter Name="n" Value="5"/>
			<DecimalParameter Name="d" Value="2.5"/>
		</Url>`,
		["url"],
	],
	["Url with only an Address", `<Url Address="https://contoso.example/x"/>`, ["url"]],
	["OutlookCommand", `<OutlookCommand ActionType="GoOffline"/>`, ["outlookCommand"]],
	[
		"OutlookCommand with Data",
		`<OutlookCommand ActionType="OpenOlkForm" Data="x"/>`,
		["outlookCommand"],
	],
	[
		"mixed actions keep their order",
		`<Url Address="/a.aspx" WinMode="0"/>
		<JavaScriptFunction FunctionName="b" Library="$webresource:b.js"/>
		<OutlookCommand ActionType="Sync"/>
		<JavaScriptFunction FunctionName="c" Library="$webresource:c.js"><IntParameter Value="1"/></JavaScriptFunction>`,
		["url", "javascript", "outlookCommand", "javascript"],
	],
	[
		"Name on a JavaScriptFunction parameter → kept raw",
		`<JavaScriptFunction FunctionName="f" Library="$webresource:a.js"><StringParameter Name="n" Value="v"/></JavaScriptFunction>`,
		["raw"],
	],
	[
		"unknown parameter element → kept raw",
		`<JavaScriptFunction FunctionName="f" Library="$webresource:a.js"><EnumParameter Value="A"/></JavaScriptFunction>`,
		["raw"],
	],
	["unknown action element → kept raw", `<FutureAction Foo="1"><Child/></FutureAction>`, ["raw"]],
];

describe("command round trip — every action and parameter kind", () => {
	it.each(ACTION_CASES)("%s", (_name, actionsXml, kinds) => {
		const commandXml = `<CommandDefinition Id="new.Test.Command">
			<EnableRules><EnableRule Id="Mscrm.Enabled"/></EnableRules>
			<DisplayRules><DisplayRule Id="new.Test.Display"/></DisplayRules>
			<Actions>${actionsXml}</Actions>
		</CommandDefinition>`;
		const { commands } = parse(ribbonDoc({ commands: commandXml }));
		expect(commands[0].actions.map((a) => a.kind)).toEqual(kinds);
		expectSame(generateCommandDefinition(commands[0]), commandXml);
	});

	it("emits the three schema-required containers even when the source omits one", () => {
		const commandXml = `<CommandDefinition Id="Mscrm.X"><EnableRules/><Actions><JavaScriptFunction FunctionName="f" Library="$webresource:a.js"/></Actions></CommandDefinition>`;
		const { commands } = parse(ribbonDoc({ commands: commandXml }));
		const xml = generateCommandDefinition(commands[0]);
		expect(xml).toMatch(/<EnableRules\/>\s*<DisplayRules\/>\s*<Actions>/);
		expectSame(xml, commandXml, true);
	});

	it("keeps an out-of-place rule reference at its position (Mscrm.SequencesMulti.ViewConnectedSequences)", () => {
		const commandXml = `<CommandDefinition Id="c"><EnableRules/><DisplayRules><DisplayRule Id="a"/><EnableRule Id="x"/><DisplayRule Id="b"/></DisplayRules><Actions/></CommandDefinition>`;
		const { commands } = parse(ribbonDoc({ commands: commandXml }));
		expect(commands[0].displayRules).toEqual(["a", "b"]);
		expectSame(generateCommandDefinition(commands[0]), commandXml);
	});

	it("writes no Name on JavaScriptFunction parameters and always one on Url parameters (#41)", () => {
		const cmd: CommandDefinition = {
			id: "new.C",
			enableRules: [],
			displayRules: [],
			actions: [
				{
					kind: "javascript",
					library: "new_/a.js",
					functionName: "f",
					params: [{ kind: "CrmParameter", name: "ignored", value: "PrimaryControl" }],
				},
				{ kind: "url", address: "/x", params: [{ kind: "StringParameter", value: "v" }] },
			],
		};
		const xml = generateCommandDefinition(cmd);
		expect(xml).toContain('<CrmParameter Value="PrimaryControl"/>');
		expect(xml).toContain('<StringParameter Name="" Value="v"/>');
		expect(xml).toContain('Library="$webresource:new_/a.js"');
		// The validator flags the missing Url parameter name.
		const errors = validateRibbonDiffXml(
			`<RibbonDiffXml><CommandDefinitions>${xml}</CommandDefinitions></RibbonDiffXml>`,
		);
		expect(errors.some((e) => e.message.includes("requires a Name"))).toBe(true);
	});

	it("normalizeLibrary prefixes bare names but leaves directives and paths alone", () => {
		expect(normalizeLibrary("new_/a.js")).toBe("$webresource:new_/a.js");
		expect(normalizeLibrary("$webresource:a.js")).toBe("$webresource:a.js");
		expect(normalizeLibrary("$Webresource:Main_system_library.js")).toBe(
			"$Webresource:Main_system_library.js",
		);
		expect(normalizeLibrary("/_static/x.js")).toBe("/_static/x.js");
	});
});

// ── Real out-of-the-box commands and rules ─────────────────────────────────

/** Rule elements CBS deliberately doesn't model (kept as RawRule). */
const UNMODELLED_RULE_TAG = /^(HideIf\w+Rule|IsExportToExcelOnlineEnabledRule|ContextTypeRule)$/;

function rawRuleTags(steps: RuleStep[]): string[] {
	return steps.flatMap((s) =>
		s.kind === "RawRule"
			? [s.tagName]
			: s.kind === "OrRule"
				? s.groups.flatMap(rawRuleTags)
				: [],
	);
}

describe.each([
	["contact-oob-commands-rules.xml", 250],
	["app-oob-subset.xml", 10],
])("real ribbon round trip — %s", (name, minCommands) => {
	const xml = fixture(name);
	const parsed = parse(xml);

	it("parses the expected volume", () => {
		expect(parsed.commands.length).toBeGreaterThanOrEqual(minCommands);
	});

	it("re-generates every CommandDefinition losslessly", () => {
		const sources = sourceElements(xml, "CommandDefinitions > CommandDefinition");
		expect(sources).toHaveLength(parsed.commands.length);
		const mismatches = parsed.commands.filter(
			(c, i) =>
				!sameXml(generateCommandDefinition(c), sources[i], { normalizeCommands: true }),
		);
		expect(mismatches.map((c) => c.id)).toEqual([]);
	});

	it("models every out-of-the-box action (nothing falls back to raw)", () => {
		const raw = parsed.commands.flatMap((c) => c.actions.filter((a) => a.kind === "raw"));
		expect(raw).toEqual([]);
	});

	it("re-generates every EnableRule and DisplayRule losslessly", () => {
		const enableSources = sourceElements(xml, "RuleDefinitions > EnableRules > EnableRule");
		const displaySources = sourceElements(xml, "RuleDefinitions > DisplayRules > DisplayRule");
		expect(enableSources).toHaveLength(parsed.enableRules.length);
		expect(displaySources).toHaveLength(parsed.displayRules.length);
		const bad = [
			...parsed.enableRules.filter(
				(r, i) => !sameXml(generateEnableRule(r), enableSources[i]),
			),
			...parsed.displayRules.filter(
				(r, i) => !sameXml(generateDisplayRule(r), displaySources[i]),
			),
		];
		expect(bad.map((r) => r.id)).toEqual([]);
	});

	it("only keeps genuinely unmodelled rule elements raw", () => {
		const tags = [...parsed.enableRules, ...parsed.displayRules].flatMap((r) =>
			rawRuleTags(r.steps),
		);
		expect(tags.filter((t) => !UNMODELLED_RULE_TAG.test(t))).toEqual([]);
	});
});

describe("real ribbon round trip — specific out-of-the-box constructs", () => {
	const parsed = parse(fixture("contact-oob-commands-rules.xml"));
	const allSteps = (rules: EnableRule[]) =>
		rules.flatMap((r) =>
			r.steps.flatMap((s) => (s.kind === "OrRule" ? [s, ...s.groups.flat()] : [s])),
		);

	it("contains OrRules whose <Or> holds several ANDed rules", () => {
		const multi = allSteps([...parsed.enableRules, ...parsed.displayRules]).filter(
			(s) => s.kind === "OrRule" && s.groups.some((g) => g.length > 1),
		);
		expect(multi.length).toBeGreaterThan(0);
	});

	it("contains CustomRules with parameters and FeatureControlRules", () => {
		const steps = allSteps([...parsed.enableRules, ...parsed.displayRules]);
		expect(steps.some((s) => s.kind === "CustomRule" && (s.params?.length ?? 0) > 0)).toBe(
			true,
		);
		expect(steps.some((s) => s.kind === "FeatureControlRule")).toBe(true);
	});
});

// ── Parse error safety ─────────────────────────────────────────────────────

describe("canonical XML", () => {
	it("ignores attribute order, whitespace and boolean spelling", () => {
		expect(
			sameXml(
				`<A b="1" InvertResult="1">\n  <C/>\n</A>`,
				`<A InvertResult="true" b="1"><C/></A>`,
			),
		).toBe(true);
	});

	it("distinguishes child order and values", () => {
		expect(sameXml(`<A><B/><C/></A>`, `<A><C/><B/></A>`)).toBe(false);
		expect(sameXml(`<A b="1"/>`, `<A b="true"/>`)).toBe(false);
	});

	it("parseXmlElement throws on malformed XML", () => {
		expect(() => parseXmlElement("<A>")).toThrow();
	});
});
