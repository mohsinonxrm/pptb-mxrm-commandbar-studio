/**
 * Adversarial review of PR #66 (new tabs and groups, #58 / #59): one
 * regression test per finding.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { planScope } from "@/services/publishPlan";
import { defaultTabDisplayRules } from "@/services/xmlGenerator";
import { emptyRibbonDiffParts, parseRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { layerSnapshotFromParts, type LayerSnapshot } from "@/services/dataverse/ribbonLayerService";
import { addLayerTabs } from "@/services/dataverse/ribbonService";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import type { LocLabel, RibbonButton, RibbonDefinition, RibbonLocation, RibbonTab, ScaleStep } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const E = "contact";
const MAIN = `Mscrm.HomepageGrid.${E}.MainTab`;
const MGMT = `${MAIN}.Management`;

const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));
const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const ca = (id: string, location: string, seq: number, inner: string) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;
const layerOf = (customActions: string, labels = "") =>
	parseRibbonDiffParts(`<RibbonDiffXml><CustomActions>${customActions}</CustomActions><LocLabels>${labels}</LocLabels></RibbonDiffXml>`);
const label = (id: string, ...titles: [number, string][]) =>
	`<LocLabel Id="${id}"><Titles>${titles.map(([l, d]) => `<Title languagecode="${l}" description="${d}" />`).join("")}</Titles></LocLabel>`;
const step = (id: string, groupId: string, sequence: number, size = "LargeMedium"): ScaleStep => ({ id, groupId, size, sequence });

const btn = (id: string, extra: Partial<RibbonButton> = {}): RibbonButton => ({
	id,
	label: id,
	kind: "button",
	sequence: 10,
	templateAlias: "o1",
	commandId: "",
	hidden: false,
	oob: false,
	custom: true,
	managed: false,
	origin: "unmanaged",
	...extra,
});

/** The home grid with its out-of-the-box main tab: MaxSize 10 / 50, Scale 80. */
function grid(extraMain: ScaleStep[] = [], extraGroups: RibbonTab["groups"] = []): RibbonDefinition {
	return {
		location: "HomepageGrid",
		entityLogicalName: E,
		tabs: [
			{
				id: MAIN,
				label: "Contacts",
				sequence: 100,
				commandId: MAIN,
				tabDisplayRules: [],
				groups: [
					{ id: MGMT, label: "Records", sequence: 10, template: "Mscrm.Templates.Flexible2", buttons: [btn(`${MAIN}.New`, { oob: true, custom: false, origin: "oob" })] },
					{ id: `${MAIN}.Workflow`, label: "Process", sequence: 50, template: "Mscrm.Templates.Flexible2", buttons: [] },
					...extraGroups,
				],
			},
		],
		scalingByTab: {
			[MAIN]: {
				tabId: MAIN,
				maxSizes: [step(`${MGMT}.MaxSize`, MGMT, 10), step(`${MAIN}.Workflow.MaxSize`, `${MAIN}.Workflow`, 50), ...extraMain],
				scales: [step(`${MAIN}.Workflow.Scale`, `${MAIN}.Workflow`, 80, "Popup")],
			},
		},
	};
}

function planOf(current: RibbonDefinition, baseline: RibbonDefinition, snap: LayerSnapshot | null = layerSnapshotFromParts(layer), locLabels: LocLabel[] = []) {
	return planScope({
		locations: [{ current, baseline }],
		commands: [],
		baselineCommands: [],
		enableRules: [],
		baselineEnableRules: [],
		displayRules: [],
		baselineDisplayRules: [],
		locLabels,
		baselineLocLabels: locLabels,
		layer: snap ?? undefined,
	});
}

async function publish(current: RibbonDefinition, baseline: RibbonDefinition, opts: { locLabels?: LocLabel[]; languageCode?: number } = {}) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const plan = planOf(current, baseline, layerSnapshotFromParts(layer), opts.locLabels);
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: E, schemaName: "Contact" },
		locations: [{ current, baseline }],
		commands: [],
		enableRules: [],
		displayRules: [],
		locLabels: opts.locLabels ?? [],
		plan,
		languageCode: opts.languageCode ?? 1033,
	});
	return { plan, ...result, doc: parse(result.xml) };
}

const seqs = (doc: Document | Element, selector: string) =>
	Array.from(doc.querySelectorAll(selector)).map((e) => [e.getAttribute("GroupId"), Number(e.getAttribute("Sequence"))]);

