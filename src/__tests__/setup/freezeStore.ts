/**
 * Every test runs with the ribbon store's workspace, baseline and history frozen (#111).
 *
 * The baseline shares its locations, commands, rules and labels with the workspace and the undo
 * history, and hasPendingChanges compares them by reference first. Code that changed one of those
 * objects in place would change the baseline too, and its edit would no longer count as a change
 * to publish. Freezing them after every change makes such a write throw in the tests instead.
 */
import { useRibbonStore, type RibbonStoreState } from "@/store/ribbonStore";

const SHARED = [
	"ribbons",
	"baseline",
	"commands",
	"enableRules",
	"displayRules",
	"locLabels",
	"baselineCommands",
	"baselineEnableRules",
	"baselineDisplayRules",
	"baselineLocLabels",
	"past",
	"future",
] as const satisfies readonly (keyof RibbonStoreState)[];

/** Objects already frozen with everything in them: a change only walks what's new. */
const frozen = new WeakSet<object>();

function freeze(value: unknown): void {
	if (!value || typeof value !== "object" || frozen.has(value)) return;
	frozen.add(value);
	Object.freeze(value);
	for (const v of Object.values(value)) freeze(v);
}

function freezeShared(state: RibbonStoreState): void {
	for (const key of SHARED) freeze(state[key]);
}

freezeShared(useRibbonStore.getState());
useRibbonStore.subscribe(freezeShared);
