import { describe, it, expect } from "vitest";
import {
	appliesToApp,
	buildAppList,
	buildModernLocationModel,
	buildModernTree,
	commandBarTabId,
	classicIdCandidates,
	describeModernCommand,
	describeOverride,
	filterModernCommands,
	findClassicOverrides,
	flattenModernTree,
	mapAppActionRow,
	mapAppActionRows,
	modernLocationsFor,
	overrideNote,
	placeModernCommands,
	scopeToContainingApps,
	type ClassicControl,
} from "@/services/modernCommands";
import type { ModernCommand } from "@/types/modernCommand";

const FV = "@OData.Community.Display.V1.FormattedValue";
const CONTACT_MD = "608861bc-50a4-4c5f-a02c-21fe1943e2cf";
const SALES = "11111111-1111-1111-1111-111111111111";
const SERVICE = "22222222-2222-2222-2222-222222222222";

let n = 0;
/** An appaction row as the Web API returns it (defaults: contact main-grid button in no app). */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
	n += 1;
	const id = `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`;
	return {
		appactionid: id,
		name: `cmd${n}`,
		uniquename: `new_cmd${n}`,
		buttonlabeltext: `Command ${n}`,
		_appmoduleid_value: null,
		context: 1,
		_contextentity_value: CONTACT_MD,
		contextvalue: "contact",
		location: 1,
		type: 0,
		sequence: 10,
		hidden: false,
		isdisabled: false,
		origin: 0,
		ismanaged: false,
		visibilitytype: 0,
		onclickeventtype: 0,
		...over,
	};
}

const cmd = (over: Record<string, unknown> = {}) => mapAppActionRow(row(over))!;
const contact = { logicalName: "contact", metadataId: CONTACT_MD };

describe("mapAppActionRow", () => {
	it("maps the documented appaction columns to the view model", () => {
		const c = mapAppActionRow(
			row({
				appactionid: "ABCDEF00-0000-0000-0000-000000000001",
				buttonlabeltext: "Send survey",
				buttontooltiptitle: "Survey",
				buttontooltipdescription: "Send the NPS survey",
				buttonaccessibilitytext: "Send survey to contact",
				_appmoduleid_value: SALES.toUpperCase(),
				[`_appmoduleid_value${FV}`]: "Sales Hub",
				location: 0,
				type: 2,
				sequence: 42.5,
				hidden: true,
				isdisabled: false,
				origin: 1,
				ismanaged: true,
				fonticon: "Send",
				_parentappactionid_value: null,
				onclickeventtype: 2,
				onclickeventjavascriptfunctionname: "Survey.send",
				onclickeventjavascriptparameters: '[{"type":5}]',
				_onclickeventjavascriptwebresourceid_value: "33333333-3333-3333-3333-333333333333",
				[`_onclickeventjavascriptwebresourceid_value${FV}`]: "new_/survey.js",
				visibilitytype: 1,
				visibilityformulacomponentlibrary: "new_contactcommands_xyz",
				visibilityformulacomponentname: "Main_Form",
				visibilityformulafunctionname: "SendSurvey_Visible",
				appaction_appactionrule_classicrules: [
					{
						appactionruleid: "44444444-4444-4444-4444-444444444444",
						name: "Mscrm.CanWriteContact",
						type: 0,
					},
					{
						appactionruleid: "55555555-5555-5555-5555-555555555555",
						name: "Mscrm.HideOnModern",
						type: 1,
					},
				],
			}),
		)!;
		expect(c).toMatchObject({
			id: "abcdef00-0000-0000-0000-000000000001",
			label: "Send survey",
			tooltipTitle: "Survey",
			tooltipDescription: "Send the NPS survey",
			accessibilityText: "Send survey to contact",
			appModuleId: SALES,
			appName: "Sales Hub",
			scope: "entity",
			contextValue: "contact",
			contextEntityId: CONTACT_MD,
			location: 0,
			type: "split",
			sequence: 42.5,
			hidden: true,
			disabled: false,
			origin: "migrated",
			managed: true,
			fontIcon: "Send",
			parentId: null,
			action: "javascript",
			jsFunctionName: "Survey.send",
			jsWebResourceName: "new_/survey.js",
			visibility: "formula",
			visibilityFormula: {
				componentLibrary: "new_contactcommands_xyz",
				componentName: "Main_Form",
				functionName: "SendSurvey_Visible",
			},
		});
		expect(c.classicRules).toEqual([
			{
				id: "44444444-4444-4444-4444-444444444444",
				name: "Mscrm.CanWriteContact",
				uniqueName: undefined,
				kind: "enable",
			},
			{
				id: "55555555-5555-5555-5555-555555555555",
				name: "Mscrm.HideOnModern",
				uniqueName: undefined,
				kind: "display",
			},
		]);
	});

	it("maps every type / origin / visibility option and falls back for sequence and label", () => {
		expect([0, 1, 2, 3, 9].map((type) => cmd({ type }).type)).toEqual([
			"button",
			"dropdown",
			"split",
			"group",
			"button",
		]);
		expect([0, 1, 2].map((origin) => cmd({ origin }).origin)).toEqual([
			"default",
			"migrated",
			"enhancedMigrated",
		]);
		expect([0, 1, 2].map((v) => cmd({ visibilitytype: v }).visibility)).toEqual([
			"none",
			"formula",
			"classicRules",
		]);
		expect([0, 1, 2].map((v) => cmd({ onclickeventtype: v }).action)).toEqual([
			"none",
			"formula",
			"javascript",
		]);
		expect(cmd({ sequence: null, buttonsequencepriority: 7 }).sequence).toBe(7);
		expect(cmd({ sequence: null }).sequence).toBe(0);
		expect(cmd({ buttonlabeltext: null, name: "Fallback" }).label).toBe("Fallback");
		expect(cmd({ context: 0 }).scope).toBe("all");
		expect(cmd({}).appModuleId).toBeNull();
	});

	it("drops rows without an id or location and de-duplicates", () => {
		expect(mapAppActionRow({ name: "x", location: 1 })).toBeNull();
		expect(mapAppActionRow(row({ location: null }))).toBeNull();
		const r = row();
		expect(mapAppActionRows([r, { ...r }, { name: "no id" }])).toHaveLength(1);
	});
});

