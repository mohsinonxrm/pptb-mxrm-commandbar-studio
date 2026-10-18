/**
 * New groups on existing tabs (#59) and tabs created in CBS (#58).
 *
 * #59: a button created in a new group was written as its own
 * `{group}.Controls._children` CustomAction. Dataverse filed it under the
 * concrete entity tab while the group was filed under the
 * `{!EntityLogicalName}` template tab, and the button never appeared. The
 * controls of a new group or tab are now written inside it (as in Microsoft's
 * samples), and the merge folds children of the layer's own containers in.
 *
 * #58: a CBS tab had no Command and no TabDisplayRule, so it belonged to no
 * location (grid and form tabs share the entity's one `Mscrm.Tabs`
 * collection): RetrieveEntityRibbon didn't return it and nothing showed it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateRibbonDiffXml, effectiveNewTab, planNewGroupScaling } from "@/services/xmlGenerator";
import { validateRibbonDiffXml } from "@/services/xmlValidator";
import { parseRibbonXml } from "@/services/xmlParser";
import {
	emptyRibbonDiffParts,
	foldIntoOwnContainers,
	mergeRibbonDiffParts,
	ownContainerIds,
	ownControlIds,
	parseRibbonDiffParts,
	stableElementXml,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { planScope, UCI_TAB_NOTE } from "@/services/publishPlan";
import { layerSnapshotFromParts, locLabelsFromParts } from "@/services/dataverse/ribbonLayerService";
import { addLayerTabs, reconcileWithLayer, splitTabsByLocation } from "@/services/dataverse/ribbonService";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import type {
	CommandDefinition,
	LocLabel,
	RibbonButton,
	RibbonDefinition,
	RibbonLocation,
	RibbonTab,
} from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const E = "contact";
const MAIN = `Mscrm.HomepageGrid.${E}.MainTab`;
const GROUP = "cbs.contact.Approvals.Group";
const TAB = "cbs.contact.HomepageGrid.Tools.Tab";
const TAB_GROUP = "cbs.contact.Tools.Group";

const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));
const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const attrs = (els: Iterable<Element>, name = "Id") => Array.from(els).map((e) => e.getAttribute(name));
const errorsOf = (xml: string) => validateRibbonDiffXml(xml).filter((e) => e.severity !== "warning");

const btn = (id: string, label: string, sequence: number, commandId: string, extra: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label,
	kind: "button",
	sequence,
	templateAlias: "o1",
	commandId,
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...extra,
});

const cmd = (id: string, fn: string): CommandDefinition => ({
	id,
	enableRules: [],
	displayRules: [],
	actions: [{ kind: "javascript", library: "cbs_/scripts/contact.js", functionName: fn, params: [] }],
});

const COMMANDS = [
	cmd("cbs.contact.Approve.Command", "Cbs.approve"),
	cmd("cbs.contact.Reject.Command", "Cbs.reject"),
	cmd("cbs.contact.Sync.Command", "Cbs.sync"),
];

const oobMain = (): RibbonTab => ({
	id: MAIN,
	label: "Contacts",
	sequence: 100,
	commandId: MAIN,
	tabDisplayRules: [],
	groups: [
		{
			id: `${MAIN}.Management`,
			label: "Records",
			sequence: 10,
			template: "Mscrm.Templates.Flexible2",
			buttons: [
				btn(`Mscrm.HomepageGrid.${E}.NewRecord`, "New", 10, "Mscrm.NewRecordFromGrid", {
					oob: true,
					custom: false,
					origin: "oob",
				}),
			],
		},
	],
});

const def = (location: RibbonLocation, tabs: RibbonTab[]): RibbonDefinition => ({ location, entityLogicalName: E, tabs });

/** Session 1: a new group with two buttons on the main tab, and a new tab with a group and a button. */
function session1(): RibbonDefinition {
	const main = oobMain();
	main.groups.push({
		id: GROUP,
		label: "Approvals",
		sequence: 60,
		template: "Flexible2",
		buttons: [
			btn("cbs.contact.Approve.Button", "Approve", 10, "cbs.contact.Approve.Command"),
			btn("cbs.contact.Reject.Button", "Reject", 20, "cbs.contact.Reject.Command"),
		],
	});
	const tab: RibbonTab = {
		id: TAB,
		label: "Tools",
		sequence: 500,
		tabDisplayRules: [],
		groups: [
			{
				id: TAB_GROUP,
				label: "Tools",
				sequence: 10,
				template: "Flexible2",
				buttons: [btn("cbs.contact.Sync.Button", "Sync", 10, "cbs.contact.Sync.Command")],
			},
		],
	};
	return def("HomepageGrid", [main, tab]);
}

function generate(current: RibbonDefinition, baseline: RibbonDefinition, commands = COMMANDS): string {
	return generateRibbonDiffXml({
		current,
		baseline,
		commands,
		enableRules: [],
		displayRules: [],
		locLabels: [],
		entityLogicalName: E,
		location: current.location,
	});
}

beforeEach(() => {
	layer = emptyRibbonDiffParts();
});

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

