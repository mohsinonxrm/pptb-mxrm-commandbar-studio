import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
	RibbonLocation,
	RibbonDefinition,
	RibbonButton,
	RibbonGroup,
	RibbonTab,
	CommandDefinition,
	DisplayRule,
	EnableRule,
	LocLabel,
	GroupTemplate,
	ConflictEntry,
	TabDisplayRule,
	ScalingDefinition,
	RibbonMenuSection,
} from "@/types/ribbon";
import type { LayerSnapshot } from "@/services/dataverse/ribbonLayerService";
import {
	copyControl,
	findGroupControl,
	groupControls,
	isMenuKind,
	menuItemPlace,
	newMenu,
	newMenuSection,
	removeMenuItem,
} from "@/utils/ribbonMenu";

/** A ribbon scope with its own unmanaged layer: the table, or the application ribbon. */
export type LayerScope = "entity" | "application";

/** Platform display rules that are never both true: together they hide a button on every client. */
export const HIDE_DISPLAY_RULES = ["Mscrm.HideOnModern", "Mscrm.ShowOnlyOnModern"] as const;

export interface HistoryEntry {
	ts: string;
	userId: string;
	userName: string;
	op: string;
	target: string;
	detail: string;
	icon: string;
	color: "success" | "warn" | "info" | "danger";
	snapshot: RibbonStoreState;
}

export type RibbonStoreState = {
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	baseline: Record<RibbonLocation, RibbonDefinition>;
	/** Commands / rules as loaded (or last published) — edits are detected against these. */
	baselineCommands: CommandDefinition[];
	baselineEnableRules: EnableRule[];
	baselineDisplayRules: DisplayRule[];
	/** LocLabels as loaded (or last published): translation-only edits are detected against these (#49). */
	baselineLocLabels: LocLabel[];
	/** The unmanaged layers as loaded / last refreshed (null when unreadable). */
	layers: Record<LayerScope, LayerSnapshot | null>;
	/**
	 * Controls hidden by a HideCustomAction of the layer that the user chose to
	 * un-hide (#47). They are not on the canvas: RetrieveEntityRibbon applies hides.
	 */
	pendingUnhides: Record<LayerScope, string[]>;
	/** Organisation base language (#50). */
	baseLanguageCode: number;
	commands: CommandDefinition[];
	displayRules: DisplayRule[];
	enableRules: EnableRule[];
	locLabels: LocLabel[];
	templates: GroupTemplate[];
	conflicts: ConflictEntry[];
	mutationsSincePublish: number;
	past: HistoryEntry[];
	future: HistoryEntry[];
};

export interface RibbonWorkspaceSeed {
	ribbons: Record<RibbonLocation, RibbonDefinition>;
	commands: CommandDefinition[];
	displayRules: DisplayRule[];
	enableRules: EnableRule[];
	locLabels: LocLabel[];
	templates?: GroupTemplate[];
	conflicts?: ConflictEntry[];
	layers?: Partial<Record<LayerScope, LayerSnapshot | null>>;
	baseLanguageCode?: number;
}

type DragSource = { groupId: string; buttonId: string; tabId: string; location: RibbonLocation };
type DragTarget = {
	groupId: string;
	beforeButtonId?: string;
	tabId: string;
	location: RibbonLocation;
};

type NewButtonContext = {
	tabId: string;
	groupId: string;
	location: RibbonLocation;
	button: Omit<RibbonButton, "id"> & { id?: string };
};

type NewMenuItemContext = {
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	/** The flyout / split button (or a nested flyout) whose menu gets the item. */
	parentId: string;
	sectionId?: string;
	item: Pick<RibbonButton, "id" | "label" | "commandId"> & Partial<RibbonButton>;
};

type NewGroupContext = {
	tabId: string;
	location: RibbonLocation;
	group: Omit<RibbonGroup, "id"> & { id?: string };
};

export interface RibbonStore extends RibbonStoreState {
	// History actions
	undo(): void;
	redo(): void;
	restore(index: number): void;

