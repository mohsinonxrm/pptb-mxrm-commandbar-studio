import { useEffect, useMemo } from "react";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { loadModernCommandData } from "@/services/dataverse/modernCommandService";
import {
	buildModernTree,
	filterModernCommands,
	findClassicOverrides,
	flattenModernTree,
	placeModernCommands,
	type ModernPlacement,
} from "@/services/modernCommands";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";
import type {
	ClassicModernOverride,
	ModernCommand,
	ModernCommandNode,
} from "@/types/modernCommand";

/**
 * Loads the active table's modern commands whenever the table changes. Runs
 * independently of (and in parallel with) the ribbon load and never fails it:
 * errors end up in the runtime log and as "no modern commands".
 */
export function useModernCommandsLoader(): void {
	const logicalName = useSessionStore((s) => s.activeEntity?.logicalName);
	const metadataId = useSessionStore((s) => s.activeEntity?.metadataId);

	useEffect(() => {
		const store = useModernCommandStore.getState();
		if (!logicalName || typeof window.dataverseAPI === "undefined") {
			store.reset();
			return;
		}
		const token = store.beginLoad(logicalName);
		void loadModernCommandData({ logicalName, metadataId }).then((data) =>
			useModernCommandStore.getState().finishLoad(token, data),
		);
	}, [logicalName, metadataId]);
}

/** App id → name, from the app list and the commands' own formatted values. */
export function useModernAppNames(): Map<string, string> {
	const apps = useModernCommandStore((s) => s.apps);
	const commands = useModernCommandStore((s) => s.commands);
	return useMemo(() => {
		const names = new Map<string, string>();
		for (const c of commands)
			if (c.appModuleId && c.appName) names.set(c.appModuleId, c.appName);
		for (const a of apps) names.set(a.id, a.name);
		return names;
	}, [apps, commands]);
}

/** Modern commands for a canvas location under the current App filter (all levels, unordered). */
export function useModernCommandsFor(location: RibbonLocation): ModernCommand[] {
	const commands = useModernCommandStore((s) => s.commands);
	const appFilter = useModernCommandStore((s) => s.appFilter);
	const logicalName = useSessionStore((s) => s.activeEntity?.logicalName);
	const metadataId = useSessionStore((s) => s.activeEntity?.metadataId);
	return useMemo(
		() =>
			logicalName
				? filterModernCommands(commands, {
						location,
						appFilter,
						table: { logicalName, metadataId },
					})
				: [],
		[commands, appFilter, location, logicalName, metadataId],
	);
}

/**
 * Modern commands render on the location's main command bar only — the first
 * tab of the location, a `…MainTab`, or the global tab.
 */
function isCommandBarTab(tab: RibbonTab, firstTabId: string | undefined): boolean {
	return tab.id === firstTabId || /MainTab$/i.test(tab.id) || tab.id === "Mscrm.GlobalTab";
}

export interface ModernCanvasModel {
	/** Top-level modern commands (with children) to draw as chips on this tab. */
	nodes: ModernCommandNode[];
	/** Where to draw them among the classic buttons (ModernCommandBar). */
	placement: ModernPlacement;
	/** Classic buttons a migrated modern command hides or stands in for. */
	overrides: Map<string, ClassicModernOverride[]>;
}

/**
 * Everything a canvas view needs to draw modern commands next to a tab's
 * classic buttons. Migrated commands that match a classic button on the tab
 * are not drawn twice: they show as a flag on that button instead.
 */
export function useModernCanvas(location: RibbonLocation, tab: RibbonTab): ModernCanvasModel {
	const commands = useModernCommandsFor(location);
	const logicalName = useSessionStore((s) => s.activeEntity?.logicalName) ?? "";
	const firstTabId = useRibbonStore((s) => s.ribbons[location]?.tabs[0]?.id);

	const model = useMemo(() => {
		const classic = tab.groups.flatMap((g) =>
			g.buttons.map((b) => ({ id: b.id, sequence: b.sequence })),
		);
		const overrides = findClassicOverrides(
			commands,
			classic.map((b) => b.id),
			logicalName,
		);
		// Migrated commands matching a classic button on this tab are represented
		// by that button (flagged when they hide / replace it, silent when they're
		// disabled and the classic button shows) — never drawn a second time.
		const matched = findClassicOverrides(
			commands,
			classic.map((b) => b.id),
			logicalName,
			{ includeDisabled: true },
		);
		const shownAsOverride = new Set([...matched.values()].flat().map((o) => o.command.id));
		const nodes = isCommandBarTab(tab, firstTabId)
			? buildModernTree(commands.filter((c) => !shownAsOverride.has(c.id)))
			: [];
		return { nodes, placement: placeModernCommands(classic, nodes), overrides };
	}, [commands, logicalName, tab, firstTabId]);

	// Diagnostics: migrated commands drawn as chips have no classic control on
	// this tab (the unique-name convention is undocumented). Logged once per set.
	const unmatchedMigrated = flattenModernTree(model.nodes)
		.filter((c) => c.origin !== "default")
		.map((c) => c.uniqueName)
		.join(", ");
	useEffect(() => {
		if (!unmatchedMigrated) return;
		useRuntimeLogStore
			.getState()
			.logInfo(
				"ribbon",
				`Migrated modern commands without a classic control on ${tab.id}: ${unmatchedMigrated}`,
			);
	}, [unmatchedMigrated, tab.id]);

	return model;
}

/** Overrides for one classic button at a location (properties pane). */
export function useClassicOverrides(
	location: RibbonLocation,
	buttonId: string | undefined,
): ClassicModernOverride[] {
	const commands = useModernCommandsFor(location);
	const logicalName = useSessionStore((s) => s.activeEntity?.logicalName) ?? "";
	return useMemo(
		() =>
			buttonId
				? (findClassicOverrides(commands, [buttonId], logicalName).get(buttonId) ?? [])
				: [],
		[commands, buttonId, logicalName],
	);
}

/**
 * The selected modern command, when it is visible at the current location and
 * App filter and no classic button is selected; otherwise null.
 */
export function useSelectedModernCommand(): {
	command: ModernCommand;
	children: ModernCommand[];
} | null {
	const selectedId = useModernCommandStore((s) => s.selectedCommandId);
	const classicSelected = useSelectionStore((s) => s.selectedButtonId);
	const location = useSelectionStore((s) => s.location);
	const commands = useModernCommandsFor(location);
	return useMemo(() => {
		if (!selectedId || classicSelected) return null;
		const command = commands.find((c) => c.id === selectedId);
		if (!command) return null;
		let self: ModernCommandNode | undefined;
		for (const root of buildModernTree(commands)) {
			self = findNode(root, selectedId);
			if (self) break;
		}
		return { command, children: self ? flattenModernTree(self.children) : [] };
	}, [selectedId, classicSelected, commands]);
}

function findNode(node: ModernCommandNode, id: string): ModernCommandNode | undefined {
	if (node.command.id === id) return node;
	for (const child of node.children) {
		const hit = findNode(child, id);
		if (hit) return hit;
	}
	return undefined;
}
