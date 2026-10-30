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
	{ kind: "command"; id: string } | { kind: "rule"; id: string; ruleKind: "enable" | "display" };

/** The editor views and the flags derived from them, which callers read. */
function editorState(editorStack: EditorView[]) {
	const command = editorStack.find((v) => v.kind === "command");
	const top = editorStack[editorStack.length - 1];
	const rule = top?.kind === "rule" ? top : null;
	return {
		editorStack,
		commandEditorOpen: !!command,
		commandEditorId: command?.id ?? null,
		ruleEditorOpen: !!rule,
		ruleEditorId: rule?.id ?? null,
		ruleEditorKind: rule?.ruleKind ?? null,
	};
}

/** Opens `view`: it replaces a view of the same kind on top, or goes on top of the others. */
function pushView(stack: EditorView[], view: EditorView): EditorView[] {
	const top = stack[stack.length - 1];
	return top?.kind === view.kind ? [...stack.slice(0, -1), view] : [...stack, view];
}

export interface UIStore {
	// Pane dimensions
	leftPaneWidth: number;
	rightPaneWidth: number;
	bottomPanelHeight: number;
	bottomCollapsed: boolean;
	rightPaneMode: RightPaneMode;
	themeMode: ThemeMode;

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
	conflictDrawerOpen: boolean;
	conflictElementId: string | null;
	webResourceBrowserOpen: boolean;
	urlComposerOpen: boolean;
	diffViewerOpen: boolean;
	diffViewerMode: "history" | "compare";
	tabDisplayRulesOpen: boolean;
	scalingEditorOpen: boolean;
	commandPaletteOpen: boolean;
	/** The top bar's solution picker is open (also opened from the canvas's empty state, #195). */
	solutionPickerOpen: boolean;
	/** The tables are asked for: the left drawer opens when narrow, the table search is focused when wide (#195). */
	tablePickerRequested: boolean;
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
	/** Back to the editor drawer's previous view (#186). */
	editorBack(): void;
	/** Closes the editor drawer, every view (#186). */
	closeEditor(): void;
	openXmlDrawer(): void;
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
	openConflictDrawer(elementId: string): void;
	closeConflictDrawer(): void;
	openWebResourceBrowser(): void;
	closeWebResourceBrowser(): void;
	openUrlComposer(): void;
	closeUrlComposer(): void;
	openDiffViewer(mode: "history" | "compare"): void;
	closeDiffViewer(): void;
	openTabDisplayRules(): void;
	closeTabDisplayRules(): void;
	openScalingEditor(): void;
	closeScalingEditor(): void;
	setCommandPaletteOpen(open: boolean): void;
	setSolutionPickerOpen(open: boolean): void;
	setTablePickerRequested(requested: boolean): void;
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
	conflictDrawerOpen: false,
	conflictElementId: null,
	webResourceBrowserOpen: false,
	urlComposerOpen: false,
	diffViewerOpen: false,
	diffViewerMode: "compare",
	tabDisplayRulesOpen: false,
	scalingEditorOpen: false,
	commandPaletteOpen: false,
	solutionPickerOpen: false,
	tablePickerRequested: false,
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
		set((s) => editorState(id ? pushView(s.editorStack, { kind: "command", id }) : [])),
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
	editorBack: () => set((s) => editorState(s.editorStack.slice(0, -1))),
	closeEditor: () => set(editorState([])),
	openXmlDrawer: () => set({ xmlDrawerOpen: true }),
	closeXmlDrawer: () => set({ xmlDrawerOpen: false }),
	openBulkPublish: () => set({ bulkPublishOpen: true }),
	closeBulkPublish: () => set({ bulkPublishOpen: false }),
	openIconPicker: () => set({ iconPickerOpen: true }),
	closeIconPicker: () => set({ iconPickerOpen: false }),
	openLocalizationEditor: (buttonId) =>
		set({ localizationEditorOpen: true, localizationEditorButtonId: buttonId }),
	closeLocalizationEditor: () =>
		set({ localizationEditorOpen: false, localizationEditorButtonId: null }),
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
	openConflictDrawer: (elementId) =>
		set({ conflictDrawerOpen: true, conflictElementId: elementId }),
	closeConflictDrawer: () => set({ conflictDrawerOpen: false, conflictElementId: null }),
	openWebResourceBrowser: () => set({ webResourceBrowserOpen: true }),
	closeWebResourceBrowser: () => set({ webResourceBrowserOpen: false }),
	openUrlComposer: () => set({ urlComposerOpen: true }),
	closeUrlComposer: () => set({ urlComposerOpen: false }),
	openDiffViewer: (mode) => set({ diffViewerOpen: true, diffViewerMode: mode }),
	closeDiffViewer: () => set({ diffViewerOpen: false }),
	openTabDisplayRules: () => set({ tabDisplayRulesOpen: true }),
	closeTabDisplayRules: () => set({ tabDisplayRulesOpen: false }),
	openScalingEditor: () => set({ scalingEditorOpen: true }),
	closeScalingEditor: () => set({ scalingEditorOpen: false }),
	setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),
	setSolutionPickerOpen: (open) => set({ solutionPickerOpen: open }),
	setTablePickerRequested: (requested) => set({ tablePickerRequested: requested }),
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
			rightPaneWidth: state.rightPaneWidth,
			bottomPanelHeight: state.bottomPanelHeight,
			bottomCollapsed: state.bottomCollapsed,
			rightPaneMode: state.rightPaneMode,
			themeMode: state.themeMode,
			ribbonViewStyle: state.ribbonViewStyle,
		}),
	}),
);
