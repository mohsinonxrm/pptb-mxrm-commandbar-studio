/**
 * Clipboard and file saving through the PPTB host first, the browser as a
 * fallback (#122): in a tool frame or the VS Code webview the browser's
 * clipboard can be denied and `<a download>` blocked, so a direct call failed
 * silently.
 */

export type CopyResult = { ok: true } | { ok: false; error: string };

export type SaveResult =
	| { ok: true; path?: string }
	| { ok: false; canceled: true }
	| { ok: false; canceled?: false; error: string };

export interface FileFilter {
	name: string;
	extensions: string[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Copies `text`: the host's clipboard, else the browser's. */
export async function copyText(text: string): Promise<CopyResult> {
	const errors: string[] = [];
	const host = window.toolboxAPI?.utils?.copyToClipboard;
	if (host) {
		try {
			await host(text);
			return { ok: true };
		} catch (e) {
			errors.push(`host: ${message(e)}`);
		}
	}
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return { ok: true };
		} catch (e) {
			errors.push(`browser: ${message(e)}`);
		}
	}
	return { ok: false, error: errors.join("; ") || "no clipboard is available here" };
}

/**
 * Saves `content` as a file: the host's Save dialog (`path` is where it went;
 * a cancel isn't an error), else a browser download (no path known).
 */
export async function saveTextFile(
	name: string,
	content: string,
	filters?: FileFilter[],
): Promise<SaveResult> {
	const host = window.toolboxAPI?.fileSystem?.saveFile;
	if (host) {
		try {
			const path = await host(name, content, filters);
			return path ? { ok: true, path } : { ok: false, canceled: true };
		} catch (e) {
			return { ok: false, error: message(e) };
		}
	}
	try {
		const url = URL.createObjectURL(new Blob([content], { type: "application/xml" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		// Revoked once the download has started, not in the same tick.
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: message(e) };
	}
}
