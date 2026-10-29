/**
 * Unified Interface command-bar ground truth (#192): the recorded fixtures in
 * src/__fixtures__/uci-preview are internally consistent, so the preview model
 * (#191) can assert against them. These tests check the recordings, not CBS.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

interface State {
	selected?: number;
	visible: string[];
	overflow: string[];
}
interface Fixture {
	entity: string;
	location: string;
	labels: Record<string, string>;
	states: Record<string, State>;
}

const dir = resolve(__dirname, "../__fixtures__/uci-preview");
const fixtures = readdirSync(dir)
	.filter((f) => f.endsWith(".json"))
	.map((f) => ({ file: f, data: JSON.parse(readFileSync(resolve(dir, f), "utf-8")) as Fixture }));
const id = (entry: string) => entry.split("|")[0];

describe("UCI preview fixtures (#192)", () => {
	it("cover main grid, form, sub-grid and associated view", () => {
		const locations = new Set(fixtures.map((f) => f.data.location));
		expect([...locations].sort()).toEqual([
			"Form",
			"HomePageGrid",
			"SubGridAssociated",
			"SubGridStandard",
		]);
	});

	for (const { file, data } of fixtures) {
		describe(file, () => {
			it("labels every recorded item, and no item is both on the bar and in the overflow", () => {
				for (const [key, state] of Object.entries(data.states)) {
					const all = [...state.visible, ...state.overflow].map(id);
					for (const item of all)
						expect(data.labels[item], `${key}: ${item}`).toBeDefined();
					expect(new Set(all).size, key).toBe(all.length);
				}
			});

			it("shows the same commands, in the same order, at every width for one selection or form state", () => {
				const groups = new Map<string, string[][]>();
				for (const [key, state] of Object.entries(data.states)) {
					const context = key.replace(/(^|\.)w\d+/, "");
					const order = [...state.visible, ...state.overflow].map(id);
					groups.set(context, [...(groups.get(context) ?? []), order]);
				}
				for (const [context, orders] of groups) {
					for (const order of orders) expect(order, context).toEqual(orders[0]);
				}
			});

			it("keeps Command checker last", () => {
				for (const [key, state] of Object.entries(data.states)) {
					const order = [...state.visible, ...state.overflow].map(id);
					if (order.includes("CommandChecker"))
						expect(order.at(-1), key).toBe("CommandChecker");
				}
			});
		});
	}
});
