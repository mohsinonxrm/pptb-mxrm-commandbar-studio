/**
 * Monaco loader + worker configuration.
 *
 * @monaco-editor/react defaults to fetching Monaco from the jsDelivr CDN.
 * Inside PPTB's sandboxed iframe that CDN fetch is blocked by CSP, so
 * `useMonaco()` and the Editor/DiffEditor components would never resolve.
 *
 * Calling loader.config({ monaco }) tells the loader to use the locally
 * bundled Monaco instance (imported via "monaco-editor") instead of
 * making any network request.
 *
 * MonacoEnvironment.getWorker routes language workers to Vite's same-origin
 * bundled chunks (imported via the `?worker` suffix). Without this, Monaco's
 * TypeScript/JavaScript validation, JSON parsing, and HTML/CSS analysis throw
 * "You must define MonacoEnvironment.getWorker" in the PPTB devtools whenever
 * a language mode other than plain text is used (xml, javascript, json, etc.).
 *
 * IMPORTANT: this module must be imported before any component that uses
 * @monaco-editor/react (i.e. early in main.tsx, before the React tree is
 * created).
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Language workers — bundled by Vite as separate same-origin chunks via the
// `?worker` suffix. The `editorWorker` covers modes without a dedicated worker
// (xml, plain text, diff views, etc.).
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";

// Route @monaco-editor/react to the locally bundled instance.
loader.config({ monaco });

// Route each language mode to its bundled worker chunk.
// Without this, Monaco logs "You must define MonacoEnvironment.getWorker"
// and language features (validation, hover, completion) silently degrade.
self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string) {
		if (label === "json") return new jsonWorker();
		if (label === "typescript" || label === "javascript") return new tsWorker();
		if (label === "css" || label === "scss" || label === "less") return new cssWorker();
		if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
		// xml, plaintext, diff, and any unknown label fall through to the base editor worker.
		return new editorWorker();
	},
};