describe("filterModernCommands", () => {
	const all = [
		cmd({ name: "grid", location: 1 }),
		cmd({ name: "form", location: 0 }),
		cmd({ name: "subgrid", location: 2 }),
		cmd({ name: "associated", location: 3 }),
		cmd({ name: "quick", location: 4 }),
		cmd({ name: "dashboard", location: 6 }),
		cmd({ name: "sales", location: 1, _appmoduleid_value: SALES }),
		cmd({ name: "service", location: 1, _appmoduleid_value: SERVICE }),
		cmd({
			name: "global",
			location: 1,
			context: 0,
			_contextentity_value: null,
			contextvalue: null,
		}),
		cmd({
			name: "account",
			location: 1,
			_contextentity_value: "99999999-9999-9999-9999-999999999999",
			contextvalue: "account",
		}),
		cmd({ name: "byvalue", location: 1, _contextentity_value: null, contextvalue: "Contact" }),
	];
	const names = (
		location: Parameters<typeof filterModernCommands>[1]["location"],
		appFilter = "all",
	) =>
		filterModernCommands(all, { location, appFilter, table: contact })
			.map((c) => c.name)
			.sort();

	it("maps CBS locations to appaction locations", () => {
		expect(modernLocationsFor("HomepageGrid")).toEqual([1]);
		expect(modernLocationsFor("SubGrid")).toEqual([2, 3]);
		expect(modernLocationsFor("Form")).toEqual([0]);
		expect(names("Form")).toEqual(["form"]);
		expect(names("SubGrid")).toEqual(["associated", "subgrid"]);
	});

	it("keeps commands for this table (by contextentity, contextvalue or context All) and drops other tables", () => {
		expect(names("HomepageGrid")).toEqual(["byvalue", "global", "grid", "sales", "service"]);
	});

	it("filters by app: an app shows its own commands plus app-less ones", () => {
		expect(names("HomepageGrid", SALES)).toEqual(["byvalue", "global", "grid", "sales"]);
		expect(names("HomepageGrid", SERVICE.toUpperCase())).toEqual([
			"byvalue",
			"global",
			"grid",
			"service",
		]);
		expect(appliesToApp(all[6], "all")).toBe(true);
	});
});

