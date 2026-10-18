import { describe, it, expect } from "vitest";
import { defaultTabId, isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import type { RibbonTab } from "@/types/ribbon";

const tab = (id: string) => ({ id }) as RibbonTab;

describe("defaultTabId (#64)", () => {
	it("opens on the table's main tab, not the Charts tab listed first", () => {
		const tabs = [
			tab("Mscrm.HomepageGrid.AllEntities.VisualizationTab"),
			tab("Mscrm.HomepageGrid.contact.MainTab"),
			tab("Mscrm.HomepageGrid.contact.View"),
		];
		expect(defaultTabId(tabs)).toBe("Mscrm.HomepageGrid.contact.MainTab");
	});

	it("falls back to the first tab Unified Interface shows, then the first tab", () => {
		expect(
			defaultTabId([tab("Mscrm.HomepageGrid.AllEntities.VisualizationTab"), tab("Mscrm.HomepageGrid.contact.View")]),
		).toBe("Mscrm.HomepageGrid.contact.View");
		expect(defaultTabId([tab("Mscrm.HomepageGrid.AllEntities.VisualizationTab")])).toBe(
			"Mscrm.HomepageGrid.AllEntities.VisualizationTab",
		);
		expect(defaultTabId([])).toBeUndefined();
	});

	it("flags the Charts / AllEntities tabs only", () => {
		expect(isHiddenOnUnifiedInterface("Mscrm.HomepageGrid.AllEntities.VisualizationTab")).toBe(true);
		expect(isHiddenOnUnifiedInterface("Mscrm.HomepageGrid.contact.MainTab")).toBe(false);
		expect(isHiddenOnUnifiedInterface("Mscrm.Form.contact.MainTab")).toBe(false);
	});
});
