/**
 * Schema validity of generated RibbonDiffXml for tabs, scaling and tab display
 * rules (#40), and the validator's ribbon-schema checks (#41). The rules come
 * from RibbonCore.xsd / RibbonTypes.xsd (Microsoft's Schemas.zip; published at
 * https://learn.microsoft.com/power-apps/developer/model-driven-apps/ribbon-types-schema).
 */
import { describe, it, expect } from "vitest";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import { validateRibbonDiffXml } from "@/services/xmlValidator";
import { isRuleKindAllowed } from "@/constants/ruleKinds";
import type { RibbonButton, RibbonDefinition, RibbonLocation, RibbonTab } from "@/types/ribbon";

const button: RibbonButton = {
	id: "new.account.Btn",
	label: "Btn",
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: "",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
};

function generate(current: RibbonDefinition, baseline: RibbonDefinition): string {
	return generateRibbonDiffXml({
		current,
		baseline,
		commands: [],
		enableRules: [],
		displayRules: [],
		locLabels: [],
		entityLogicalName: current.entityLogicalName,
		location: current.location,
	});
}

function ribbon(
	location: RibbonLocation,
	tabs: RibbonTab[],
	extra: Partial<RibbonDefinition> = {},
): RibbonDefinition {
	return { location, entityLogicalName: "account", tabs, ...extra };
}

const existingTab: RibbonTab = {
	id: "Mscrm.Form.account.MainTab",
	label: "Main",
	sequence: 10,
	commandId: "Mscrm.Form.account.MainTab",
	tabDisplayRules: [],
	groups: [
		{
			id: "Mscrm.Form.account.MainTab.Save",
			label: "Save",
			sequence: 10,
			template: "Mscrm.Templates.Flexible2",
			buttons: [],
		},
	],
};

const newTab = (rules: RibbonTab["tabDisplayRules"] = []): RibbonTab => ({
	id: "new.account.Tab",
	label: "New tab",
	sequence: 50,
	commandId: "new.account.Tab.Command",
	tabDisplayRules: rules,
	groups: [
		{
			id: "new.account.Tab.G1",
			label: "One",
			sequence: 10,
			template: "Flexible2",
			buttons: [button],
		},
		{
			id: "new.account.Tab.G2",
			label: "Two",
			sequence: 20,
			template: "Mscrm.Templates.Flexible3",
			buttons: [],
		},
	],
});

const errorsOf = (xml: string) =>
	validateRibbonDiffXml(xml).filter((e) => e.severity !== "warning");

describe("new tabs (#40)", () => {
	const xml = generate(ribbon("Form", [existingTab, newTab()]), ribbon("Form", [existingTab]));

	it("puts <Scaling Id> before <Groups>, with a MaxSize per group", () => {
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const tab = doc.querySelector("Tab[Id='new.account.Tab']")!;
		expect(Array.from(tab.children).map((c) => c.tagName)).toEqual(["Scaling", "Groups"]);
		const scaling = tab.querySelector("Scaling")!;
		expect(scaling.getAttribute("Id")).toBe("new.account.Tab.Scaling");
		const maxSizes = Array.from(scaling.querySelectorAll("MaxSize"));
		expect(maxSizes.map((m) => [m.getAttribute("GroupId"), m.getAttribute("Size")])).toEqual([
			["new.account.Tab.G1", "LargeLarge"],
			["new.account.Tab.G2", "LargeLargeMedium"],
		]);
	});

	it("gives no default MaxSize to a group whose template layouts are unknown", () => {
		const tab = newTab();
		tab.groups = [{ ...tab.groups[0], template: "new.Templates.Custom" }];
		const out = generate(ribbon("Form", [tab]), ribbon("Form", []));
		expect(out).toContain('<Scaling Id="new.account.Tab.Scaling"/>');
		expect(out).not.toContain("<MaxSize");
	});

	it("passes the validator", () => {
		expect(errorsOf(xml)).toEqual([]);
	});

	it("uses the tab's own scaling when one is defined (MaxSize before Scale)", () => {
		const tab = newTab();
		const withScaling = generate(
			ribbon("Form", [tab], {
				scalingByTab: {
					[tab.id]: {
						tabId: tab.id,
						maxSizes: [
							{
								id: "m1",
								groupId: "new.account.Tab.G1",
								size: "LargeMedium",
								sequence: 10,
							},
						],
						scales: [
							{
								id: "s1",
								groupId: "new.account.Tab.G1",
								size: "Popup",
								sequence: 20,
							},
						],
					},
				},
			}),
			ribbon("Form", []),
		);
		expect(withScaling).toMatch(/<MaxSize Id="m1"[^>]*Size="LargeMedium"\/>\s*<Scale Id="s1"/);
	});
});

