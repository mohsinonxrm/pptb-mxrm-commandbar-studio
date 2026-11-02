/**
 * Monaco loader + worker configuration, loaded with the first editor (#118).
 *
 * @monaco-editor/react defaults to fetching Monaco from the jsDelivr CDN.
 * Inside PPTB's sandboxed iframe that CDN fetch is blocked by CSP, so
 * `useMonaco()` and the Editor/DiffEditor components would never resolve.
 *
 * Calling loader.config({ monaco }) tells the loader to use the locally
 * bundled Monaco instance instead of making any network request.
 *
 * MonacoEnvironment.getWorker routes language workers to Vite's same-origin
 * bundled chunks (imported via the `?worker` suffix). Without this, Monaco
 * throws "You must define MonacoEnvironment.getWorker" in the PPTB devtools.
 *
 * Only what CBS uses is bundled: the editor and its features, XML (ribbon XML,
 * Compare) and JavaScript (script editing, with the TypeScript service for its
 * checks and completions). `import "monaco-editor"` brought every language,
 * the CSS / HTML / JSON services and their workers.
 *
 * IMPORTANT: import this module (see MonacoEditor, CompareView) before
 * @monaco-editor/react renders an editor.
 */
import { loader } from "@monaco-editor/react";
// Since monaco-editor 0.56 the package exports `./*` as `./esm/vs/*.js`, so the
// paths start below `esm/vs`.
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/features/register.all";
import "monaco-editor/languages/definitions/xml/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/features/typescript/register";

// Language workers, bundled by Vite as separate same-origin chunks via the
// `?worker` suffix. The `editorWorker` covers modes without a dedicated worker
// (xml, plain text, diff views).
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import tsWorker from "monaco-editor/languages/features/typescript/ts.worker?worker";

// Route @monaco-editor/react to the locally bundled instance.
loader.config({ monaco });

self.MonacoEnvironment = {
	getWorker(_workerId: string, label: string) {
		if (label === "typescript" || label === "javascript") return new tsWorker();
		// xml, plaintext, diff and any unknown label use the base editor worker.
		return new editorWorker();
	},
};
