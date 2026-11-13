/**
 * #111: an edit copies only the locations it reads. Typing a label on the home grid no longer
 * copies the sub-grid, form and application ribbons on every keystroke; they stay shared with
 * the state before, and the state before is left as it was.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useRibbonStore } from "@/store/ribbonStore";
import { parseRibbonXml } from "@/services/xmlParser";
import { groupControls } from "@/utils/ribbonMenu";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const fixture = (name: string) =>
	readFileSync(resolve(__dirname, "../__fixtures__/ribbon", name), "utf8");
const store = () => useRibbonStore.getState();

function loadContact() {
	const home = parseRibbonXml(fixture("contact-homepage-menus.xml"), "HomepageGrid", "contact");
	const app = parseRibbonXml(
		fixture("app-oob-subset.xml"),
		"Application",
		"{!EntityLogicalName}",
	);
	const asLocation = (location: RibbonLocation): RibbonDefinition => ({
		...JSON.parse(JSON.stringify(home.ribbon)),
		location,
	});
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: asLocation("HomepageGrid"),
			SubGrid: asLocation("SubGrid"),
			Form: asLocation("Form"),
			Application: app.ribbon,
		},
		commands: [...home.commands, ...app.commands],
		enableRules: [...home.enableRules, ...app.enableRules],
		displayRules: [...home.displayRules, ...app.displayRules],
		locLabels: [],
	});
	const tab = store().ribbons.HomepageGrid.tabs[0];
	const group = tab.groups.find((g) => groupControls(g).length > 0)!;
	return { tabId: tab.id, groupId: group.id, buttonId: groupControls(group)[0].id };
}

describe("#111 an edit's cost", () => {
	it("copies only the location it changes, and leaves the state before as it was", () => {
		const { tabId, groupId, buttonId } = loadContact();
		const before = store().ribbons;
		const beforeLabel = JSON.stringify(before.HomepageGrid);
		store().setButtonProp("HomepageGrid", tabId, groupId, buttonId, { label: "Renamed" });
		const after = store().ribbons;
		expect(after).not.toBe(before);
		expect(after.HomepageGrid).not.toBe(before.HomepageGrid);
		for (const location of ["SubGrid", "Form", "Application"] as const)
			expect(after[location]).toBe(before[location]);
		// The previous state (and its undo snapshot) is untouched
		expect(JSON.stringify(before.HomepageGrid)).toBe(beforeLabel);
		const label = (r: Record<RibbonLocation, RibbonDefinition>) =>
			groupControls(
				r.HomepageGrid.tabs
					.find((t) => t.id === tabId)!
					.groups.find((g) => g.id === groupId)!,
			).find((b) => b.id === buttonId)!.label;
		expect(label(after)).toBe("Renamed");
		store().undo();
		expect(label(store().ribbons)).not.toBe("Renamed");
	});

	it("types 200 characters into a label well within the old cost", () => {
		const { tabId, groupId, buttonId } = loadContact();
		const all = store().ribbons;
		// What every keystroke cost before: a JSON copy of all four ribbons
		const t0 = performance.now();
		for (let i = 0; i < 200; i++) JSON.parse(JSON.stringify(all));
		const oldCost = performance.now() - t0;

		const t1 = performance.now();
		let text = "";
		for (let i = 0; i < 200; i++) {
			text += "x";
			store().setButtonProp("HomepageGrid", tabId, groupId, buttonId, { label: text });
		}
		const newCost = performance.now() - t1;
		// One location of four is copied: well under the old copy alone, with room for noise
		expect(newCost).toBeLessThan(oldCost);
	});
});