describe("tab display rules (#40)", () => {
	const rules: RibbonTab["tabDisplayRules"] = [
		{
			tabCommand: "new.account.Tab.Command",
			rules: [
				{ kind: "EntityRule", entityName: "account", context: "Form" },
				{ kind: "PageRule", address: "/main.aspx" },
			],
		},
	];

	it("keeps rules as direct children of TabDisplayRule", () => {
		const xml = generate(ribbon("Form", [newTab(rules)]), ribbon("Form", []));
		expect(xml).toMatch(/<TabDisplayRule TabCommand="new.account.Tab.Command">\s*<EntityRule /);
		expect(xml).not.toContain(
			'<TabDisplayRule TabCommand="new.account.Tab.Command">\n        <DisplayRules',
		);
	});

	it("drops PageRule for an entity ribbon (only valid in the application ribbon)", () => {
		const xml = generate(ribbon("Form", [newTab(rules)]), ribbon("Form", []));
		expect(xml).not.toContain("<PageRule");
	});

	it("keeps PageRule for the application ribbon", () => {
		const xml = generate(ribbon("Application", [newTab(rules)]), ribbon("Application", []));
		expect(xml).toContain('<PageRule Address="/main.aspx"/>');
	});

	it("omits a TabDisplayRule left without rules", () => {
		const pageOnly: RibbonTab["tabDisplayRules"] = [
			{ tabCommand: "new.account.Tab.Command", rules: [{ kind: "PageRule", address: "/x" }] },
		];
		const xml = generate(ribbon("Form", [newTab(pageOnly)]), ribbon("Form", []));
		expect(xml).not.toContain("<TabDisplayRule ");
	});
});

describe("scaling changes on existing tabs (#40)", () => {
	const baseline = ribbon("Form", [existingTab], {
		scalingByTab: {
			[existingTab.id]: {
				tabId: existingTab.id,
				maxSizes: [
					{
						id: "Save.MaxSize",
						groupId: "Mscrm.Form.account.MainTab.Save",
						size: "LargeLarge",
						sequence: 10,
					},
				],
				scales: [],
			},
		},
	});
	const current = ribbon("Form", [existingTab], {
		scalingByTab: {
			[existingTab.id]: {
				tabId: existingTab.id,
				maxSizes: [
					{
						id: "Save.MaxSize",
						groupId: "Mscrm.Form.account.MainTab.Save",
						size: "LargeLarge",
						sequence: 10,
					},
				],
				scales: [
					{
						id: "Save.Scale.1",
						groupId: "Mscrm.Form.account.MainTab.Save",
						size: "Popup",
						sequence: 40,
					},
				],
			},
		},
	});
	const xml = generate(current, baseline);

	it("emits no top-level <Scalings>", () => {
		expect(xml).not.toContain("<Scalings");
		expect(xml).not.toContain("TabId=");
	});

	it("emits each changed step as a CustomAction at {tabId}.Scaling._children", () => {
		expect(xml).toContain('Location="Mscrm.Form.account.MainTab.Scaling._children"');
		expect(xml).toContain('<Scale Id="Save.Scale.1"');
		// The unchanged MaxSize is not re-emitted.
		expect(xml).not.toContain('<MaxSize Id="Save.MaxSize"');
		expect(errorsOf(xml)).toEqual([]);
	});

	it("adds a MaxSize for a new group in an existing tab", () => {
		const withGroup = ribbon("Form", [
			{
				...existingTab,
				groups: [
					...existingTab.groups,
					{
						id: "new.account.Group",
						label: "G",
						sequence: 30,
						template: "Flexible2",
						buttons: [],
					},
				],
			},
		]);
		const out = generate(withGroup, ribbon("Form", [existingTab]));
		expect(out).toMatch(
			/Location="Mscrm.Form.account.MainTab.Scaling._children"[\s\S]*<MaxSize Id="new.account.Group.MaxSize" GroupId="new.account.Group"/,
		);
	});
});

