import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		// jsdom provides DOMParser / XMLSerializer for the ribbon XML tests.
		environment: "jsdom",
		globals: true,
	},
});
