/**
 * #192: the merged ribbon behind each Unified Interface recording, and the probe that shows where
 * your own CustomActions and modern commands land. These tests check the recordings and the rules
 * docs/uci-command-bar.md draws from them, not CBS: the preview model (#191) is tested against
 * the same fixtures.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ribbonXml } from "@/__fixtures__/uci-preview/load";

interface State {
	selected?: number;
	visible: string[];
	overflow: string[];
}
interface Probe {
	ribbonDiffXml: string;
	modern: { name: string; sequence: number }[];
	merged: Record<string, string[]>;
}
interface Fixture {
	entity: string;
	location: string;
	labels: Record<string, string>;
	states: Record<string, State>;
	ribbon?: { rows: [string, string, string, number, string, string, string][] };
	probe?: Probe;
}

const dir = resolve(__dirname, "../__fixtures__/uci-preview");
const read = (path: string) => readFileSync(resolve(dir, path), "utf-8");
const fixtures = readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.map((f) => ({ file: f, data: JSON.parse(read(f)) as Fixture }));
const fixture = (file: string) => fixtures.find((f) => f.file === file)!.data;
const id = (entry: string) => entry.split("|")[0];
const order = (state: State) => [...state.visible, ...state.overflow].map(id);
const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

/**
 * The saved RetrieveEntityRibbon output for a recording's entity, every location, as CBS loads it:
 * on the main grid, the HomepageGrid filter leaves out Merge's CommandDefinition and returns New's
 * with other display rules.
 */
const ribbonOf = (data: Fixture) => parse(ribbonXml(data.entity));

/** Items Unified Interface adds that no ribbon defines (docs/uci-command-bar.md, point 4). */
const SYSTEM_ITEM =
	/^(changeVisualization-|ShowChartPane$|OpenEntityDashboard$|CommandChecker$|.+-navigateToAssociatedGrid-)/;
const PROBE_ITEM = /^cbstest\.P192\./;

const children = (el: Element | null | undefined) => [...(el?.children ?? [])];
const seqOf = (el: Element) => Number(el.getAttribute("Sequence") ?? 0);

describe("#192 the merged ribbon behind each recording", () => {
	it("is saved, as well-formed XML, for every recorded entity", () => {
		for (const { file, data } of fixtures)
			expect(ribbonOf(data).querySelector("parsererror"), file).toBeNull();
	});

	for (const { file, data } of fixtures) {
		it(`${file}: every recorded command is in it, or is a system item`, () => {
			const doc = ribbonOf(data);
			const ids = new Set([...doc.querySelectorAll("[Id]")].map((e) => e.getAttribute("Id")));
			for (const item of Object.keys(data.labels))
				if (!SYSTEM_ITEM.test(item) && !PROBE_ITEM.test(item))
					expect(ids.has(item), item).toBe(true);
		});
	}

	it("contact's main grid rows still match, apart from Quick Campaign's display rules (changed since 2026-10-29)", () => {
		// Today's display rules where they differ from the recording; the bar looked the same.
		const changed: Record<string, string> = {
			"Mscrm.HomepageGrid.contact.QuickCampaign":
				"Mscrm.QuickCampaignAllowed,Mscrm.QuickCampaignModernizationDisabled",
		};
		const data = fixture("contact.HomePageGrid.json");
		const doc = ribbonOf(data);
		const ruleIds = (def: Element | undefined, kind: string) =>
			[...(def?.querySelectorAll(kind) ?? [])].map((r) => r.getAttribute("Id")).join(",");
		for (const [rowId, , , sequence, element, display, enable] of data.ribbon!.rows) {
			const control = doc.querySelector(`${element}[Id="${rowId}"]`);
			expect(control, rowId).not.toBeNull();
			expect(seqOf(control!), rowId).toBe(sequence);
			const def = [...doc.querySelectorAll("CommandDefinition")].find(
				(c) => c.getAttribute("Id") === control!.getAttribute("Command"),
			);
			expect(ruleIds(def, "EnableRules > EnableRule"), rowId).toBe(enable);
			expect(ruleIds(def, "DisplayRules > DisplayRule"), rowId).toBe(
				changed[rowId] ?? display,
			);
		}
	});
});