describe("buildModernTree", () => {
	it("orders by sequence and nests dropdown / split children; orphans stay visible", () => {
		const dd = cmd({ name: "dd", type: 1, sequence: 20, buttonlabeltext: "Dropdown" });
		const rows = [
			cmd({ name: "b", sequence: 30, buttonlabeltext: "B" }),
			dd,
			cmd({ name: "a", sequence: 5, buttonlabeltext: "A" }),
			cmd({ name: "child2", sequence: 2, _parentappactionid_value: dd.id }),
			cmd({ name: "child1", sequence: 1, _parentappactionid_value: dd.id }),
			cmd({
				name: "orphan",
				sequence: 25,
				_parentappactionid_value: "deadbeef-0000-0000-0000-000000000000",
			}),
		];
		// dd was built separately; put the same object in the list.
		rows[1] = dd;
		const tree = buildModernTree(rows);
		expect(tree.map((t) => t.command.name)).toEqual(["a", "dd", "orphan", "b"]);
		expect(tree[1].children.map((c) => c.command.name)).toEqual(["child1", "child2"]);
		expect(flattenModernTree(tree).map((c) => c.name)).toEqual([
			"a",
			"dd",
			"child1",
			"child2",
			"orphan",
			"b",
		]);
	});
});

describe("classic buttons overridden by migrated modern commands", () => {
	const refresh = (over: Record<string, unknown> = {}) =>
		cmd({
			origin: 1,
			context: 0,
			_contextentity_value: null,
			contextvalue: null,
			name: "RefreshModernButton",
			uniquename: "msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.RefreshModernButton!1",
			buttonlabeltext: "Refresh",
			...over,
		});
	const classicIds = [
		"Mscrm.HomepageGrid.contact.RefreshModernButton",
		"Mscrm.HomepageGrid.contact.NewRecord",
	];

	it("derives the classic id from a migrated unique name", () => {
		expect(classicIdCandidates(refresh(), "contact")[0]).toBe(
			"Mscrm.HomepageGrid.contact.RefreshModernButton",
		);
		expect(
			classicIdCandidates(cmd({ origin: 0, uniquename: "msdyn_Mscrm.X.Y" }), "contact"),
		).toEqual([]);
		// No prefix: the raw name is tried as well.
		expect(
			classicIdCandidates(refresh({ uniquename: "new_contact.MyButton" }), "contact"),
		).toContain("new_contact.MyButton");
	});

	it("flags hidden vs replaced, ignores disabled (classic shown) and designer-made commands", () => {
		const hidden = refresh({
			hidden: true,
			_appmoduleid_value: SALES,
			[`_appmoduleid_value${FV}`]: "Sales Hub",
		});
		const replaced = refresh();
		const disabled = refresh({ isdisabled: true });
		const designer = refresh({ origin: 0 });
		const map = findClassicOverrides(
			[hidden, replaced, disabled, designer],
			classicIds,
			"contact",
		);
		expect([...map.keys()]).toEqual(["Mscrm.HomepageGrid.contact.RefreshModernButton"]);
		const list = map.get("Mscrm.HomepageGrid.contact.RefreshModernButton")!;
		expect(list.map((o) => [o.command.id, o.effect])).toEqual([
			[hidden.id, "hidden"],
			[replaced.id, "replaced"],
		]);
		expect(describeOverride(list[0])).toBe("Hidden by modern command Refresh in Sales Hub");
		expect(describeOverride(list[1])).toBe(
			"Rendered as modern command Refresh in all apps (migrated)",
		);
	});

	it("reports a disabled migrated command only when asked (so it isn't drawn next to its classic button)", () => {
		const disabled = refresh({ isdisabled: true });
		expect(findClassicOverrides([disabled], classicIds, "contact").size).toBe(0);
		expect(
			findClassicOverrides([disabled], classicIds, "contact", { includeDisabled: true }).size,
		).toBe(1);
	});

	it("matches case-insensitively", () => {
		const map = findClassicOverrides(
			[refresh()],
			["MSCRM.HOMEPAGEGRID.CONTACT.REFRESHMODERNBUTTON"],
			"contact",
		);
		expect(map.has("MSCRM.HOMEPAGEGRID.CONTACT.REFRESHMODERNBUTTON")).toBe(true);
	});
});

