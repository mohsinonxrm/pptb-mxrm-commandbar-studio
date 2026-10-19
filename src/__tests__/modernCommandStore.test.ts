import { describe, it, expect, beforeEach, vi } from "vitest";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { planScope } from "@/services/publishPlan";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import {
	buildAppActionQuery,
	fetchModernCommands,
	loadModernCommandData,
} from "@/services/dataverse/modernCommandService";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const CONTACT_MD = "608861bc-50a4-4c5f-a02c-21fe1943e2cf";
const SALES = "11111111-1111-1111-1111-111111111111";

const APPACTION = {
	appactionid: "aaaaaaaa-0000-0000-0000-000000000001",
	name: "SendSurvey",
	uniquename: "new_SendSurvey",
	buttonlabeltext: "Send survey",
	_appmoduleid_value: SALES,
	context: 1,
	_contextentity_value: CONTACT_MD,
	contextvalue: "contact",
	location: 1,
	type: 0,
	sequence: 15,
	hidden: false,
	isdisabled: false,
	origin: 0,
};

function ribbon(location: RibbonLocation): RibbonDefinition {
	return {
		location,
		entityLogicalName: "contact",
		tabs: [
			{
				id: `Mscrm.${location}.contact.MainTab`,
				label: "Main",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: "G",
						label: "G",
						sequence: 10,
						template: "Mscrm.Templates.Flexible2",
						buttons: [
							{
								id: `Mscrm.${location}.contact.NewRecord`,
								label: "New",
								kind: "button",
								sequence: 10,
								templateAlias: "o1",
								commandId: "Mscrm.NewRecordFromGrid",
								hidden: false,
								oob: true,
								custom: false,
								managed: false,
							},
						],
					},
				],
			},
		],
	};
}

function setApi(queryData: (q: string) => Promise<unknown>) {
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = { queryData: vi.fn(queryData) };
}

