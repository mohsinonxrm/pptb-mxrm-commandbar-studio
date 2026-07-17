// Configure Monaco to use the locally-bundled instance instead of CDN.
// Must be the very first import so the loader is configured before any
// component that calls useMonaco() / <Editor> / <DiffEditor> is loaded.
import "@/utils/monacoSetup";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { App } from "./App";
import "./index.css";

async function bootstrap() {
	const logInfo = useRuntimeLogStore.getState().logInfo;
	const toolboxAPI = (window as Window & typeof globalThis).toolboxAPI;
	const dataverseAPI = (window as Window & typeof globalThis).dataverseAPI;
	if (!toolboxAPI || !dataverseAPI) {
		throw new Error("PPTB host APIs are required. toolboxAPI/dataverseAPI were not found.");
	}

	logInfo("startup", "Connected to PPTB host runtime.");

	const theme = await toolboxAPI.utils.getCurrentTheme();
	const isDark = theme === "dark";
	logInfo("startup", `Host theme loaded: ${theme}.`);

	const connection = await toolboxAPI.connections.getActiveConnection();
	if (!connection) {
		throw new Error("No active connection available from toolboxAPI");
	}

	const { setConnection } = useSessionStore.getState();
	const { setThemeMode } = useUIStore.getState();
	setConnection(
		connection.url,
		connection.name,
		connection.environment as "Dev" | "Test" | "UAT" | "Production",
	);
	setThemeMode(isDark ? "dark" : "light");
	logInfo("startup", `Connected to ${connection.name} (${connection.environment}).`);

	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState !== "visible") return;
		void toolboxAPI.utils
			.getCurrentTheme()
			.then((nextTheme) => {
				useUIStore.getState().setThemeMode(nextTheme === "dark" ? "dark" : "light");
			})
			.catch((error) => {
				useRuntimeLogStore
					.getState()
					.logWarn(
						"startup",
						`Theme refresh failed: ${error instanceof Error ? error.message : String(error)}`,
					);
			});
	});

	const container = document.getElementById("root");
	if (!container) throw new Error("No #root element found");

	const root = createRoot(container);
	root.render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

bootstrap().catch((error) => {
	useRuntimeLogStore
		.getState()
		.logError("startup", error instanceof Error ? error.message : String(error));
	console.error(error);
});
