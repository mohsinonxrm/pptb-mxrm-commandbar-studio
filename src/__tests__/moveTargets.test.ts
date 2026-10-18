import { describe, it, expect } from "vitest";
import { moveTargets } from "@/utils/moveTargets";
import type { LocLabel, RibbonButton, RibbonGroup, RibbonTab } from "@/types/ribbon";

// #75 — "Move to: …" context-menu items: resolved titles, never the button's own group.

const btn = (id: string): RibbonButton => ({
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
});

const grp = (id: string, label: string, buttons: RibbonButton[] = []): RibbonGroup => ({
	id,
	label,
	sequence: 10,
	template: "Flexible2",
	buttons,
});

const tab = (groups: RibbonGroup[]): RibbonTab => ({
	id: "T",
	label: "T",
	sequence: 10,
	tabDisplayRules: [],
	groups,
});

const locLabels: LocLabel[] = [
	{
		id: "grp.Title",
		titles: [
			{ languageCode: 1033, description: "Mine" },
			{ languageCode: 1031, description: "Meine" },
		],
	},
];

describe("moveTargets", () => {
	it("resolves $LocLabels (base language) and $Resources titles", () => {
		const t = tab([
			grp("A", "Current", [btn("b")]),
			grp("B", "$LocLabels:grp.Title"),
			grp("C", "$Resources:Ribbon.HomepageGrid.MainTab.Management"),
		]);
		expect(moveTargets(t, "A", "b", locLabels, 1031)).toEqual([
			{ groupId: "B", text: "Meine" },
			{ groupId: "C", text: "Ribbon.HomepageGrid.MainTab.Management" },
		]);
	});

	it("leaves out the group holding the button even when the menu's group id is stale", () => {
		const t = tab([grp("A", "Old"), grp("B", "Now holds it", [btn("b")]), grp("C", "Other")]);
		expect(moveTargets(t, "A", "b", locLabels).map((x) => x.groupId)).toEqual(["C"]);
	});

	it("falls back to the group id, and tells same-titled groups apart", () => {
		const t = tab([
			grp("A", "Current", [btn("b")]),
			grp("B", ""),
			grp("C", "$Resources:Ribbon.Same"),
			grp("D", "$Resources:Ribbon.Same"),
			grp("E", "$LocLabels:missing.Title"),
		]);
		expect(moveTargets(t, "A", "b", locLabels).map((x) => x.text)).toEqual([
			"B",
			"Ribbon.Same (C)",
			"Ribbon.Same (D)",
			"missing.Title",
		]);
	});
});
