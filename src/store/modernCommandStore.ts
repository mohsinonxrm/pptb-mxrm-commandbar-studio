import { create } from "zustand";
import { useSelectionStore } from "@/store/selectionStore";
import type { ModernAppFilter, ModernAppModule, ModernCommand } from "@/types/modernCommand";
import type { ModernCommandData } from "@/services/dataverse/modernCommandService";

/**
 * Modern commands (`appaction`, #32) for the active table — a store of its own,
 * deliberately separate from the ribbon store. Nothing in here is part of the
 * ribbon model: it is never in history, the baseline, persistence, the publish
 * planner or the RibbonDiffXml merge, and CBS never writes it back.
 */
export interface ModernCommandStore {
	/** Table the commands were loaded for. */
	tableLogicalName: string | null;
	status: "idle" | "loading" | "loaded" | "unavailable";
	/** Why the commands couldn't be read (status "unavailable"). */
	error: string | null;
	commands: ModernCommand[];
	apps: ModernAppModule[];
	/** "all" or an appmoduleid. */
	appFilter: ModernAppFilter;
	/** Selected modern command (shown read-only in the properties pane). */
	selectedCommandId: string | null;
	/** Bumped on every load so a slow response for a previous table is dropped. */
	loadToken: number;

	beginLoad(tableLogicalName: string): number;
	finishLoad(token: number, data: ModernCommandData): void;
	reset(): void;
	setAppFilter(filter: ModernAppFilter): void;
	selectCommand(id: string | null): void;
}

export const useModernCommandStore = create<ModernCommandStore>()((set, get) => ({
	tableLogicalName: null,
	status: "idle",
	error: null,
	commands: [],
	apps: [],
	appFilter: "all",
	selectedCommandId: null,
	loadToken: 0,

	beginLoad(tableLogicalName) {
		const token = get().loadToken + 1;
		set({
			tableLogicalName,
			status: "loading",
			error: null,
			commands: [],
			apps: [],
			selectedCommandId: null,
			loadToken: token,
		});
		return token;
	},

	finishLoad(token, data) {
		if (token !== get().loadToken) return;
		const { appFilter } = get();
		// Keep the chosen app across tables when it is still offered.
		const keepFilter = appFilter === "all" || data.apps.some((a) => a.id === appFilter);
		set({
			status: data.error ? "unavailable" : "loaded",
			error: data.error ?? null,
			commands: data.commands,
			apps: data.apps,
			appFilter: keepFilter ? appFilter : "all",
		});
	},

	reset() {
		set((s) => ({
			tableLogicalName: null,
			status: "idle",
			error: null,
			commands: [],
			apps: [],
			selectedCommandId: null,
			// An app of the previous connection (#120) or table.
			appFilter: "all",
			loadToken: s.loadToken + 1,
		}));
	},

	setAppFilter(filter) {
		set({ appFilter: filter ? filter.toLowerCase() : "all" });
	},

	selectCommand(id) {
		// A modern command and a classic button are never selected together.
		if (id) useSelectionStore.getState().clearSelection();
		set({ selectedCommandId: id });
	},
}));

// Selecting a classic button, or moving to another tab / location, ends the
// modern selection so it can't reappear later. (A table change clears it in beginLoad.)
useSelectionStore.subscribe((s, prev) => {
	if (!useModernCommandStore.getState().selectedCommandId) return;
	const classicSelected = !!s.selectedButtonId && s.selectedButtonId !== prev.selectedButtonId;
	if (classicSelected || s.location !== prev.location || s.tabId !== prev.tabId) {
		useModernCommandStore.setState({ selectedCommandId: null });
	}
});
