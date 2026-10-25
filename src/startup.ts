/**
 * Start-up against the PPTB host (desktop app or VS Code extension), split
 * from main.tsx so it can be tested. A start-up that fails — or a host call
 * that never answers — used to leave a blank tab (#89): every failure now
 * ends on a visible error screen, and host calls are time-boxed.
 */

/** Longest wait for the host's theme; the tool starts in the light theme without it. */
export const THEME_TIMEOUT_MS = 5_000;
/** Longest wait for the host's active connection. */
export const CONNECTION_TIMEOUT_MS = 30_000;
/** The PPTB version the tool is built for (package.json `features.minAPI`). */
export const MIN_PPTB_VERSION = "1.2.7";

export interface StartupHost {
	toolboxAPI?: Partial<ToolBoxAPI.API>;
	dataverseAPI?: unknown;
}

export interface StartupResult {
	connection: ToolBoxAPI.Connection;
	theme: "light" | "dark";
	/** Problems that didn't stop the start-up (shown in the runtime log). */
	warnings: string[];
}

/** Rejects with `message` when `promise` hasn't settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error(message)), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

/** Reads what the tool needs from the host, or throws an error that says what to do. */
export async function connectToHost(host: StartupHost): Promise<StartupResult> {
	const { toolboxAPI, dataverseAPI } = host;
	if (!toolboxAPI || !dataverseAPI) {
		throw new Error(
			"Command Bar Studio must be opened from Power Platform ToolBox: the toolbox APIs (toolboxAPI / dataverseAPI) aren't available.",
		);
	}
	const getActiveConnection = toolboxAPI.connections?.getActiveConnection;
	if (typeof getActiveConnection !== "function") {
		throw new Error(
			`This version of Power Platform ToolBox doesn't provide the connection API Command Bar Studio uses. Update Power Platform ToolBox (desktop app or VS Code extension) to ${MIN_PPTB_VERSION} or later.`,
		);
	}

	const warnings: string[] = [];
	let theme: "light" | "dark" = "light";
	try {
		const getCurrentTheme = toolboxAPI.utils?.getCurrentTheme;
		if (typeof getCurrentTheme !== "function") throw new Error("the host has no theme API");
		const value = await withTimeout(
			getCurrentTheme(),
			THEME_TIMEOUT_MS,
			"the host didn't answer",
		);
		theme = value === "dark" ? "dark" : "light";
	} catch (error) {
		warnings.push(`Couldn't read the host theme (${messageOf(error)}); using the light theme.`);
	}

	const connection = await withTimeout(
		getActiveConnection(),
		CONNECTION_TIMEOUT_MS,
		`Power Platform ToolBox didn't return the active connection within ${CONNECTION_TIMEOUT_MS / 1000} seconds. Make sure a connection is active and signed in, then open Command Bar Studio again.`,
	);
	if (!connection) {
		throw new Error(
			"No active connection: connect to an environment in Power Platform ToolBox, then open Command Bar Studio again.",
		);
	}
	return { connection, theme, warnings };
}

/** Replaces `container`'s content with a start-up error and what to try (plain DOM: React may be what failed). */
export function renderStartupError(
	container: HTMLElement,
	error: unknown,
	title = "Command Bar Studio couldn't start",
): void {
	const doc = container.ownerDocument;
	const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
		const node = doc.createElement(tag);
		if (text) node.textContent = text;
		return node;
	};
	const box = el("div");
	box.setAttribute("role", "alert");
	box.style.cssText =
		"font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; max-width: 720px; line-height: 1.5;";
	box.append(el("h1", title));
	const reason = el("p", messageOf(error));
	reason.style.fontWeight = "600";
	box.append(reason);
	const tips = el("ul");
	// No reload button: neither host can reload a tool page — the desktop app
	// loses the tool's context and the VS Code extension shows an empty frame.
	for (const tip of [
		"Close the Command Bar Studio tab and open the tool again.",
		`Use Power Platform ToolBox ${MIN_PPTB_VERSION} or later (desktop app or VS Code extension).`,
		"Make sure a connection is active and signed in.",
		"If it keeps happening, report it at https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio/issues with this message.",
	])
		tips.append(el("li", tip));
	box.append(tips);
	container.replaceChildren(box);
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
