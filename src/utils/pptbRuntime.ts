let closeGuardDepth = 0;

/**
 * Runs `fn` with PPTB's prevent-close on (1.2.6+, #10): closing the tool or
 * quitting PPTB while a solution import / publish runs asks the user first,
 * instead of leaving a half-imported ribbon behind. Nested and parallel calls
 * share one guard, released when the last one ends. A host without the API,
 * or a failing call, never blocks the work.
 */
export async function withCloseGuard<T>(fn: () => Promise<T>): Promise<T> {
	const api = typeof window !== "undefined" ? window.toolboxAPI : undefined;
	if (closeGuardDepth++ === 0) await callHost(() => api?.preventClose?.());
	try {
		return await fn();
	} finally {
		if (--closeGuardDepth === 0) await callHost(() => api?.releasePreventClose?.());
	}
}

/** Longest wait for the host to acknowledge; the work never waits longer. */
const HOST_TIMEOUT_MS = 2000;

async function callHost(call: () => Promise<boolean> | undefined): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			call(),
			new Promise((resolve) => (timer = setTimeout(resolve, HOST_TIMEOUT_MS))),
		]);
	} catch {
		// Older host or a failed call: the work goes ahead unguarded.
	} finally {
		clearTimeout(timer);
	}
}
