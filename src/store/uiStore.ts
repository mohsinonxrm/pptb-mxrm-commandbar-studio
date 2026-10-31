import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import type { RibbonLocation } from "@/types/ribbon";

export type RibbonViewStyle = "classic" | "modern" | "list";
export type RightPaneMode = "docked" | "floating" | "hidden";
export type ThemeMode = "light" | "dark";

/** Where a control (a top-level button or a menu item) is on the canvas. */
export interface ControlRef {
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	buttonId: string;
}

/**
 * A view of the editor drawer (#186). The drawer never stacks: opening a rule
 * from the command editor adds a view, and Back returns to the command.
 */
export type EditorView =
	| { kind: "command"; id: string }
	| { kind: "rule"; id: string; ruleKind: "enable" | "display" }
	/** A JavaScript action's web resource, `id` its name; `editable` saves it to Dataverse. */
	| { kind: "script"; id: string; editable: boolean }
	/** A tab's display rule, `id` the tab's. */
	| { kind: "tabRules"; id: string; location: RibbonLocation }
	/** The RibbonDiffXml of your changes, opening on location `id`. */
	| { kind: "xml"; id: RibbonLocation }
	/**
	 * A diff of the XML: `id` "compare" is the published baseline against now;
	 * "history" is what the history entry at `historyIndex` changed.
	 */
	| { kind: "diff"; id: "compare" | "history"; historyIndex?: number }
	/** A button's text in every language, `id` the button's. */
	| { kind: "translations"; id: string };

/** The command editor's tabs, in the drawer's header (#186). */
export type CommandEditorTab = "actions" | "enable" | "display" | "usedBy";

/** The editor views and the flags derived from them, which callers read. */
function editorState(editorStack: EditorView[]) {
	const command = editorStack.find((v) => v.kind === "command");
	const top = editorStack[editorStack.length - 1];
	const rule = top?.kind === "rule" ? top : null;
	const translations = editorStack.find((v) => v.kind === "translations");
	const diff = [...editorStack]
		.reverse()
		.find((v): v is Extract<EditorView, { kind: "diff" }> => v.kind === "diff");
	return {
		editorStack,
		commandEditorOpen: !!command,
		commandEditorId: command?.id ?? null,
		ruleEditorOpen: !!rule,
		ruleEditorId: rule?.id ?? null,
		ruleEditorKind: rule?.ruleKind ?? null,
		tabDisplayRulesOpen: editorStack.some((v) => v.kind === "tabRules"),
		xmlDrawerOpen: editorStack.some((v) => v.kind === "xml"),
		diffViewerOpen: !!diff,
		diffViewerMode: diff?.id ?? ("compare" as const),
		localizationEditorOpen: !!translations,
		localizationEditorButtonId: translations?.id ?? null,
	};
}

/** Opens `view`: it replaces a view of the same kind on top, or goes on top of the others. */
function pushView(stack: EditorView[], view: EditorView): EditorView[] {
	const top = stack[stack.length - 1];
	return top?.kind === view.kind ? [...stack.slice(0, -1), view] : [...stack, view];
}

export type LeftPaneTab = "structure" | "solution";

export interface UIStore {
	// Pane dimensions
	leftPaneWidth: number;
	rightPaneWidth: number;
	bottomPanelHeight: number;
	bottomCollapsed: boolean;
	rightPaneMode: RightPaneMode;
	themeMode: ThemeMode;
	/** The left pane's tab: the location's Structure tree, or the solution's elements (#194). */
	leftPaneTab: LeftPaneTab;

	// View
	ribbonViewStyle: RibbonViewStyle;
	activeBottomTab: "commands" | "displayRules" | "enableRules" | "history" | "console";

	// Modal / panel open states
	/** The editor drawer's views, the one shown last (#186). Empty when it's closed. */
	editorStack: EditorView[];
	commandEditorOpen: boolean;
	commandEditorId: string | null;
	ruleEditorOpen: boolean;
	ruleEditorId: string | null;
	ruleEditorKind: "enable" | "display" | null;
	/** The command editor's tab; kept while a rule or script is shown over it. */
	commandEditorTab: CommandEditorTab;
	/** The XML is shown in the editor drawer (#186). */
	xmlDrawerOpen: boolean;
	bulkPublishOpen: boolean;
	iconPickerOpen: boolean;
	localizationEditorOpen: boolean;
	localizationEditorButtonId: string | null;
	newGroupOpen: boolean;
	newButtonGroupId: string | null;
	importXmlOpen: boolean;
	/** XML the import dialog opens with (the XML drawer's, or the clipboard's). */
	importXmlSeed: string;
	/** Why the import dialog opened empty, e.g. the clipboard couldn't be read (#122). */
	importXmlNote: string;
	webResourceBrowserOpen: boolean;
	urlComposerOpen: boolean;
	/** A diff is shown in the editor drawer (#186). */
	diffViewerOpen: boolean;
	diffViewerMode: "history" | "compare";
	/** A tab's display rules are shown in the editor drawer (#186). */
	tabDisplayRulesOpen: boolean;
	commandPaletteOpen: boolean;
	/** The top bar's solution picker is open (also opened from the canvas's empty state, #195). */
	solutionPickerOpen: boolean;
	/** The top bar's table picker is open (also opened from the canvas's empty state, #195). */
	tablePickerOpen: boolean;
	/** Something asked for the Properties pane (e.g. Show orphans): it opens when it's a drawer (#179). */
	propertiesRequested: boolean;
	newTabOpen: boolean;
	/** A control Delete was pressed on that isn't yours: offered a hide instead (#17). */
	hideInsteadOfDelete: ControlRef | null;

