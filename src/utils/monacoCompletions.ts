/**
 * Registers Monaco Editor CompletionItemProviders for CBS-specific XML content.
 *
 * Provides intelligent completions for:
 *  - `$LocLabels:` references → all LocLabel IDs from the ribbon store
 *  - `$webresource:` references → all web resource names from the web resource list
 *  - `Command="` attribute → all CommandDefinition IDs
 *  - `ModernImage="` attribute → common Fluent icon names
 *
 * Call `registerMonacoCompletions(monaco, disposables)` once on editor mount.
 * Call `disposeMonacoCompletions(disposables)` on component unmount to clean up.
 */

import type * as Monaco from "monaco-editor";
import { useRibbonStore } from "@/store/ribbonStore";

/** Top Fluent icon names available as ModernImage values */
const FLUENT_ICON_NAMES: string[] = [
	"Add",
	"AddCircle",
	"Alert",
	"AppFolder",
	"Archive",
	"ArrowClockwise",
	"ArrowCounterclockwise",
	"ArrowDown",
	"ArrowExport",
	"ArrowImport",
	"ArrowLeft",
	"ArrowRight",
	"ArrowSync",
	"ArrowUp",
	"Attach",
	"Beaker",
	"Bookmark",
	"Bug",
	"Building",
	"Calculator",
	"CalendarLtr",
	"CalendarMonth",
	"Call",
	"Camera",
	"Cart",
	"Chart",
	"Checkmark",
	"CheckmarkCircle",
	"Circle",
	"ClipboardTask",
	"Clock",
	"Cloud",
	"Code",
	"CodeBlock",
	"Comment",
	"ContactCard",
	"Copy",
	"CreditCard",
	"Crown",
	"Cube",
	"CursorClick",
	"DataBarVertical",
	"Delete",
	"Diamond",
	"Document",
	"DocumentCopy",
	"DocumentEdit",
	"DocumentText",
	"Download",
	"Edit",
	"Emoji",
	"ErrorCircle",
	"Eye",
	"EyeOff",
	"Filter",
	"Flag",
	"Flow",
	"FolderOpen",
	"Globe",
	"Grid",
	"Group",
	"Heart",
	"Home",
	"Image",
	"Info",
	"Key",
	"Library",
	"Link",
	"List",
	"Location",
	"Lock",
	"Mail",
	"Map",
	"MegaphoneLoud",
	"Money",
	"MoreCircle",
	"MoreHorizontal",
	"Note",
	"NoteEdit",
	"NumberCircle1",
	"Open",
	"Organization",
	"Pause",
	"People",
	"PeopleCommunity",
	"Person",
	"PersonAdd",
	"PersonSearch",
	"Phone",
	"Play",
	"Plug",
	"Print",
	"Question",
	"Refresh",
	"Rename",
	"Save",
	"Search",
	"Send",
	"Settings",
	"Share",
	"Shield",
	"ShoppingBag",
	"Sparkle",
	"Star",
	"StarEmphasis",
	"Stop",
	"Table",
	"Tag",
	"TaskList",
	"TextBulletList",
	"TextDescription",
	"ThumbLike",
	"Timer",
	"ToggleLeft",
	"ToggleRight",
	"Tool",
	"Translate",
	"Umbrella",
	"Unlock",
	"Upload",
	"Video",
	"Warning",
	"Wrench",
];

type Disposable = Monaco.IDisposable;

/**
 * Registers CBS-specific completion providers for the XML language in Monaco.
 * Returns an array of disposables — call `dispose()` on each to clean up.
 */