describe("validator — ribbon schema checks (#41)", () => {
	const wrap = (inner: string) => `<RibbonDiffXml>${inner}</RibbonDiffXml>`;
	const rules = (enable: string, display = "") =>
		wrap(
			`<RuleDefinitions><TabDisplayRules/><DisplayRules>${display}</DisplayRules><EnableRules>${enable}</EnableRules></RuleDefinitions>`,
		);
	const messages = (xml: string, severity?: "warning") =>
		validateRibbonDiffXml(xml)
			.filter((e) => (severity ? e.severity === severity : e.severity !== "warning"))
			.map((e) => e.message);

	it("rejects an empty enable / display rule", () => {
		expect(messages(rules(`<EnableRule Id="a"/>`))).toEqual([
			expect.stringContaining("no steps"),
		]);
		expect(messages(rules("", `<DisplayRule Id="b"></DisplayRule>`))).toEqual([
			expect.stringContaining("no steps"),
		]);
	});

	it("rejects an OrRule with fewer than two <Or>", () => {
		expect(
			messages(
				rules(
					`<EnableRule Id="a"><OrRule><Or><FormStateRule State="Create"/></Or></OrRule></EnableRule>`,
				),
			),
		).toEqual([expect.stringContaining("at least 2 <Or>")]);
	});

	it("rejects a nested OrRule and an empty <Or>", () => {
		const msgs = messages(
			rules(
				`<EnableRule Id="a"><OrRule><Or><OrRule><Or><SkuRule Sku="Online"/></Or><Or><SkuRule Sku="Spla"/></Or></OrRule></Or><Or/></OrRule></EnableRule>`,
			),
		);
		expect(msgs.some((m) => m.includes("cannot contain another OrRule"))).toBe(true);
		expect(msgs.some((m) => m.includes("Empty <Or>"))).toBe(true);
	});

	it("does not mistake command rule references for empty rules", () => {
		const xml = wrap(
			`<CommandDefinitions><CommandDefinition Id="c"><EnableRules><EnableRule Id="x"/></EnableRules><DisplayRules><DisplayRule Id="y"/></DisplayRules><Actions/></CommandDefinition></CommandDefinitions>`,
		);
		expect(messages(xml)).toEqual([]);
	});

	it("warns (without blocking) on rule placement outside the XSD", () => {
		const xml = rules(
			`<EnableRule Id="a"><EntityPrivilegeRule PrivilegeType="Read" PrivilegeDepth="Basic"/><OrRule><Or><FeatureControlRule FeatureControlBit="x" ExpectedValue="true"/></Or><Or><HideIfDelveNotAvailableRule/></Or></OrRule></EnableRule>`,
			`<DisplayRule Id="b"><CustomRule FunctionName="f" Library="$webresource:a.js"/><SelectionCountRule Minimum="1"/></DisplayRule>`,
		);
		expect(messages(xml)).toEqual([]);
		const warnings = messages(xml, "warning");
		for (const tag of [
			"EntityPrivilegeRule",
			"FeatureControlRule",
			"HideIfDelveNotAvailableRule",
			"CustomRule",
			"SelectionCountRule",
		]) {
			expect(warnings.some((w) => w.includes(tag))).toBe(true);
		}
	});

	it("rejects a Name on JavaScriptFunction / CustomRule parameters", () => {
		const xml = wrap(
			`<CommandDefinitions><CommandDefinition Id="c"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="f" Library="$webresource:a.js"><StringParameter Name="n" Value="v"/></JavaScriptFunction></Actions></CommandDefinition></CommandDefinitions>`,
		);
		expect(messages(xml)).toEqual([expect.stringContaining("must not have a Name")]);
	});

	it("requires Name on Url parameters and a CrmNamedParameterValue", () => {
		const xml = wrap(
			`<CommandDefinitions><CommandDefinition Id="c"><EnableRules/><DisplayRules/><Actions><Url Address="/x"><StringParameter Value="v"/><CrmParameter Name="r" Value="SelectedControlAllItemReferences"/></Url></Actions></CommandDefinition></CommandDefinitions>`,
		);
		const msgs = messages(xml);
		expect(msgs.some((m) => m.includes("requires a Name"))).toBe(true);
		expect(msgs.some((m) => m.includes("not allowed in a <Url>"))).toBe(true);
	});

	it("rejects an unknown CrmParameter value", () => {
		const xml = wrap(
			`<CommandDefinitions><CommandDefinition Id="c"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="f" Library="$webresource:a.js"><CrmParameter Value="PrimaryEntity"/></JavaScriptFunction></Actions></CommandDefinition></CommandDefinitions>`,
		);
		expect(messages(xml)).toEqual([expect.stringContaining("not a valid CrmParameterValue")]);
	});

	it("rejects <Scalings>, a new tab without <Scaling> and a wrapped TabDisplayRule", () => {
		const xml = wrap(
			`<CustomActions><CustomAction Id="t" Location="Mscrm.Tabs._children"><CommandUIDefinition><Tab Id="T"><Groups Id="T.Groups"/></Tab></CommandUIDefinition></CustomAction></CustomActions>
			<RuleDefinitions><TabDisplayRules><TabDisplayRule TabCommand="T"><DisplayRules><EntityRule/></DisplayRules></TabDisplayRule></TabDisplayRules><DisplayRules/><EnableRules/></RuleDefinitions>
			<Scalings><Scaling TabId="T"/></Scalings>`,
		);
		const msgs = messages(xml);
		expect(msgs.some((m) => m.includes("<Scalings> is not allowed"))).toBe(true);
		expect(msgs.some((m) => m.includes("needs a <Scaling Id>"))).toBe(true);
		expect(msgs.some((m) => m.includes("<DisplayRules> wrapper"))).toBe(true);
	});
});