beforeEach(() => {
	layer = emptyRibbonDiffParts();
	useSessionStore.setState({ publisherPrefix: "cbs" });
});

// ---------------------------------------------------------------------------

describe("B1 — a second publish in the same session doesn't reuse the scaling Sequences of the first", () => {
	const load = () =>
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: grid(),
				Form: { location: "Form", entityLogicalName: E, tabs: [] },
				SubGrid: { location: "SubGrid", entityLogicalName: E, tabs: [] },
				Application: { location: "Application", entityLogicalName: "{!EntityLogicalName}", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
			layers: { entity: layerSnapshotFromParts(layer) },
		});
	const st = () => useRibbonStore.getState();
	const publishStore = async () => {
		const { ribbons, baseline, locLabels } = st();
		const r = await publish(ribbons.HomepageGrid, baseline.HomepageGrid, { locLabels });
		layer = r.parts;
		st().markPublished(["HomepageGrid", "Form", "SubGrid"], { entity: r.parts });
		st().setLayerSnapshot("entity", layerSnapshotFromParts(r.parts));
		return r;
	};
	const addGroup = (tabId: string, name: string) => {
		st().createGroup({ location: "HomepageGrid", tabId, group: { label: name, template: "Flexible2", buttons: [] } });
		const group = st().ribbons.HomepageGrid.tabs.find((t) => t.id === tabId)!.groups.at(-1)!;
		st().createButton({ location: "HomepageGrid", tabId, groupId: group.id, button: btn(`cbs.${name}.Button`) });
	};

	it("tab and main-tab MaxSizes stay unique across two publishes", async () => {
		load();
		st().createTab("HomepageGrid", { label: "Tools" });
		const tools = st().ribbons.HomepageGrid.tabs.find((t) => t.label === "Tools")!.id;
		addGroup(tools, "First");
		addGroup(MAIN, "MainFirst");
		const first = await publishStore();
		expect(first.plan.unsupported).toEqual([]);

		// After markPublished the model has the Sequences the layer was written with.
		expect(st().ribbons.HomepageGrid.scalingByTab?.[MAIN]?.maxSizes.map((m) => m.sequence)).toEqual([10, 50, 51]);
		expect(planOf(st().ribbons.HomepageGrid, st().baseline.HomepageGrid, st().layers.entity, st().locLabels).hasChanges).toBe(false);

		addGroup(tools, "Second");
		addGroup(MAIN, "MainSecond");
		const second = await publishStore();
		expect(second.plan.unsupported).toEqual([]);
		// Allocated right the first time — the merge didn't have to repair anything.
		expect(second.scalingChanges).toEqual([]);
		const toolsSeqs = seqs(second.doc.querySelector(`Tab[Id="${tools}"] > Scaling`)!, "MaxSize").map(([, s]) => s);
		expect(new Set(toolsSeqs).size).toBe(2);
		const mainSeqs = seqs(second.doc, `CustomAction[Location="${MAIN}.Scaling._children"] MaxSize`).map(([, s]) => s);
		expect(mainSeqs.sort()).toEqual([51, 52]);
	});

	it("m4 — after publishing, the new tab keeps its $LocLabels title, so renaming it again publishes", async () => {
		load();
		st().createTab("HomepageGrid", { label: "Tools" });
		const tools = st().ribbons.HomepageGrid.tabs.find((t) => t.label === "Tools")!.id;
		await publishStore();
		expect(st().ribbons.HomepageGrid.tabs.find((t) => t.id === tools)!.label).toBe(`$LocLabels:${tools}.Title`);
		st().renameTab("HomepageGrid", tools, "Utilities");
		const p = planOf(st().ribbons.HomepageGrid, st().baseline.HomepageGrid, st().layers.entity, st().locLabels);
		expect(p.unsupported).toEqual([]);
		expect(p.renamedLabels).toEqual([{ id: `${tools}.Title`, text: "Utilities", containerId: tools }]);
	});
});