export function registerMonacoCompletions(
	monaco: typeof Monaco,
	getWebResourceNames: () => string[],
): Disposable[] {
	const disposables: Disposable[] = [];

	// ------------------------------------------------------------------
	// 1. $LocLabels: → LocLabel IDs from ribbon store
	// ------------------------------------------------------------------
	disposables.push(
		monaco.languages.registerCompletionItemProvider("xml", {
			triggerCharacters: [":", "$"],
			provideCompletionItems(model, position) {
				const lineText = model.getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn: 1,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				});

				if (!lineText.includes("$LocLabels:")) return { suggestions: [] };

				const afterColon = lineText.lastIndexOf("$LocLabels:") + "$LocLabels:".length;
				const prefix = lineText.slice(afterColon);
				const range = {
					startLineNumber: position.lineNumber,
					startColumn: position.column - prefix.length,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				};

				const locLabels = useRibbonStore.getState().locLabels;
				const suggestions: Monaco.languages.CompletionItem[] = locLabels.map((l) => ({
					label: l.id,
					kind: monaco.languages.CompletionItemKind.Reference,
					insertText: l.id,
					range,
					detail: "LocLabel reference",
				}));

				return { suggestions };
			},
		}),
	);

	// ------------------------------------------------------------------
	// 2. $webresource: → web resource names
	// ------------------------------------------------------------------
	disposables.push(
		monaco.languages.registerCompletionItemProvider("xml", {
			triggerCharacters: [":", "$"],
			provideCompletionItems(model, position) {
				const lineText = model.getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn: 1,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				});

				if (!lineText.includes("$webresource:")) return { suggestions: [] };

				const afterColon = lineText.lastIndexOf("$webresource:") + "$webresource:".length;
				const prefix = lineText.slice(afterColon);
				const range = {
					startLineNumber: position.lineNumber,
					startColumn: position.column - prefix.length,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				};

				const names = getWebResourceNames();
				const suggestions: Monaco.languages.CompletionItem[] = names.map((name) => ({
					label: name,
					kind: monaco.languages.CompletionItemKind.File,
					insertText: name,
					range,
					detail: "Web resource",
				}));

				return { suggestions };
			},
		}),
	);

	// ------------------------------------------------------------------
	// 3. Command=" → CommandDefinition IDs
	// ------------------------------------------------------------------
	disposables.push(
		monaco.languages.registerCompletionItemProvider("xml", {
			triggerCharacters: ['"'],
			provideCompletionItems(model, position) {
				const lineText = model.getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn: 1,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				});

				if (!/Command\s*=\s*"[^"]*$/.test(lineText)) return { suggestions: [] };

				const match = lineText.match(/Command\s*=\s*"([^"]*)$/);
				const prefix = match?.[1] ?? "";
				const range = {
					startLineNumber: position.lineNumber,
					startColumn: position.column - prefix.length,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				};

				const commands = useRibbonStore.getState().commands;
				const suggestions: Monaco.languages.CompletionItem[] = commands.map((c) => ({
					label: c.id,
					kind: monaco.languages.CompletionItemKind.Function,
					insertText: c.id,
					range,
					detail: "CommandDefinition",
				}));

				return { suggestions };
			},
		}),
	);

	// ------------------------------------------------------------------
	// 4. ModernImage=" → Fluent icon names
	// ------------------------------------------------------------------
	disposables.push(
		monaco.languages.registerCompletionItemProvider("xml", {
			triggerCharacters: ['"'],
			provideCompletionItems(model, position) {
				const lineText = model.getValueInRange({
					startLineNumber: position.lineNumber,
					startColumn: 1,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				});

				if (!/ModernImage\s*=\s*"[^"]*$/.test(lineText)) return { suggestions: [] };

				const match = lineText.match(/ModernImage\s*=\s*"([^"]*)$/);
				const prefix = match?.[1] ?? "";
				const range = {
					startLineNumber: position.lineNumber,
					startColumn: position.column - prefix.length,
					endLineNumber: position.lineNumber,
					endColumn: position.column,
				};

				const suggestions: Monaco.languages.CompletionItem[] = FLUENT_ICON_NAMES.map((name) => ({
					label: name,
					kind: monaco.languages.CompletionItemKind.Color,
					insertText: name,
					range,
					detail: "Fluent icon (ModernImage)",
					documentation: `Renders the ${name}_20_Regular Fluent icon`,
				}));

				return { suggestions };
			},
		}),
	);

	return disposables;
}

/**
 * Disposes all completion item provider registrations created by
 * `registerMonacoCompletions`. Call this in the component's cleanup effect.
 */
export function disposeMonacoCompletions(disposables: Disposable[]): void {
	disposables.forEach((d) => d.dispose());
}