	// Mutations
	moveButton(src: DragSource, dst: DragTarget): void;
	setButtonProp(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
		patch: Partial<RibbonButton>,
	): void;
	deleteButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	/**
	 * Adds an item to the menu of flyout / split button `parentId` (#27) — to
	 * `sectionId`, or the first section (created when the menu has none).
	 */
	addMenuItem(ctx: NewMenuItemContext): void;
	/** Adds a section to the menu of `parentId` (#27). */
	addMenuSection(location: RibbonLocation, tabId: string, groupId: string, parentId: string, title?: string): void;
	setMenuSectionProp(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		parentId: string,
		sectionId: string,
		patch: Partial<Pick<RibbonMenuSection, "title" | "displayMode" | "sequence">>,
	): void;
	/** Removes a menu section together with its items (#27). */
	deleteMenuSection(location: RibbonLocation, tabId: string, groupId: string, parentId: string, sectionId: string): void;
	duplicateButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	createButton(ctx: NewButtonContext): void;
	createGroup(ctx: NewGroupContext): void;
	renameGroup(location: RibbonLocation, tabId: string, groupId: string, newLabel: string): void;
	duplicateGroup(location: RibbonLocation, tabId: string, groupId: string): void;
	setGroupTemplate(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		template: string,
	): void;
	deleteGroup(location: RibbonLocation, tabId: string, groupId: string): void;
	createTab(location: RibbonLocation, tabDef: Partial<RibbonTab>): void;
	renameTab(location: RibbonLocation, tabId: string, newLabel: string): void;
	deleteTab(location: RibbonLocation, tabId: string): void;
	reorderTabs(location: RibbonLocation, tabIds: string[]): void;
	setTabDisplayRules(location: RibbonLocation, tabId: string, rules: TabDisplayRule[]): void;
	setScaling(location: RibbonLocation, tabId: string, scaling: ScalingDefinition): void;
	hideOobButton(location: RibbonLocation, tabId: string, groupId: string, buttonId: string): void;
	customizeOobButton(
		location: RibbonLocation,
		tabId: string,
		groupId: string,
		buttonId: string,
	): void;
	upsertCommand(cmd: CommandDefinition): void;
	/**
	 * Hides a button reversibly: adds the platform display rules
	 * Mscrm.HideOnModern + Mscrm.ShowOnlyOnModern (never both true) to its
	 * command. Every button that uses the command is hidden. Returns false when
	 * the button has no loaded command.
	 */
	hideWithDisplayRules(buttonCommandId: string | undefined): boolean;
	renameCommandId(oldId: string, newId: string): boolean;
	upsertDisplayRule(rule: DisplayRule): void;
	renameDisplayRuleId(oldId: string, newId: string): boolean;
	upsertEnableRule(rule: EnableRule): void;
	renameEnableRuleId(oldId: string, newId: string): boolean;
	upsertLocLabel(label: LocLabel): void;
	/** Marks a control hidden by the layer (#47) to be un-hidden on publish, or keeps it hidden. */
	setLayerHideUnhidden(scope: LayerScope, controlId: string, unhide: boolean): void;
	/** Replaces a scope's layer snapshot (after a publish re-reads it). */
	setLayerSnapshot(scope: LayerScope, snapshot: LayerSnapshot | null): void;
	/**
	 * Marks the given locations as published (their baseline becomes the
	 * current state). Locations that were not published keep their pending
	 * changes. Command / rule baselines advance only when every location was
	 * published.
	 */
	markPublished(locations?: RibbonLocation[]): void;
	setConflicts(entries: ConflictEntry[]): void;

	// Load initial data
	loadRibbons(ribbons: Record<RibbonLocation, RibbonDefinition>): void;
	loadWorkspace(seed: RibbonWorkspaceSeed): void;
}

const MAX_HISTORY = 80;

function cloneRibbons(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
): Record<RibbonLocation, RibbonDefinition> {
	return JSON.parse(JSON.stringify(ribbons));
}

function commitMutation(
	state: RibbonStoreState,
	mutator: (ribbons: Record<RibbonLocation, RibbonDefinition>) => void,
	meta: Omit<HistoryEntry, "snapshot">,
): Partial<RibbonStoreState> {
	const next = cloneRibbons(state.ribbons);
	mutator(next);
	const entry: HistoryEntry = { ...meta, snapshot: { ...state } };
	const past = [...state.past, entry].slice(-MAX_HISTORY);
	return {
		ribbons: next,
		past,
		future: [],
		mutationsSincePublish: state.mutationsSincePublish + 1,
	};
}