describe("M1 / M2 — scaling written by earlier CBS versions", () => {
	// Old CBS wrote a group's MaxSize at the group's Sequence: 50 (= the
	// platform's MaxSize 50) and 80 (= the platform's Scale 80); another tool
	// put one at 200 (after the first Scale).
	const OLD = [
		step("cbs.Old50.Group.MaxSize", "cbs.Old50.Group", 50, "LargeLarge"),
		step("cbs.Old80.Group.MaxSize", "cbs.Old80.Group", 80, "LargeLarge"),
		step("rw.Late.Group.MaxSize", "rw.Late.Group", 200, "LargeLarge"),
	];
	const oldLayer = () =>
		layerOf(
			OLD.map((s) =>
				ca(`${s.id}.CustomAction`, `${MAIN}.Scaling._children`, s.sequence, `<MaxSize Id="${s.id}" GroupId="${s.groupId}" Sequence="${s.sequence}" Size="${s.size}" />`),
			).join(""),
		);
	const groups = OLD.map((s) => ({ id: s.groupId, label: s.groupId, sequence: 60, template: "Mscrm.Templates.Flexible2", buttons: [] }));

	it("the plan says which layer steps the publish moves, and the publish moves them into free Sequences", async () => {
		layer = oldLayer();
		const baseline = grid(OLD, groups);
		const current = clone(baseline);
		current.tabs[0].groups[0].buttons[0].hidden = true; // an unrelated change
		const p = planOf(current, baseline);
		expect(p.unsupported).toEqual([]);
		expect(p.warnings).toEqual([
			`Repaired the scaling of tab ${MAIN}: MaxSize cbs.Old50.Group.MaxSize (group cbs.Old50.Group) moves from Sequence 50 to 51, so no two scaling steps share a Sequence`,
			`Repaired the scaling of tab ${MAIN}: MaxSize cbs.Old80.Group.MaxSize (group cbs.Old80.Group) moves from Sequence 80 to 52, so no two scaling steps share a Sequence`,
			`Repaired the scaling of tab ${MAIN}: MaxSize rw.Late.Group.MaxSize (group rw.Late.Group) moves from Sequence 200 to 53, so no two scaling steps share a Sequence`,
		]);
		const { doc, scalingChanges } = await publish(current, baseline);
		expect(scalingChanges.map((c) => [c.id, c.from, c.to])).toEqual([
			["cbs.Old50.Group.MaxSize", 50, 51],
			["cbs.Old80.Group.MaxSize", 80, 52],
			["rw.Late.Group.MaxSize", 200, 53],
		]);
		const cas = Array.from(doc.querySelectorAll(`CustomAction[Location="${MAIN}.Scaling._children"]`));
		expect(cas.map((c) => [c.querySelector("MaxSize")!.getAttribute("Sequence"), c.getAttribute("Sequence")])).toEqual([
			["51", "51"],
			["52", "52"],
			["53", "53"],
		]);
	});

	it("M2 — a MaxSize after the first Scale doesn't block a new group: it gets a free Sequence in the band", async () => {
		layer = oldLayer();
		const baseline = grid(OLD, groups);
		const current = clone(baseline);
		current.tabs[0].groups.push({ id: "cbs.New.Group", label: "New", sequence: 70, template: "Flexible2", buttons: [] });
		const p = planOf(current, baseline);
		expect(p.unsupported).toEqual([]);
		const { doc } = await publish(current, baseline);
		const all = seqs(doc, `CustomAction[Location="${MAIN}.Scaling._children"] MaxSize`);
		expect(all.find(([g]) => g === "cbs.New.Group")?.[1]).toBe(51);
		const values = [10, 50, 80, ...all.map(([, s]) => s as number)];
		expect(new Set(values).size).toBe(values.length);
		expect(Math.max(...all.map(([, s]) => s as number))).toBeLessThan(80);
	});

	it("when the band is truly full, the plan blocks and the merge refuses to import", async () => {
		layer = layerOf(
			ca("cbs.X.MaxSize.CustomAction", `${MAIN}.Scaling._children`, 80, `<MaxSize Id="cbs.X.MaxSize" GroupId="cbs.X" Sequence="80" Size="Large" />`),
		);
		const full = (): RibbonDefinition => {
			const d = grid([step("cbs.X.MaxSize", "cbs.X", 80, "Large")], [{ id: "cbs.X", label: "X", sequence: 60, template: "Mscrm.Templates.Flexible", buttons: [] }]);
			d.scalingByTab![MAIN].maxSizes.push(...Array.from({ length: 29 }, (_, i) => step(`p${i}`, MGMT, 51 + i)));
			return d;
		};
		const current = full();
		current.tabs[0].groups[0].buttons[0].hidden = true;
		expect(planOf(current, full()).unsupported).toEqual([
			`The scaling of tab ${MAIN} has no free position for MaxSize cbs.X.MaxSize (Sequence 80): it must come before the first Scale (80) and use a Sequence no other step uses`,
		]);
		await expect(publish(current, full())).rejects.toThrow(/Not published: The scaling of tab/);
	});
});

