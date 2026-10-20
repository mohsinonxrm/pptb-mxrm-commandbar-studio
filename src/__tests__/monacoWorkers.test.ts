/**
 * The `?worker` imports in monacoSetup.ts must point at real files of the installed
 * monaco-editor. Its package exports changed in 0.56 (`./*` → `./esm/vs/*.js`) and the old
 * paths broke the build (#98, #117); this catches the next layout change before the build.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// The package doesn't export its package.json, so read it from node_modules.
const monacoRoot = path.resolve(__dirname, "../../node_modules/monaco-editor");
const exportsMap = JSON.parse(readFileSync(path.join(monacoRoot, "package.json"), "utf8"))
	.exports as Record<string, unknown>;
const setup = readFileSync(path.resolve(__dirname, "../utils/monacoSetup.ts"), "utf8");
const specifiers = [...setup.matchAll(/from "monaco-editor\/([^"?]+)\?worker"/g)].map((m) => m[1]);

/** Resolves `monaco-editor/<sub>` through the package's `./*` export, as Vite does. */
function resolveExport(sub: string): string {
	const target = exportsMap["./*"];
	if (typeof target !== "string") throw new Error("monaco-editor has no ./* export");
	return path.join(monacoRoot, target.replace("*", sub));
}

describe("Monaco worker imports (#117)", () => {
	it("imports the editor worker and the JSON, TypeScript, CSS and HTML workers", () => {
		expect(specifiers.map((s) => s.split("/").pop())).toEqual([
			"editor.worker",
			"json.worker",
			"ts.worker",
			"css.worker",
			"html.worker",
		]);
	});

	it.each(specifiers)("monaco-editor/%s resolves to a file", (sub) => {
		expect(existsSync(resolveExport(sub))).toBe(true);
	});
});