const NO_LAYERS: Record<LayerScope, LayerSnapshot | null> = { entity: null, application: null };
const NO_UNHIDES: Record<LayerScope, string[]> = { entity: [], application: [] };
const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

/**
 * A sequence for a button just placed between `prev` and `next` (#26): the
 * canvas orders by position, publish by Sequence, so a move must change it.
 * Keeps the current value when it already fits.
 */
export function sequenceBetween(current: number, prev?: number, next?: number): number {
	const fits = (prev === undefined || current > prev) && (next === undefined || current < next);
	if (fits) return current;
	if (prev !== undefined && next !== undefined) {
		return next - prev > 1 ? Math.floor((prev + next) / 2) : prev + 1;
	}
	if (prev !== undefined) return prev + 10;
	if (next !== undefined) return Math.max(1, next - 10);
	return current;
}

const EMPTY_RIBBONS: Record<RibbonLocation, RibbonDefinition> = {
	HomepageGrid: { location: "HomepageGrid", entityLogicalName: "", tabs: [] },
	SubGrid: { location: "SubGrid", entityLogicalName: "", tabs: [] },
	Form: { location: "Form", entityLogicalName: "", tabs: [] },
	Application: { location: "Application", entityLogicalName: "", tabs: [] },
};

/** A control of a group (top-level button or menu item, #27) in a mutable ribbon copy. */
function controlAt(
	ribbons: Record<RibbonLocation, RibbonDefinition>,
	location: RibbonLocation,
	tabId: string,
	groupId: string,
	id: string,
): { group: RibbonGroup; button: RibbonButton } | undefined {
	const group = ribbons[location].tabs.find((t) => t.id === tabId)?.groups.find((g) => g.id === groupId);
	const button = findGroupControl(group, id);
	return group && button ? { group, button } : undefined;
}

function isReadOnlyGlobalOobButton(
	location: RibbonLocation,
	tabId: string,
	button: RibbonButton,
): boolean {
	return (
		location === "Application" &&
		tabId === "Mscrm.GlobalTab" &&
		button.oob === true &&
		button.custom !== true
	);
}

