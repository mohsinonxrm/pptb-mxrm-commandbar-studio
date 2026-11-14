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

/**
 * Monaco ships its own copy of DOMPurify (`vs/base/browser/dompurify/dompurify.js`:
 * 3.2.7 in 0.55, 3.4.15 in 0.57) and imports that, not the npm package, so the
 * `overrides` entry in package.json alone never reached the bundle (0.6.1).
 * This sends the import to the installed `dompurify` — the same default export
 * (the DOMPurify instance) — so security fixes come from npm.
 * .github/scripts/check-dompurify.mjs checks the built bundle in CI.
 */
function monacoDompurify(): Plugin {
	return {
		name: "cbs-monaco-dompurify",
		enforce: "pre",
		async resolveId(source, importer, options) {
			if (
				!importer ||
				!/[\\/]monaco-editor[\\/]esm[\\/]vs[\\/]base[\\/]browser[\\/]/.test(importer)
			)
				return null;
			if (!/(^|[\\/])dompurify[\\/]dompurify\.js$/.test(source)) return null;
			// Resolved from Monaco's folder: its own (overridden) dompurify dependency.
			return this.resolve("dompurify", importer, { ...options, skipSelf: true });
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
		monacoDompurify(),
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
		// These are the modules monacoSetup imports (#118), pre-bundled together so
		// they share one Monaco instance.
		include: [
			"monaco-editor/editor/editor.api",
			"monaco-editor/features/register.all",
			"monaco-editor/languages/definitions/xml/register",
			"monaco-editor/languages/definitions/javascript/register",
			"monaco-editor/languages/features/typescript/register",
		],
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
				// By package path (Vite's module ids use "/"). With the object form,
				// Monaco's chunk also took Vite's preload helper, which Monaco's language
				// loaders use, so the entry imported the whole editor at startup (#118).
				// The helper gets a chunk of its own; Monaco loads with the first editor.
				manualChunks(id) {
					if (id.includes("vite/preload-helper")) return "preload-helper";
					const pkg = /\/node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id)?.[1];
					if (!pkg) return undefined;
					if (pkg === "monaco-editor" || pkg.startsWith("@monaco-editor/"))
						return "monaco";
					// One chunk: the icons and the components import each other
					if (/^(@fluentui|@griffel)\/|^(tabster|keyborg)$|^@floating-ui\//.test(pkg))
						return "fluent-ui";
					if (pkg.startsWith("@dnd-kit/")) return "dnd";
					return undefined;
				},
			},
		},
	},
}));
