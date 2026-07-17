import { create } from "zustand";
import type { RibbonLocation } from "@/types/ribbon";

export interface SelectionStore {
	location: RibbonLocation;
	tabId: string;
	selectedButtonId: string | null;
	selectedGroupId: string | null;

	setLocation(location: RibbonLocation): void;
	setTabId(tabId: string): void;
	selectGroup(groupId: string): void;
	selectButton(groupId: string, buttonId: string): void;
	selectButtonInContext(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
	): void;
	clearSelection(): void;
}

export const useSelectionStore = create<SelectionStore>()((set) => ({
	location: "HomepageGrid",
	tabId: "MainTab",
	selectedButtonId: null,
	selectedGroupId: null,

	setLocation(location) {
		set({ location, tabId: "MainTab", selectedButtonId: null, selectedGroupId: null });
	},

	setTabId(tabId) {
		set({ tabId, selectedButtonId: null, selectedGroupId: null });
	},

	selectGroup(groupId) {
		set({ selectedGroupId: groupId, selectedButtonId: null });
	},

	selectButton(groupId, buttonId) {
		set({ selectedGroupId: groupId, selectedButtonId: buttonId });
	},

	selectButtonInContext(location, tabId, groupId, buttonId) {
		set({ location, tabId, selectedGroupId: groupId, selectedButtonId: buttonId });
	},

	clearSelection() {
		set({ selectedButtonId: null, selectedGroupId: null });
	},
}));