	// Setters
	setLeftPaneWidth(w: number): void;
	setRightPaneWidth(w: number): void;
	setBottomPanelHeight(h: number): void;
	setBottomCollapsed(collapsed: boolean): void;
	setRightPaneMode(mode: RightPaneMode): void;
	setThemeMode(mode: ThemeMode): void;
	setRibbonViewStyle(style: RibbonViewStyle): void;
	setActiveBottomTab(tab: UIStore["activeBottomTab"]): void;

	openCommandEditor(commandId: string | null): void;
	closeCommandEditor(): void;
	openRuleEditor(ruleId: string | null, kind: "enable" | "display"): void;
	closeRuleEditor(): void;
	setCommandEditorTab(tab: CommandEditorTab): void;
	/** Shows a JavaScript action's web resource over the command (#186). */
	openScriptView(webResourceName: string, editable: boolean): void;
	/** Back to the editor drawer's previous view (#186). */
	editorBack(): void;
	/** Closes the editor drawer, every view (#186). */
	closeEditor(): void;
	/** Shows the XML of your changes in the editor drawer, on `location` (#186). */
	openXmlDrawer(location: RibbonLocation): void;
	closeXmlDrawer(): void;
	openBulkPublish(): void;
	closeBulkPublish(): void;
	openIconPicker(): void;
	closeIconPicker(): void;
	openLocalizationEditor(buttonId: string): void;
	closeLocalizationEditor(): void;
	openNewGroup(): void;
	closeNewGroup(): void;
	openNewButton(groupId: string): void;
	closeNewButton(): void;
	openImportXml(seed?: string, note?: string): void;
	closeImportXml(): void;
	openWebResourceBrowser(): void;
	closeWebResourceBrowser(): void;
	openUrlComposer(): void;
	closeUrlComposer(): void;
	/** Compare with published, or what history entry `historyIndex` changed (#186). */
	openDiffViewer(mode: "history" | "compare", historyIndex?: number): void;
	closeDiffViewer(): void;
	/** Shows a tab's display rules in the editor drawer (#186). */
	openTabDisplayRules(location: RibbonLocation, tabId: string): void;
	setCommandPaletteOpen(open: boolean): void;
	setSolutionPickerOpen(open: boolean): void;
	setTablePickerOpen(open: boolean): void;
	setLeftPaneTab(tab: LeftPaneTab): void;
	/** Counts groups and controls chosen in the Structure tree: the narrow drawer closes on one (#194). */
	structureChoice: number;
	noteStructureChoice(): void;
	setPropertiesRequested(requested: boolean): void;
	openNewTab(): void;
	closeNewTab(): void;
	openHideInsteadOfDelete(control: ControlRef): void;
	closeHideInsteadOfDelete(): void;

	// ARIA live region
	announcement: string;
	announce(message: string): void;
}

