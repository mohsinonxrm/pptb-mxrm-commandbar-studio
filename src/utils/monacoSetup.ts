/**
 * Monaco loader configuration.
 *
 * @monaco-editor/react defaults to fetching Monaco from the jsDelivr CDN.
 * Inside PPTB's sandboxed iframe that CDN fetch is blocked by CSP, so
 * `useMonaco()` and the Editor/DiffEditor components would never resolve.
 *
 * Calling loader.config({ monaco }) tells the loader to use the locally
 * bundled Monaco instance (imported via "monaco-editor") instead of
 * making any network request.
 *
 * IMPORTANT: this module must be imported before any component that uses
 * @monaco-editor/react (i.e. early in main.tsx, before the React tree is
 * created).
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

loader.config({ monaco });
