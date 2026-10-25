/**
 * Dev harness: installs stand-ins for PPTB's `window.toolboxAPI` and
 * `window.dataverseAPI` so Command Bar Studio's real UI runs in a normal
 * browser tab against a live Dataverse org.
 *
 * Loaded by dev/harness/index.html *before* /src/main.tsx. Only used by
 * `npm run dev:harness`; never part of the build or the npm package.
 *
 * Only the members CBS actually uses are implemented. Dataverse calls go
 * through the Vite dev-server proxy (`/__dv/*`, see
 * vite-plugin-dataverse-proxy.ts), which adds the bearer token server-side.
 *
 * Query-string overrides (handy for screenshots/automation):
 *   ?theme=dark|light   force the theme returned by getCurrentTheme()
 */
import { createDataverseStub, HARNESS_HEADER } from "./dataverseStub";

const LOG_PREFIX = "[cbs-harness]";

interface HarnessInfo {
	orgUrl: string;
}

let infoPromise: Promise<HarnessInfo> | undefined;

function getHarnessInfo(): Promise<HarnessInfo> {
	infoPromise ??= fetch("/__dv-harness/info", { headers: { [HARNESS_HEADER]: "1" } }).then(
		async (res) => {
			if (!res.ok) {
				throw new Error(
					`Dev harness proxy is not running (HTTP ${res.status}). ` +
						"Start it with CBS_HARNESS_ORG=https://<org>.crm.dynamics.com npm run dev:harness",
				);
			}
			return (await res.json()) as HarnessInfo;
		},
	);
	return infoPromise;
}

function currentTheme(): "light" | "dark" {
	const forced = new URLSearchParams(window.location.search).get("theme");
	if (forced === "dark" || forced === "light") return forced;
	return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const dataverseAPI = createDataverseStub((input, init) => window.fetch(input, init));

/** The harness org as a connection. */
async function harnessConnection(): Promise<ToolBoxAPI.Connection> {
	const { orgUrl } = await getHarnessInfo();
	return {
		id: "cbs-dev-harness",
		name: `${new URL(orgUrl).hostname} (dev harness)`,
		url: orgUrl,
		environment: "Dev",
	};
}

/**
 * Simulating PPTB changing the tool's connection while it runs (#120): set via
 * `window.cbsHarness.switchConnection({...})` in the browser console. The
 * proxy still talks to the harness org, so use another id (and/or name,
 * environment) for "another connection".
 */
let connectionOverride: ToolBoxAPI.Connection | null = null;
const currentConnection = async () => connectionOverride ?? harnessConnection();
type EventHandler = (
	event: unknown,
	payload: { event: string; data: unknown; timestamp: string },
) => void;
const eventHandlers = new Set<EventHandler>();
function emitEvent(event: string, data: unknown = {}): void {
	for (const handler of eventHandlers)
		handler({}, { event, data, timestamp: new Date().toISOString() });
}

const toolboxAPI = {
	connections: {
		getActiveConnection: currentConnection,
		getConnection: async (_slot: unknown) => currentConnection(),
	},
	utils: {
		getCurrentTheme: async (): Promise<"light" | "dark"> => currentTheme(),
		openInConnectionBrowser: async (url: string): Promise<void> => {
			window.open(url, "_blank", "noopener,noreferrer");
		},
		copyToClipboard: async (text: string): Promise<void> => {
			await navigator.clipboard.writeText(text);
		},
		showNotification: async (options: ToolBoxAPI.NotificationOptions): Promise<void> => {
			console.info(
				LOG_PREFIX,
				`[${options.type ?? "info"}] ${options.title}: ${options.body}`,
			);
		},
	},
	events: {
		on: (handler: EventHandler): void => {
			eventHandlers.add(handler);
		},
		off: (handler: EventHandler): void => {
			eventHandlers.delete(handler);
		},
	},
};

// The stubs implement only what CBS uses, so cast to the full host API types.
window.toolboxAPI = toolboxAPI as unknown as ToolBoxAPI.API;
window.dataverseAPI = dataverseAPI as unknown as DataverseAPI.API;

/** Harness-only helpers for the browser console. */
(window as unknown as { cbsHarness: unknown }).cbsHarness = {
	/** As PPTB does when the tool's connection changes: the new connection, then `connection:updated`. */
	async switchConnection(connection: Partial<ToolBoxAPI.Connection> | null): Promise<void> {
		const harness = await harnessConnection();
		connectionOverride = connection
			? {
					...harness,
					id: "cbs-dev-harness-2",
					name: "Other connection",
					environment: "Production",
					...connection,
				}
			: null;
		emitEvent("connection:updated", { id: (connectionOverride ?? harness).id });
	},
	/** Raises any host event (e.g. a token refresh: "connection:updated"). */
	emit: emitEvent,
};

console.info(LOG_PREFIX, "PPTB stub installed (toolboxAPI + dataverseAPI → /__dv proxy).");
