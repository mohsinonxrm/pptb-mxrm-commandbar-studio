/**
 * #165: a new group whose template CBS doesn't list gets its MaxSize from the template's layouts
 * as loaded, or a warning; a control's TemplateAlias is checked against its group's template.
 */
import { describe, it, expect } from "vitest";
import { planNewGroupScaling } from "@/services/xmlGenerator";
import { validatePublishRibbonDiff } from "@/services/xmlValidator";
import { parseRibbonXml } from "@/services/xmlParser";
import type { RibbonDefinition, RibbonGroup } from "@/types/ribbon";

const TAB = "Mscrm.HomepageGrid.account.MainTab";
const group = (id: string, template: string): RibbonGroup =>
	({ id, label: "Tools", sequence: 90, template, buttons: [] }) as unknown as RibbonGroup;
const ribbon = (groups: RibbonGroup[], extra: Partial<RibbonDefinition> = {}): RibbonDefinition =>
	({
		location: "HomepageGrid",
		entityLogicalName: "account",
		tabs: [{ id: TAB, label: "Main", sequence: 10, tabDisplayRules: [], groups }],
		...extra,
	}) as RibbonDefinition;

describe("#165 a new group's MaxSize", () => {
	it("comes from the template's largest layout as loaded", () => {
		const base = ribbon([]);
		const current = ribbon([group("cbs.Tools", "mxrm.Templates.Custom")], {
			templateLayouts: { "mxrm.Templates.Custom": ["Big", "Small", "Popup"] },
		});
		const plan = planNewGroupScaling(current, base);
		expect(plan.steps.get("cbs.Tools")?.size).toBe("Big");
		expect(plan.warnings).toEqual([]);
	});

	it("never defaults to a Popup layout", () => {
		const current = ribbon([group("cbs.Tools", "mxrm.Templates.Custom")], {
			templateLayouts: { "mxrm.Templates.Custom": ["Popup", "Big"] },
		});
		expect(planNewGroupScaling(current, ribbon([])).steps.get("cbs.Tools")?.size).toBe("Big");
	});

	it("is left out with a warning when nothing knows the template", () => {
		const plan = planNewGroupScaling(
			ribbon([group("cbs.Tools", "mxrm.Templates.Custom")]),
			ribbon([]),
		);
		expect(plan.steps.size).toBe(0);
		expect(plan.problems).toEqual([]);
		expect(plan.warnings).toHaveLength(1);
		expect(plan.warnings[0]).toMatch(/cbs\.Tools.*mxrm\.Templates\.Custom.*gets no MaxSize/);
	});

	it("still comes from Microsoft's templates CBS lists", () => {
		const plan = planNewGroupScaling(
			ribbon([group("cbs.Tools", "Mscrm.Templates.Flexible2")]),
			ribbon([]),
		);
		expect(plan.steps.get("cbs.Tools")?.size).toBe("LargeLarge");
	});
});

describe("#165 TemplateAlias", () => {
	const GROUP = `${TAB}.Management`;
	const diff = (customActions: string, templates = "") => `<RibbonDiffXml>
  <CustomActions>${customActions}</CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates">${templates}</RibbonTemplates></Templates>
  <CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions><LocLabels/>
</RibbonDiffXml>`;
	const addButton = (alias: string) =>
		`<CustomAction Id="cbs.B.CustomAction" Location="${GROUP}.Controls._children" Sequence="10"><CommandUIDefinition><Button Id="cbs.B" Command="cbs.B.Command" Sequence="10" TemplateAlias="${alias}"/></CommandUIDefinition></CustomAction>`;
	const context = {
		groupTemplates: { [GROUP]: "Mscrm.Templates.Flexible2" },
		templateAliases: { "Mscrm.Templates.Flexible2": ["o1", "o2", "isv"] },
	};
	const aliasFindings = (xml: string, ctx = context) =>
		validatePublishRibbonDiff(xml, ctx).filter((f) => f.code === "template-alias");

	it("warns on an alias the group's template doesn't have", () => {
		const [f, ...rest] = aliasFindings(diff(addButton("c1")));
		expect(rest).toEqual([]);
		expect(f.severity).toBe("warning");
		expect(f.message).toBe(
			`Button cbs.B has TemplateAlias "c1", which template Mscrm.Templates.Flexible2 of group ${GROUP} doesn't have (o1, o2, isv): the classic ribbon won't lay it out`,
		);
		expect(aliasFindings(diff(addButton("o1")))).toEqual([]);
		// Template not known: not checked
		expect(aliasFindings(diff(addButton("c1")), {} as typeof context)).toEqual([]);
	});

	it("checks a new group's controls against its template in the merged XML", () => {
		const newGroup = `<CustomAction Id="cbs.G.CustomAction" Location="${TAB}.Groups._children" Sequence="90"><CommandUIDefinition><Group Id="cbs.G" Sequence="90" Template="mxrm.Templates.Custom"><Controls Id="cbs.G.Controls"><Button Id="cbs.G.B" Command="x" Sequence="10" TemplateAlias="o1"/></Controls></Group></CommandUIDefinition></CustomAction>`;
		const template = `<GroupTemplate Id="mxrm.Templates.Custom"><Layout Title="Big"><Section Type="OneRow"><Row><ControlRef TemplateAlias="c1" DisplayMode="Large"/></Row></Section></Layout></GroupTemplate>`;
		const findings = aliasFindings(diff(newGroup, template), {} as typeof context);
		expect(findings.map((f) => f.elementId)).toEqual(["cbs.G.B"]);
	});

	it("the parser reads each used template's aliases", () => {
		const xml = `<RibbonDiffXml><CustomActions/><Templates><RibbonTemplates Id="Mscrm.Templates">
  <GroupTemplate Id="Mscrm.Templates.Flexible2">
    <Layout Title="LargeLarge"><OverflowSection Type="OneRow" TemplateAlias="o1" DisplayMode="Large"/><OverflowSection Type="OneRow" TemplateAlias="o2" DisplayMode="Large"/></Layout>
    <Layout Title="Popup" LayoutTitle="LargeLarge"/>
  </GroupTemplate>
  <GroupTemplate Id="Mscrm.Templates.Unused"><Layout Title="X"><OverflowSection TemplateAlias="z"/></Layout></GroupTemplate>
</RibbonTemplates></Templates></RibbonDiffXml>`;
		const ribbonXml = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs Id="Mscrm.Tabs"><Tab Id="${TAB}" Sequence="10"><Scaling Id="${TAB}.Scaling"/><Groups Id="${TAB}.Groups"><Group Id="${TAB}.Management" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${TAB}.Management.Controls"/></Group></Groups></Tab></Tabs></Ribbon></UI><Templates>${xml.slice(xml.indexOf("<RibbonTemplates"), xml.indexOf("</Templates>"))}</Templates></RibbonDefinition></RibbonDefinitions>`;
		const parsed = parseRibbonXml(ribbonXml, "HomepageGrid", "account");
		expect(parsed.ribbon.templateAliases).toEqual({
			"Mscrm.Templates.Flexible2": ["o1", "o2"],
		});
	});
});
