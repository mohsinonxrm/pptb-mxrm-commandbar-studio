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

const toolboxAPI = {
	connections: {
		getActiveConnection: async (): Promise<ToolBoxAPI.Connection> => {
			const { orgUrl } = await getHarnessInfo();
			return {
				id: "cbs-dev-harness",
				name: `${new URL(orgUrl).hostname} (dev harness)`,
				url: orgUrl,
				environment: "Dev",
			};
		},
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
		on: (): (() => void) => () => undefined,
		off: (): void => undefined,
	},
};

// The stubs implement only what CBS uses, so cast to the full host API types.
window.toolboxAPI = toolboxAPI as unknown as ToolBoxAPI.API;
window.dataverseAPI = dataverseAPI as unknown as DataverseAPI.API;

console.info(LOG_PREFIX, "PPTB stub installed (toolboxAPI + dataverseAPI → /__dv proxy).");