describe("#59 — a new group on an existing tab", () => {
	const xml = generate(session1(), def("HomepageGrid", [oobMain()]));
	const doc = parse(xml);

	it("is one CustomAction at {tab}.Groups._children with its buttons inside <Controls>", () => {
		const cas = doc.querySelectorAll(`CustomAction[Location="${MAIN}.Groups._children"]`);
		expect(cas).toHaveLength(1);
		const group = cas[0].querySelector(":scope > CommandUIDefinition > Group")!;
		expect(group.getAttribute("Id")).toBe(GROUP);
		expect(group.getAttribute("Template")).toBe("Mscrm.Templates.Flexible2");
		expect(group.getAttribute("Title")).toBe(`$LocLabels:${GROUP}.Title`);
		const controls = group.querySelector(":scope > Controls")!;
		expect(controls.getAttribute("Id")).toBe(`${GROUP}.Controls`);
		expect(attrs(controls.children)).toEqual(["cbs.contact.Approve.Button", "cbs.contact.Reject.Button"]);
		expect(attrs(controls.children, "Command")).toEqual(["cbs.contact.Approve.Command", "cbs.contact.Reject.Command"]);
		expect(attrs(controls.children, "LabelText")).toEqual([
			"$LocLabels:cbs.contact.Approve.Button.LabelText",
			"$LocLabels:cbs.contact.Reject.Button.LabelText",
		]);
	});

	it("writes no separate CustomAction for the buttons", () => {
		const children = attrs(doc.querySelectorAll("CustomActions > CustomAction"), "Location");
		expect(children.filter((l) => l?.endsWith(".Controls._children"))).toEqual([]);
		expect(doc.querySelectorAll('Button[Id="cbs.contact.Approve.Button"]')).toHaveLength(1);
	});

	it("adds a MaxSize for the group to the tab's scaling", () => {
		const maxSize = doc.querySelector(`CustomAction[Location="${MAIN}.Scaling._children"] MaxSize`)!;
		expect(maxSize.getAttribute("GroupId")).toBe(GROUP);
		expect(maxSize.getAttribute("Size")).toBe("LargeLarge");
	});

	it("defines the buttons' commands and every label it references", () => {
		expect(attrs(doc.querySelectorAll("CommandDefinitions > CommandDefinition"))).toEqual(
			expect.arrayContaining(["cbs.contact.Approve.Command", "cbs.contact.Reject.Command"]),
		);
		const labels = attrs(doc.querySelectorAll("LocLabels > LocLabel"));
		for (const ref of xml.matchAll(/\$LocLabels:([^"]+)"/g)) expect(labels).toContain(ref[1]);
		expect(errorsOf(xml)).toEqual([]);
	});

	it("an existing button moved into the new group keeps its own CustomAction (not written twice)", () => {
		const baseline = def("HomepageGrid", [oobMain()]);
		baseline.tabs[0].groups[0].buttons.push(btn("cbs.contact.Mine.Button", "Mine", 900, "cbs.contact.Approve.Command"));
		const current = session1();
		current.tabs[0].groups[1].buttons.push(btn("cbs.contact.Mine.Button", "Mine", 30, "cbs.contact.Approve.Command"));
		const d = parse(generate(current, baseline));
		expect(d.querySelector(`Group[Id="${GROUP}"] Button[Id="cbs.contact.Mine.Button"]`)).toBeNull();
	});
});

describe("#58 — a new tab", () => {
	const xml = generate(session1(), def("HomepageGrid", [oobMain()]));
	const doc = parse(xml);

	it("is added to Mscrm.Tabs with a Command, its groups and their buttons inside", () => {
		const ca = doc.querySelector(`CustomAction[Id="${TAB}.CustomAction"]`)!;
		expect(ca.getAttribute("Location")).toBe("Mscrm.Tabs._children");
		const tab = ca.querySelector(":scope > CommandUIDefinition > Tab")!;
		expect(tab.getAttribute("Command")).toBe(`${TAB}.Command`);
		expect(Array.from(tab.children).map((c) => c.tagName)).toEqual(["Scaling", "Groups"]);
		expect(attrs(tab.querySelectorAll("Groups > Group > Controls > Button"))).toEqual(["cbs.contact.Sync.Button"]);
		expect(doc.querySelector(`CustomAction[Location="${TAB_GROUP}.Controls._children"]`)).toBeNull();
		expect(doc.querySelector(`CustomAction[Location="${TAB}.Groups._children"]`)).toBeNull();
	});

	it("gets a TabDisplayRule for the table's home grid, bound to its Command, and the Command is defined", () => {
		const rule = doc.querySelector(`TabDisplayRule[TabCommand="${TAB}.Command"]`)!;
		const entityRules = Array.from(rule.children);
		expect(entityRules.map((r) => [r.tagName, r.getAttribute("EntityName"), r.getAttribute("Context"), r.getAttribute("AppliesTo")])).toEqual([
			["EntityRule", E, "HomePageGrid", "PrimaryEntity"],
		]);
		const command = doc.querySelector(`CommandDefinition[Id="${TAB}.Command"]`)!;
		expect(Array.from(command.children).map((c) => c.tagName)).toEqual(["EnableRules", "DisplayRules", "Actions"]);
		expect(attrs(doc.querySelectorAll("CommandDefinitions > CommandDefinition"))).toContain("cbs.contact.Sync.Command");
		expect(errorsOf(xml)).toEqual([]);
	});

	it("on the form gets a Form rule; on the sub-grid it goes into the contextual group with sub-grid rules", () => {
		const tab = (): RibbonTab => ({ ...session1().tabs[1], id: "cbs.contact.X.Tab" });
		const form = parse(generate(def("Form", [tab()]), def("Form", [])));
		expect(form.querySelector("CustomAction")!.getAttribute("Location")).toBe("Mscrm.Tabs._children");
		expect(attrs(form.querySelectorAll("TabDisplayRule > EntityRule"), "Context")).toEqual(["Form"]);

		const sub = parse(generate(def("SubGrid", [tab()]), def("SubGrid", [])));
		expect(sub.querySelector("CustomAction")!.getAttribute("Location")).toBe(`Mscrm.SubGrid.${E}.ContextualTabs._children`);
		expect(attrs(sub.querySelectorAll("TabDisplayRule > EntityRule"), "Context")).toEqual(["SubGridStandard", "SubGridAssociated"]);
	});

	it("keeps the user's display rules (binding a rule without TabCommand to the tab's Command)", () => {
		const current = session1();
		current.tabs[1].tabDisplayRules = [{ tabCommand: "", rules: [{ kind: "EntityRule", context: "Form", appliesTo: "PrimaryEntity" }] }];
		const d = parse(generate(current, def("HomepageGrid", [oobMain()])));
		const rules = d.querySelectorAll("TabDisplayRule");
		expect(rules).toHaveLength(1);
		expect(rules[0].getAttribute("TabCommand")).toBe(`${TAB}.Command`);
		expect(rules[0].querySelector("EntityRule")!.getAttribute("Context")).toBe("Form");
	});

	it("keeps a Command the tab already has", () => {
		const tab = effectiveNewTab({ ...session1().tabs[1], commandId: "my.Command" }, "HomepageGrid", E);
		expect(tab.commandId).toBe("my.Command");
		expect(tab.tabDisplayRules[0].tabCommand).toBe("my.Command");
	});
});

describe("#58 — creating a tab in the store", () => {
	beforeEach(() => {
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: def("HomepageGrid", [oobMain()]),
				Form: def("Form", []),
				SubGrid: def("SubGrid", []),
				Application: { location: "Application", entityLogicalName: "{!EntityLogicalName}", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
	});

	it("gives a table tab a Command and the display rule of its location", () => {
		useRibbonStore.getState().createTab("Form", { id: "cbs.contact.Form.Review.Tab", label: "Review" });
		const tab = useRibbonStore.getState().ribbons.Form.tabs[0];
		expect(tab.commandId).toBe("cbs.contact.Form.Review.Tab.Command");
		expect(tab.tabDisplayRules).toEqual([
			{
				tabCommand: "cbs.contact.Form.Review.Tab.Command",
				rules: [{ kind: "EntityRule", entityName: E, context: "Form", appliesTo: "PrimaryEntity" }],
			},
		]);
	});

	it("gives an application tab a Command but no rule (there is no default to choose)", () => {
		useRibbonStore.getState().createTab("Application", { id: "cbs.App.Tab", label: "App" });
		const tab = useRibbonStore.getState().ribbons.Application.tabs[0];
		expect(tab.commandId).toBe("cbs.App.Tab.Command");
		expect(tab.tabDisplayRules).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function planOf(current: RibbonDefinition, baseline: RibbonDefinition, extra: { commands?: CommandDefinition[]; baselineCommands?: CommandDefinition[]; locLabels?: LocLabel[] } = {}) {
	return planScope({
		locations: [{ current, baseline }],
		commands: extra.commands ?? COMMANDS,
		baselineCommands: extra.baselineCommands ?? [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		locLabels: extra.locLabels ?? [],
		baselineLocLabels: extra.locLabels ?? [],
		layer: layerSnapshotFromParts(layer),
	});
}

describe("publish plan for new tabs and groups", () => {
	it("publishes them, and warns what Unified Interface does with a tab", () => {
		const p = planOf(session1(), def("HomepageGrid", [oobMain()]));
		expect(p.hasChanges).toBe(true);
		expect(p.unsupported).toEqual([]);
		expect(p.editedCommandIds.sort()).toEqual(COMMANDS.map((c) => c.id).sort());
		expect(p.warnings).toEqual([`New tab "Tools" (${TAB}): ${UCI_TAB_NOTE}`]);
	});

	it("reports an application tab without a display rule (it would never be shown)", () => {
		const tab: RibbonTab = { id: "cbs.App.Tab", label: "App", sequence: 10, commandId: "cbs.App.Tab.Command", tabDisplayRules: [], groups: [] };
		const app = (tabs: RibbonTab[]): RibbonDefinition => ({ location: "Application", entityLogicalName: "{!EntityLogicalName}", tabs });
		expect(planOf(app([tab]), app([])).unsupported).toEqual([
			"New tab cbs.App.Tab has no tab display rule, so it would never be shown — add one in Tab rules",
		]);
		const withRule = { ...tab, tabDisplayRules: [{ tabCommand: "cbs.App.Tab.Command", rules: [{ kind: "PageRule" as const, address: "/main.aspx" }] }] };
		expect(planOf(app([withRule]), app([])).unsupported).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Publish (read–merge–write) round trip
// ---------------------------------------------------------------------------

async function publish(
	current: RibbonDefinition,
	baseline: RibbonDefinition,
	opts: { commands?: CommandDefinition[]; baselineCommands?: CommandDefinition[]; locLabels?: LocLabel[] } = {},
) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const commands = opts.commands ?? COMMANDS;
	const p = planOf(current, baseline, opts);
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: E, schemaName: "Contact" },
		locations: [{ current, baseline }],
		commands,
		enableRules: [],
		displayRules: [],
		locLabels: opts.locLabels ?? [],
		plan: p,
		languageCode: 1033,
	});
	return { plan: p, ...result, doc: parse(result.xml) };
}

const FIXTURE = readFileSync(resolve(__dirname, "../__fixtures__/ribbon/contact-cbs-tabs.xml"), "utf-8");

/**
 * What RetrieveEntityRibbon really returns after a CBS publish (verified live,
 * #58): the table's template tabs (with the new group on the main tab), but
 * NOT the tabs the layer adds at Mscrm.Tabs._children, nor their commands.
 */
const LIVE = (() => {
	const doc = parse(FIXTURE);
	for (const el of Array.from(doc.querySelectorAll('Tab[Id^="cbs."], TabDisplayRule'))) el.remove();
	for (const el of Array.from(doc.querySelectorAll("CommandDefinition"))) {
		if (/Sync|\.Tab\.Command$/.test(el.getAttribute("Id") ?? "")) el.remove();
	}
	return new XMLSerializer().serializeToString(doc);
})();

/**
 * Session 2: the table reloaded after session 1 was published, the way
 * fetchRibbonWorkspace does it: the merged ribbon, plus the layer's own tabs
 * rebuilt from the layer, ownership, and commands the merged ribbon lacks.
 */
function reload(xml = LIVE) {
	const labels = locLabelsFromParts(layer);
	const parsed = parseRibbonXml(xml, "HomepageGrid", E, labels);
	const ribbons = splitTabsByLocation(parsed.ribbon.tabs, E, parsed.ribbon.scalingByTab);
	addLayerTabs(ribbons, layer, E, labels);
	const own = ownControlIds(layer);
	for (const d of Object.values(ribbons)) applyLayerOwnership(d, own);
	reconcileWithLayer(Object.values(ribbons), parsed, layer);
	return { ...parsed, ribbons };
}

async function publishSession1() {
	const first = await publish(session1(), def("HomepageGrid", [oobMain()]));
	layer = parseRibbonDiffParts(first.xml); // what Dataverse keeps in the unmanaged layer
	return first;
}

describe("round trip — publish, reload, publish again", () => {
	it("the first publish writes the group, the tab, their buttons, commands, labels and tab rule", async () => {
		const { doc, xml } = await publishSession1();
		expect(attrs(doc.querySelectorAll("CustomActions > CustomAction"))).toEqual(
			expect.arrayContaining([`${TAB}.CustomAction`, `${GROUP}.CustomAction`, `${GROUP}.MaxSize.CustomAction`]),
		);
		expect(attrs(doc.querySelectorAll(`Group[Id="${GROUP}"] > Controls > Button`))).toEqual([
			"cbs.contact.Approve.Button",
			"cbs.contact.Reject.Button",
		]);
		expect(attrs(doc.querySelectorAll(`Tab[Id="${TAB}"] Button`))).toEqual(["cbs.contact.Sync.Button"]);
		// The tab's Command survives the "only edited commands" filter of the publish.
		expect(attrs(doc.querySelectorAll("CommandDefinitions > CommandDefinition")).sort()).toEqual(
			[...COMMANDS.map((c) => c.id), `${TAB}.Command`].sort(),
		);
		expect(attrs(doc.querySelectorAll("TabDisplayRule"), "TabCommand")).toEqual([`${TAB}.Command`]);
		expect(errorsOf(xml)).toEqual([]);
	});

	it("the layer then owns the tab, the group and the buttons written inside them", async () => {
		await publishSession1();
		expect([...ownContainerIds(layer)].sort()).toEqual([GROUP, TAB, TAB_GROUP].sort());
		expect([...ownControlIds(layer)]).toEqual(
			expect.arrayContaining(["cbs.contact.Approve.Button", "cbs.contact.Reject.Button", "cbs.contact.Sync.Button"]),
		);
	});

	it("custom tabs RetrieveEntityRibbon returns go to the location their display rule names", async () => {
		await publishSession1();
		const { ribbons } = reload(FIXTURE);
		expect(ribbons.HomepageGrid.tabs.map((t) => t.id)).toEqual([MAIN, TAB]);
		expect(ribbons.Form.tabs.map((t) => t.id)).toEqual([`Mscrm.Form.${E}.MainTab`, "cbs.contact.Form.Review.Tab"]);
		expect(ribbons.SubGrid.tabs.map((t) => t.id)).toEqual([`Mscrm.SubGrid.${E}.MainTab`, "cbs.contact.SubGrid.Extra.Tab"]);
	});

	it("reload: the layer's tab, missing from RetrieveEntityRibbon, is rebuilt from the layer with its group, button, rule and command", async () => {
		await publishSession1();
		expect(LIVE).not.toContain(TAB);
		const { ribbons, locLabels, commands } = reload();
		expect(ribbons.HomepageGrid.tabs.map((t) => t.id)).toEqual([MAIN, TAB]);
		expect(ribbons.Form.tabs.map((t) => t.id)).toEqual([`Mscrm.Form.${E}.MainTab`]);
		expect(ribbons.HomepageGrid.scalingByTab?.[TAB]?.maxSizes.map((m) => m.groupId)).toEqual([TAB_GROUP]);
		expect(ribbons.HomepageGrid.tabs[1].groups[0].buttons.map((b) => [b.id, b.label, b.origin, b.commandId])).toEqual([
			["cbs.contact.Sync.Button", "Sync", "unmanaged", "cbs.contact.Sync.Command"],
		]);
		// The button's command comes from the layer (the #57 reconcile path).
		expect(commands.find((c) => c.id === "cbs.contact.Sync.Command")?.actions).toHaveLength(1);

		const tab = ribbons.HomepageGrid.tabs[1];
		expect(tab.commandId).toBe(`${TAB}.Command`);
		expect(tab.tabDisplayRules).toEqual([
			{ tabCommand: `${TAB}.Command`, rules: [{ kind: "EntityRule", entityName: E, context: "HomePageGrid", appliesTo: "PrimaryEntity" }] },
		]);
		expect(resolveDisplayLabel(tab.label, locLabels)).toBe("Tools");
		expect(resolveDisplayLabel(tab.groups[0].label, locLabels)).toBe("Tools");

		const group = ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === GROUP)!;
		expect(resolveDisplayLabel(group.label, locLabels)).toBe("Approvals");
		expect(group.buttons.map((b) => [b.id, b.label, b.origin])).toEqual([
			["cbs.contact.Approve.Button", "Approve", "unmanaged"],
			["cbs.contact.Reject.Button", "Reject", "unmanaged"],
		]);
	});

	it("an unchanged reload plans nothing", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const p = planOf(ribbons.HomepageGrid, clone(ribbons.HomepageGrid), { commands, baselineCommands: clone(commands), locLabels });
		expect(p.hasChanges).toBe(false);
		expect(p.unsupported).toEqual([]);
		expect(p.warnings).toEqual([]);
	});

	it("a second publish keeps the first's tab and group as they are", async () => {
		await publishSession1();
		const before = new Map(layer.customActions);
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		current.tabs[0].groups[0].buttons[0].hidden = true; // an unrelated change: hide New
		const { doc } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		const after = parseRibbonDiffParts(new XMLSerializer().serializeToString(doc));
		for (const key of [`ca:${TAB}.CustomAction`, `ca:${GROUP}.CustomAction`, `ca:${GROUP}.MaxSize.CustomAction`]) {
			expect(stableElementXml("customActions", after.customActions.get(key)!)).toBe(
				stableElementXml("customActions", before.get(key)!),
			);
		}
		expect(doc.querySelectorAll("HideCustomAction")).toHaveLength(1);
		expect(attrs(doc.querySelectorAll("TabDisplayRule"), "TabCommand")).toEqual([`${TAB}.Command`]);
		expect(attrs(doc.querySelectorAll("CommandDefinitions > CommandDefinition"))).toContain(`${TAB}.Command`);
	});

	it("buttons added to the published group and tab are written inside them; an edit is made in place", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		const group = current.tabs[0].groups.find((g) => g.id === GROUP)!;
		group.buttons[1].label = "Decline";
		group.buttons.push(btn("cbs.contact.Escalate.Button", "Escalate", 30, "cbs.contact.Approve.Command"));
		current.tabs[1].groups[0].buttons.push(btn("cbs.contact.Export.Button", "Export", 20, "cbs.contact.Sync.Command"));
		const { doc, plan, xml } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(plan.unsupported).toEqual([]);

		expect(attrs(doc.querySelectorAll(`Group[Id="${GROUP}"] > Controls > Button`))).toEqual([
			"cbs.contact.Approve.Button",
			"cbs.contact.Reject.Button",
			"cbs.contact.Escalate.Button",
		]);
		expect(attrs(doc.querySelectorAll(`Tab[Id="${TAB}"] Group[Id="${TAB_GROUP}"] > Controls > Button`))).toEqual([
			"cbs.contact.Sync.Button",
			"cbs.contact.Export.Button",
		]);
		const children = attrs(doc.querySelectorAll("CustomActions > CustomAction"), "Location");
		expect(children.filter((l) => l?.endsWith(".Controls._children"))).toEqual([]);
		expect(doc.querySelectorAll('Button[Id="cbs.contact.Reject.Button"]')).toHaveLength(1);
		expect(
			doc.querySelector('LocLabel[Id="cbs.contact.Reject.Button.LabelText"] Title')!.getAttribute("description"),
		).toBe("Decline");
		expect(attrs(doc.querySelectorAll("LocLabels > LocLabel"))).toEqual(
			expect.arrayContaining(["cbs.contact.Escalate.Button.LabelText", "cbs.contact.Export.Button.LabelText", `${TAB}.Title`, `${GROUP}.Title`]),
		);
		expect(errorsOf(xml)).toEqual([]);
	});

	it("a new group (with a button) on the published tab is written inside that tab, with its MaxSize", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		current.tabs[1].groups.push({
			id: "cbs.contact.More.Group",
			label: "More",
			sequence: 20,
			template: "Flexible2",
			buttons: [btn("cbs.contact.More.Button", "More", 10, "cbs.contact.Sync.Command")],
		});
		const { doc, plan, xml } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(plan.unsupported).toEqual([]);
		const tab = doc.querySelector(`CustomAction[Id="${TAB}.CustomAction"] > CommandUIDefinition > Tab`)!;
		expect(attrs(tab.querySelectorAll(":scope > Groups > Group"))).toEqual([TAB_GROUP, "cbs.contact.More.Group"]);
		expect(attrs(tab.querySelectorAll('Group[Id="cbs.contact.More.Group"] > Controls > Button'))).toEqual(["cbs.contact.More.Button"]);
		expect(attrs(tab.querySelectorAll(":scope > Scaling > MaxSize"), "GroupId")).toEqual([TAB_GROUP, "cbs.contact.More.Group"]);
		const locations = attrs(doc.querySelectorAll("CustomActions > CustomAction"), "Location");
		expect(locations.filter((l) => l?.startsWith(`${TAB}.`))).toEqual([]);
		expect(errorsOf(xml)).toEqual([]);
	});

	it("deleting a button inside the published group removes it there, with its unused command", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		const group = current.tabs[0].groups.find((g) => g.id === GROUP)!;
		group.buttons = group.buttons.filter((b) => b.id !== "cbs.contact.Reject.Button");
		const { doc, plan } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(plan.deletedButtonIds).toEqual(["cbs.contact.Reject.Button"]);
		expect(plan.unsupported).toEqual([]);
		expect(attrs(doc.querySelectorAll(`Group[Id="${GROUP}"] > Controls > Button`))).toEqual(["cbs.contact.Approve.Button"]);
		expect(attrs(doc.querySelectorAll("CommandDefinitions > CommandDefinition"))).not.toContain("cbs.contact.Reject.Command");
		expect(attrs(doc.querySelectorAll("LocLabels > LocLabel"))).not.toContain("cbs.contact.Reject.Button.LabelText");
	});

	it("moving a button out of the published group gives it its own CustomAction at the new group", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		const group = current.tabs[0].groups.find((g) => g.id === GROUP)!;
		const [approve] = group.buttons.splice(0, 1);
		current.tabs[0].groups[0].buttons.push({ ...approve, sequence: 50 });
		const { doc, plan } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(plan.movedButtons).toEqual([{ id: "cbs.contact.Approve.Button", groupId: `${MAIN}.Management`, sequence: 50 }]);
		expect(plan.unsupported).toEqual([]);
		expect(doc.querySelectorAll('Button[Id="cbs.contact.Approve.Button"]')).toHaveLength(1);
		const moved = doc.querySelector('Button[Id="cbs.contact.Approve.Button"]')!;
		const ca = moved.closest("CustomAction")!;
		expect(ca.getAttribute("Location")).toBe(`${MAIN}.Management.Controls._children`);
		expect(ca.getAttribute("Sequence")).toBe("50");
		expect(moved.getAttribute("Sequence")).toBe("50");
		expect(attrs(doc.querySelectorAll(`Group[Id="${GROUP}"] > Controls > Button`))).toEqual(["cbs.contact.Reject.Button"]);
	});

	it("deleting the published tab removes it with its buttons, command and display rule", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		current.tabs = current.tabs.filter((t) => t.id !== TAB);
		const { doc, plan } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(plan.deletedContainerIds).toEqual([TAB]);
		expect(doc.querySelector(`Tab[Id="${TAB}"]`)).toBeNull();
		expect(doc.querySelector('Button[Id="cbs.contact.Sync.Button"]')).toBeNull();
		expect(doc.querySelectorAll("TabDisplayRule")).toHaveLength(0);
		const cmds = attrs(doc.querySelectorAll("CommandDefinitions > CommandDefinition"));
		expect(cmds).not.toContain(`${TAB}.Command`);
		expect(cmds).not.toContain("cbs.contact.Sync.Command");
		// The group on the main tab is untouched.
		expect(attrs(doc.querySelectorAll(`Group[Id="${GROUP}"] > Controls > Button`))).toHaveLength(2);
	});
});

describe("layers written by earlier CBS versions are repaired (#59)", () => {
	const ca = (id: string, location: string, seq: number, inner: string) =>
		`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
	const legacy = () =>
		parseRibbonDiffParts(`<RibbonDiffXml><CustomActions>
			${ca(`${GROUP}.CustomAction`, `${MAIN}.Groups._children`, 60, `<Group Id="${GROUP}" Title="$LocLabels:${GROUP}.Title" Sequence="60" Template="Mscrm.Templates.Flexible2"><Controls Id="${GROUP}.Controls" /></Group>`)}
			${ca("cbs.contact.Approve.Button.CustomAction", `${GROUP}.Controls._children`, 10, `<Button Id="cbs.contact.Approve.Button" Command="cbs.contact.Approve.Command" Sequence="10" LabelText="Approve" TemplateAlias="o1" />`)}
			${ca(`${TAB}.CustomAction`, "Mscrm.Tabs._children", 500, `<Tab Id="${TAB}" Command="${TAB}.Command" Title="Tools" Sequence="500"><Scaling Id="${TAB}.Scaling"><Scale Id="s" GroupId="${TAB_GROUP}" Sequence="20" Size="Popup" /></Scaling><Groups Id="${TAB}.Groups"><Group Id="${TAB_GROUP}" Title="Tools" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${TAB_GROUP}.Controls" /></Group></Groups></Tab>`)}
			${ca("cbs.contact.Sync.Button.CustomAction", `${TAB_GROUP}.Controls._children`, 10, `<Button Id="cbs.contact.Sync.Button" Command="cbs.contact.Sync.Command" LabelText="Sync" TemplateAlias="o1" />`)}
			${ca("cbs.contact.G2.CustomAction", `${TAB}.Groups._children`, 20, `<Group Id="cbs.contact.G2" Title="Two" Sequence="20" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.contact.G2.Controls" /></Group>`)}
			${ca("cbs.contact.G2.MaxSize.CustomAction", `${TAB}.Scaling._children`, 20, `<MaxSize Id="cbs.contact.G2.MaxSize" GroupId="cbs.contact.G2" Sequence="20" Size="LargeLarge" />`)}
			${ca("cbs.contact.Mine.CustomAction", `${MAIN}.Management.Controls._children`, 900, `<Button Id="cbs.contact.Mine" Command="cbs.contact.Approve.Command" Sequence="900" LabelText="Mine" TemplateAlias="o1" />`)}
		</CustomActions></RibbonDiffXml>`);

	it("folds children of the layer's own groups and tabs into them", () => {
		const folded = foldIntoOwnContainers(legacy().customActions);
		expect([...folded.keys()].sort()).toEqual(
			[`ca:${GROUP}.CustomAction`, `ca:${TAB}.CustomAction`, "ca:cbs.contact.Mine.CustomAction"].sort(),
		);
		const doc = parse(`<x>${[...folded.values()].join("")}</x>`);
		expect(attrs(doc.querySelectorAll(`Group[Id="${GROUP}"] > Controls > Button`))).toEqual(["cbs.contact.Approve.Button"]);
		expect(attrs(doc.querySelectorAll(`Group[Id="${TAB_GROUP}"] > Controls > Button`))).toEqual(["cbs.contact.Sync.Button"]);
		// The CustomAction's Sequence is kept when the control had none.
		expect(doc.querySelector('Button[Id="cbs.contact.Sync.Button"]')!.getAttribute("Sequence")).toBe("10");
		expect(attrs(doc.querySelectorAll(`Tab[Id="${TAB}"] > Groups > Group`))).toEqual([TAB_GROUP, "cbs.contact.G2"]);
		// Every MaxSize before any Scale.
		expect(Array.from(doc.querySelector(`Tab[Id="${TAB}"] > Scaling`)!.children).map((c) => c.tagName)).toEqual(["MaxSize", "Scale"]);
		// A button the layer adds to an out-of-the-box group stays as it is.
		expect(doc.querySelector(`CustomAction[Id="cbs.contact.Mine.CustomAction"]`)!.getAttribute("Location")).toBe(
			`${MAIN}.Management.Controls._children`,
		);
	});

	it("…on the next publish, whatever it changes", async () => {
		layer = legacy();
		const baseline = def("HomepageGrid", [oobMain()]);
		const current = clone(baseline);
		current.tabs[0].groups[0].buttons[0].hidden = true;
		const { doc } = await publish(current, baseline);
		expect(doc.querySelector(`Group[Id="${GROUP}"] > Controls > Button[Id="cbs.contact.Approve.Button"]`)).not.toBeNull();
		const children = attrs(doc.querySelectorAll("CustomActions > CustomAction"), "Location");
		expect(children.filter((l) => l?.endsWith(".Controls._children"))).toEqual([`${MAIN}.Management.Controls._children`]);
	});
});

// ---------------------------------------------------------------------------
// #66 review: scaling Sequences must be unique in the tab
// ---------------------------------------------------------------------------

describe("#66 review — a new group's MaxSize never reuses a scaling Sequence of its tab", () => {
	const T = "cbstest_ribbontest";
	const TMAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
	const step = (kind: "MaxSize" | "Scale", seq: number, group: string, size = "LargeMedium") => ({
		id: `${TMAIN}.Scaling.${kind}.${seq}`,
		groupId: `${TMAIN}.${group}`,
		size,
		sequence: seq,
	});
	// The home grid main tab's scaling of cbstest_ribbontest, as RetrieveEntityRibbon returned it.
	const REAL_SCALING = {
		tabId: TMAIN,
		maxSizes: [
			step("MaxSize", 10, "Management"),
			step("MaxSize", 20, "Collaborate"),
			step("MaxSize", 30, "Actions"),
			step("MaxSize", 40, "ExportData"),
			step("MaxSize", 50, "Workflow"),
			step("MaxSize", 60, "Find"),
			step("MaxSize", 61, "OutlookHelp"),
		],
		scales: [
			step("Scale", 80, "ExportData"),
			step("Scale", 100, "Workflow"),
			step("Scale", 110, "Actions"),
			step("Scale", 120, "Collaborate"),
			step("Scale", 130, "Management"),
			step("Scale", 140, "ExportData", "Popup"),
			step("Scale", 150, "Collaborate", "Popup"),
			step("Scale", 160, "Actions", "Popup"),
			step("Scale", 170, "Management", "Popup"),
		],
	};
	const realMain = (): RibbonDefinition => ({
		location: "HomepageGrid",
		entityLogicalName: T,
		tabs: [
			{
				id: TMAIN,
				label: "Main",
				sequence: 10,
				commandId: TMAIN,
				tabDisplayRules: [],
				groups: ["Management", "Collaborate", "Actions", "ExportData", "Workflow", "Find", "OutlookHelp"].map((g, i) => ({
					id: `${TMAIN}.${g}`,
					label: g,
					sequence: (i + 1) * 10,
					template: "Mscrm.Templates.Flexible2",
					buttons: [],
				})),
			},
		],
		scalingByTab: { [TMAIN]: clone(REAL_SCALING) },
	});
	const withNewGroups = (...seqs: number[]): RibbonDefinition => {
		const d = realMain();
		seqs.forEach((seq, i) =>
			d.tabs[0].groups.push({
				id: `new.${T}.HomepageGrid.G${i}.Group`,
				label: `G${i}`,
				sequence: seq,
				template: "Flexible2",
				buttons: [btn(`new.${T}.B${i}.Button`, `B${i}`, 10, "cbs.contact.Sync.Command")],
			}),
		);
		return d;
	};
	const maxSizesOf = (xml: string) =>
		Array.from(parse(xml).querySelectorAll(`CustomAction[Location="${TMAIN}.Scaling._children"] MaxSize`)).map((m) => [
			m.getAttribute("GroupId"),
			Number(m.getAttribute("Sequence")),
		]);

	it("goes after the last MaxSize and before the first Scale — not at the group's Sequence (80 = Scale ExportData)", () => {
		const xml = generate(withNewGroups(80), realMain());
		expect(maxSizesOf(xml)).toEqual([[`new.${T}.HomepageGrid.G0.Group`, 62]]);
		const ca = parse(xml).querySelector(`CustomAction[Location="${TMAIN}.Scaling._children"]`)!;
		expect(ca.getAttribute("Sequence")).toBe("62");
		// The group keeps its own Sequence.
		expect(parse(xml).querySelector(`Group[Id="new.${T}.HomepageGrid.G0.Group"]`)!.getAttribute("Sequence")).toBe("80");
		expect(planOf(withNewGroups(80), realMain()).unsupported).toEqual([]);
	});

	it("several new groups get distinct Sequences, skipping ones already used (a MaxSize the layer added before)", () => {
		const current = withNewGroups(80, 80, 150);
		const baseline = realMain();
		for (const d of [current, baseline]) d.scalingByTab![TMAIN].maxSizes.push(step("MaxSize", 63, "Earlier"));
		const all = [...REAL_SCALING.maxSizes, ...REAL_SCALING.scales].map((s) => s.sequence).concat(63);
		const got = maxSizesOf(generate(current, baseline)).map(([, seq]) => seq as number);
		expect(got).toEqual([64, 65, 66]);
		for (const seq of got) expect(all).not.toContain(seq);
		expect(Math.max(...got)).toBeLessThan(80);
	});

	it("with no free Sequence between the last MaxSize and the first Scale, the publish is blocked", () => {
		const current = withNewGroups(80);
		const baseline = realMain();
		for (const d of [current, baseline]) d.scalingByTab![TMAIN].scales.unshift(step("Scale", 62, "Find"));
		const p = planOf(current, baseline);
		expect(p.unsupported).toEqual([
			`No free scaling position for the new group "G0" (new.${T}.HomepageGrid.G0.Group) on tab ${TMAIN}: its MaxSize must ` +
				"come after the tab's last MaxSize (61) and before its first Scale (62), and no Sequence is free there",
		]);
		expect(maxSizesOf(generate(current, baseline))).toEqual([]);
	});

	it("in a new tab, groups with the same Sequence get distinct MaxSize Sequences", () => {
		const tab = session1().tabs[1];
		tab.groups.push({ ...clone(tab.groups[0]), id: "cbs.contact.Tools2.Group", buttons: [] });
		const doc = parse(generate(def("HomepageGrid", [tab]), def("HomepageGrid", [])));
		const seqs = attrs(doc.querySelectorAll(`Tab[Id="${TAB}"] > Scaling > MaxSize`), "Sequence");
		expect(seqs).toEqual(["10", "11"]);
	});

	it("a new tab whose scaling repeats a Sequence is blocked", () => {
		const current = def("HomepageGrid", [session1().tabs[1]]);
		current.scalingByTab = {
			[TAB]: {
				tabId: TAB,
				maxSizes: [{ id: "m", groupId: TAB_GROUP, size: "LargeLarge", sequence: 10 }],
				scales: [{ id: "s", groupId: TAB_GROUP, size: "Popup", sequence: 10 }],
			},
		};
		expect(planNewGroupScaling(current, def("HomepageGrid", [])).problems).toEqual([
			`The scaling of new tab ${TAB} uses a Sequence more than once — give every MaxSize and Scale its own`,
		]);
	});

	it("the parser loads each tab's scaling and the reload keeps it per location", async () => {
		await publishSession1();
		const { ribbons, commands } = reload();
		expect(ribbons.HomepageGrid.scalingByTab?.[MAIN]).toEqual({
			tabId: MAIN,
			maxSizes: [
				{ id: `${MAIN}.Management.MaxSize`, groupId: `${MAIN}.Management`, size: "LargeMedium", sequence: 10 },
				{ id: `${GROUP}.MaxSize`, groupId: GROUP, size: "LargeLarge", sequence: 60 },
			],
			scales: [],
		});
		expect(Object.keys(ribbons.HomepageGrid.scalingByTab ?? {})).toEqual([MAIN, TAB]);
		const full = reload(FIXTURE).ribbons;
		expect(Object.keys(full.Form.scalingByTab ?? {})).toEqual(["cbs.contact.Form.Review.Tab"]);
		expect(Object.keys(full.SubGrid.scalingByTab ?? {})).toEqual(["cbs.contact.SubGrid.Extra.Tab"]);
		// An unchanged reload still plans nothing (scaling is compared too).
		const p = planOf(ribbons.HomepageGrid, clone(ribbons.HomepageGrid), { commands, baselineCommands: clone(commands) });
		expect(p.hasChanges).toBe(false);
		expect(p.unsupported).toEqual([]);
	});

	it("after a reload, the next new group's MaxSize goes after the loaded ones", async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		const baseline = clone(ribbons.HomepageGrid);
		const current = clone(ribbons.HomepageGrid);
		current.tabs[0].groups.push({ id: "cbs.contact.Next.Group", label: "Next", sequence: 60, template: "Flexible2", buttons: [] });
		const { doc } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		const maxSize = doc.querySelector('MaxSize[GroupId="cbs.contact.Next.Group"]')!;
		expect(maxSize.getAttribute("Sequence")).toBe("61");
	});
});

describe("#66 review — new group ids and new button sequences", () => {
	beforeEach(() => {
		useSessionStore.setState({ publisherPrefix: "cbs" });
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: def("HomepageGrid", [oobMain()]),
				Form: def("Form", []),
				SubGrid: def("SubGrid", []),
				Application: { location: "Application", entityLogicalName: "{!EntityLogicalName}", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
		});
	});

	it("a new group gets a prefixed, unique id and a sequence no other group of the tab has", () => {
		const s = useRibbonStore.getState();
		s.createGroup({ location: "HomepageGrid", tabId: MAIN, group: { label: "New Group", sequence: 10, template: "Flexible2", buttons: [] } });
		s.createGroup({ location: "HomepageGrid", tabId: MAIN, group: { label: "New Group", template: "Flexible2", buttons: [] } });
		const groups = useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups;
		expect(groups.map((g) => [g.id, g.sequence])).toEqual([
			[`${MAIN}.Management`, 10],
			[`cbs.${E}.HomepageGrid.NewGroup.Group`, 20],
			[`cbs.${E}.HomepageGrid.NewGroup.Group2`, 30],
		]);
	});

	it("buttons added to a group get increasing, unique sequences", () => {
		const s = useRibbonStore.getState();
		s.createGroup({ location: "HomepageGrid", tabId: MAIN, group: { label: "Approvals", template: "Flexible2", buttons: [] } });
		const groupId = useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[1].id;
		const add = (id: string, sequence?: number) =>
			useRibbonStore.getState().createButton({
				location: "HomepageGrid",
				tabId: MAIN,
				groupId,
				button: { ...btn(id, id, 0, ""), sequence },
			});
		add("a");
		add("b");
		add("c", 50);
		add("d", 50);
		const buttons = useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups[1].buttons;
		expect(buttons.map((b) => [b.id, b.sequence])).toEqual([
			["a", 10],
			["b", 20],
			["c", 50],
			["d", 60],
		]);
	});
});

// ---------------------------------------------------------------------------
// Live result of #66: tabs the layer adds are never returned by
// RetrieveEntityRibbon / RetrieveApplicationRibbon — CBS rebuilds them.
// ---------------------------------------------------------------------------

describe("#58 — the layer's own tabs are loaded from the layer", () => {
	const reloadFor = async () => {
		await publishSession1();
		const { ribbons, commands, locLabels } = reload();
		return { baseline: clone(ribbons.HomepageGrid), current: clone(ribbons.HomepageGrid), commands, locLabels };
	};

	it("renaming the tab changes its title label only", async () => {
		const { baseline, current, commands, locLabels } = await reloadFor();
		const before = layer.customActions.get(`ca:${TAB}.CustomAction`)!;
		current.tabs[1].label = "Utilities";
		const { doc, plan } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(plan.unsupported).toEqual([]);
		expect(plan.renamedLabels).toEqual([{ id: `${TAB}.Title`, text: "Utilities" }]);
		expect(doc.querySelector(`LocLabel[Id="${TAB}.Title"] Title`)!.getAttribute("description")).toBe("Utilities");
		const after = parseRibbonDiffParts(new XMLSerializer().serializeToString(doc));
		expect(stableElementXml("customActions", after.customActions.get(`ca:${TAB}.CustomAction`)!)).toBe(
			stableElementXml("customActions", before),
		);
	});

	it("renaming a group of the tab (or the layer's group on the main tab) changes its title label; other languages stay", async () => {
		const { baseline, current, commands, locLabels } = await reloadFor();
		current.tabs[1].groups[0].label = "Sync tools";
		current.tabs[0].groups.find((g) => g.id === GROUP)!.label = "Reviews";
		const labels = locLabels.map((l) => (l.id === `${GROUP}.Title` ? { ...l, titles: [...l.titles, { languageCode: 1031, description: "Freigaben" }] } : l));
		const { doc, plan } = await publish(current, baseline, { commands, baselineCommands: clone(commands), locLabels: labels });
		expect(plan.unsupported).toEqual([]);
		const titles = (id: string) =>
			Array.from(doc.querySelectorAll(`LocLabel[Id="${id}"] Title`)).map((t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`);
		expect(titles(`${TAB_GROUP}.Title`)).toEqual(["1033=Sync tools"]);
		expect(titles(`${GROUP}.Title`).sort()).toEqual(["1031=Freigaben", "1033=Reviews"]);
	});

	it("renaming an out-of-the-box tab is still reported", async () => {
		const { baseline, current, commands, locLabels } = await reloadFor();
		current.tabs[0].label = "My contacts";
		const p = planOf(current, baseline, { commands, baselineCommands: clone(commands), locLabels });
		expect(p.unsupported).toEqual([
			`Renaming tab ${MAIN} — only tabs and groups your unmanaged customizations add (with a translatable title) can be renamed`,
		]);
	});

	it("form and sub-grid tabs of the layer are placed by their location and display rule", () => {
		const tab = (id: string): RibbonTab => ({ ...clone(session1().tabs[1]), id, groups: [] });
		layer = mergeRibbonDiffParts(
			parseRibbonDiffParts(generate(def("Form", [tab("cbs.contact.Form.F.Tab")]), def("Form", []))),
			parseRibbonDiffParts(generate(def("SubGrid", [tab("cbs.contact.SubGrid.S.Tab")]), def("SubGrid", []))),
		);
		const { ribbons } = reload();
		expect(ribbons.Form.tabs.map((t) => t.id)).toEqual([`Mscrm.Form.${E}.MainTab`, "cbs.contact.Form.F.Tab"]);
		expect(ribbons.SubGrid.tabs.map((t) => t.id)).toEqual([`Mscrm.SubGrid.${E}.MainTab`, "cbs.contact.SubGrid.S.Tab"]);
		expect(ribbons.HomepageGrid.tabs.map((t) => t.id)).toEqual([MAIN]);
		expect(ribbons.Form.tabs[1].tabDisplayRules[0].rules[0]).toMatchObject({ kind: "EntityRule", context: "Form" });
	});

	it("children the layer adds separately are folded in, and controls it hides are left out", () => {
		const ca = (id: string, location: string, inner: string) =>
			`<CustomAction Id="${id}" Location="${location}" Sequence="10"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
		layer = parseRibbonDiffParts(`<RibbonDiffXml><CustomActions>
			${ca(`${TAB}.CustomAction`, "Mscrm.Tabs._children", `<Tab Id="${TAB}" Command="${TAB}.Command" Title="Tools" Sequence="500"><Groups Id="${TAB}.Groups"><Group Id="${TAB_GROUP}" Title="Tools" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${TAB_GROUP}.Controls"><Button Id="cbs.contact.Hidden.Button" Command="x" Sequence="5" LabelText="Hidden" TemplateAlias="o1" /></Controls></Group></Groups></Tab>`)}
			${ca("cbs.contact.Sync.Button.CustomAction", `${TAB_GROUP}.Controls._children`, `<Button Id="cbs.contact.Sync.Button" Command="cbs.contact.Sync.Command" Sequence="10" LabelText="Sync" TemplateAlias="o1" />`)}
			<HideCustomAction HideActionId="h" Location="cbs.contact.Hidden.Button" />
		</CustomActions></RibbonDiffXml>`);
		const { ribbons } = reload();
		const tab = ribbons.HomepageGrid.tabs.find((t) => t.id === TAB)!;
		expect(tab.groups[0].buttons.map((b) => [b.id, b.origin])).toEqual([["cbs.contact.Sync.Button", "unmanaged"]]);
		// No display rule in the layer → the home grid.
		expect(tab.tabDisplayRules).toEqual([]);
	});

	it("an application-ribbon tab of the layer is added to the application ribbon", () => {
		const app: RibbonDefinition = { location: "Application", entityLogicalName: "{!EntityLogicalName}", tabs: [] };
		const tab: RibbonTab = {
			id: "cbs.App.Tab",
			label: "App",
			sequence: 10,
			commandId: "cbs.App.Tab.Command",
			tabDisplayRules: [{ tabCommand: "cbs.App.Tab.Command", rules: [{ kind: "PageRule", address: "/main.aspx" }] }],
			groups: [],
		};
		const appLayer = parseRibbonDiffParts(generate({ ...app, tabs: [tab] }, app));
		expect(addLayerTabs({ Application: app }, appLayer, null, [])).toEqual(["cbs.App.Tab"]);
		expect(app.tabs.map((t) => [t.id, t.commandId])).toEqual([["cbs.App.Tab", "cbs.App.Tab.Command"]]);
		expect(app.tabs[0].tabDisplayRules[0].rules).toEqual([{ kind: "PageRule", address: "/main.aspx" }]);
	});
});
