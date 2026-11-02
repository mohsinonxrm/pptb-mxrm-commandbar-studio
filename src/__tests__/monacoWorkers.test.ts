/**
 * The `?worker` and other `monaco-editor/…` imports in monacoSetup.ts must point at real
 * files of the installed monaco-editor. Its package exports changed in 0.56 (`./*` → `./esm/vs/*.js`) and the old
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
// The editor API, its features and the languages CBS uses (#118)
const modules = [...setup.matchAll(/(?:from |import )"monaco-editor\/([^"?]+)"/g)].map((m) => m[1]);

/** Resolves `monaco-editor/<sub>` through the package's `./*` export, as Node and Vite do (every `*` in the target is replaced). */
function resolveExport(sub: string): string {
	const target = exportsMap["./*"];
	if (typeof target !== "string") throw new Error("monaco-editor has no ./* export");
	return path.join(monacoRoot, target.replaceAll("*", sub));
}

describe("Monaco worker imports (#117)", () => {
	it("imports only the editor and TypeScript workers (XML and JavaScript, #118)", () => {
		expect(specifiers.map((s) => s.split("/").pop())).toEqual(["editor.worker", "ts.worker"]);
	});

	it("imports the editor API, its features and the XML and JavaScript languages, not the whole package", () => {
		expect(modules).toEqual([
			"editor/editor.api",
			"features/register.all",
			"editor/contrib/dropOrPasteInto/browser/copyPasteContribution",
			"editor/contrib/caretOperations/browser/caretOperations",
			"editor/contrib/gotoError/browser/markerSelectionStatus",
			"editor/contrib/semanticTokens/browser/documentSemanticTokens",
			"languages/definitions/xml/register",
			"languages/definitions/javascript/register",
			"languages/features/typescript/register",
		]);
		expect(setup).not.toMatch(/from "monaco-editor"/);
	});

	it.each([...specifiers, ...modules])("monaco-editor/%s resolves to a file", (sub) => {
		expect(existsSync(resolveExport(sub))).toBe(true);
	});
});
