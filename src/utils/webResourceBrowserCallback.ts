import type { WebResource } from "@/types/webResource";

/**
 * Module-level callback registry for the global WebResourceBrowser overlay.
 *
 * Because WebResourceBrowser is rendered once in Layout without props, callers
 * (IdentitySection, CommandEditorPanel, …) register a one-shot callback before
 * calling `openWebResourceBrowser()`. The browser invokes and clears the
 * callback when the user confirms a selection, or clears it on cancel.
 *
 * Using a module variable (not Zustand state) avoids serialization issues with
 * the persisted uiStore.
 */
type WRCallback = (wr: WebResource) => void;

let _callback: WRCallback | null = null;

export const webResourceBrowserCallbackRegistry = {
	/** Register a one-shot callback. Overwrites any previously registered one. */
	set(cb: WRCallback): void {
		_callback = cb;
	},

	/** Invoke the registered callback with the selected resource, then clear it. */
	invoke(wr: WebResource): void {
		const cb = _callback;
		_callback = null;
		cb?.(wr);
	},

	/** Clear the callback without invoking (e.g. on Cancel). */
	clear(): void {
		_callback = null;
	},

	/** True when a caller is waiting for a selection. */
	hasPending(): boolean {
		return _callback !== null;
	},
};
