import type { StateStorage } from "zustand/middleware";

/**
 * A StateStorage that writes each key at most once per `delayMs`. Dragging a pane's resize
 * handle sets its width on every pointer move, and zustand's persist wrote localStorage
 * each time (#23). The newest value is written when the delay ends, and straight away when
 * the page is hidden or closed. Reads see a write that's still pending.
 */
export function throttledStorage(storage: () => Storage, delayMs = 250): StateStorage {
	const pending = new Map<string, string>();
	let timer: ReturnType<typeof setTimeout> | undefined;

	const flush = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		for (const [key, value] of pending) {
			try {
				storage().setItem(key, value);
			} catch {
				// Storage unavailable or full: the setting lasts for this session only
			}
		}
		pending.clear();
	};

	if (typeof window !== "undefined") {
		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") flush();
		});
	}

	return {
		getItem: (key) => {
			const value = pending.get(key);
			if (value !== undefined) return value;
			try {
				return storage().getItem(key);
			} catch {
				return null;
			}
		},
		setItem: (key, value) => {
			pending.set(key, value);
			timer ??= setTimeout(flush, delayMs);
		},
		removeItem: (key) => {
			pending.delete(key);
			try {
				storage().removeItem(key);
			} catch {
				// Nothing to remove
			}
		},
	};
}