// Regression for the live check of #74: the migrated (origin = 1) copies of the
// contact Home Grid buttons were drawn as separate chips next to the classic
// buttons they stand for. Unique names exactly as read from the test org.
describe("migrated contact Home Grid commands (live unique names)", () => {
	const TABLE_SPECIFIC = [
		["msdyn_Mscrm.HomepageGrid.contact.MergeRecords!contact!1", "MergeRecords", false],
		[
			"msdyn_Mscrm.HomepageGrid.contact.ImportDataFromExchange!contact!1",
			"ImportDataFromExchange",
			true,
		],
		["msdyn_Mscrm.HomepageGrid.contact.NewRecord!contact!1", "NewRecord", false],
	] as const;
	const GLOBAL = [
		"Activate",
		"RefreshModernButton",
		"ExportSelectedToExcel",
		"Chart.Edit",
		"Assign",
		"RefreshButton",
		"NavigateToHomepageGrid",
		"ViewHierarchy",
		"NewRecord",
		"Sharing",
		"Deactivate",
		"Edit",
		"OpenActiveStage",
		"SaveFiltersToCurrentSystemView",
		"NewRecordForBPFEntity",
		"Chart.Delete",
	];
	const rows = [
		...TABLE_SPECIFIC.map(([uniquename, , isdisabled]) =>
			cmd({ uniquename, name: uniquename, origin: 1, isdisabled }),
		),
		...GLOBAL.map((suffix) =>
			cmd({
				uniquename: `msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.${suffix}!1`,
				name: suffix,
				origin: 1,
				context: 0,
				_contextentity_value: null,
				contextvalue: null,
			}),
		),
		cmd({ uniquename: "new_SendSurvey", name: "SendSurvey", origin: 0 }),
	];
	const controls = [...new Set([...TABLE_SPECIFIC.map(([, s]) => s), ...GLOBAL])].map(
		(s) => `Mscrm.HomepageGrid.contact.${s}`,
	);

	it("strips `!contact!1` and `!1` without breaking `{!EntityLogicalName}`", () => {
		expect(classicIdCandidates(rows[0], "contact")[0]).toBe(
			"Mscrm.HomepageGrid.contact.MergeRecords",
		);
		expect(classicIdCandidates(rows[3], "contact")[0]).toBe(
			"Mscrm.HomepageGrid.contact.Activate",
		);
		expect(classicIdCandidates(rows[6], "contact")[0]).toBe(
			"Mscrm.HomepageGrid.contact.Chart.Edit",
		);
	});

	it("maps every migrated command to its classic control; only the designer command is left", () => {
		const matched = findClassicOverrides(rows, controls, "contact", { includeDisabled: true });
		const matchedIds = new Set([...matched.values()].flat().map((o) => o.command.id));
		expect(rows.filter((c) => !matchedIds.has(c.id)).map((c) => c.uniqueName)).toEqual([
			"new_SendSurvey",
		]);
		// isdisabled = the classic button applies: no flag.
		const flagged = findClassicOverrides(rows, controls, "contact");
		expect(flagged.has("Mscrm.HomepageGrid.contact.ImportDataFromExchange")).toBe(false);
		expect(flagged.get("Mscrm.HomepageGrid.contact.MergeRecords")?.[0].effect).toBe("replaced");
		// NewRecord has both a table-specific and a global migrated copy.
		expect(flagged.get("Mscrm.HomepageGrid.contact.NewRecord")).toHaveLength(2);
	});

	it("also matches controls whose id keeps the {!EntityLogicalName} template", () => {
		const templated = controls.map((id) => id.replace(".contact.", ".{!EntityLogicalName}."));
		const matched = findClassicOverrides(rows, templated, "contact", { includeDisabled: true });
		expect([...matched.values()].flat()).toHaveLength(rows.length - 1);
	});
});

