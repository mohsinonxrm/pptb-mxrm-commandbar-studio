/**
 * Small per-user UI preferences (open sections, dismissed messages) kept in
 * localStorage. Storage can be missing or throw (private windows, blocked site
 * data, the VS Code webview), so every read and write is guarded and a failure
 * just means the preference isn't remembered.
 */

const PREFIX = "cbs.ui.";

export function readPref<T>(key: string, fallback: T): T {
	try {
		const raw = window.localStorage.getItem(PREFIX + key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

export function writePref<T>(key: string, value: T): void {
	try {
		window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// Not remembered: storage is unavailable or full.
	}
}