describe("modern command loading", () => {
	beforeEach(() => {
		useModernCommandStore.getState().reset();
	});

	it("queries active commands for the table (contextentity / contextvalue / All) on the shown locations", () => {
		const q = buildAppActionQuery({ logicalName: "o'brien", metadataId: CONTACT_MD }, true);
		expect(q).toMatch(/^appactions\?\$select=appactionid,/);
		expect(q).toContain("statecode eq 0");
		expect(q).toContain(
			`(context eq 0 or contextvalue eq 'o''brien' or _contextentity_value eq ${CONTACT_MD})`,
		);
		expect(q).toContain("location eq 5");
		expect(q).not.toContain("location eq 6");
		expect(q).not.toContain("$orderby");
		expect(q).toContain("$expand=appaction_appactionrule_classicrules(");
		expect(
			buildAppActionQuery({ logicalName: "contact", metadataId: "not-a-guid" }, false),
		).not.toMatch(/_contextentity_value eq|\$expand/);
	});

	it("retries without the classic-rules expand and follows nextLink", async () => {
		const queries: string[] = [];
		setApi(async (q) => {
			queries.push(q);
			if (q.includes("$expand")) throw new Error("0x80060888: expand not supported");
			if (q.includes("skiptoken"))
				return {
					value: [{ ...APPACTION, appactionid: "aaaaaaaa-0000-0000-0000-000000000002" }],
				};
			return {
				value: [APPACTION],
				"@odata.nextLink":
					"https://org.crm.dynamics.com/api/data/v9.2/appactions?$skiptoken=2",
			};
		});
		const commands = await fetchModernCommands({
			logicalName: "contact",
			metadataId: CONTACT_MD,
		});
		expect(commands.map((c) => c.id)).toEqual([
			"aaaaaaaa-0000-0000-0000-000000000001",
			"aaaaaaaa-0000-0000-0000-000000000002",
		]);
		expect(queries).toContain("appactions?$skiptoken=2");
	});

	it("never throws: an org without appaction access yields no modern commands", async () => {
		setApi(async () => {
			throw new Error("0x80040220: principal lacks prvReadappaction");
		});
		const data = await loadModernCommandData({
			logicalName: "contact",
			metadataId: CONTACT_MD,
		});
		expect(data.commands).toEqual([]);
		expect(data.apps).toEqual([]);
		expect(data.error).toMatch(/prvReadappaction/);
	});

	it("doesn't retry on a permission error and logs one clear warning", async () => {
		const queries: string[] = [];
		setApi(async (q) => {
			queries.push(q);
			if (q.startsWith("appactions")) throw new Error("403: Forbidden");
			return { value: [] };
		});
		useRuntimeLogStore.getState().clear();
		const data = await loadModernCommandData({
			logicalName: "contact",
			metadataId: CONTACT_MD,
		});
		expect(data.commands).toEqual([]);
		expect(queries.filter((q) => q.startsWith("appactions"))).toHaveLength(1);
		const logs = useRuntimeLogStore.getState().entries;
		expect(logs.filter((e) => e.level === "warn").map((e) => e.message)).toEqual([
			"No permission to read modern commands (appaction) for contact; the canvas shows classic commands only. (403: Forbidden)",
		]);
		expect(logs.some((e) => e.message.includes("retrying"))).toBe(false);
	});

	it("drops commands of apps that don't contain the table and stops on a repeated nextLink", async () => {
		const OTHER = "22222222-2222-2222-2222-222222222222";
		setApi(async (q) => {
			if (q.startsWith("appactions"))
				return {
					value: [
						APPACTION,
						{
							...APPACTION,
							appactionid: "aaaaaaaa-0000-0000-0000-00000000000b",
							_appmoduleid_value: OTHER,
							context: 0,
						},
					],
					// A broken server repeating its own nextLink must not loop forever.
					"@odata.nextLink": `https://org.crm.dynamics.com/api/data/v9.2/${q}`,
				};
			if (q.startsWith("appmodulecomponents"))
				return { value: [{ _appmoduleidunique_value: "unique-sales" }] };
			return {
				value: [
					{ appmoduleid: SALES, appmoduleidunique: "unique-sales", name: "Sales Hub" },
					{ appmoduleid: OTHER, appmoduleidunique: "unique-other", name: "Other" },
				],
			};
		});
		const data = await loadModernCommandData({
			logicalName: "contact",
			metadataId: CONTACT_MD,
		});
		expect(data.commands.map((c) => c.appModuleId)).toEqual([SALES]);
		expect(data.apps.map((a) => a.name)).toEqual(["Sales Hub"]);
	});

	it("keeps the commands when only the app list fails, naming apps from the lookup's formatted value", async () => {
		setApi(async (q) => {
			if (q.startsWith("appactions"))
				return {
					value: [
						{
							...APPACTION,
							"_appmoduleid_value@OData.Community.Display.V1.FormattedValue":
								"Sales Hub",
						},
					],
				};
			throw new Error("no appmodule access");
		});
		const data = await loadModernCommandData({
			logicalName: "contact",
			metadataId: CONTACT_MD,
		});
		expect(data.error).toBeUndefined();
		expect(data.commands).toHaveLength(1);
		expect(data.apps).toEqual([{ id: SALES, name: "Sales Hub" }]);
	});

	it("lists the apps that contain the table via appmodulecomponent", async () => {
		setApi(async (q) => {
			if (q.startsWith("appactions")) return { value: [] };
			if (q.startsWith("appmodulecomponents")) {
				expect(q).toContain(`componenttype eq 1 and objectid eq ${CONTACT_MD}`);
				return { value: [{ _appmoduleidunique_value: "UNIQUE-SALES" }] };
			}
			return {
				value: [
					{
						appmoduleid: SALES,
						appmoduleidunique: "unique-sales",
						name: "Sales Hub",
						uniquename: "msdynce_saleshub",
					},
					{
						appmoduleid: "22222222-2222-2222-2222-222222222222",
						appmoduleidunique: "unique-other",
						name: "Other",
					},
				],
			};
		});
		const data = await loadModernCommandData({
			logicalName: "contact",
			metadataId: CONTACT_MD,
		});
		expect(data.apps.map((a) => a.name)).toEqual(["Sales Hub"]);
	});
});