describe("M3 / m6 / t4 / m1 — new tab and group ids and sequences", () => {
	beforeEach(() => {
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: grid(),
				Form: { location: "Form", entityLogicalName: E, tabs: [] },
				SubGrid: { location: "SubGrid", entityLogicalName: E, tabs: [] },
				Application: { location: "Application", entityLogicalName: "{!EntityLogicalName}", tabs: [] },
			},
			commands: [],
			displayRules: [],
			enableRules: [],
			locLabels: [],
			// A group the layer adds that the user deleted this session (m1).
			layers: { entity: { controlIds: [], containerIds: [`cbs.${E}.HomepageGrid.Old.Group`], locLabelIds: [], hides: [] } },
		});
	});
	const tabs = () => useRibbonStore.getState().ribbons.HomepageGrid.tabs;

	it("M3 — two tabs with the same label get different ids; a duplicate id is refused", () => {
		const s = useRibbonStore.getState();
		s.createTab("HomepageGrid", { label: "Tools" });
		s.createTab("HomepageGrid", { label: "Tools" });
		expect(tabs().map((t) => t.id)).toEqual([MAIN, `cbs.${E}.HomepageGrid.Tools.Tab`, `cbs.${E}.HomepageGrid.Tools.Tab2`]);
		useRibbonStore.getState().createTab("HomepageGrid", { id: `cbs.${E}.HomepageGrid.Tools.Tab`, label: "Again" });
		expect(tabs()).toHaveLength(3);
	});

	it("m6 — the tab id is sanitized", () => {
		useRibbonStore.getState().createTab("HomepageGrid", { label: "R&D (EU)" });
		expect(tabs()[1].id).toBe(`cbs.${E}.HomepageGrid.RDEU.Tab`);
	});

	it("t4 — a new tab goes after the location's last tab, never at an existing sequence", () => {
		useRibbonStore.getState().createTab("HomepageGrid", { label: "A", sequence: 100 });
		useRibbonStore.getState().createTab("HomepageGrid", { label: "B" });
		expect(tabs().map((t) => t.sequence)).toEqual([100, 110, 120]);
	});

	it("m1 — a new group doesn't reuse the id of a group the layer still adds", () => {
		useRibbonStore.getState().createGroup({ location: "HomepageGrid", tabId: MAIN, group: { label: "Old", template: "Flexible2", buttons: [] } });
		expect(tabs()[0].groups.at(-1)!.id).toBe(`cbs.${E}.HomepageGrid.Old.Group2`);
	});
});

describe("m2 — the layer's tabs: placement and hides", () => {
	const def = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: E, tabs: [] });
	const tabXml = (id: string, groups = "") =>
		`<Tab Id="${id}" Command="${id}.Command" Title="T" Sequence="500"><Groups Id="${id}.Groups">${groups}</Groups></Tab>`;
	const rule = (id: string, ...contexts: string[]) =>
		`<TabDisplayRule TabCommand="${id}.Command">${contexts.map((c) => `<EntityRule EntityName="${E}" Context="${c}" />`).join("")}</TabDisplayRule>`;

	it("a tab whose rules name the form and the home grid is placed the same way whatever the rule order", () => {
		for (const contexts of [["Form", "HomePageGrid"], ["HomePageGrid", "Form"]]) {
			layer = parseRibbonDiffParts(
				`<RibbonDiffXml><CustomActions>${ca("t.CustomAction", "Mscrm.Tabs._children", 500, tabXml("cbs.Both.Tab"))}</CustomActions>` +
					`<RuleDefinitions><TabDisplayRules>${rule("cbs.Both.Tab", ...contexts)}</TabDisplayRules></RuleDefinitions></RibbonDiffXml>`,
			);
			const ribbons = { HomepageGrid: def("HomepageGrid"), Form: def("Form"), SubGrid: def("SubGrid") };
			addLayerTabs(ribbons, layer, E, []);
			expect([ribbons.HomepageGrid.tabs.length, ribbons.Form.tabs.length]).toEqual([1, 0]);
		}
	});

	it("tabs and groups the layer hides are left out", () => {
		layer = layerOf(
			ca("a.CustomAction", "Mscrm.Tabs._children", 500, tabXml("cbs.Hidden.Tab")) +
				ca(
					"b.CustomAction",
					"Mscrm.Tabs._children",
					510,
					tabXml(
						"cbs.Shown.Tab",
						`<Group Id="cbs.G1" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.G1.Controls" /></Group><Group Id="cbs.G2" Sequence="20" Template="Mscrm.Templates.Flexible2"><Controls Id="cbs.G2.Controls" /></Group>`,
					),
				) +
				`<HideCustomAction HideActionId="h1" Location="cbs.Hidden.Tab" /><HideCustomAction HideActionId="h2" Location="cbs.G2" />`,
		);
		const ribbons = { HomepageGrid: def("HomepageGrid"), Form: def("Form"), SubGrid: def("SubGrid") };
		expect(addLayerTabs(ribbons, layer, E, [])).toEqual(["cbs.Shown.Tab"]);
		expect(ribbons.HomepageGrid.tabs[0].groups.map((g) => g.id)).toEqual(["cbs.G1"]);
	});
});