const uiStoreCreator: StateCreator<UIStore, [], [["zustand/persist", Partial<UIStore>]]> = (
	set,
) => ({
	leftPaneWidth: 260,
	leftPaneTab: "structure",
	rightPaneWidth: 340,
	bottomPanelHeight: 220,
	// Collapsed until wanted (#179): the canvas gets the height.
	bottomCollapsed: true,
	rightPaneMode: "docked",
	themeMode: "light",
	ribbonViewStyle: "modern",
	activeBottomTab: "commands",

	editorStack: [],
	commandEditorOpen: false,
	commandEditorId: null,
	ruleEditorOpen: false,
	ruleEditorId: null,
	ruleEditorKind: null,
	commandEditorTab: "actions",
	xmlDrawerOpen: false,
	bulkPublishOpen: false,
	iconPickerOpen: false,
	localizationEditorOpen: false,
	localizationEditorButtonId: null,
	newGroupOpen: false,
	newButtonGroupId: null,
	importXmlOpen: false,
	importXmlSeed: "",
	importXmlNote: "",
	webResourceBrowserOpen: false,
	urlComposerOpen: false,
	diffViewerOpen: false,
	diffViewerMode: "compare",
	tabDisplayRulesOpen: false,
	commandPaletteOpen: false,
	solutionPickerOpen: false,
	tablePickerOpen: false,
	propertiesRequested: false,
	newTabOpen: false,
	hideInsteadOfDelete: null,

	// ARIA live region
	announcement: "",

	setLeftPaneWidth: (w) => set({ leftPaneWidth: w }),
	setRightPaneWidth: (w) => set({ rightPaneWidth: w }),
	setBottomPanelHeight: (h) => set({ bottomPanelHeight: h }),
	setBottomCollapsed: (collapsed) => set({ bottomCollapsed: collapsed }),
	setRightPaneMode: (mode) => set({ rightPaneMode: mode }),
	setThemeMode: (mode) => set({ themeMode: mode }),
	setRibbonViewStyle: (style) => set({ ribbonViewStyle: style }),
	setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

	openCommandEditor: (id) =>
		set((s) => ({
			...editorState(id ? pushView(s.editorStack, { kind: "command", id }) : []),
			// Another command opens on its actions.
			commandEditorTab: id && id === s.commandEditorId ? s.commandEditorTab : "actions",
		})),
	// The command's editor closes with everything shown over it.
	closeCommandEditor: () => set(editorState([])),
	openRuleEditor: (id, kind) =>
		set((s) =>
			editorState(
				id ? pushView(s.editorStack, { kind: "rule", id, ruleKind: kind }) : s.editorStack,
			),
		),
	closeRuleEditor: () =>
		set((s) =>
			editorState(
				s.editorStack[s.editorStack.length - 1]?.kind === "rule"
					? s.editorStack.slice(0, -1)
					: s.editorStack,
			),
		),
	setCommandEditorTab: (tab) => set({ commandEditorTab: tab }),
	openScriptView: (name, editable) =>
		set((s) => editorState(pushView(s.editorStack, { kind: "script", id: name, editable }))),
	editorBack: () => set((s) => editorState(s.editorStack.slice(0, -1))),
	closeEditor: () => set(editorState([])),
	openXmlDrawer: (location) =>
		set((s) => editorState(pushView(s.editorStack, { kind: "xml", id: location }))),
	closeXmlDrawer: () => set((s) => editorState(s.editorStack.filter((v) => v.kind !== "xml"))),
	openBulkPublish: () => set({ bulkPublishOpen: true }),
	closeBulkPublish: () => set({ bulkPublishOpen: false }),
	openIconPicker: () => set({ iconPickerOpen: true }),
	closeIconPicker: () => set({ iconPickerOpen: false }),
	openLocalizationEditor: (buttonId) =>
		set((s) => editorState(pushView(s.editorStack, { kind: "translations", id: buttonId }))),
	closeLocalizationEditor: () =>
		set((s) => editorState(s.editorStack.filter((v) => v.kind !== "translations"))),
	openNewGroup: () => set({ newGroupOpen: true }),
	closeNewGroup: () => set({ newGroupOpen: false }),
	openNewButton: (groupId) => set({ newButtonGroupId: groupId }),
	closeNewButton: () => set({ newButtonGroupId: null }),
	openImportXml: (seed, note) =>
		set({
			importXmlOpen: true,
			importXmlSeed: typeof seed === "string" ? seed : "",
			importXmlNote: typeof note === "string" ? note : "",
		}),
	closeImportXml: () => set({ importXmlOpen: false }),
	openWebResourceBrowser: () => set({ webResourceBrowserOpen: true }),
	closeWebResourceBrowser: () => set({ webResourceBrowserOpen: false }),
	openUrlComposer: () => set({ urlComposerOpen: true }),
	closeUrlComposer: () => set({ urlComposerOpen: false }),
	openDiffViewer: (mode, historyIndex) =>
		set((s) => editorState(pushView(s.editorStack, { kind: "diff", id: mode, historyIndex }))),
	closeDiffViewer: () => set((s) => editorState(s.editorStack.filter((v) => v.kind !== "diff"))),
	openTabDisplayRules: (location, tabId) =>
		set((s) => editorState(pushView(s.editorStack, { kind: "tabRules", id: tabId, location }))),
	setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
	setSolutionPickerOpen: (open) => set({ solutionPickerOpen: open }),
	setTablePickerOpen: (open) => set({ tablePickerOpen: open }),
	setLeftPaneTab: (tab) => set({ leftPaneTab: tab }),
	structureChoice: 0,
	noteStructureChoice: () => set((s) => ({ structureChoice: s.structureChoice + 1 })),
	setPropertiesRequested: (requested) => set({ propertiesRequested: requested }),
	openNewTab: () => set({ newTabOpen: true }),
	closeNewTab: () => set({ newTabOpen: false }),
	openHideInsteadOfDelete: (control) => set({ hideInsteadOfDelete: control }),
	closeHideInsteadOfDelete: () => set({ hideInsteadOfDelete: null }),
	announce: (message: string) => set({ announcement: message }),
});

export const useUIStore = create<UIStore>()(
	persist(uiStoreCreator, {
		name: "cbs:ui",
		partialize: (state) => ({
			leftPaneWidth: state.leftPaneWidth,
			leftPaneTab: state.leftPaneTab,
			rightPaneWidth: state.rightPaneWidth,
			bottomPanelHeight: state.bottomPanelHeight,
			bottomCollapsed: state.bottomCollapsed,
			rightPaneMode: state.rightPaneMode,
			themeMode: state.themeMode,
			ribbonViewStyle: state.ribbonViewStyle,
		}),
	}),
);