describe("modern command store", () => {
	beforeEach(() => {
		useModernCommandStore.getState().reset();
	});

	it("ignores a response for a table the user already left", () => {
		const s = useModernCommandStore.getState();
		const stale = s.beginLoad("contact");
		const current = s.beginLoad("account");
		s.finishLoad(stale, { commands: [{ id: "x" } as never], apps: [] });
		expect(useModernCommandStore.getState().commands).toEqual([]);
		expect(useModernCommandStore.getState().status).toBe("loading");
		s.finishLoad(current, { commands: [], apps: [], error: "denied" });
		expect(useModernCommandStore.getState()).toMatchObject({
			status: "unavailable",
			error: "denied",
		});
	});

	it("falls back to All apps when the chosen app isn't offered for the new table", () => {
		const s = useModernCommandStore.getState();
		s.setAppFilter(SALES.toUpperCase());
		expect(useModernCommandStore.getState().appFilter).toBe(SALES);
		s.finishLoad(s.beginLoad("contact"), {
			commands: [],
			apps: [{ id: SALES, name: "Sales Hub" }],
		});
		expect(useModernCommandStore.getState().appFilter).toBe(SALES);
		s.finishLoad(s.beginLoad("account"), { commands: [], apps: [] });
		expect(useModernCommandStore.getState().appFilter).toBe("all");
	});

	it("selecting a modern command clears the classic selection", () => {
		useSelectionStore.getState().selectButton("G", "Mscrm.HomepageGrid.contact.NewRecord");
		useModernCommandStore.getState().selectCommand(APPACTION.appactionid);
		expect(useSelectionStore.getState().selectedButtonId).toBeNull();
		expect(useModernCommandStore.getState().selectedCommandId).toBe(APPACTION.appactionid);
	});

	it("ends the modern selection on a classic selection or a tab / location change", () => {
		const modern = () => useModernCommandStore.getState().selectedCommandId;
		const select = () => useModernCommandStore.getState().selectCommand(APPACTION.appactionid);
		select();
		useSelectionStore.getState().selectButton("G", "Mscrm.HomepageGrid.contact.NewRecord");
		expect(modern()).toBeNull();
		select();
		useSelectionStore.getState().setTabId("Mscrm.HomepageGrid.contact.View");
		expect(modern()).toBeNull();
		select();
		useSelectionStore.getState().setLocation("Form");
		expect(modern()).toBeNull();
		select();
		useSelectionStore.getState().clearSelection();
		expect(modern()).toBe(APPACTION.appactionid);
	});

	it("is isolated from the ribbon store: loading modern commands changes nothing that is published", async () => {
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: ribbon("HomepageGrid"),
				SubGrid: ribbon("SubGrid"),
				Form: ribbon("Form"),
				Application: { location: "Application", entityLogicalName: "", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
		const before = JSON.stringify(useRibbonStore.getState());

		setApi(async (q) =>
			q.startsWith("appactions")
				? {
						value: [
							APPACTION,
							{
								...APPACTION,
								appactionid: "aaaaaaaa-0000-0000-0000-000000000009",
								origin: 1,
								hidden: true,
								uniquename:
									"msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.NewRecord!1",
							},
						],
					}
				: q.startsWith("appmodulecomponents")
					? { value: [{ _appmoduleidunique_value: "unique-sales" }] }
					: {
							value: [
								{
									appmoduleid: SALES,
									appmoduleidunique: "unique-sales",
									name: "Sales Hub",
								},
							],
						},
		);
		const s = useModernCommandStore.getState();
		const token = s.beginLoad("contact");
		s.finishLoad(
			token,
			await loadModernCommandData({ logicalName: "contact", metadataId: CONTACT_MD }),
		);
		s.setAppFilter(SALES);
		s.selectCommand(APPACTION.appactionid);
		expect(useModernCommandStore.getState().commands).toHaveLength(2);

		const r = useRibbonStore.getState();
		expect(JSON.stringify(r)).toBe(before);
		expect(r.mutationsSincePublish).toBe(0);
		expect(JSON.stringify(r)).not.toContain("Send survey");

		const plan = planScope({
			locations: (["HomepageGrid", "SubGrid", "Form"] as const).map((l) => ({
				current: r.ribbons[l],
				baseline: r.baseline[l],
			})),
			commands: r.commands,
			baselineCommands: r.baselineCommands,
			enableRules: r.enableRules,
			baselineEnableRules: r.baselineEnableRules,
			displayRules: r.displayRules,
			baselineDisplayRules: r.baselineDisplayRules,
		});
		expect(plan.hasChanges).toBe(false);
		expect(plan.unsupported).toEqual([]);

		const xml = generateRibbonDiffXml({
			current: r.ribbons.HomepageGrid,
			baseline: r.baseline.HomepageGrid,
			commands: r.commands,
			enableRules: r.enableRules,
			displayRules: r.displayRules,
			locLabels: r.locLabels,
			entityLogicalName: "contact",
			location: "HomepageGrid",
		});
		expect(xml).not.toMatch(/SendSurvey|HideCustomAction/);
	});
});
