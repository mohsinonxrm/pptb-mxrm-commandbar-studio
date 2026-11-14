/**
 * #111: an edit copies only the locations it reads. Typing a label on the home grid no longer
 * copies the sub-grid, form and application ribbons on every keystroke; they stay shared with
 * the state before, and the state before is left as it was.
 */
import { describe, it, expect, vi } from "vitest";
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
	const asLocation = (location: RibbonLocation): RibbonDefinition => ({
		...JSON.parse(JSON.stringify(home.ribbon)),
		location,
	});
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: asLocation("HomepageGrid"),
			SubGrid: asLocation("SubGrid"),
			Form: asLocation("Form"),
			// The home grid again, so all four locations are the same size
			Application: { ...asLocation("HomepageGrid"), location: "Application" },
		},
		commands: home.commands,
		enableRules: home.enableRules,
		displayRules: home.displayRules,
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

	it("typing 200 characters copies one ribbon per keystroke, not four", () => {
		const { tabId, groupId, buttonId } = loadContact();
		const loaded = store().ribbons;
		const oneLocation = JSON.stringify(loaded.HomepageGrid).length;
		const allLocations = JSON.stringify(loaded).length;
		// Copies go through JSON: count what's serialised while typing
		let copied = 0;
		const stringify = JSON.stringify;
		const spy = vi.spyOn(JSON, "stringify").mockImplementation((...args) => {
			const out = stringify(...(args as Parameters<typeof JSON.stringify>));
			copied += out?.length ?? 0;
			return out;
		});
		try {
			let text = "";
			for (let i = 0; i < 200; i++) {
				text += "x";
				store().setButtonProp("HomepageGrid", tabId, groupId, buttonId, { label: text });
			}
		} finally {
			spy.mockRestore();
		}
		// Each keystroke copies the home grid (whose label grows by one character), and a little else
		expect(copied).toBeLessThan(200 * (oneLocation + 200) * 1.1);
		expect(copied).toBeLessThan(200 * allLocations * 0.5);
		for (const location of ["SubGrid", "Form", "Application"] as const)
			expect(store().ribbons[location]).toBe(loaded[location]);
	});
});
