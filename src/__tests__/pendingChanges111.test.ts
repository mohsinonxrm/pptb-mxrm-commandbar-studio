/**
 * #111: whether anything is left to publish compares the workspace with its baseline by
 * reference first, and by value only where they differ. It used to write both as JSON on every
 * check. A load and a publish share what they load or publish with the baseline, edits copy only
 * what they change and undo puts back the objects it saved, so most checks walk nothing. The
 * answer must stay exact: "no changes" when there are some would hide unpublished work.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	hasPendingChanges,
	useRibbonStore,
	workspaceOf,
	type RibbonStoreState,
} from "@/store/ribbonStore";
import { parseRibbonXml } from "@/services/xmlParser";
import { draftWorkspace, readDraft, writeDraft, type DraftKey } from "@/services/ribbonDraft";
import { groupControls } from "@/utils/ribbonMenu";
import { jsonEqual } from "@/utils/jsonEqual";
import type { CommandDefinition, LocLabel, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const fixture = (name: string) =>
	readFileSync(resolve(__dirname, "../__fixtures__/ribbon", name), "utf8");
const store = () => useRibbonStore.getState();
const pending = () => hasPendingChanges(store());

const COMMAND: CommandDefinition = {
	id: "cbs.Mine.Command",
	enableRules: ["Mscrm.SelectionCountAtLeastOne"],
	displayRules: [],
	actions: [],
};
const LABEL: LocLabel = {
	id: "cbs.Mine.LabelText",
	titles: [{ languageCode: 1033, description: "Mine" }],
};

/** The contact home grid at all four locations, plus a command and a label of your own. */
function seed() {
	const home = parseRibbonXml(fixture("contact-homepage-menus.xml"), "HomepageGrid", "contact");
	const at = (location: RibbonLocation): RibbonDefinition => ({
		...JSON.parse(JSON.stringify(home.ribbon)),
		location,
	});
	return {
		ribbons: {
			HomepageGrid: at("HomepageGrid"),
			SubGrid: at("SubGrid"),
			Form: at("Form"),
			Application: at("Application"),
		},
		commands: [...home.commands, COMMAND],
		enableRules: home.enableRules,
		displayRules: home.displayRules,
		locLabels: [LABEL],
	};
}

/** The first button of `location` with a group of buttons, and its label. */
function firstButton(location: RibbonLocation = "HomepageGrid") {
	const tab = store().ribbons[location].tabs.find((t) =>
		t.groups.some((g) => groupControls(g).length > 0),
	)!;
	const group = tab.groups.find((g) => groupControls(g).length > 0)!;
	const button = groupControls(group)[0];
	const label = () =>
		groupControls(
			store()
				.ribbons[location].tabs.find((t) => t.id === tab.id)!
				.groups.find((g) => g.id === group.id)!,
		).find((b) => b.id === button.id)!.label;
	const setLabel = (text: string) =>
		store().setButtonProp(location, tab.id, group.id, button.id, { label: text });
	return { original: button.label, label, setLabel };
}

/** The workspace parts compared with a baseline, by reference. */
function sharedWithBaseline(s: RibbonStoreState) {
	const locations = Object.keys(s.ribbons) as RibbonLocation[];
	return {
		locations: locations.filter((l) => s.ribbons[l] === s.baseline[l]),
		commands: s.commands.every((c, i) => c === s.baselineCommands[i]),
		locLabels: s.locLabels.every((l, i) => l === s.baselineLocLabels[i]),
	};
}

beforeEach(() => {
	localStorage.clear();
	store().loadWorkspace(seed());
});