// Regression for the second live check of #74: classic counterparts of
// migrated commands live on other tabs of the location (Charts / View), and
// chips were drawn on every tab instead of only the table's MainTab.
describe("buildModernLocationModel (whole location)", () => {
	const tab = (id: string, buttonIds: string[]) => ({
		id,
		groups: [{ buttons: buttonIds.map((b) => ({ id: b })) }],
	});
	// Live tab order: the shared Charts tab can come first.
	const tabs = [
		tab("Mscrm.HomepageGrid.AllEntities.VisualizationTab", [
			"Mscrm.HomepageGrid.contact.Chart.Edit",
			"Mscrm.HomepageGrid.contact.Chart.Delete",
			"Mscrm.HomepageGrid.contact.Chart.RefreshButton",
		]),
		tab("Mscrm.HomepageGrid.contact.MainTab", [
			"Mscrm.HomepageGrid.contact.NewRecord",
			"Mscrm.HomepageGrid.contact.Edit",
		]),
		tab("Mscrm.HomepageGrid.contact.View", [
			"Mscrm.HomepageGrid.contact.RefreshButton",
			"Mscrm.HomepageGrid.contact.SaveFiltersToCurrentSystemView",
		]),
	];
	const migrated = (suffix: string) =>
		cmd({
			uniquename: `msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.${suffix}!1`,
			name: suffix,
			origin: 1,
			context: 0,
			_contextentity_value: null,
			contextvalue: null,
		});
	const commands = [
		...[
			"RefreshButton",
			"Chart.Edit",
			"Chart.Delete",
			"SaveFiltersToCurrentSystemView",
			"NewRecord",
			"Edit",
		].map(migrated),
		migrated("NotInThisRibbon"),
		cmd({ uniquename: "new_SendSurvey", name: "SendSurvey", origin: 0 }),
	];
	const model = buildModernLocationModel({
		commands,
		tabs,
		location: "HomepageGrid",
		entityLogicalName: "contact",
	});

	it("matches migrated commands against every tab of the location", () => {
		expect([...model.overrides.keys()].sort()).toEqual([
			"Mscrm.HomepageGrid.contact.Chart.Delete",
			"Mscrm.HomepageGrid.contact.Chart.Edit",
			"Mscrm.HomepageGrid.contact.Edit",
			"Mscrm.HomepageGrid.contact.NewRecord",
			"Mscrm.HomepageGrid.contact.RefreshButton",
			"Mscrm.HomepageGrid.contact.SaveFiltersToCurrentSystemView",
		]);
	});

	it("draws chips only for designer commands and migrated ones without a counterpart", () => {
		expect(model.nodes.map((n) => n.command.uniqueName)).toEqual([
			"msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.NotInThisRibbon!1",
			"new_SendSurvey",
		]);
		expect(model.unmatchedMigrated.map((c) => c.name)).toEqual(["NotInThisRibbon"]);
	});

	it("puts chips on the table's MainTab, never on the shared Charts tab", () => {
		expect(model.commandBarTabId).toBe("Mscrm.HomepageGrid.contact.MainTab");
		expect(
			commandBarTabId(
				[
					{ id: "Mscrm.HomepageGrid.AllEntities.VisualizationTab" },
					{ id: "Custom.MainTab" },
				],
				"HomepageGrid",
				"contact",
			),
		).toBe("Custom.MainTab");
		expect(commandBarTabId([{ id: "Mscrm.GlobalTab" }], "Application", "contact")).toBe(
			"Mscrm.GlobalTab",
		);
	});
});

