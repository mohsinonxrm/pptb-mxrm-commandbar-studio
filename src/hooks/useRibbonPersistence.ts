/**
 * Persists ribbon state to localStorage after every mutation
 * and offers to restore unsaved changes on startup.
 *
 * Storage key format: cbs:ribbon:{orgUrl}:{entityLogicalName}
 */
import { useEffect, useRef } from "react";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import type { RibbonLocation, RibbonDefinition } from "@/types/ribbon";
import type { CommandDefinition, EnableRule, DisplayRule, LocLabel } from "@/types/ribbon";

interface PersistedRibbonData {
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	commands: CommandDefinition[];
	displayRules: DisplayRule[];
	enableRules: EnableRule[];
	locLabels: LocLabel[];
	savedAt: string;
}

function buildKey(orgUrl: string, entityLogicalName: string): string {
	// Normalize org URL to avoid issues with trailing slashes
	const safeOrg = orgUrl.replace(/\/+$/, "").replace(/[^a-zA-Z0-9.-]/g, "_");
	const safeEntity = entityLogicalName || "global";
	return `cbs:ribbon:${safeOrg}:${safeEntity}`;
}

export function loadPersistedRibbonData(
	orgUrl: string,
	entityLogicalName: string,
): PersistedRibbonData | null {
	try {
		const key = buildKey(orgUrl, entityLogicalName);
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		return JSON.parse(raw) as PersistedRibbonData;
	} catch {
		return null;
	}
}

export function clearPersistedRibbonData(orgUrl: string, entityLogicalName: string): void {
	const key = buildKey(orgUrl, entityLogicalName);
	localStorage.removeItem(key);
}

/**
 * Hook that auto-saves ribbon state to localStorage on every mutation.
 * Call once in the app root — does not render anything.
 */
export function useRibbonPersistence() {
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const entityLogicalName = activeEntity?.logicalName ?? "";

	// Track last saved mutation count to avoid redundant writes
	const lastSavedMutation = useRef(-1);

	useEffect(() => {
		if (!connectionUrl) return;

		// Subscribe to mutation count changes — save when mutations occur
		const unsubscribe = useRibbonStore.subscribe(
			(state) => state.mutationsSincePublish,
			(count) => {
				if (count === 0) return; // Just published — no need to save
				if (count === lastSavedMutation.current) return;
				lastSavedMutation.current = count;

				const state = useRibbonStore.getState();
				const data: PersistedRibbonData = {
					ribbons: state.ribbons,
					commands: state.commands,
					displayRules: state.displayRules,
					enableRules: state.enableRules,
					locLabels: state.locLabels,
					savedAt: new Date().toISOString(),
				};
				try {
					const key = buildKey(connectionUrl, entityLogicalName);
					localStorage.setItem(key, JSON.stringify(data));
				} catch {
					// localStorage quota exceeded — silently ignore
				}
			},
		);

		return unsubscribe;
	}, [connectionUrl, entityLogicalName]);

	// Clear saved state after publish
	useEffect(() => {
		if (!connectionUrl) return;

		const unsubscribe = useRibbonStore.subscribe(
			(state) => state.mutationsSincePublish,
			(count) => {
				if (count === 0) {
					clearPersistedRibbonData(connectionUrl, entityLogicalName);
					lastSavedMutation.current = 0;
				}
			},
		);

		return unsubscribe;
	}, [connectionUrl, entityLogicalName]);
}