describe("#192 probe: your own commands on contact's main grid", () => {
	const data = fixture("contact.HomePageGrid.probe.json");
	const probe = data.probe!;
	const base = ribbonOf(data);
	const rdx = parse(read(probe.ribbonDiffXml));
	const TAB = "Mscrm.HomepageGrid.contact.MainTab";
	const tab = [...base.querySelectorAll("Tab")].find((t) => t.getAttribute("Id") === TAB)!;

	/** The platform's merge: before the first sibling with a greater Sequence, else at the end. */
	function insert(list: Element[], added: Element): Element[] {
		const at = list.findIndex((e) => seqOf(e) > seqOf(added));
		return at < 0 ? [...list, added] : [...list.slice(0, at), added, ...list.slice(at)];
	}
	function mergedChildren(container: string): Element[] {
		const location =
			container === "groups"
				? `${TAB}.Groups._children`
				: container === "scaling"
					? `${TAB}.Scaling._children`
					: `${container}.Controls._children`;
		const existing =
			container === "groups"
				? children(tab.querySelector("Groups"))
				: container === "scaling"
					? children(tab.querySelector("Scaling"))
					: children(base.querySelector(`Group[Id="${container}"] > Controls`));
		const added = [...rdx.querySelectorAll("CustomAction")]
			.filter((ca) => ca.getAttribute("Location") === location)
			.map((ca) => ca.querySelector("CommandUIDefinition")!.firstElementChild!);
		return added.reduce(insert, existing);
	}

	it("RetrieveEntityRibbon puts each added control, group and MaxSize before the first sibling with a greater Sequence", () => {
		for (const [container, expected] of Object.entries(probe.merged)) {
			const merged = container.startsWith("cbstest.")
				? children(rdx.querySelector(`Group[Id="${container}"] > Controls`))
				: mergedChildren(container);
			expect(
				merged.map((e) => e.getAttribute("Id")),
				container,
			).toEqual(expected);
		}
		// Not by Sequence: Seq22 goes before Run Report (30), not after Import from Excel (21).
		const exportData = probe.merged[`${TAB}.ExportData`];
		expect(exportData.indexOf("cbstest.P192.Seq22")).toBe(0);
	});

	it("the bar shows the probed groups' classic commands in that merged document order", () => {
		// Groups in their merged order, each group's controls in theirs.
		const flat = probe.merged.groups.flatMap((g) => probe.merged[g] ?? []);
		for (const [key, state] of Object.entries(data.states)) {
			const classic = order(state).filter((i) => flat.includes(i));
			expect(classic.length, key).toBeGreaterThan(3);
			expect(classic, key).toEqual(flat.filter((i) => classic.includes(i)));
		}
	});

	it("a modern command goes into the group its sequence names, before the first command there with a greater Sequence", () => {
		const seqById = new Map<string, number>();
		for (const el of [
			...base.querySelectorAll("[Id][Sequence]"),
			...rdx.querySelectorAll("[Id][Sequence]"),
		])
			seqById.set(el.getAttribute("Id")!, seqOf(el));
		const groupBySeq = new Map(probe.merged.groups.map((g) => [seqById.get(g)!, g]));
		const withModern = new Map(
			probe.merged.groups.map((g) => [g, [...(probe.merged[g] ?? [])]]),
		);
		for (const m of probe.modern) {
			// 1,000,000,000 + (tab Sequence − 100) × 1,000,000 + group Sequence × 10,000 + control Sequence
			const rest = m.sequence - 1_000_000_000;
			expect(Math.floor(rest / 1_000_000), m.name).toBe(0); // the main tab (Sequence 100)
			const list = withModern.get(groupBySeq.get(Math.floor((rest % 1_000_000) / 10_000))!)!;
			const at = list.findIndex((i) => (seqById.get(i) ?? 0) > rest % 10_000);
			list.splice(at < 0 ? list.length : at, 0, m.name);
		}
		const flat = probe.merged.groups.flatMap((g) => withModern.get(g)!);
		const recorded = order(data.states["w1534.sel0"]).filter((i) => flat.includes(i));
		for (const m of probe.modern) expect(recorded).toContain(m.name);
		expect(recorded).toEqual(flat.filter((i) => recorded.includes(i)));
		// In ExportData, the first command with a Sequence above 100 is Export Selected (230). It isn't
		// shown with nothing selected, so Modern100 appears just before Import from Excel.
		expect(recorded.indexOf("cbstest.P192.Modern100")).toBe(
			recorded.indexOf("Mscrm.HomepageGrid.contact.ImportDataFromExcel") - 1,
		);
	});

	it("a HideCustomAction removes the command", () => {
		const hidden = "Mscrm.HomepageGrid.contact.QuickCampaign";
		expect(order(fixture("contact.HomePageGrid.json").states["w1920.sel0"])).toContain(hidden);
		for (const state of Object.values(data.states)) expect(order(state)).not.toContain(hidden);
	});

	it("a selection hides your commands that have no Mscrm.AnySelection, modern ones included", () => {
		const none = order(data.states["w1534.sel0"]).filter((i) => PROBE_ITEM.test(i));
		const one = order(data.states["w1534.sel1"]).filter((i) => PROBE_ITEM.test(i));
		expect(none).toContain("cbstest.P192.Modern23");
		expect(none).toContain("cbstest.P192.Seq22");
		expect(one).toEqual(["cbstest.P192.AnySel1010"]);
	});
});
