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
		// `npm run test:coverage` (CI writes the totals to the run summary, #118). A report,
		// not a gate: no thresholds.
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.test.{ts,tsx}",
				"src/**/*.d.ts",
				"src/__tests__/**",
				"src/__fixtures__/**",
			],
			reporter: ["text-summary", "json-summary"],
		},
	},
});
