import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";

export type RibbonViewStyle = "classic" | "modern" | "list";
export type RightPaneMode = "docked" | "floating" | "hidden";
export type ThemeMode = "light" | "dark";

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
	conflictDrawerOpen: boolean;
	conflictElementId: string | null;
	webResourceBrowserOpen: boolean;
	urlComposerOpen: boolean;
	diffViewerOpen: boolean;
	diffViewerMode: "history" | "compare";
	tabDisplayRulesOpen: boolean;
	scalingEditorOpen: boolean;
	commandPaletteOpen: boolean;
	newTabOpen: boolean;

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
	openImportXml(): void;
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
	openNewTab(): void;
	closeNewTab(): void;

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
	bottomCollapsed: false,
	rightPaneMode: "docked",
	themeMode: "light",
	ribbonViewStyle: "modern",
	activeBottomTab: "commands",

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
	conflictDrawerOpen: false,
	conflictElementId: null,
	webResourceBrowserOpen: false,
	urlComposerOpen: false,
	diffViewerOpen: false,
	diffViewerMode: "compare",
	tabDisplayRulesOpen: false,
	scalingEditorOpen: false,
	commandPaletteOpen: false,
	newTabOpen: false,

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

	openCommandEditor: (id) => set({ commandEditorOpen: true, commandEditorId: id }),
	closeCommandEditor: () => set({ commandEditorOpen: false, commandEditorId: null }),
	openRuleEditor: (id, kind) =>
		set({ ruleEditorOpen: true, ruleEditorId: id, ruleEditorKind: kind }),
	closeRuleEditor: () => set({ ruleEditorOpen: false, ruleEditorId: null, ruleEditorKind: null }),
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
	openImportXml: () => set({ importXmlOpen: true }),
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
	openNewTab: () => set({ newTabOpen: true }),
	closeNewTab: () => set({ newTabOpen: false }),
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
