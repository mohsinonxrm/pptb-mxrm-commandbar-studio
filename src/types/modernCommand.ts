/**
 * Read-only view model for modern commands (#32).
 *
 * Modern commands are built with the command designer and stored as
 * `appaction` rows (plus `appactionrule` rows for migrated classic rules).
 * CBS only ever READS them: they are shown on the canvas so it matches what
 * Unified Interface renders, but they never enter the ribbon store, the
 * baseline, the publish planner or the RibbonDiffXml merge.
 *
 * Schema: https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/appaction
 */

/** `appaction.location` (global choice `appaction_location`). */
export const APP_ACTION_LOCATION = {
	Form: 0,
	MainGrid: 1,
	SubGrid: 2,
	AssociatedGrid: 3,
	QuickForm: 4,
	GlobalHeader: 5,
	Dashboard: 6,
} as const;

export const APP_ACTION_LOCATION_LABELS: Record<number, string> = {
	0: "Form",
	1: "Main grid",
	2: "Subgrid",
	3: "Associated grid",
	4: "Quick form",
	5: "Global header",
	6: "Dashboard",
};

/** `appaction.type` (global choice `appaction_type`). */
export type ModernCommandType = "button" | "dropdown" | "split" | "group";

/** `appaction.onclickeventtype`: 0 None, 1 Formula, 2 JavaScript. */
export type ModernActionKind = "none" | "formula" | "javascript";

/** `appaction.visibilitytype`: 0 None, 1 Formula, 2 Classic Rules. */
export type ModernVisibilityKind = "none" | "formula" | "classicRules";

/** `appaction.origin`: 0 Default, 1 Migrated, 2 Enhanced Migrated. */
export type ModernCommandOrigin = "default" | "migrated" | "enhancedMigrated";

/** A Power Fx function reference: the formula text lives in the command component library (a canvasapp), not on the appaction row. */
export interface ModernFormulaRef {
	componentLibrary?: string;
	componentName?: string;
	functionName?: string;
}

/** A classic rule attached to a migrated command (`appaction_appactionrule_classicrules`). */
export interface ModernClassicRule {
	id: string;
	name: string;
	uniqueName?: string;
	/** `appactionrule.type`: 0 Enable Rule, 1 Display Rule. */
	kind: "enable" | "display";
}

export interface ModernCommand {
	id: string;
	name: string;
	uniqueName: string;
	label: string;
	tooltipTitle?: string;
	tooltipDescription?: string;
	accessibilityText?: string;
	/** `appmoduleid` — null means the command is shown in every app containing the table. */
	appModuleId: string | null;
	/** Display name of the app (from the formatted value or the app list). */
	appName?: string;
	/** `context`: 0 All (every table) / 1 Entity. */
	scope: "all" | "entity";
	/** `contextvalue` / `contextentity` — the table the command is bound to (when scope is "entity"). */
	contextValue?: string;
	contextEntityId?: string;
	/** `appaction.location` raw option value. */
	location: number;
	type: ModernCommandType;
	/** `sequence`, falling back to the deprecated `buttonsequencepriority`. */
	sequence: number;
	hidden: boolean;
	/** `isdisabled`: the modern command is off and its ribbon (classic) equivalent is shown instead. */
	disabled: boolean;
	origin: ModernCommandOrigin;
	managed: boolean;
	fontIcon?: string;
	iconWebResourceId?: string;
	iconWebResourceName?: string;
	parentId: string | null;
	groupTitle?: string;
	groupTitleHidden: boolean;
	action: ModernActionKind;
	jsFunctionName?: string;
	jsParameters?: string;
	jsWebResourceId?: string;
	jsWebResourceName?: string;
	onSelectFormula?: ModernFormulaRef;
	visibility: ModernVisibilityKind;
	visibilityFormula?: ModernFormulaRef;
	classicRules: ModernClassicRule[];
}

export interface ModernAppModule {
	id: string;
	name: string;
	uniqueName?: string;
}

/** A modern command plus its nested children (dropdown / split / group members), ready to render. */
export interface ModernCommandNode {
	command: ModernCommand;
	children: ModernCommandNode[];
}

/** "all" shows every app's commands (each badged with its app); otherwise one app id. */
export type ModernAppFilter = "all" | string;

/**
 * A classic button that a migrated modern command stands in for: when the
 * modern command is active, Unified Interface renders it instead of the
 * classic button; when it is hidden, the button disappears in that app.
 */
export interface ClassicModernOverride {
	buttonId: string;
	command: ModernCommand;
	effect: "hidden" | "replaced";
	/** Commands nested under the migrated command (they show in the classic control's menu, not as chips). */
	items?: ModernCommand[];
}