describe("review fixes (#74)", () => {
	it("puts global-header commands on the global tab of the application ribbon, not a templated MainTab", () => {
		expect(
			commandBarTabId(
				[
					{ id: "Mscrm.HomepageGrid.{!EntityLogicalName}.MainTab" },
					{ id: "Mscrm.GlobalTab" },
				],
				"Application",
				"contact",
			),
		).toBe("Mscrm.GlobalTab");
	});

	it("keeps a designer child of a matched migrated command in that control's menu, not as a chip", () => {
		const parent = cmd({
			uniquename: "msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.ExportToExcel!1",
			buttonlabeltext: "Export to Excel",
			origin: 1,
			type: 2,
			context: 0,
			_contextentity_value: null,
			contextvalue: null,
		});
		const child = cmd({ buttonlabeltext: "Export CSV", _parentappactionid_value: parent.id });
		const grandchild = cmd({
			buttonlabeltext: "Export TSV",
			_parentappactionid_value: child.id,
		});
		const model = buildModernLocationModel({
			commands: [parent, child, grandchild],
			tabs: [
				{
					id: "Mscrm.HomepageGrid.contact.MainTab",
					groups: [{ buttons: [{ id: "Mscrm.HomepageGrid.contact.ExportToExcel" }] }],
				},
			],
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect(model.nodes).toEqual([]);
		const [o] = model.overrides.get("Mscrm.HomepageGrid.contact.ExportToExcel")!;
		expect(o.items?.map((i) => i.label).sort()).toEqual(["Export CSV", "Export TSV"]);
		expect(describeOverride(o)).toMatch(/its menu also has Export/);
	});

	it("gives the classic button an accessible note matching its badge", () => {
		const refresh = cmd({
			uniquename: "msdyn_Mscrm.HomepageGrid.contact.RefreshModernButton!contact!1",
			buttonlabeltext: "Refresh",
			origin: 1,
		});
		const ids = ["Mscrm.HomepageGrid.contact.RefreshModernButton"];
		expect(overrideNote(findClassicOverrides([refresh], ids, "contact").get(ids[0]))).toBe(
			" — modern (migrated)",
		);
		const hidden = { ...refresh, hidden: true };
		expect(overrideNote(findClassicOverrides([hidden], ids, "contact").get(ids[0]))).toBe(
			" — hidden by modern command Refresh in all apps",
		);
		expect(overrideNote(undefined)).toBe("");
	});
});

describe("flyout menu items (#74 follow-up)", () => {
	const flyout = (id: string, items: ClassicControl[]): ClassicControl => ({
		id,
		menu: { sections: [{ controls: items }] },
	});
	const migrated = (suffix: string, over: Record<string, unknown> = {}) =>
		cmd({
			uniquename: `msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.${suffix}!1`,
			buttonlabeltext: suffix,
			origin: 1,
			context: 0,
			_contextentity_value: null,
			contextvalue: null,
			...over,
		});
	const tabs = [
		{
			id: "Mscrm.HomepageGrid.contact.MainTab",
			groups: [
				{
					buttons: [
						{ id: "Mscrm.HomepageGrid.contact.NewRecord" },
						flyout("Mscrm.HomepageGrid.contact.ExportToExcel", [
							{ id: "Mscrm.HomepageGrid.contact.ExportToExcel.Static" },
							flyout("Mscrm.HomepageGrid.contact.ExportToExcel.More", [
								{ id: "Mscrm.HomepageGrid.contact.ExportToExcel.Pivot" },
							]),
						]),
					],
				},
			],
		},
	];

	it("matches a migrated command to a menu item, nested menus included", () => {
		const parent = migrated("ExportToExcel", { type: 2 });
		const staticItem = migrated("ExportToExcel.Static", {
			_parentappactionid_value: parent.id,
			hidden: true,
		});
		const pivot = migrated("ExportToExcel.Pivot", { _parentappactionid_value: parent.id });
		const model = buildModernLocationModel({
			commands: [parent, staticItem, pivot],
			tabs,
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect(model.nodes).toEqual([]);
		expect(model.unmatchedMigrated).toEqual([]);
		expect(model.overrides.get("Mscrm.HomepageGrid.contact.ExportToExcel.Static")).toEqual([
			expect.objectContaining({ effect: "hidden", command: staticItem }),
		]);
		expect(model.overrides.get("Mscrm.HomepageGrid.contact.ExportToExcel.Pivot")).toEqual([
			expect.objectContaining({ effect: "replaced", command: pivot }),
		]);
		// Matched items have their own flag; the flyout lists only what has none.
		const [o] = model.overrides.get("Mscrm.HomepageGrid.contact.ExportToExcel")!;
		expect(o.items).toBeUndefined();
	});

	it("draws an unmatched migrated child of an unmatched parent as a chip, not a menu item flag", () => {
		const parent = migrated("NotHere", { type: 2 });
		const child = migrated("NotHere.Item", { _parentappactionid_value: parent.id });
		const model = buildModernLocationModel({
			commands: [parent, child],
			tabs,
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect(model.overrides.size).toBe(0);
		expect(model.nodes.map((n) => n.command.id)).toEqual([parent.id]);
		expect(model.nodes[0].children.map((n) => n.command.id)).toEqual([child.id]);
	});

	it("prefers a top-level button over a menu item when both match only loosely", () => {
		const twin = migrated("Twin");
		const model = buildModernLocationModel({
			commands: [twin],
			tabs: [
				{
					id: "Mscrm.HomepageGrid.contact.MainTab",
					groups: [
						// The menu comes first in the ribbon; neither id names this table.
						{ buttons: [flyout("Mscrm.HomepageGrid.contact.Menu", [{ id: "Mscrm.HomepageGrid.lead.Twin" }])] },
						{ buttons: [{ id: "Mscrm.HomepageGrid.account.Twin" }] },
					],
				},
			],
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect([...model.overrides.keys()]).toEqual(["Mscrm.HomepageGrid.account.Twin"]);
	});

	it("keeps a matching child in its parent's chip when the parent itself has no classic control (review m1)", () => {
		const parent = migrated("RenamedFlyout", { type: 2 });
		const child = migrated("ExportToExcel.Static", { _parentappactionid_value: parent.id });
		const other = migrated("NotAnywhere", { _parentappactionid_value: parent.id });
		const model = buildModernLocationModel({
			commands: [parent, child, other],
			tabs,
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect(model.overrides.has("Mscrm.HomepageGrid.contact.ExportToExcel.Static")).toBe(false);
		expect(model.nodes.map((n) => n.command.id)).toEqual([parent.id]);
		expect(model.nodes[0].children.map((n) => n.command.id).sort()).toEqual([child.id, other.id].sort());
	});

	it("looks through a menu section (group command) to the matched flyout (review)", () => {
		const parent = migrated("ExportToExcel", { type: 2 });
		const section = cmd({ name: "Section", type: 3, origin: 1, _parentappactionid_value: parent.id });
		const item = migrated("ExportToExcel.Static", { _parentappactionid_value: section.id, hidden: true });
		const model = buildModernLocationModel({
			commands: [parent, section, item],
			tabs,
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect(model.overrides.get("Mscrm.HomepageGrid.contact.ExportToExcel.Static")).toEqual([
			expect.objectContaining({ effect: "hidden", command: item }),
		]);
		expect(model.nodes).toEqual([]);
	});

	it("lists a disabled child on its parent's flag instead of dropping it (review m2)", () => {
		const parent = migrated("ExportToExcel", { type: 2 });
		const disabled = migrated("ExportToExcel.Static", { _parentappactionid_value: parent.id, isdisabled: true });
		const model = buildModernLocationModel({
			commands: [parent, disabled],
			tabs,
			location: "HomepageGrid",
			entityLogicalName: "contact",
		});
		expect(model.overrides.has("Mscrm.HomepageGrid.contact.ExportToExcel.Static")).toBe(false);
		const [o] = model.overrides.get("Mscrm.HomepageGrid.contact.ExportToExcel")!;
		expect(o.items?.map((i) => i.id)).toEqual([disabled.id]);
		expect(model.nodes).toEqual([]);
	});
});

describe("placeModernCommands", () => {
	it("puts each modern command before the first classic button with a higher sequence", () => {
		const classic = [
			{ id: "New", sequence: 10 },
			{ id: "Edit", sequence: 30 },
			{ id: "Delete", sequence: 50 },
		];
		const tree = buildModernTree([
			cmd({ name: "first", sequence: 1 }),
			cmd({ name: "mid", sequence: 40 }),
			cmd({ name: "tie", sequence: 30 }),
			cmd({ name: "last", sequence: 999 }),
		]);
		const p = placeModernCommands(classic, tree);
		expect(p.before.get("New")?.map((x) => x.command.name)).toEqual(["first"]);
		expect(p.before.get("Edit")).toBeUndefined();
		expect(p.before.get("Delete")?.map((x) => x.command.name)).toEqual(["tie", "mid"]);
		expect(p.trailing.map((x) => x.command.name)).toEqual(["last"]);
	});

	it("appends everything when there are no classic buttons", () => {
		const p = placeModernCommands([], buildModernTree([cmd(), cmd()]));
		expect(p.trailing).toHaveLength(2);
		expect(p.before.size).toBe(0);
	});
});

describe("buildAppList / describeModernCommand", () => {
	it("lists only the apps containing the table; falls back to apps with commands when unknown", () => {
		const commands: ModernCommand[] = [
			cmd({ _appmoduleid_value: SERVICE }),
			cmd({
				_appmoduleid_value: "33333333-3333-3333-3333-333333333333",
				[`_appmoduleid_value${FV}`]: "Zeta",
			}),
			cmd(),
		];
		const apps = [
			{ id: SALES, name: "Sales Hub" },
			{ id: SERVICE, name: "Customer Service Hub" },
			{ id: "44444444-4444-4444-4444-444444444444", name: "Not containing" },
		];
		expect(buildAppList(commands, apps, new Set([SALES, SERVICE])).map((a) => a.name)).toEqual([
			"Customer Service Hub",
			"Sales Hub",
		]);
		expect(buildAppList(commands, apps, null).map((a) => a.name)).toEqual([
			"Customer Service Hub",
			"Zeta",
		]);
		// Commands of apps without the table never show for it, not even under "All apps".
		expect(
			scopeToContainingApps(commands, new Set([SALES, SERVICE.toUpperCase()])).map(
				(c) => c.appModuleId,
			),
		).toEqual([SERVICE, null]);
		expect(scopeToContainingApps(commands, null)).toBe(commands);
	});

	it("describes app, location, type and the Power Fx / JavaScript references", () => {
		const c = cmd({
			_appmoduleid_value: SALES,
			location: 3,
			type: 1,
			visibilitytype: 1,
			visibilityformulacomponentname: "Grid",
			visibilityformulafunctionname: "Btn_Visible",
			visibilityformulacomponentlibrary: "lib1",
			onclickeventtype: 1,
			onclickeventformulafunctionname: "Btn_OnSelect",
		});
		const rows = Object.fromEntries(
			describeModernCommand(c, new Map([[SALES, "Sales Hub"]])).map((r) => [
				r.label,
				r.value,
			]),
		);
		expect(rows).toMatchObject({
			App: "Sales Hub",
			Location: "Associated grid",
			Type: "Dropdown",
			"Visible (Power Fx)": "Grid.Btn_Visible (component library lib1)",
			"OnSelect (Power Fx)": "Btn_OnSelect",
		});
		const status = (over: Record<string, unknown>) =>
			describeModernCommand(cmd({ isdisabled: true, ...over })).find(
				(r) => r.label === "Status",
			)?.value;
		// Only a migrated command has a classic (ribbon) equivalent to fall back to.
		expect(status({ origin: 1 })).toMatch(/classic/);
		expect(status({ origin: 0 })).toBe("Disabled");
	});
});
