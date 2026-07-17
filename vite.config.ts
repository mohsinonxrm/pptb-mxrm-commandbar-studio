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
	build: {
		target: ["chrome108", "firefox115", "safari16"],
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
