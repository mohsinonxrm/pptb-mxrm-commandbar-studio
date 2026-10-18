import type { RibbonTab } from "@/types/ribbon";

/**
 * Tabs whose buttons Unified Interface never shows on the command bar (#64):
 * the Charts tab (`Mscrm.HomepageGrid.AllEntities.VisualizationTab`) and the
 * other `AllEntities` tabs. Buttons added there publish fine but appear
 * nowhere, and RetrieveEntityRibbon doesn't return them on reload.
 */
export function isHiddenOnUnifiedInterface(tabId: string): boolean {
	return /\.AllEntities\./.test(tabId) || /\.VisualizationTab$/.test(tabId);
}

/**
 * The tab the canvas opens on: the table's main tab (`….MainTab`), else the
 * first tab Unified Interface shows, else the first tab.
 */
export function defaultTabId(tabs: readonly RibbonTab[]): string | undefined {
	const shown = tabs.filter((t) => !isHiddenOnUnifiedInterface(t.id));
	return (shown.find((t) => /\.MainTab$/.test(t.id)) ?? shown[0] ?? tabs[0])?.id;
}