describe("control attributes by control type (#41)", () => {
	const withControl = (kind: RibbonButton["kind"]) =>
		generate(
			ribbon("Form", [
				{
					...existingTab,
					groups: [
						{
							...existingTab.groups[0],
							buttons: [
								{
									...button,
									kind,
									icon: "$webresource:new_/i.svg",
									image16: "$webresource:new_/i16.png",
									image32: "$webresource:new_/i32.png",
								},
							],
						},
					],
				},
			]),
			ribbon("Form", [existingTab]),
		);
	const control = (xml: string, tag: string) =>
		new DOMParser().parseFromString(xml, "application/xml").querySelector(tag)!;

	it.each([
		["textBox", "TextBox"],
		["comboBox", "ComboBox"],
	] as const)("%s has no LabelText or images", (kind, tag) => {
		const el = control(withControl(kind), tag);
		for (const a of ["LabelText", "ModernImage", "Image16by16", "Image32by32"]) {
			expect(el.hasAttribute(a)).toBe(false);
		}
	});

	it("checkBox keeps its label but has no images", () => {
		const el = control(withControl("checkBox"), "CheckBox");
		expect(el.hasAttribute("LabelText")).toBe(true);
		expect(el.hasAttribute("Image16by16")).toBe(false);
		expect(el.hasAttribute("ModernImage")).toBe(false);
	});

	it("a button keeps label and images", () => {
		const el = control(withControl("button"), "Button");
		expect(el.getAttribute("ModernImage")).toMatch(/^\$webresource:/);
		expect(el.hasAttribute("LabelText")).toBe(true);
	});
});

describe("rule placement for the picker (#41)", () => {
	it("follows RibbonTypes.xsd EnableRulesGroup / DisplayRulesGroup", () => {
		for (const k of [
			"CustomRule",
			"SelectionCountRule",
			"RecordPrivilegeRule",
			"OutlookItemTrackingRule",
		] as const) {
			expect(isRuleKindAllowed(k, "enable")).toBe(true);
			expect(isRuleKindAllowed(k, "display")).toBe(false);
		}
		for (const k of [
			"CrmOutlookClientVersionRule",
			"DeviceTypeRule",
			"EntityPrivilegeRule",
			"EntityPropertyRule",
			"FeatureControlRule",
			"FormEntityContextRule",
			"FormTypeRule",
			"HideForTabletExperienceRule",
			"MiscellaneousPrivilegeRule",
			"OptionSetRule",
			"OrganizationSettingRule",
			"OutlookRenderTypeRule",
			"ReferencingAttributeRequiredRule",
			"RelationshipTypeRule",
		] as const) {
			expect(isRuleKindAllowed(k, "enable")).toBe(false);
			expect(isRuleKindAllowed(k, "display")).toBe(true);
		}
		for (const k of [
			"EntityRule",
			"FormStateRule",
			"PageRule",
			"ValueRule",
			"SkuRule",
			"CommandClientTypeRule",
		] as const) {
			expect(isRuleKindAllowed(k, "enable")).toBe(true);
			expect(isRuleKindAllowed(k, "display")).toBe(true);
		}
	});

	it("never offers a nested OrRule or a RawRule", () => {
		expect(isRuleKindAllowed("OrRule", "enable", true)).toBe(false);
		expect(isRuleKindAllowed("OrRule", "enable")).toBe(true);
		expect(isRuleKindAllowed("RawRule", "display")).toBe(false);
	});
});
