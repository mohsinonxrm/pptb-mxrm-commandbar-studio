import { useEffect, useMemo } from "react";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { loadModernCommandData } from "@/services/dataverse/modernCommandService";
import {
	buildModernLocationModel,
	buildModernTree,
	filterModernCommands,
	flattenModernTree,
	placeModernCommands,
	type ModernLocationModel,
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

export interface ModernCanvasModel {
	/** Top-level modern commands (with children) to draw as chips on this tab. */
	nodes: ModernCommandNode[];
	/** Where to draw them among the classic buttons (ModernCommandBar). */
	placement: ModernPlacement;
	/** Classic buttons (on any tab of the location) a migrated modern command hides or stands in for. */
	overrides: Map<string, ClassicModernOverride[]>;
}

/** Diagnostics already written, so each location's list is logged once. */
const loggedUnmatched = new Set<string>();

/**
 * Location-wide model: migrated commands are matched against the classic
 * controls of every tab of the location; chips go on its command-bar tab only.
 */
export function useModernLocation(location: RibbonLocation): ModernLocationModel {
	const commands = useModernCommandsFor(location);
	const logicalName = useSessionStore((s) => s.activeEntity?.logicalName) ?? "";
	const tabs = useRibbonStore((s) => s.ribbons[location]?.tabs);
	const ribbonTable = useRibbonStore((s) => s.ribbons[location]?.entityLogicalName ?? "");
	const modernTable = useModernCommandStore((s) =>
		s.status === "loaded" ? s.tableLogicalName : null,
	);
	// The ribbon store still holds the previous table's tabs while the new
	// table's ribbon loads: match (and place chips) only against this table's.
	const ribbonReady =
		(tabs?.length ?? 0) > 0 &&
		(location === "Application" || ribbonTable.toLowerCase() === logicalName.toLowerCase());
	const model = useMemo(
		() =>
			buildModernLocationModel({
				commands,
				tabs: ribbonReady ? (tabs ?? []) : [],
				location,
				entityLogicalName: logicalName,
			}),
		[commands, tabs, ribbonReady, location, logicalName],
	);

	// Diagnostics: migrated commands with no classic control anywhere in the
	// location (the unique-name convention is undocumented). Only once both the
	// table's classic ribbon and its modern commands are loaded — before that
	// nothing can match — and logged once per list.
	const ready = !!logicalName && modernTable === logicalName && ribbonReady;
	const unmatched = ready ? model.unmatchedMigrated.map((c) => c.uniqueName).join(", ") : "";
	useEffect(() => {
		const key = `${logicalName}|${location}|${unmatched}`;
		if (!unmatched || loggedUnmatched.has(key)) return;
		loggedUnmatched.add(key);
		useRuntimeLogStore
			.getState()
			.logInfo(
				"ribbon",
				`Migrated modern commands without a classic control in ${logicalName} ${location}: ${unmatched}`,
			);
	}, [unmatched, logicalName, location]);

	return model;
}

/**
 * Everything a canvas view needs to draw modern commands next to a tab's
 * classic buttons. Migrated commands that match a classic control anywhere in
 * the location are not drawn: they show as a flag on that control instead.
 * Chips appear only on the location's command-bar tab (the table's MainTab),
 * as Unified Interface renders one flat command bar per location.
 */
export function useModernCanvas(location: RibbonLocation, tab: RibbonTab): ModernCanvasModel {
	const model = useModernLocation(location);
	return useMemo(() => {
		const classic = tab.groups.flatMap((g) =>
			g.buttons.map((b) => ({ id: b.id, sequence: b.sequence })),
		);
		const nodes = tab.id === model.commandBarTabId ? model.nodes : [];
		return {
			nodes,
			placement: placeModernCommands(classic, nodes),
			overrides: model.overrides,
		};
	}, [model, tab]);
}

/** Overrides for one classic button at a location (properties pane). */
export function useClassicOverrides(
	location: RibbonLocation,
	buttonId: string | undefined,
): ClassicModernOverride[] {
	const { overrides } = useModernLocation(location);
	return (buttonId && overrides.get(buttonId)) || NO_OVERRIDES;
}

const NO_OVERRIDES: ClassicModernOverride[] = [];

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