describe("#111 jsonEqual answers as JSON.stringify would", () => {
	/** JSON with every object's keys sorted: what jsonEqual compares. */
	const canonical = (v: unknown) =>
		JSON.stringify(v, (_k, x) =>
			x && typeof x === "object" && !Array.isArray(x)
				? Object.fromEntries(
						Object.keys(x)
							.sort()
							.map((k) => [k, x[k]]),
					)
				: x,
		);

	it("on hand-picked cases", () => {
		const cases: [unknown, unknown][] = [
			[1, 1],
			[1, "1"],
			[null, undefined],
			[undefined, undefined],
			[NaN, null],
			[Infinity, null],
			[-0, 0],
			[{ a: 1, b: undefined }, { a: 1 }],
			[{ a: 1, f: () => 1 }, { a: 1 }],
			[{ a: undefined }, { b: undefined }],
			[{ a: null }, {}],
			[[undefined], [null]],
			[
				[1, 2],
				[2, 1],
			],
			[[], {}],
			[{ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }],
			[{ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }],
			[{ a: { b: "" } }, { a: { b: undefined } }],
			[new Date(0), new Date(0).toISOString()],
			[{ toJSON: () => "x" }, "x"],
			["a", { a: 1 }],
		];
		for (const [a, b] of cases) {
			expect(jsonEqual(a, b), `${String(a)} / ${String(b)}`).toBe(
				canonical(a) === canonical(b),
			);
			expect(jsonEqual(b, a)).toBe(jsonEqual(a, b));
		}
	});

	it("on random values, and the same values with their keys reordered", () => {
		let n = 7;
		const rand = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648) * 0.9999;
		const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
		const value = (depth: number): unknown => {
			const r = rand();
			if (depth > 3 || r < 0.4)
				return pick([0, 1, -1, NaN, "", "a", "b", true, false, null, undefined]);
			if (r < 0.7)
				return Array.from({ length: Math.floor(rand() * 3) }, () => value(depth + 1));
			const o: Record<string, unknown> = {};
			for (const k of ["a", "b", "c"]) if (rand() < 0.6) o[k] = value(depth + 1);
			return o;
		};
		const reorder = (v: unknown): unknown =>
			Array.isArray(v)
				? v.map(reorder)
				: v && typeof v === "object"
					? Object.fromEntries(
							Object.entries(v)
								.reverse()
								.map(([k, x]) => [k, reorder(x)]),
						)
					: v;
		let equalPairs = 0;
		for (let i = 0; i < 3000; i++) {
			const a = value(0);
			const b = rand() < 0.5 ? reorder(a) : value(0);
			const expected = canonical(a) === canonical(b);
			if (expected) equalPairs++;
			expect(jsonEqual(a, b)).toBe(expected);
		}
		// Both answers were exercised
		expect(equalPairs).toBeGreaterThan(500);
		expect(equalPairs).toBeLessThan(2900);
	});

	it("ignores key order, where comparing JSON saw a change", () => {
		// Strictly better than before: the same content is no change, whatever order its keys are in.
		const a = { id: "x", label: "Hi", sequence: 10 };
		const b = { sequence: 10, id: "x", label: "Hi" };
		expect(JSON.stringify(a) === JSON.stringify(b)).toBe(false);
		expect(jsonEqual(a, b)).toBe(true);
	});

	it("calls toJSON once per value, as JSON does", () => {
		let calls = 0;
		const date = {
			toJSON(key: string) {
				calls++;
				// A toJSON result's own toJSON isn't called again
				return { key, toJSON: () => "never" };
			},
		};
		expect(jsonEqual({ a: date }, { a: { key: "a" } })).toBe(true);
		expect(calls).toBe(1);
		calls = 0;
		expect(jsonEqual([date], [{ key: "0" }])).toBe(true);
		expect(jsonEqual({ b: date }, {})).toBe(false);
		expect(jsonEqual({}, { b: date })).toBe(false);
		expect(calls).toBe(3);
		expect(JSON.stringify({ a: date })).toBe('{"a":{"key":"a"}}');
	});
});