export const useRibbonStore = create<RibbonStore>()(
	subscribeWithSelector((set, get) => ({
		ribbons: cloneRibbons(EMPTY_RIBBONS),
		baseline: cloneRibbons(EMPTY_RIBBONS),
		baselineCommands: [],
		baselineEnableRules: [],
		baselineDisplayRules: [],
		baselineLocLabels: [],
		layers: { ...NO_LAYERS },
		pendingUnhides: { entity: [], application: [] },
		baseLanguageCode: 1033,
		commands: [],
		displayRules: [],
		enableRules: [],
		locLabels: [],
		templates: [],
		conflicts: [],
		mutationsSincePublish: 0,
		past: [],
		future: [],

		loadRibbons(ribbons) {
			set({
				ribbons: cloneRibbons(ribbons),
				baseline: cloneRibbons(ribbons),
				mutationsSincePublish: 0,
				past: [],
				future: [],
			});
		},

		setConflicts(entries) {
			set({ conflicts: entries });
		},

		loadWorkspace(seed) {
			const ribbons = cloneRibbons(seed.ribbons);
			set({
				ribbons,
				baseline: cloneRibbons(ribbons),
				commands: [...seed.commands],
				displayRules: [...seed.displayRules],
				enableRules: [...seed.enableRules],
				baselineCommands: JSON.parse(JSON.stringify(seed.commands)),
				baselineDisplayRules: JSON.parse(JSON.stringify(seed.displayRules)),
				baselineEnableRules: JSON.parse(JSON.stringify(seed.enableRules)),
				locLabels: [...seed.locLabels],
				baselineLocLabels: JSON.parse(JSON.stringify(seed.locLabels)),
				layers: { ...NO_LAYERS, ...(seed.layers ?? {}) },
				pendingUnhides: { ...NO_UNHIDES },
				baseLanguageCode: seed.baseLanguageCode ?? 1033,
				templates: [...(seed.templates ?? [])],
				conflicts: [...(seed.conflicts ?? [])],
				mutationsSincePublish: 0,
				past: [],
				future: [],
			});
		},

		undo() {
			const { past, future, ribbons } = get();
			if (past.length === 0) return;
			const entry = past[past.length - 1];
			set({
				ribbons: entry.snapshot.ribbons,
				past: past.slice(0, -1),
				future: [{ ...entry, snapshot: { ...get(), ribbons } }, ...future],
				mutationsSincePublish: Math.max(0, get().mutationsSincePublish - 1),
			});
		},

		redo() {
			const { future, ribbons } = get();
			if (future.length === 0) return;
			const [entry, ...rest] = future;
			set({
				ribbons: entry.snapshot.ribbons,
				past: [...get().past, { ...entry, snapshot: { ...get(), ribbons } }],
				future: rest,
				mutationsSincePublish: get().mutationsSincePublish + 1,
			});
		},

		restore(index) {
			const { past } = get();
			if (index < 0 || index >= past.length) return;
			const target = past[index];
			const currentSnapshot: RibbonStoreState = {
				ribbons: cloneRibbons(get().ribbons),
				baseline: cloneRibbons(get().baseline),
				baselineCommands: [...get().baselineCommands],
				baselineEnableRules: [...get().baselineEnableRules],
				baselineDisplayRules: [...get().baselineDisplayRules],
				baselineLocLabels: [...get().baselineLocLabels],
				layers: { ...get().layers },
				pendingUnhides: { ...get().pendingUnhides },
				baseLanguageCode: get().baseLanguageCode,
				commands: [...get().commands],
				displayRules: [...get().displayRules],
				enableRules: [...get().enableRules],
				locLabels: [...get().locLabels],
				templates: [...get().templates],
				conflicts: [...get().conflicts],
				mutationsSincePublish: get().mutationsSincePublish,
				past: [...get().past],
				future: [...get().future],
			};

			set({
				ribbons: cloneRibbons(target.snapshot.ribbons),
				baseline: cloneRibbons(target.snapshot.baseline),
				commands: [...target.snapshot.commands],
				displayRules: [...target.snapshot.displayRules],
				enableRules: [...target.snapshot.enableRules],
				locLabels: [...target.snapshot.locLabels],
				templates: [...target.snapshot.templates],
				conflicts: [...target.snapshot.conflicts],
				mutationsSincePublish: target.snapshot.mutationsSincePublish,
				past: past.slice(0, index + 1),
				future: [
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "restored",
						target: target.target,
						detail: "from history",
						icon: "clock_arrow_counterclockwise",
						color: "info",
						snapshot: currentSnapshot,
					},
					...get().future,
				],
			});
		},

		moveButton(src, dst) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[src.location].tabs.find((t) => t.id === src.tabId);
						if (!tab) return;
						const srcGroup = tab.groups.find((g) => g.id === src.groupId);
						if (!srcGroup) return;
						const btnIdx = srcGroup.buttons.findIndex((b) => b.id === src.buttonId);
						if (btnIdx === -1) return;
						if (isReadOnlyGlobalOobButton(src.location, src.tabId, srcGroup.buttons[btnIdx]))
							return;
						const [button] = srcGroup.buttons.splice(btnIdx, 1);
						const dstTab =
							src.tabId === dst.tabId && src.location === dst.location
								? tab
								: ribbons[dst.location].tabs.find((t) => t.id === dst.tabId);
						if (!dstTab) return;
						const dstGroup = dstTab.groups.find((g) => g.id === dst.groupId);
						if (!dstGroup) return;
						const insertIdx = dst.beforeButtonId
							? dstGroup.buttons.findIndex((b) => b.id === dst.beforeButtonId)
							: dstGroup.buttons.length;
						const at = insertIdx < 0 ? dstGroup.buttons.length : insertIdx;
						dstGroup.buttons.splice(at, 0, button);
						button.sequence = sequenceBetween(
							button.sequence,
							dstGroup.buttons[at - 1]?.sequence,
							dstGroup.buttons[at + 1]?.sequence,
						);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "moved",
						target: src.buttonId,
						detail: `to ${dst.groupId}`,
						icon: "arrow_move",
						color: "info",
					},
				),
			);
		},

		setButtonProp(location, tabId, groupId, buttonId, patch) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const button = controlAt(ribbons, location, tabId, groupId, buttonId)?.button;
						if (!button) return;
						if (isReadOnlyGlobalOobButton(location, tabId, button)) return;
						Object.assign(button, patch);
						// A button turned into a flyout / split button gets an (empty) menu.
						if (isMenuKind(button.kind) && !button.menu) button.menu = newMenu(button.id);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: patch.label ?? buttonId,
						detail: Object.keys(patch).join(", "),
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const found = controlAt(ribbons, location, tabId, groupId, buttonId);
						if (!found) return;
						const { group, button } = found;
						if (isReadOnlyGlobalOobButton(location, tabId, button)) return;
						// A menu item leaves its menu section (#27).
						if (!removeMenuItem(group, buttonId)) group.buttons = group.buttons.filter((b) => b.id !== buttonId);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: buttonId,
						detail: groupId,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		addMenuItem({ location, tabId, groupId, parentId, sectionId, item }) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(ribbons, location, tabId, groupId, parentId)?.button;
						if (!parent || isReadOnlyGlobalOobButton(location, tabId, parent)) return;
						parent.menu = parent.menu ?? newMenu(parent.id);
						if (parent.menu.sections.length === 0) parent.menu.sections.push(newMenuSection(parent.id, []));
						const section = parent.menu.sections.find((s) => s.id === sectionId) ?? parent.menu.sections[0];
						const last = section.controls[section.controls.length - 1]?.sequence ?? 0;
						section.controls.push({
							...item,
							kind: item.kind ?? "button",
							sequence: item.sequence ?? last + 10,
							// Menu items take their size from the section's DisplayMode.
							templateAlias: item.templateAlias ?? "",
							hidden: false,
							oob: false,
							custom: true,
							managed: false,
							origin: "unmanaged",
						});
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: item.label,
						detail: `menu of ${parentId}`,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		addMenuSection(location, tabId, groupId, parentId, title) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(ribbons, location, tabId, groupId, parentId)?.button;
						if (!parent || isReadOnlyGlobalOobButton(location, tabId, parent)) return;
						parent.menu = parent.menu ?? { id: `${parent.id}.Menu`, sections: [] };
						parent.menu.sections.push(newMenuSection(parent.id, parent.menu.sections, title));
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: title ?? "Menu section",
						detail: `menu of ${parentId}`,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		setMenuSectionProp(location, tabId, groupId, parentId, sectionId, patch) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(ribbons, location, tabId, groupId, parentId)?.button;
						const section = parent?.menu?.sections.find((s) => s.id === sectionId);
						if (!parent || !section || isReadOnlyGlobalOobButton(location, tabId, parent)) return;
						Object.assign(section, patch);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: sectionId,
						detail: Object.keys(patch).join(", "),
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteMenuSection(location, tabId, groupId, parentId, sectionId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const parent = controlAt(ribbons, location, tabId, groupId, parentId)?.button;
						if (!parent?.menu || isReadOnlyGlobalOobButton(location, tabId, parent)) return;
						parent.menu.sections = parent.menu.sections.filter((s) => s.id !== sectionId);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: sectionId,
						detail: `menu of ${parentId}`,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		duplicateButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const found = controlAt(ribbons, location, tabId, groupId, buttonId);
						if (found) {
							const { group, button: btn } = found;
							if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
							// The copy is a new control: it must not reuse the original's
							// LocLabel tokens / attributes (#11 review N5), and its menu
							// gets ids of its own (#27).
							const copy: RibbonButton = {
								...copyControl(btn, `${btn.id}_copy_${Date.now()}`),
								label: `${btn.label} (copy)`,
								sequence: btn.sequence + 5,
							};
							const place = menuItemPlace(group, buttonId);
							const list = place ? place.section.controls : group.buttons;
							const idx = list.findIndex((b) => b.id === buttonId);
							list.splice(idx + 1, 0, copy);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "duplicated",
						target: buttonId,
						detail: groupId,
						icon: "copy",
						color: "info",
					},
				),
			);
		},

		createButton({ tabId, groupId, location, button }) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (group) {
							const newBtn: RibbonButton = {
								...button,
								id: button.id ?? `new_${Date.now()}`,
								label: button.label ?? "New Button",
								kind: button.kind ?? "button",
								sequence: button.sequence ?? (group.buttons.length + 1) * 10,
								templateAlias: button.templateAlias ?? "o1",
								commandId: button.commandId ?? "",
								hidden: button.hidden ?? false,
								oob: false,
								custom: true,
								managed: false,
								origin: "unmanaged",
							};
							if (isMenuKind(newBtn.kind) && !newBtn.menu) newBtn.menu = newMenu(newBtn.id);
							group.buttons.push(newBtn);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: button.label ?? "New Button",
						detail: groupId,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		createGroup({ tabId, location, group }) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) {
							const newGroup: RibbonGroup = {
								id: group.id ?? `grp_${Date.now()}`,
								label: group.label ?? "New Group",
								sequence: group.sequence ?? (tab.groups.length + 1) * 10,
								template: group.template ?? "Flexible2",
								buttons: group.buttons ?? [],
							};
							tab.groups.push(newGroup);
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: group.label ?? "New Group",
						detail: tabId,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		renameGroup(location, tabId, groupId, newLabel) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (group) group.label = newLabel;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "renamed",
						target: groupId,
						detail: newLabel,
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		duplicateGroup(location, tabId, groupId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (!tab) return;
						const grp = tab.groups.find((g) => g.id === groupId);
						if (!grp) return;
						const stamp = `_copy_${Date.now()}`;
						const copy: RibbonGroup = {
							...JSON.parse(JSON.stringify(grp)),
							id: `${grp.id}${stamp}`,
							label: `${grp.label} (copy)`,
							sequence: grp.sequence + 5,
							buttons: grp.buttons.map((b) => copyControl(b, `${b.id}${stamp}`)),
						};
						const idx = tab.groups.findIndex((g) => g.id === groupId);
						tab.groups.splice(idx + 1, 0, copy);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "duplicated",
						target: groupId,
						detail: tabId,
						icon: "copy",
						color: "info",
					},
				),
			);
		},

		setGroupTemplate(location, tabId, groupId, template) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						const group = tab?.groups.find((g) => g.id === groupId);
						if (group) group.template = template;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: groupId,
						detail: `template → ${template}`,
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteGroup(location, tabId, groupId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) tab.groups = tab.groups.filter((g) => g.id !== groupId);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: groupId,
						detail: tabId,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		createTab(location, tabDef) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const ribbon = ribbons[location];
						const newTab: RibbonTab = {
							id: tabDef.id ?? `tab_${Date.now()}`,
							label: tabDef.label ?? "New Tab",
							sequence: tabDef.sequence ?? (ribbon.tabs.length + 1) * 10,
							tabDisplayRules: [],
							groups: [],
						};
						ribbon.tabs.push(newTab);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "added",
						target: tabDef.label ?? "New Tab",
						detail: location,
						icon: "add",
						color: "success",
					},
				),
			);
		},

		renameTab(location, tabId, newLabel) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) tab.label = newLabel;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "renamed",
						target: tabId,
						detail: newLabel,
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		deleteTab(location, tabId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						ribbons[location].tabs = ribbons[location].tabs.filter((t) => t.id !== tabId);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "deleted",
						target: tabId,
						detail: location,
						icon: "delete",
						color: "danger",
					},
				),
			);
		},

		reorderTabs(location, tabIds) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tabs = ribbons[location].tabs;
						ribbons[location].tabs = tabIds
							.map((id) => tabs.find((t) => t.id === id))
							.filter((t): t is RibbonTab => t !== undefined);
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "reordered",
						target: "Tabs",
						detail: location,
						icon: "arrow_sort",
						color: "info",
					},
				),
			);
		},

		setTabDisplayRules(location, tabId, rules) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const tab = ribbons[location].tabs.find((t) => t.id === tabId);
						if (tab) tab.tabDisplayRules = rules;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: `${tabId} display rules`,
						detail: `${rules.length} rule(s)`,
						icon: "eye",
						color: "info",
					},
				),
			);
		},

		setScaling(location, tabId, scaling) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const ribbon = ribbons[location];
						ribbon.scalingByTab = ribbon.scalingByTab ?? {};
						ribbon.scalingByTab[tabId] = {
							tabId,
							maxSizes: [...scaling.maxSizes],
							scales: [...scaling.scales],
						};
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "edited",
						target: `${tabId} scaling`,
						detail: `${scaling.maxSizes.length} MaxSize, ${scaling.scales.length} Scale`,
						icon: "resize",
						color: "info",
					},
				),
			);
		},

		hideOobButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const btn = controlAt(ribbons, location, tabId, groupId, buttonId)?.button;
						if (!btn) return;
						if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
						btn.hidden = true;
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "hid",
						target: buttonId,
						detail: groupId,
						icon: "eye_off",
						color: "warn",
					},
				),
			);
		},

		customizeOobButton(location, tabId, groupId, buttonId) {
			set((state) =>
				commitMutation(
					state,
					(ribbons) => {
						const btn = controlAt(ribbons, location, tabId, groupId, buttonId)?.button;
						if (btn) {
							if (isReadOnlyGlobalOobButton(location, tabId, btn)) return;
							// Creating an override makes this an unmanaged customization
							// layered over the OOB/managed original (same id).
							btn.oob = false;
							btn.custom = true;
							btn.managed = false;
							btn.origin = "unmanaged";
						}
					},
					{
						ts: new Date().toISOString(),
						userId: "",
						userName: "You",
						op: "customized",
						target: buttonId,
						detail: "OOB override",
						icon: "edit",
						color: "info",
					},
				),
			);
		},

		hideWithDisplayRules(buttonCommandId) {
			const cmd = buttonCommandId ? get().commands.find((c) => c.id === buttonCommandId) : undefined;
			if (!cmd) return false;
			const displayRules = [...cmd.displayRules];
			for (const id of HIDE_DISPLAY_RULES) if (!displayRules.includes(id)) displayRules.push(id);
			get().upsertCommand({ ...cmd, displayRules });
			return true;
		},

		upsertCommand(cmd) {
			set((state) => {
				const existing = state.commands.findIndex((c) => c.id === cmd.id);
				const commands =
					existing >= 0
						? state.commands.map((c, i) => (i === existing ? cmd : c))
						: [...state.commands, cmd];
				return { commands, mutationsSincePublish: state.mutationsSincePublish + 1 };
			});
		},

		renameCommandId(oldId, newId) {
			const state = get();
			if (!oldId || !newId || oldId === newId) return true;
			if (state.commands.some((c) => c.id === newId)) return false;

			set((current) => {
				const nextRibbons = cloneRibbons(current.ribbons);
				for (const location of Object.keys(nextRibbons) as RibbonLocation[]) {
					for (const tab of nextRibbons[location].tabs) {
						for (const group of tab.groups) {
							for (const button of groupControls(group)) {
								if (button.commandId === oldId) {
									button.commandId = newId;
								}
							}
						}
					}
				}

				const commands = current.commands.map((c) =>
					c.id === oldId
						? {
								...c,
								id: newId,
							}
						: c,
				);

				const entry: HistoryEntry = {
					ts: new Date().toISOString(),
					userId: "",
					userName: "You",
					op: "renamed",
					target: oldId,
					detail: `command -> ${newId}`,
					icon: "edit",
					color: "info",
					snapshot: { ...current },
				};

				return {
					ribbons: nextRibbons,
					commands,
					past: [...current.past, entry].slice(-MAX_HISTORY),
					future: [],
					mutationsSincePublish: current.mutationsSincePublish + 1,
				};
			});

			return true;
		},

		upsertDisplayRule(rule) {
			set((state) => {
				const existing = state.displayRules.findIndex((r) => r.id === rule.id);
				const displayRules =
					existing >= 0
						? state.displayRules.map((r, i) => (i === existing ? rule : r))
						: [...state.displayRules, rule];
				return { displayRules, mutationsSincePublish: state.mutationsSincePublish + 1 };
			});
		},

		renameDisplayRuleId(oldId, newId) {
			const state = get();
			if (!oldId || !newId || oldId === newId) return true;
			if (state.displayRules.some((r) => r.id === newId)) return false;

			set((current) => {
				const displayRules = current.displayRules.map((r) =>
					r.id === oldId
						? {
								...r,
								id: newId,
							}
						: r,
				);
				const commands = current.commands.map((c) => ({
					...c,
					displayRules: c.displayRules.map((id) => (id === oldId ? newId : id)),
				}));

				const entry: HistoryEntry = {
					ts: new Date().toISOString(),
					userId: "",
					userName: "You",
					op: "renamed",
					target: oldId,
					detail: `display rule -> ${newId}`,
					icon: "edit",
					color: "info",
					snapshot: { ...current },
				};

				return {
					displayRules,
					commands,
					past: [...current.past, entry].slice(-MAX_HISTORY),
					future: [],
					mutationsSincePublish: current.mutationsSincePublish + 1,
				};
			});

			return true;
		},

		upsertEnableRule(rule) {
			set((state) => {
				const existing = state.enableRules.findIndex((r) => r.id === rule.id);
				const enableRules =
					existing >= 0
						? state.enableRules.map((r, i) => (i === existing ? rule : r))
						: [...state.enableRules, rule];
				return { enableRules, mutationsSincePublish: state.mutationsSincePublish + 1 };
			});
		},

		renameEnableRuleId(oldId, newId) {
			const state = get();
			if (!oldId || !newId || oldId === newId) return true;
			if (state.enableRules.some((r) => r.id === newId)) return false;

			set((current) => {
				const enableRules = current.enableRules.map((r) =>
					r.id === oldId
						? {
								...r,
								id: newId,
							}
						: r,
				);
				const commands = current.commands.map((c) => ({
					...c,
					enableRules: c.enableRules.map((id) => (id === oldId ? newId : id)),
				}));

				const entry: HistoryEntry = {
					ts: new Date().toISOString(),
					userId: "",
					userName: "You",
					op: "renamed",
					target: oldId,
					detail: `enable rule -> ${newId}`,
					icon: "edit",
					color: "info",
					snapshot: { ...current },
				};

				return {
					enableRules,
					commands,
					past: [...current.past, entry].slice(-MAX_HISTORY),
					future: [],
					mutationsSincePublish: current.mutationsSincePublish + 1,
				};
			});

			return true;
		},

		upsertLocLabel(label) {
			set((state) => {
				const existing = state.locLabels.findIndex((l) => l.id === label.id);
				if (existing >= 0 && JSON.stringify(state.locLabels[existing]) === JSON.stringify(label)) return {};
				const locLabels =
					existing >= 0
						? state.locLabels.map((l, i) => (i === existing ? label : l))
						: [...state.locLabels, label];
				// Translation edits are publishable changes too (#49).
				return { locLabels, mutationsSincePublish: state.mutationsSincePublish + 1 };
			});
		},

		setLayerHideUnhidden(scope, controlId, unhide) {
			set((state) => {
				const ids = state.pendingUnhides[scope].filter((id) => id !== controlId);
				if (unhide) ids.push(controlId);
				return {
					pendingUnhides: { ...state.pendingUnhides, [scope]: ids },
					mutationsSincePublish: state.mutationsSincePublish + 1,
				};
			});
		},

		setLayerSnapshot(scope, snapshot) {
			set((state) => ({ layers: { ...state.layers, [scope]: snapshot } }));
		},

		markPublished(locations) {
			set((state) => {
				const all = Object.keys(state.ribbons) as RibbonLocation[];
				const published = locations ?? all;
				const baseline = cloneRibbons(state.baseline);
				const current = cloneRibbons(state.ribbons);
				for (const loc of published) baseline[loc] = current[loc];
				const everything = all.every((loc) => published.includes(loc));
				// Un-hides of published scopes are done: drop them from the hidden list.
				const layers = { ...state.layers };
				const pendingUnhides = { ...state.pendingUnhides };
				const scopes: [LayerScope, boolean][] = [
					["entity", ENTITY_LOCATIONS.every((l) => published.includes(l))],
					["application", published.includes("Application")],
				];
				for (const [scope, done] of scopes) {
					if (!done || pendingUnhides[scope].length === 0) continue;
					const snap = layers[scope];
					if (snap) {
						layers[scope] = { ...snap, hides: snap.hides.filter((h) => !pendingUnhides[scope].includes(h.location)) };
					}
					pendingUnhides[scope] = [];
				}
				const pending =
					all.some((loc) => JSON.stringify(baseline[loc]) !== JSON.stringify(current[loc])) ||
					pendingUnhides.entity.length + pendingUnhides.application.length > 0;
				return {
					baseline,
					layers,
					pendingUnhides,
					...(everything
						? {
								baselineCommands: JSON.parse(JSON.stringify(state.commands)),
								baselineEnableRules: JSON.parse(JSON.stringify(state.enableRules)),
								baselineDisplayRules: JSON.parse(JSON.stringify(state.displayRules)),
								baselineLocLabels: JSON.parse(JSON.stringify(state.locLabels)),
							}
						: {}),
					mutationsSincePublish: pending ? Math.max(1, state.mutationsSincePublish) : 0,
				};
			});
		},
	})),
);
