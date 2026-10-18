/**
 * Saves the loaded table's unsaved changes as a draft in localStorage after
 * every change, so they can be restored in a later session (#16). What is
 * saved, when, and how it is restored: see store/draftStore.ts and
 * services/ribbonDraft.ts.
 */
import { useEffect } from "react";
import { installDraftAutosave } from "@/store/draftStore";
import { discardOutdatedDrafts } from "@/services/ribbonDraft";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";

/** Call once in the app root — does not render anything. */
export function useRibbonPersistence() {
	useEffect(() => {
		const outdated = discardOutdatedDrafts();
		if (outdated > 0) {
			useRuntimeLogStore
				.getState()
				.logInfo(
					"ribbon",
					`Discarded ${outdated} unsaved-changes draft(s) saved by an earlier version of Command Bar Studio (they can't be restored correctly).`,
				);
		}
		return installDraftAutosave();
	}, []);
}
