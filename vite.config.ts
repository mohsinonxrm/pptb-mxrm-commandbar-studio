import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { dataverseProxy } from "./dev/harness/vite-plugin-dataverse-proxy";

/**
 * Bundles the tool icon at dist/icons/icon.svg, where package.json's top-level
 * `icon` points. PPTB resolves `icon` relative to the dist root, so the
 * repo-root `icons/` folder is never seen by the host (#54). Prerelease
 * versions (e.g. 0.6.0-beta.1) get the gold Insider variant; releases get the
 * regular icon. Mirrors the sibling studios (FXS `fxs-tool-icon`, DRS
 * `toolIcon()`). https://docs.powerplatformtoolbox.com/tool-development/publishing
 */
function toolIcon(): Plugin {
	return {
		name: "cbs-tool-icon",
		apply: "build",
		generateBundle() {
			// Resolve against this config file, not the process cwd.
			const fromRoot = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
			const { version } = JSON.parse(readFileSync(fromRoot("package.json"), "utf8")) as {
				version: string;
			};
			const source = version.includes("-") ? "icons/icon-insider.svg" : "icons/icon.svg";
			this.emitFile({
				type: "asset",
				fileName: "icons/icon.svg",
				source: readFileSync(fromRoot(source), "utf8"),
			});
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
	// Relative asset URLs: the host serves dist/ under a tool-specific path
	// (the VS Code extension's webview resource URL), so root-absolute
	// `/assets/…` lazy chunks and preloads resolve to the wrong place and 401,
	// leaving a blank tab (#89). Same as the PPTB desktop app's own config.
	base: "./",
	plugins: [
		react(),
		toolIcon(),
		// Dev harness only (`npm run dev:harness`): proxies /__dv/* to the org in
		// CBS_HARNESS_ORG with an Azure CLI token. Never active for `vite build`.
		...(command === "serve" && process.env.CBS_HARNESS_ORG
			? [dataverseProxy({ orgUrl: process.env.CBS_HARNESS_ORG })]
			: []),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	optimizeDeps: {
		// Pre-bundle Monaco at dev-time so Vite doesn't lazily transform its
		// deep internal imports (avoids CJS/ESM interop edge cases that surface
		// as runtime "module not found" errors). Mirrors DRS / FetchXML Studio.
		include: ["monaco-editor"],
	},
	build: {
		target: ["chrome108", "firefox115", "safari16"],
		// Source maps disabled: Monaco worker .map files add ~17 MB to the
		// npm package. Dev builds via `npm run dev` provide full HMR + source
		// maps. Flip to true / 'hidden' locally if you need to debug a
		// specific production-only issue.
		sourcemap: false,
		rollupOptions: {
			output: {
				manualChunks: {
					monaco: ["@monaco-editor/react", "monaco-editor"],
					"fluent-ui": ["@fluentui/react-components"],
					"fluent-icons": ["@fluentui/react-icons"],
					dnd: ["@dnd-kit/core", "@dnd-kit/sortable"],
				},
			},
		},
	},
}));
