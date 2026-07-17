import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react(), visualizer({ open: false, filename: "dist/stats.html" })],
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
});