describe("m3 / t3 — renaming the layer's tab", () => {
	const TAB = "cbs.Tools.Tab";
	const tabCa = (title: string) =>
		ca(`${TAB}.CustomAction`, "Mscrm.Tabs._children", 500, `<Tab Id="${TAB}" Command="${TAB}.Command" Title="${title}" Sequence="500"><Groups Id="${TAB}.Groups" /></Tab>`);
	const model = (tabLabel: string, buttonLabel?: string): RibbonDefinition => {
		const d = grid();
		d.tabs.push({ id: TAB, label: tabLabel, sequence: 500, commandId: `${TAB}.Command`, tabDisplayRules: [], groups: [] });
		if (buttonLabel) {
			d.tabs[0].groups[0].buttons.push(
				btn("cbs.B", { label: "Shared", source: { attributes: { Id: "cbs.B", LabelText: buttonLabel } } }),
			);
		}
		return d;
	};

	it("m3 — on an organisation whose base language is German, the German title changes and the English one stays", async () => {
		layer = layerOf(tabCa(`$LocLabels:${TAB}.Title`), label(`${TAB}.Title`, [1031, "Werkzeuge"], [1033, "Tools"]));
		const labels: LocLabel[] = [{ id: `${TAB}.Title`, titles: [{ languageCode: 1031, description: "Werkzeuge" }, { languageCode: 1033, description: "Tools" }] }];
		const baseline = model(`$LocLabels:${TAB}.Title`);
		const current = model("Hilfsmittel");
		const { doc } = await publish(current, baseline, { locLabels: labels, languageCode: 1031 });
		const titles = Array.from(doc.querySelectorAll(`LocLabel[Id="${TAB}.Title"] Title`)).map((t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`);
		expect(titles.sort()).toEqual(["1031=Hilfsmittel", "1033=Tools"]);
	});

	it("t3 — a title label a button also uses keeps its text; the tab gets a label of its own", async () => {
		layer = layerOf(tabCa("$LocLabels:cbs.Shared"), label("cbs.Shared", [1033, "Shared"]));
		const labels: LocLabel[] = [{ id: "cbs.Shared", titles: [{ languageCode: 1033, description: "Shared" }] }];
		const baseline = model("$LocLabels:cbs.Shared", "$LocLabels:cbs.Shared");
		const current = model("Tools", "$LocLabels:cbs.Shared");
		const { doc, plan } = await publish(current, baseline, { locLabels: labels });
		expect(plan.renamedLabels).toEqual([{ id: `${TAB}.Title`, text: "Tools", containerId: TAB, newLabel: true }]);
		expect(doc.querySelector(`Tab[Id="${TAB}"]`)!.getAttribute("Title")).toBe(`$LocLabels:${TAB}.Title`);
		expect(doc.querySelector(`LocLabel[Id="${TAB}.Title"] Title`)!.getAttribute("description")).toBe("Tools");
		expect(doc.querySelector('LocLabel[Id="cbs.Shared"] Title')!.getAttribute("description")).toBe("Shared");
	});
});

describe("t1 — sub-grid tabs", () => {
	it("default display rules apply to the selected entity, like Microsoft's sub-grid tab rules", () => {
		expect(defaultTabDisplayRules("SubGrid", E, "c")[0].rules.map((r) => r.kind === "EntityRule" && r.appliesTo)).toEqual([
			"SelectedEntity",
			"SelectedEntity",
		]);
	});
});