describe("#111 pending changes", () => {
	it("a load shares everything with the baseline: no changes, and nothing is written as JSON", () => {
		expect(sharedWithBaseline(store())).toEqual({
			locations: ["HomepageGrid", "SubGrid", "Form", "Application"],
			commands: true,
			locLabels: true,
		});
		// The workspace and the baseline have lists of their own
		expect(store().commands).not.toBe(store().baselineCommands);
		expect(store().baseline).not.toBe(store().ribbons);
		const stringify = vi.spyOn(JSON, "stringify");
		try {
			expect(pending()).toBe(false);
			expect(stringify).not.toHaveBeenCalled();
		} finally {
			stringify.mockRestore();
		}
		store().loadRibbons(seed().ribbons);
		expect(sharedWithBaseline(store()).locations).toHaveLength(4);
		expect(pending()).toBe(false);
	});

	it("an edit is a change; undo back to the load is none, by reference; redo is again", () => {
		const b = firstButton();
		b.setLabel("Renamed");
		expect(pending()).toBe(true);
		expect(sharedWithBaseline(store()).locations).toEqual(["SubGrid", "Form", "Application"]);
		store().undo();
		expect(b.label()).toBe(b.original);
		expect(sharedWithBaseline(store()).locations).toHaveLength(4);
		const stringify = vi.spyOn(JSON, "stringify");
		try {
			expect(pending()).toBe(false);
			expect(stringify).not.toHaveBeenCalled();
		} finally {
			stringify.mockRestore();
		}
		expect(store().mutationsSincePublish).toBe(0);
		store().redo();
		expect(b.label()).toBe("Renamed");
		expect(pending()).toBe(true);
		expect(store().mutationsSincePublish).toBeGreaterThan(0);
	});

	it("an edit typed back to what was loaded is no change (by value, not 'was touched')", () => {
		const b = firstButton("Form");
		b.setLabel("Renamed");
		expect(pending()).toBe(true);
		b.setLabel(b.original);
		// The location is a copy now, not the baseline's: compared by value
		expect(store().ribbons.Form).not.toBe(store().baseline.Form);
		expect(pending()).toBe(false);
		// One character off is still a change
		b.setLabel(`${b.original} `);
		expect(pending()).toBe(true);
	});

	it("a deep change in an otherwise shared workspace is found", () => {
		const s = store();
		// Only the application ribbon is a copy; the other locations are the baseline's
		const ribbons: RibbonStoreState["ribbons"] = {
			...s.ribbons,
			Application: JSON.parse(JSON.stringify(s.ribbons.Application)),
		};
		const tab = ribbons.Application.tabs[ribbons.Application.tabs.length - 1];
		const group = tab.groups[tab.groups.length - 1];
		group.sequence += 1;
		expect(hasPendingChanges({ ...s, ribbons })).toBe(true);
		group.sequence -= 1;
		expect(hasPendingChanges({ ...s, ribbons })).toBe(false);
	});

	it("commands, rules and labels: changed, changed back, discarded", () => {
		store().upsertCommand({ ...COMMAND, enableRules: [] });
		expect(pending()).toBe(true);
		// Back to the loaded definition, as a new object
		store().upsertCommand(JSON.parse(JSON.stringify(COMMAND)));
		expect(pending()).toBe(false);
		store().upsertCommand({ ...COMMAND, actions: [{ type: "url", address: "x" } as never] });
		expect(pending()).toBe(true);
		store().discardCommandChanges(COMMAND.id);
		expect(sharedWithBaseline(store()).commands).toBe(true);
		expect(pending()).toBe(false);
		for (const change of [
			{ enableRules: [...store().enableRules, { id: "cbs.New", steps: [] }] },
			{ displayRules: [...store().displayRules, { id: "cbs.New", steps: [] }] },
			{
				locLabels: [{ ...LABEL, titles: [{ languageCode: 1033, description: "Mine!" }] }],
			},
		])
			expect(hasPendingChanges({ ...store(), ...change })).toBe(true);
	});

	it("a partial publish advances only the published locations' baseline", () => {
		const home = firstButton("HomepageGrid");
		const sub = firstButton("SubGrid");
		home.setLabel("Home renamed");
		sub.setLabel("Sub renamed");
		store().markPublished(["HomepageGrid"]);
		// The published location is the baseline, shared; the sub-grid is still to publish
		expect(store().baseline.HomepageGrid).toBe(store().ribbons.HomepageGrid);
		expect(pending()).toBe(true);
		expect(store().mutationsSincePublish).toBeGreaterThan(0);
		// Undo the sub-grid edit: the published home grid is all that's left, and it's published
		store().undo();
		expect(sub.label()).toBe(sub.original);
		expect(pending()).toBe(false);
		// Undo the home grid edit too: it's back to before the publish, which is a change now
		store().undo();
		expect(home.label()).toBe(home.original);
		expect(pending()).toBe(true);
		store().redo();
		expect(pending()).toBe(false);
	});

	it("a full publish: commands and labels become the baseline too", () => {
		firstButton().setLabel("Renamed");
		store().upsertCommand({ ...COMMAND, enableRules: [] });
		store().markPublished(["HomepageGrid", "SubGrid", "Form", "Application"]);
		expect(pending()).toBe(false);
		expect(store().mutationsSincePublish).toBe(0);
		expect(sharedWithBaseline(store())).toEqual({
			locations: ["HomepageGrid", "SubGrid", "Form", "Application"],
			commands: true,
			locLabels: true,
		});
		// Undo past the publish: what was published is the baseline now, so the undo is a change
		store().undo();
		expect(pending()).toBe(true);
	});

	it("a restored draft is a change; undoing the restore isn't; redo is again", () => {
		const key: DraftKey = {
			orgUrl: "https://org",
			solutionId: "s",
			entityLogicalName: "contact",
		};
		const b = firstButton("SubGrid");
		b.setLabel("From the draft");
		expect(writeDraft(key, store())).not.toBeNull();
		const draft = readDraft(key)!;
		store().loadWorkspace(seed());
		expect(pending()).toBe(false);
		store().restoreWorkspace(draftWorkspace(draft, store()), "test");
		expect(b.label()).toBe("From the draft");
		expect(pending()).toBe(true);
		store().undo();
		expect(pending()).toBe(false);
		store().redo();
		expect(pending()).toBe(true);
	});

	it("a restore that differs from the workspace only in key order restores nothing", () => {
		const s = store();
		const reversed = <T extends object>(o: T): T =>
			Object.fromEntries(Object.entries(o).reverse()) as T;
		const workspace = {
			...workspaceOf(s),
			ribbons: { ...s.ribbons, Form: reversed(s.ribbons.Form) },
			commands: s.commands.map(reversed),
		};
		expect(JSON.stringify(workspace) === JSON.stringify(workspaceOf(s))).toBe(false);
		store().restoreWorkspace(workspace, "test");
		expect(store().past).toHaveLength(0);
		expect(pending()).toBe(false);
		// A real difference is still restored
		store().restoreWorkspace(
			{ ...workspace, commands: [...s.commands, { ...COMMAND, id: "cbs.Other" }] },
			"test",
		);
		expect(store().past).toHaveLength(1);
		expect(pending()).toBe(true);
	});

	it("a draft with nothing left in it restores nothing", () => {
		const key: DraftKey = {
			orgUrl: "https://org",
			solutionId: "s",
			entityLogicalName: "contact",
		};
		const b = firstButton();
		b.setLabel("Renamed");
		b.setLabel(b.original);
		expect(writeDraft(key, store())).not.toBeNull();
		store().loadWorkspace(seed());
		store().restoreWorkspace(draftWorkspace(readDraft(key)!, store()), "test");
		expect(store().past).toHaveLength(0);
		expect(pending()).toBe(false);
	});

	it("the store's shared state is frozen in tests (setup/freezeStore.ts)", () => {
		// The baseline shares objects with the workspace and its undo history: an edit that
		// changed one in place would change the baseline too, and hide itself. The test setup
		// freezes them after every change, so such a write throws.
		const s = store();
		const button = groupControls(
			s.ribbons.Form.tabs.flatMap((t) => t.groups).find((g) => groupControls(g).length > 0)!,
		)[0];
		expect(s.ribbons.Form).toBe(s.baseline.Form);
		expect(() => {
			(button as { label: string }).label = "changed in place";
		}).toThrow(TypeError);
		expect(() => {
			s.commands.push(COMMAND);
		}).toThrow(TypeError);
		expect(() => {
			(s.baselineLocLabels[0].titles[0] as { description: string }).description = "x";
		}).toThrow(TypeError);
		// …after a change too: the edit's own copy, and the history entry
		firstButton("Form").setLabel("Renamed");
		const after = store();
		expect(Object.isFrozen(after.ribbons.Form.tabs[0])).toBe(true);
		expect(Object.isFrozen(after.past[0].snapshot.ribbons.Form)).toBe(true);
	});

	it("edits, publishes, undo and redo change nothing shared in place", () => {
		const tab = store().ribbons.Form.tabs[0];
		const group = tab.groups.find((g) => groupControls(g).length > 0)!;
		const button = groupControls(group)[0];
		store().setButtonProp("Form", tab.id, group.id, button.id, { label: "x" });
		store().setButtonProp("Form", tab.id, group.id, button.id, { hidden: true });
		store().upsertCommand({ ...COMMAND, enableRules: [] });
		store().customiseButton("Form", tab.id, group.id, button.id, "cbs");
		store().markPublished(["Form"]);
		store().undo();
		store().undo();
		store().redo();
		store().discardCommandChanges(COMMAND.id);
		store().markPublished();
		store().deleteButton("Form", tab.id, group.id, button.id);
		store().undo();
		expect(typeof pending()).toBe("boolean");
	});

	it("typing 200 characters with a check after each walks only the edited location", () => {
		const b = firstButton();
		// Each check after an edit stops at the first difference, in the one edited location; it
		// writes no JSON. (Timing-free: a time budget was flaky in #280.)
		const stringify = vi.spyOn(JSON, "stringify");
		let checks = 0;
		let text = "";
		for (let i = 0; i < 200; i++) {
			text += "x";
			b.setLabel(text);
			const before = stringify.mock.calls.length;
			expect(pending()).toBe(true);
			checks += stringify.mock.calls.length - before;
		}
		stringify.mockRestore();
		expect(checks).toBe(0);
		expect(sharedWithBaseline(store()).locations).toEqual(["SubGrid", "Form", "Application"]);
	});
});
