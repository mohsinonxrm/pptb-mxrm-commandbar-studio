import { barOrder, type BarEntry } from "@/services/uciPreview/bar";
import type { RibbonTab } from "@/types/ribbon";
import type { ClassicModernOverride, ModernCommandNode } from "@/types/modernCommand";

/** A command on the "How users see it" strip (#194): a ribbon button or a modern command. */
export type UsersBarItem = Exclude<BarEntry, { kind: "system" }>;

/**
 * The tab's commands as the Unified Interface command bar lists them, before any rule is
 * applied (#194), from the preview's bar model (#191, `services/uciPreview/bar.ts`):
 * groups by Sequence and their buttons in merged document order, a button you added, moved or
 * re-sequenced where the platform's merge will put it, the buttons your layer or a modern command hides and the
 * controls Unified Interface doesn't draw (#37) left out, a button a migrated modern command
 * replaces shown as that command, and each modern command in the group its sequence names.
 * Display and enable rules aren't evaluated: Simulate mode (#191) does that.
 */
export function usersBar(
	tab: RibbonTab,
	modern: readonly ModernCommandNode[],
	overrides: ReadonlyMap<string, readonly ClassicModernOverride[]>,
	location: {
		/** Every tab of the location: a modern command can name a group on another tab. */
		tabs?: readonly RibbonTab[];
	} = {},
): UsersBarItem[] {
	// The tab as given (it may be newer than the store's), among the location's others.
	const tabs = location.tabs?.some((t) => t.id === tab.id)
		? location.tabs.map((t) => (t.id === tab.id ? tab : t))
		: [tab];
	return barOrder({
		tabs,
		modern: modern.map((n) => n.command),
		overrides,
	}).filter(
		(e): e is UsersBarItem =>
			(e.kind === "classic" && e.tabId === tab.id) ||
			// The modern commands given are this tab's strip's, wherever their sequence points:
			// one that names a group on another tab sits before or after this tab's buttons, as
			// that tab's Sequence puts it; one that names none comes last.
			e.kind === "modern",
	);
}
