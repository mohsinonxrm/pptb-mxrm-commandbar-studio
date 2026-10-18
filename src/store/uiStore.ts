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
	/** XML the import dialog opens with (the XML drawer's, or the clipboard's). */
	importXmlSeed: string;
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
	openImportXml(seed?: string): void;
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
	importXmlSeed: "",
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
	openImportXml: (seed) =>
		set({ importXmlOpen: true, importXmlSeed: typeof seed === "string" ? seed : "" }),
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
