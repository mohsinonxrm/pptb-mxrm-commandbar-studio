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
import { RootErrorBoundary } from "@/components/shared/RootErrorBoundary";
import { connectToHost, renderStartupError } from "./startup";
import { getPrimaryConnection, watchHostConnection } from "@/services/hostConnection";
import { applyHostConnection } from "@/services/connectionSwitch";
import "./index.css";

async function bootstrap() {
	const logInfo = useRuntimeLogStore.getState().logInfo;
	const win = window as Window & typeof globalThis;
	const toolboxAPI = win.toolboxAPI;
	const { connection, theme, warnings } = await connectToHost({
		toolboxAPI,
		dataverseAPI: win.dataverseAPI,
	});
	logInfo("startup", "Connected to PPTB host runtime.");
	for (const w of warnings) useRuntimeLogStore.getState().logWarn("startup", w);
	logInfo("startup", `Host theme loaded: ${theme}.`);

	const { setConnection } = useSessionStore.getState();
	const { setThemeMode } = useUIStore.getState();
	// The tool's own connection (slot 0) when the host has slots; the active one otherwise.
	const primary = (await getPrimaryConnection().catch(() => null)) ?? connection;
	setConnection(
		primary.url,
		primary.name,
		primary.environment as "Dev" | "Test" | "UAT" | "Production",
		primary.id,
	);
	setThemeMode(theme);
	logInfo("startup", `Connected to ${primary.name} (${primary.environment}).`);

	// The connection can change while the tool runs (#120): reset to the new one.
	watchHostConnection((next) => applyHostConnection(next));

	const refreshTheme = () => {
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
	};
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") refreshTheme();
	});
	// PPTB raises `settings:updated` when the user changes the host theme while
	// the tool is open (no visibility change in that case).
	toolboxAPI.events?.on((_event, payload) => {
		if (payload?.event === "settings:updated") refreshTheme();
	});

	const container = document.getElementById("root");
	if (!container) throw new Error("No #root element found");

	const root = createRoot(container);
	root.render(
		<StrictMode>
			<RootErrorBoundary>
				<App />
			</RootErrorBoundary>
		</StrictMode>,
	);
}

bootstrap().catch((error) => {
	useRuntimeLogStore
		.getState()
		.logError("startup", error instanceof Error ? error.message : String(error));
	console.error(error);
	// Never a blank tab (#89): show what failed and what to try.
	const container = document.getElementById("root") ?? document.body;
	renderStartupError(container, error);
});
