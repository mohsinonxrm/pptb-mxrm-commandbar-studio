import { create } from "zustand";

export type RuntimeLogLevel = "info" | "warn" | "error";

export interface RuntimeLogEntry {
	id: string;
	ts: string;
	scope: string;
	level: RuntimeLogLevel;
	message: string;
}

interface RuntimeLogStore {
	entries: RuntimeLogEntry[];
	append(entry: Omit<RuntimeLogEntry, "id" | "ts">): void;
	logInfo(scope: string, message: string): void;
	logWarn(scope: string, message: string): void;
	logError(scope: string, message: string): void;
	clear(): void;
}

const MAX_ENTRIES = 400;

export const useRuntimeLogStore = create<RuntimeLogStore>()((set, get) => ({
	entries: [],
	append: (entry) => {
		const nextId = `${Date.now()}-${get().entries.length + 1}`;
		const next: RuntimeLogEntry = {
			id: nextId,
			ts: new Date().toISOString(),
			...entry,
		};
		set({ entries: [...get().entries, next].slice(-MAX_ENTRIES) });
	},
	logInfo: (scope, message) => get().append({ scope, level: "info", message }),
	logWarn: (scope, message) => get().append({ scope, level: "warn", message }),
	logError: (scope, message) => get().append({ scope, level: "error", message }),
	clear: () => set({ entries: [] }),
}));
