/**
 * Pre-publish validation (#35): the RibbonDiffXml a publish would import is
 * checked the way Ribbon Workbench checks it — errors block the publish,
 * warnings don't.
 */
import { describe, it, expect, vi } from "vitest";
import {
	validatePublishRibbonDiff,
	webResourceReferences,
	droppedActionKinds,
	type PublishCheckCode,
	type PublishFinding,
	type PublishValidationContext,
} from "@/services/xmlValidator";
import { lookupWebResources } from "@/services/dataverse/webResourceService";
import {
	emptyRibbonDiffParts,
	parseRibbonDiffParts,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { parseRibbonXml } from "@/services/xmlParser";
import type { CommandDefinition, RibbonDefinition, ScalingDefinition } from "@/types/ribbon";

// Module re-imports and DOM parsing are slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts = emptyRibbonDiffParts();
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

// ── Fixture helpers ─────────────────────────────────────────────────────────

interface DiffSpec {
	customActions?: string[];
	commands?: string[];
	enableRules?: string[];
	displayRules?: string[];
	labels?: string[];
	templates?: string[];
}

const diff = (s: DiffSpec) => `<RibbonDiffXml>
  <CustomActions>${(s.customActions ?? []).join("")}</CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates">${(s.templates ?? []).join("")}</RibbonTemplates></Templates>
  <CommandDefinitions>${(s.commands ?? []).join("")}</CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules/>
    <DisplayRules>${(s.displayRules ?? []).join("")}</DisplayRules>
    <EnableRules>${(s.enableRules ?? []).join("")}</EnableRules>
  </RuleDefinitions>
  <LocLabels>${(s.labels ?? []).join("")}</LocLabels>
</RibbonDiffXml>`;

const ca = (id: string, location: string, inner: string, seq = 10) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
const button = (id: string, command: string, extra = "") =>
	`<Button Id="${id}" Command="${command}" Sequence="10" TemplateAlias="o1"${extra ? ` ${extra}` : ""}/>`;
const command = (id: string, rules = "") =>
	`<CommandDefinition Id="${id}"><EnableRules>${rules}</EnableRules><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:mxrm_/x.js" FunctionName="go"/></Actions></CommandDefinition>`;
const label = (id: string) =>
	`<LocLabel Id="${id}"><Titles><Title languagecode="1033" description="x"/></Titles></LocLabel>`;
const enableRule = (id: string, inner: string) => `<EnableRule Id="${id}">${inner}</EnableRule>`;
const displayRule = (id: string, inner: string) => `<DisplayRule Id="${id}">${inner}</DisplayRule>`;

const GROUP = "Mscrm.HomepageGrid.account.MainTab.Management";
const TAB = "Mscrm.HomepageGrid.account.MainTab";

const codes = (findings: PublishFinding[], code: PublishCheckCode) =>
	findings.filter((f) => f.code === code);
const only = (findings: PublishFinding[], code: PublishCheckCode) => {
	const found = codes(findings, code);
	expect(found).toHaveLength(1);
	return found[0];
};
const check = (spec: DiffSpec, context: PublishValidationContext = {}) =>
	validatePublishRibbonDiff(diff(spec), context);

// ── Baseline ────────────────────────────────────────────────────────────────

describe("validatePublishRibbonDiff — a clean RibbonDiffXml", () => {
	it("has no findings", () => {
		const findings = check(
			{
				customActions: [
					ca(
						"mxrm.B.CustomAction",
						`${GROUP}.Controls._children`,
						button(
							"mxrm.B",
							"mxrm.B.Command",
							'LabelText="$LocLabels:mxrm.B.LabelText"',
						),
					),
				],
				commands: [command("mxrm.B.Command", '<EnableRule Id="mxrm.B.Rule"/>')],
				enableRules: [enableRule("mxrm.B.Rule", '<SelectionCountRule Minimum="1"/>')],
				labels: [label("mxrm.B.LabelText")],
			},
			{
				publisherPrefix: "mxrm",
				newKeys: [
					"customActions:ca:mxrm.B.CustomAction",
					"commandDefinitions:mxrm.B.Command",
				],
				known: {
					commandIds: [],
					enableRuleIds: [],
					displayRuleIds: [],
					elementIds: [GROUP],
				},
			},
		);
		expect(findings).toEqual([]);
	});

	it("reports unparseable XML as an error", () => {
		const [f] = validatePublishRibbonDiff("<RibbonDiffXml><CustomActions>");
		expect(f).toMatchObject({ severity: "error", code: "xml-parse" });
	});
});

// ── Dropped action kinds ────────────────────────────────────────────────────

describe("dropped action kinds", () => {
	const powerFx: CommandDefinition = {
		id: "mxrm.B.Command",
		enableRules: [],
		displayRules: [],
		actions: [
			{
				kind: "powerFx",
				expression: "Notify(1)",
			} as unknown as CommandDefinition["actions"][number],
		],
	};

	it("lists the kinds a classic command can't run", () => {
		expect(droppedActionKinds(powerFx)).toEqual(["powerFx"]);
		expect(droppedActionKinds({ ...powerFx, actions: [] })).toEqual([]);
	});

	it("is an error for a command this publish writes", () => {
		const f = only(
			check({ commands: [command("mxrm.B.Command")] }, { commands: [powerFx] }),
			"dropped-action",
		);
		expect(f.severity).toBe("error");
		expect(f.message).toMatch(/Power Fx/);
		expect(f.elementId).toBe("mxrm.B.Command");
	});

	it("is not reported for a command the publish leaves as it is", () => {
		const findings = check(
			{ commands: [command("mxrm.B.Command")] },
			{ commands: [powerFx], changedKeys: [] },
		);
		expect(codes(findings, "dropped-action")).toEqual([]);
	});
});

// ── Flyout / split buttons without a Menu ───────────────────────────────────

describe("FlyoutAnchor / SplitButton without a Menu", () => {
	const flyout = (tag: string, menu: string) =>
		ca(
			"mxrm.F.CustomAction",
			`${GROUP}.Controls._children`,
			`<${tag} Id="mxrm.F" Command="mxrm.F.Command" Sequence="10" TemplateAlias="o1">${menu}</${tag}>`,
		);

	it("is an error for a flyout the generator would emit without its Menu", () => {
		const f = only(check({ customActions: [flyout("FlyoutAnchor", "")] }), "menu-missing");
		expect(f).toMatchObject({ severity: "error", elementId: "mxrm.F" });
	});

	it("covers split buttons too", () => {
		expect(
			codes(check({ customActions: [flyout("SplitButton", "")] }), "menu-missing"),
		).toHaveLength(1);
	});

	it("accepts a flyout that has a Menu", () => {
		const menu = `<Menu Id="mxrm.F.Menu"><MenuSection Id="mxrm.F.Section" Sequence="10"><Controls Id="mxrm.F.Section.Controls">${button("mxrm.F.Item", "mxrm.F.Command")}</Controls></MenuSection></Menu>`;
		expect(
			codes(check({ customActions: [flyout("FlyoutAnchor", menu)] }), "menu-missing"),
		).toEqual([]);
	});

	it("is only a warning when the flyout is already published", () => {
		const f = only(
			check({ customActions: [flyout("FlyoutAnchor", "")] }, { changedKeys: [] }),
			"menu-missing",
		);
		expect(f.severity).toBe("warning");
		expect(f.message).toMatch(/already in the published customizations/);
	});
});

// ── Commands / rules referenced but not defined ─────────────────────────────

describe("commands and rules referenced but not defined", () => {
	const known = {
		commandIds: ["Mscrm.NewRecordFromGrid"],
		enableRuleIds: ["Mscrm.ShowOnGrid"],
		displayRuleIds: [],
	};

	it("is an error for a button whose command is defined nowhere", () => {
		const f = only(
			check(
				{
					customActions: [
						ca(
							"mxrm.B.CustomAction",
							`${GROUP}.Controls._children`,
							button("mxrm.B", "mxrm.Missing.Command"),
						),
					],
				},
				{ known },
			),
			"undefined-command",
		);
		expect(f).toMatchObject({ severity: "error", elementId: "mxrm.B" });
	});

	it("accepts a command defined in the merged layer or in the loaded ribbon", () => {
		const findings = check(
			{
				customActions: [
					ca(
						"mxrm.B.CustomAction",
						`${GROUP}.Controls._children`,
						button("mxrm.B", "mxrm.B.Command"),
					),
					ca(
						"mxrm.C.CustomAction",
						`${GROUP}.Controls._children`,
						button("mxrm.C", "Mscrm.NewRecordFromGrid"),
					),
				],
				commands: [command("mxrm.B.Command")],
			},
			{ known },
		);
		expect(codes(findings, "undefined-command")).toEqual([]);
	});

	it("only warns about an unknown platform command (it can exist outside the loaded ribbon)", () => {
		const f = only(
			check(
				{
					customActions: [
						ca(
							"mxrm.B.CustomAction",
							`${GROUP}.Controls._children`,
							button("mxrm.B", "Mscrm.SomethingElse"),
						),
					],
				},
				{ known },
			),
			"undefined-command",
		);
		expect(f.severity).toBe("warning");
	});

	it("is skipped without the loaded ribbon", () => {
		const findings = check({
			customActions: [
				ca(
					"mxrm.B.CustomAction",
					`${GROUP}.Controls._children`,
					button("mxrm.B", "mxrm.Missing"),
				),
			],
		});
		expect(codes(findings, "undefined-command")).toEqual([]);
	});

	it("is an error for a command whose enable or display rule is defined nowhere", () => {
		const findings = check(
			{
				commands: [
					`<CommandDefinition Id="mxrm.B.Command"><EnableRules><EnableRule Id="mxrm.Missing.EnableRule"/><EnableRule Id="Mscrm.ShowOnGrid"/></EnableRules><DisplayRules><DisplayRule Id="mxrm.Missing.DisplayRule"/></DisplayRules><Actions/></CommandDefinition>`,
				],
			},
			{ known },
		);
		const rules = codes(findings, "undefined-rule");
		expect(rules.map((f) => f.severity)).toEqual(["error", "error"]);
		expect(rules.map((f) => f.message).join()).toMatch(
			/enable rule mxrm\.Missing\.EnableRule.*display rule mxrm\.Missing\.DisplayRule/,
		);
	});

	it("accepts rules defined in the merged layer", () => {
		const findings = check(
			{
				commands: [command("mxrm.B.Command", '<EnableRule Id="mxrm.B.Rule"/>')],
				enableRules: [enableRule("mxrm.B.Rule", '<SelectionCountRule Minimum="1"/>')],
			},
			{ known },
		);
		expect(codes(findings, "undefined-rule")).toEqual([]);
	});
});

// ── Rule placement ──────────────────────────────────────────────────────────

describe("display-only kinds in enable rules and enable-only kinds in display rules", () => {
	it("is an error for a display-only kind in an enable rule", () => {
		const f = only(
			check({ enableRules: [enableRule("mxrm.E", '<FormTypeRule Type="Main"/>')] }),
			"rule-placement",
		);
		expect(f).toMatchObject({ severity: "error", elementId: "mxrm.E" });
		expect(f.message).toMatch(/FormTypeRule.*only allows in display rules/);
	});

	it("is an error for an enable-only kind in a display rule, also inside an OrRule", () => {
		const findings = check({
			displayRules: [
				displayRule("mxrm.D", '<SelectionCountRule Minimum="1"/>'),
				displayRule(
					"mxrm.D2",
					'<OrRule><Or><CustomRule FunctionName="f" Library="$webresource:mxrm_/x.js"/></Or><Or><FormStateRule State="Create"/></Or></OrRule>',
				),
			],
		});
		expect(codes(findings, "rule-placement").map((f) => f.elementId)).toEqual([
			"mxrm.D",
			"mxrm.D2",
		]);
	});

	it("accepts kinds both rule types allow (EntityRule, FormStateRule, ValueRule)", () => {
		const both =
			'<EntityRule EntityName="account"/><FormStateRule State="Existing"/><ValueRule Field="name" Value="x"/>';
		const findings = check({
			enableRules: [enableRule("mxrm.E", both)],
			displayRules: [displayRule("mxrm.D", both)],
		});
		expect(codes(findings, "rule-placement")).toEqual([]);
	});

	it("only warns about a rule already in the published layer", () => {
		const f = only(
			check(
				{ displayRules: [displayRule("mxrm.D", '<SelectionCountRule Minimum="1"/>')] },
				{ changedKeys: [] },
			),
			"rule-placement",
		);
		expect(f.severity).toBe("warning");
	});
});

// ── Publisher prefix ────────────────────────────────────────────────────────

describe("ids without the publisher prefix", () => {
	const spec: DiffSpec = {
		customActions: [
			ca(
				"new.B.CustomAction",
				`${GROUP}.Controls._children`,
				button("new.B", "mxrm.B.Command"),
			),
			ca(
				"Mscrm.HomepageGrid.account.Edit.Override.CustomAction",
				"Mscrm.HomepageGrid.account.Edit",
				button(
					"Mscrm.HomepageGrid.account.Edit",
					"Mscrm.EditSelectedRecord",
					'LabelText="$LocLabels:Mscrm.HomepageGrid.account.Edit.LabelText"',
				),
			),
		],
		commands: [command("mxrm.B.Command")],
		labels: [label("Mscrm.HomepageGrid.account.Edit.LabelText")],
	};
	const keys = [
		"customActions:ca:new.B.CustomAction",
		"customActions:ca:Mscrm.HomepageGrid.account.Edit.Override.CustomAction",
		"commandDefinitions:mxrm.B.Command",
		"locLabels:Mscrm.HomepageGrid.account.Edit.LabelText",
	];
	const context: PublishValidationContext = {
		publisherPrefix: "mxrm",
		newKeys: keys,
		known: {
			elementIds: [GROUP, "Mscrm.HomepageGrid.account.Edit"],
			commandIds: ["Mscrm.EditSelectedRecord"],
		},
	};

	it("warns for new ids CBS creates without the prefix", () => {
		const found = codes(check(spec, context), "id-prefix");
		expect(found.map((f) => f.elementId)).toEqual(["new.B.CustomAction", "new.B"]);
		expect(found.every((f) => f.severity === "warning")).toBe(true);
	});

	it("ignores ids named after existing elements and elements already in the layer", () => {
		expect(codes(check(spec, { ...context, newKeys: [] }), "id-prefix")).toEqual([]);
	});
});

// ── $LocLabels ──────────────────────────────────────────────────────────────

describe("$LocLabels references", () => {
	const spec = (labels: string[]): DiffSpec => ({
		customActions: [
			ca(
				"mxrm.B.CustomAction",
				`${GROUP}.Controls._children`,
				button(
					"mxrm.B",
					"mxrm.B.Command",
					'LabelText="$LocLabels:mxrm.B.LabelText" ToolTipTitle="$LocLabels:mxrm.B.ToolTip"',
				),
			),
		],
		labels,
	});

	it("is an error when the merged XML has no LocLabel for a reference", () => {
		const f = only(check(spec([label("mxrm.B.LabelText")])), "loclabel-missing");
		expect(f).toMatchObject({ severity: "error", elementId: "mxrm.B" });
		expect(f.message).toMatch(/ToolTipTitle references \$LocLabels:mxrm\.B\.ToolTip/);
	});

	it("accepts references that all have a LocLabel", () => {
		expect(
			codes(
				check(spec([label("mxrm.B.LabelText"), label("mxrm.B.ToolTip")])),
				"loclabel-missing",
			),
		).toEqual([]);
	});

	it("only warns about a reference already published", () => {
		const f = only(
			check(spec([label("mxrm.B.LabelText")]), { changedKeys: [] }),
			"loclabel-missing",
		);
		expect(f.severity).toBe("warning");
	});
});

// ── $webresource ────────────────────────────────────────────────────────────

describe("$webresource references", () => {
	const spec: DiffSpec = {
		customActions: [
			ca(
				"mxrm.B.CustomAction",
				`${GROUP}.Controls._children`,
				button("mxrm.B", "mxrm.B.Command", 'ModernImage="$webresource:mxrm_/icons/b.svg"'),
			),
		],
		commands: [
			command("mxrm.B.Command"),
			`<CommandDefinition Id="mxrm.C.Command"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction Library="$webresource:Main_system_library.js" FunctionName="XrmCore.Commands.Open"/><JavaScriptFunction Library="$webresource:other_/managed.js" FunctionName="f"/></Actions></CommandDefinition>`,
		],
	};

	it("lists the referenced names once, without the platform library", () => {
		expect(webResourceReferences(diff(spec))).toEqual([
			"mxrm_/icons/b.svg",
			"mxrm_/x.js",
			"other_/managed.js",
		]);
	});

	it("warns about a missing web resource and one outside the solution", () => {
		const findings = check(spec, {
			webResources: {
				"mxrm_/icons/b.svg": { exists: false, inSolution: false },
				"mxrm_/x.js": { exists: true, inSolution: false, managed: false },
				"other_/managed.js": { exists: true, inSolution: false, managed: true },
			},
		});
		expect(only(findings, "webresource-missing")).toMatchObject({
			severity: "warning",
			elementId: "mxrm.B",
		});
		expect(only(findings, "webresource-not-in-solution").message).toMatch(/mxrm_\/x\.js/);
	});

	it("accepts web resources in the solution, and doesn't check names that weren't looked up", () => {
		const findings = check(spec, {
			webResources: { "mxrm_/x.js": { exists: true, inSolution: true } },
		});
		expect(findings.filter((f) => f.code.startsWith("webresource"))).toEqual([]);
	});

	it("looks the names up in one query and their solution membership in another", async () => {
		const queries: string[] = [];
		const api = {
			queryData: vi.fn(async (q: string) => {
				queries.push(q);
				if (q.startsWith("webresourceset")) {
					return {
						value: [
							{ webresourceid: "AAA", name: "mxrm_/X.js", ismanaged: false },
							{ webresourceid: "bbb", name: "other_/managed.js", ismanaged: true },
						],
					};
				}
				return { value: [{ objectid: "aaa" }] };
			}),
		};
		const result = await lookupWebResources(
			api as unknown as Pick<DataverseAPI.API, "queryData">,
			["mxrm_/x.js", "MXRM_/x.js", "other_/managed.js", "o'brien.js"],
			"{11111111-2222-3333-4444-555555555555}",
		);
		expect(queries).toHaveLength(2);
		expect(queries[0]).toContain(
			"name eq 'mxrm_/x.js' or name eq 'other_/managed.js' or name eq 'o''brien.js'",
		);
		expect(queries[1]).toContain(
			"_solutionid_value eq 11111111-2222-3333-4444-555555555555 and componenttype eq 61",
		);
		expect(result).toEqual({
			"mxrm_/x.js": { exists: true, inSolution: true, managed: false },
			"other_/managed.js": { exists: true, inSolution: false, managed: true },
			"o'brien.js": { exists: false, inSolution: false },
		});
	});
});

// ── Scaling ─────────────────────────────────────────────────────────────────

/** A real out-of-the-box tab's scaling (account home grid, verified live). */
const REAL_SCALING: ScalingDefinition = {
	tabId: TAB,
	maxSizes: [10, 20, 30, 40, 50, 60, 61].map((sequence, i) => ({
		id: `${TAB}.Scaling.MaxSize${i}`,
		groupId: `${TAB}.G${i}`,
		size: "LargeLarge",
		sequence,
	})),
	scales: [80, 100, 110, 120, 130, 140, 150, 160, 170].map((sequence, i) => ({
		id: `${TAB}.Scaling.Scale${i}`,
		groupId: `${TAB}.G${i % 7}`,
		size: "Popup",
		sequence,
	})),
};

const maxSizeAction = (groupId: string, sequence: number, size = "LargeLarge") =>
	ca(
		`${groupId}.MaxSize.CustomAction`,
		`${TAB}.Scaling._children`,
		`<MaxSize Id="${groupId}.MaxSize" GroupId="${groupId}" Sequence="${sequence}" Size="${size}"/>`,
		sequence,
	);

describe("scaling", () => {
	it("is an error when a new MaxSize takes the Sequence of an existing Scale (80)", () => {
		const f = only(
			check(
				{ customActions: [maxSizeAction("mxrm.NewGroup", 80)] },
				{ tabScaling: { [TAB]: REAL_SCALING } },
			),
			"scaling-collision",
		);
		expect(f.severity).toBe("error");
		expect(f.elementId).toBe("mxrm.NewGroup.MaxSize");
		expect(f.message).toMatch(
			/MaxSize mxrm\.NewGroup\.MaxSize and Scale .*Scale0|Scale .*Scale0 and MaxSize mxrm\.NewGroup\.MaxSize/,
		);
		expect(f.message).toMatch(/Sequence 80/);
	});

	it("accepts a new MaxSize on a free Sequence", () => {
		expect(
			codes(
				check(
					{ customActions: [maxSizeAction("mxrm.NewGroup", 62)] },
					{ tabScaling: { [TAB]: REAL_SCALING } },
				),
				"scaling-collision",
			),
		).toEqual([]);
	});

	it("doesn't count a layer step that is also in the loaded ribbon as a collision with itself", () => {
		const loaded = {
			...REAL_SCALING,
			maxSizes: [
				...REAL_SCALING.maxSizes,
				{
					id: "mxrm.NewGroup.MaxSize",
					groupId: "mxrm.NewGroup",
					size: "LargeLarge",
					sequence: 62,
				},
			],
		};
		expect(
			codes(
				check(
					{ customActions: [maxSizeAction("mxrm.NewGroup", 62)] },
					{ tabScaling: { [TAB]: loaded } },
				),
				"scaling-collision",
			),
		).toEqual([]);
	});

	it("ignores collisions only between the platform's own steps", () => {
		const loaded = {
			...REAL_SCALING,
			scales: [
				...REAL_SCALING.scales,
				{ id: "Other", groupId: "g", size: "Popup", sequence: 80 },
			],
		};
		expect(codes(check({}, { tabScaling: { [TAB]: loaded } }), "scaling-collision")).toEqual(
			[],
		);
	});

	it("checks the inline scaling of a new tab", () => {
		const tab = ca(
			"mxrm.Tab.CustomAction",
			"Mscrm.Tabs._children",
			`<Tab Id="mxrm.Tab" Title="t" Sequence="500"><Scaling Id="mxrm.Tab.Scaling"><MaxSize Id="mxrm.Tab.G1.MaxSize" GroupId="mxrm.Tab.G1" Sequence="10" Size="LargeLarge"/><Scale Id="mxrm.Tab.G1.Scale" GroupId="mxrm.Tab.G1" Sequence="10" Size="Popup"/></Scaling><Groups Id="mxrm.Tab.Groups"><Group Id="mxrm.Tab.G1" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="mxrm.Tab.G1.Controls"/></Group></Groups></Tab>`,
		);
		expect(only(check({ customActions: [tab] }), "scaling-collision").message).toMatch(
			/tab mxrm\.Tab/,
		);
	});

	it("warns when a MaxSize Size isn't a layout of the group's template", () => {
		const context: PublishValidationContext = {
			groupTemplates: { "mxrm.NewGroup": "Flexible2" },
			templateLayouts: {
				"Mscrm.Templates.Flexible2": ["LargeLarge", "LargeMedium", "Popup"],
			},
		};
		const f = only(
			check({ customActions: [maxSizeAction("mxrm.NewGroup", 62, "Large")] }, context),
			"scaling-size",
		);
		expect(f.severity).toBe("warning");
		expect(f.message).toMatch(/Size "Large".*Mscrm\.Templates\.Flexible2/);
		expect(
			codes(
				check(
					{ customActions: [maxSizeAction("mxrm.NewGroup", 62, "LargeMedium")] },
					context,
				),
				"scaling-size",
			),
		).toEqual([]);
		// Unknown template: not checked.
		expect(
			codes(
				check({ customActions: [maxSizeAction("mxrm.NewGroup", 62, "Large")] }),
				"scaling-size",
			),
		).toEqual([]);
	});

	it("reads group templates and layouts from the merged XML too", () => {
		const group = ca(
			"mxrm.NewGroup.CustomAction",
			`${TAB}.Groups._children`,
			`<Group Id="mxrm.NewGroup" Sequence="62" Template="mxrm.Templates.Custom"><Controls Id="mxrm.NewGroup.Controls"/></Group>`,
		);
		const template = `<GroupTemplate Id="mxrm.Templates.Custom"><Layout Title="Big"/><Layout Title="Popup"/></GroupTemplate>`;
		const f = only(
			check({
				customActions: [group, maxSizeAction("mxrm.NewGroup", 62, "LargeLarge")],
				templates: [template],
			}),
			"scaling-size",
		);
		expect(f.message).toMatch(/\(Big, Popup\)/);
	});
});

// ── Duplicate ids ───────────────────────────────────────────────────────────

describe("duplicate control ids", () => {
	it("is an error when two CustomActions add the same control id", () => {
		const f = only(
			check({
				customActions: [
					ca(
						"mxrm.B.CustomAction",
						`${GROUP}.Controls._children`,
						button("mxrm.B", "mxrm.B.Command"),
					),
					ca(
						"mxrm.B2.CustomAction",
						`${GROUP}.Controls._children`,
						button("mxrm.B", "mxrm.B.Command"),
					),
				],
			}),
			"duplicate-id",
		);
		expect(f).toMatchObject({ severity: "error", elementId: "mxrm.B" });
	});

	it("is an error when a new control reuses an id the ribbon already has", () => {
		const f = only(
			check(
				{
					customActions: [
						ca(
							"mxrm.B.CustomAction",
							`${GROUP}.Controls._children`,
							button("Mscrm.HomepageGrid.account.Edit", "mxrm.B.Command"),
						),
					],
				},
				{
					newKeys: ["customActions:ca:mxrm.B.CustomAction"],
					known: { elementIds: ["Mscrm.HomepageGrid.account.Edit"] },
				},
			),
			"duplicate-id",
		);
		expect(f.severity).toBe("error");
	});

	it("accepts an override, which redefines an existing control on purpose", () => {
		const findings = check(
			{
				customActions: [
					ca(
						"x.Override.CustomAction",
						"Mscrm.HomepageGrid.account.Edit",
						button("Mscrm.HomepageGrid.account.Edit", "Mscrm.EditSelectedRecord"),
					),
				],
			},
			{
				newKeys: ["customActions:ca:x.Override.CustomAction"],
				known: { elementIds: ["Mscrm.HomepageGrid.account.Edit"] },
			},
		);
		expect(codes(findings, "duplicate-id")).toEqual([]);
	});
});

// ── Loaded scaling / templates and the publish pipeline ─────────────────────

const T = "account";
const LOADED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon>
<Tabs>
  <Tab Id="${TAB}" Command="${TAB}" Sequence="10">
    <Scaling Id="${TAB}.Scaling">
${REAL_SCALING.maxSizes.map((s) => `      <MaxSize Id="${s.id}" GroupId="${s.groupId}" Sequence="${s.sequence}" Size="${s.size}"/>`).join("\n")}
${REAL_SCALING.scales.map((s) => `      <Scale Id="${s.id}" GroupId="${s.groupId}" Sequence="${s.sequence}" Size="${s.size}"/>`).join("\n")}
    </Scaling>
    <Groups Id="${TAB}.Groups">
      <Group Id="${GROUP}" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${GROUP}.Controls">
        <Button Id="Mscrm.HomepageGrid.${T}.NewRecord" Command="Mscrm.NewRecordFromGrid" Sequence="10" LabelText="$Resources:New" TemplateAlias="o1"/>
      </Controls></Group>
    </Groups>
  </Tab>
</Tabs>
</Ribbon></UI>
<Templates><RibbonTemplates Id="Mscrm.Templates">
  <GroupTemplate Id="Mscrm.Templates.Flexible2"><Layout Title="LargeLarge"/><Layout Title="LargeMedium"/><Layout Title="Popup"/></GroupTemplate>
  <GroupTemplate Id="Mscrm.Templates.Unused"><Layout Title="Large"/></GroupTemplate>
</RibbonTemplates></Templates>
<CommandDefinitions><CommandDefinition Id="Mscrm.NewRecordFromGrid"><EnableRules/><DisplayRules/><Actions/></CommandDefinition></CommandDefinitions>
<RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

/** The loaded ribbon plus a new group at Sequence 80 (the generator gives it a MaxSize at the group's Sequence). */
function withNewGroup(sequence: number): { current: RibbonDefinition; baseline: RibbonDefinition } {
	const baseline = parseRibbonXml(LOADED, "HomepageGrid", T).ribbon;
	const current: RibbonDefinition = JSON.parse(JSON.stringify(baseline));
	current.tabs[0].groups.push({
		id: "mxrm.account.NewGroup",
		label: "New group",
		sequence,
		template: "Mscrm.Templates.Flexible2",
		buttons: [],
	});
	return { current, baseline };
}

const PLAN = {
	editedCommandIds: [],
	editedEnableRuleIds: [],
	editedDisplayRuleIds: [],
	deletedButtonIds: [],
	unhiddenButtonIds: [],
};

describe("loaded scaling and templates", () => {
	it("are parsed from the merged ribbon", () => {
		const ribbon = parseRibbonXml(LOADED, "HomepageGrid", T).ribbon;
		expect(ribbon.scalingByTab?.[TAB].maxSizes.map((s) => s.sequence)).toEqual([
			10, 20, 30, 40, 50, 60, 61,
		]);
		expect(ribbon.scalingByTab?.[TAB].scales.map((s) => s.sequence)).toEqual([
			80, 100, 110, 120, 130, 140, 150, 160, 170,
		]);
		// Only templates the groups use.
		expect(ribbon.templateLayouts).toEqual({
			"Mscrm.Templates.Flexible2": ["LargeLarge", "LargeMedium", "Popup"],
		});
	});
});

describe("checkBeforePublish / publishRibbon", () => {
	it("reports the collision of a new group's MaxSize with an existing Scale in the merged XML", async () => {
		layer = emptyRibbonDiffParts();
		const { checkBeforePublish } = await import("@/services/dataverse/publishService");
		const lookup = vi.fn(async () => ({}));
		const { findings, xml } = await checkBeforePublish(
			{
				entity: { logicalName: T },
				locations: [withNewGroup(80)],
				commands: [],
				enableRules: [],
				displayRules: [],
				locLabels: [],
				plan: PLAN,
				languageCode: 1033,
				baselineCommands: [],
				baselineEnableRules: [],
				baselineDisplayRules: [],
				publisherPrefix: "mxrm",
			},
			{ lookupWebResources: lookup },
		);
		expect(xml).toContain('Sequence="80" Size="LargeLarge"');
		const f = only(findings, "scaling-collision");
		expect(f.severity).toBe("error");
		expect(f.message).toMatch(/Sequence 80/);
		// Nothing references a web resource: no lookup.
		expect(lookup).not.toHaveBeenCalled();
	});

	it("passes a new group on a free Sequence", async () => {
		layer = emptyRibbonDiffParts();
		const { checkBeforePublish } = await import("@/services/dataverse/publishService");
		const { findings } = await checkBeforePublish({
			entity: { logicalName: T },
			locations: [withNewGroup(62)],
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			plan: PLAN,
			languageCode: 1033,
			publisherPrefix: "mxrm",
		});
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
	});

	it("checks the merged layer: a problem only in an element already published is a warning", async () => {
		// The existing unmanaged layer has a flyout without a Menu (e.g. written by another tool).
		layer = parseRibbonDiffParts(
			diff({
				customActions: [
					ca(
						"mxrm.F.CustomAction",
						`${GROUP}.Controls._children`,
						`<FlyoutAnchor Id="mxrm.F" Command="Mscrm.NewRecordFromGrid" Sequence="20" TemplateAlias="o1"/>`,
					),
				],
			}),
		);
		const { checkBeforePublish } = await import("@/services/dataverse/publishService");
		const { findings, xml } = await checkBeforePublish({
			entity: { logicalName: T },
			locations: [withNewGroup(62)],
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			plan: PLAN,
			languageCode: 1033,
		});
		expect(xml).toContain('<FlyoutAnchor Id="mxrm.F"');
		expect(only(findings, "menu-missing")).toMatchObject({
			severity: "warning",
			elementId: "mxrm.F",
		});
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
	});

	it("publishRibbon refuses to import when the check finds an error", async () => {
		layer = emptyRibbonDiffParts();
		const deploySolution = vi.fn();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
			deploySolution,
			queryData: vi.fn(async () => ({ value: [] })),
		};
		vi.resetModules();
		const { publishRibbon } = await import("@/services/dataverse/publishService");
		await expect(
			publishRibbon({
				entity: { logicalName: T },
				locations: [withNewGroup(80)],
				commands: [],
				enableRules: [],
				displayRules: [],
				locLabels: [],
				plan: PLAN,
				languageCode: 1033,
				solution: {
					uniqueName: "S",
					friendlyName: "S",
					version: "1.0.0.0",
					publisherUniqueName: "p",
					publisherName: "P",
					publisherPrefix: "mxrm",
				},
				busy: { sleep: async () => undefined },
			}),
		).rejects.toThrow(/pre-publish check found 1 error.*Sequence 80/);
		expect(deploySolution).not.toHaveBeenCalled();
	});
});
