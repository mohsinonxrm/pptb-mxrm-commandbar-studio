// ============================================================
// Command Bar Studio — Core ribbon domain types
// Source of truth: copilot-instructions.md §4 Domain Model
// ============================================================

export type RibbonLocation =
	| "HomepageGrid" // Mscrm.HomepageGrid.<entity>
	| "SubGrid" // Mscrm.SubGrid.<entity>
	| "Form" // Mscrm.Form.<entity>
	| "Application"; // applicationRibbon.xml — cross-entity

export type RibbonButtonKind =
	| "button"
	| "flyout"
	| "splitButton"
	| "textBox"
	| "comboBox"
	| "checkBox"
	// Shown read-only and written back verbatim (#42, utils/controlKinds.ts).
	| "toggleButton"
	| "label"
	| "dropDown"
	| "mruSplitButton"
	| "spinner"
	| "galleryButton";

/**
 * Where a ribbon element actually comes from, determined from Dataverse solution
 * layers (msdyn_componentlayer), NOT from id-prefix guessing:
 *  - "oob"        — Microsoft platform base ribbon (no solution layer owns it)
 *  - "managed"    — added/owned by a managed solution (first-party app like
 *                   Field Service / Sales, or an ISV). Override-only.
 *  - "unmanaged"  — your unmanaged customization (the Active layer). Editable.
 *
 * The legacy `oob` / `custom` / `managed` booleans are derived from this (see
 * applyButtonOrigin) so existing UI keeps working.
 */
export type RibbonOrigin = "oob" | "managed" | "unmanaged";

export interface RibbonButton {
	id: string;
	label: string;
	tooltipTitle?: string;
	tooltipBody?: string;
	icon?: string;
	image16?: string;
	image32?: string;
	kind: RibbonButtonKind;
	sequence: number;
	templateAlias: string;
	commandId: string;
	hidden: boolean;
	oob: boolean;
	custom: boolean;
	managed: boolean;
	/** Provenance from solution layers; undefined until resolved. */
	origin?: RibbonOrigin;
	/** Owning solution friendly name (for managed/unmanaged buttons). */
	solutionName?: string;
	/** Owning publisher name (for managed buttons — e.g. "Microsoft Dynamics 365"). */
	publisherName?: string;
	/**
	 * The button exactly as loaded from Dataverse: raw label/tooltip tokens
	 * (`$Resources:…`, `$LocLabels:…`), the raw ModernImage value and every
	 * other attribute. Lets the generator write unchanged values back verbatim
	 * instead of re-deriving them from display text (#12). Absent for buttons
	 * created in this session.
	 */
	source?: RibbonButtonSource;
	/**
	 * The `<Menu>` of a FlyoutAnchor / SplitButton (or ComboBox) (#27). Menu
	 * items are RibbonButtons themselves, so a nested FlyoutAnchor carries its
	 * own menu.
	 */
	menu?: RibbonMenu;
}

/** `<Menu Id>`: one or more MenuSections (RibbonCore.xsd MenuType). */
export interface RibbonMenu {
	id: string;
	sections: RibbonMenuSection[];
	/** Every attribute of `<Menu>` as loaded (e.g. MaxWidth). Absent for menus created in this session. */
	attributes?: Record<string, string>;
}

/**
 * `<MenuSection Id Title Sequence DisplayMode><Controls Id>…</Controls></MenuSection>`.
 * New items are added to a section of an existing menu with a CustomAction at
 * `Location="{controlsId}._children"`.
 */
export interface RibbonMenuSection {
	id: string;
	title?: string;
	sequence: number;
	/** `Menu` (text only), `Menu16` or `Menu32`. */
	displayMode?: string;
	/** Id of the section's `<Controls>` element. */
	controlsId: string;
	/** The modelled controls (Button, FlyoutAnchor, SplitButton, CheckBox …). */
	controls: RibbonButton[];
	/**
	 * Every attribute of `<MenuSection>` as loaded (Scrollable, MaxHeight, …),
	 * written back verbatim. Absent for sections created in this session.
	 */
	attributes?: Record<string, string>;
	/**
	 * Children of the section CBS does not model — a `<Gallery>` instead of
	 * `<Controls>`, or controls such as ToggleButton / ColorPicker / Label
	 * (`index` = position among the `<Controls>` children). Kept verbatim so
	 * re-emitting the section never drops them.
	 */
	rawControls?: { index: number; xml: string }[];
	/** The section has a `<Gallery>` (or nothing) instead of `<Controls>`; its raw XML. */
	rawContent?: string;
}

export interface RibbonButtonSource {
	labelToken?: string;
	tooltipTitleToken?: string;
	tooltipBodyToken?: string;
	/** Raw ModernImage attribute (e.g. `New`, `$webresource:x.svg`). */
	modernImage?: string;
	/** Every attribute of the control element, as loaded. */
	attributes: Record<string, string>;
	/**
	 * The whole control element as loaded, for the kinds CBS shows read-only
	 * (ToggleButton, Label, DropDown, … — #42): written back verbatim, so its
	 * children (a DropDown's `<Menu>`, a Spinner's `<Unit>`s) are never lost.
	 */
	xml?: string;
}

export interface RibbonGroup {
	id: string;
	label: string;
	sequence: number;
	template: string;
	/** `Description` as loaded (absent when the element has none); written back when set (#42). */
	description?: string;
	buttons: RibbonButton[];
	/** The `<Group>` as imported from a RibbonDiffXml (#30); absent otherwise. */
	source?: RibbonContainerSource;
}

/**
 * A tab / group element exactly as imported (#30): its raw `Title` token
 * (`$LocLabels:…`, `$Resources:…`, literal) and every attribute, so a publish
 * writes them back instead of re-deriving them from the display text.
 */
export interface RibbonContainerSource {
	titleToken?: string;
	attributes: Record<string, string>;
}

export interface RibbonTab {
	id: string;
	label: string;
	sequence: number;
	commandId?: string;
	/** `Description` as loaded (absent when the element has none); written back when set (#42). */
	description?: string;
	tabDisplayRules: TabDisplayRule[];
	groups: RibbonGroup[];
	/** The `<Tab>` as imported from a RibbonDiffXml (#30); absent otherwise. */
	source?: RibbonContainerSource;
}

export interface RibbonDefinition {
	location: RibbonLocation;
	entityLogicalName: string;
	tabs: RibbonTab[];
	flow?: string[];
	scalingByTab?: Record<string, ScalingDefinition>;
	/** Layout titles of the group templates this ribbon's groups use, as loaded (template id → titles). */
	templateLayouts?: Record<string, string[]>;
}

export interface CommandDefinition {
	id: string;
	enableRules: string[];
	displayRules: string[];
	actions: RibbonAction[];
	/**
	 * Children of `<EnableRules>` / `<DisplayRules>` that are not a reference of
	 * that container's own kind (e.g. Microsoft's Mscrm.SequencesMulti.ViewConnectedSequences
	 * has an `<EnableRule>` inside `<DisplayRules>`). Kept verbatim at their
	 * original position so re-emitting the command doesn't drop them.
	 */
	rawRuleRefs?: { container: "EnableRules" | "DisplayRules"; index: number; xml: string }[];
}

export type RibbonAction =
	| JavaScriptAction
	| UrlAction
	| OutlookCommandAction
	| RawAction
	| PowerFxAction
	| CustomApiAction;

export interface JavaScriptAction {
	kind: "javascript";
	library: string;
	functionName: string;
	/** Unnamed parameters (RibbonTypes.xsd `ParameterType` has no Name attribute). */
	params: ActionParameter[];
}

export interface UrlAction {
	kind: "url";
	address: string;
	/** `PassParams` (xs:boolean). undefined = attribute absent. */
	passParams?: boolean;
	/** `WinMode` 0–2. undefined = attribute absent. */
	winMode?: 0 | 1 | 2;
	/** `WinParams`, e.g. `dialogWidth:640px;dialogHeight:658px`. */
	winParams?: string;
	width?: number;
	height?: number;
	/** Named parameters (RibbonTypes.xsd `NamedParameterType`: Name is required). */
	params: ActionParameter[];
}

/** `<OutlookCommand ActionType Data/>` (RibbonTypes.xsd OutlookCommandType). */
export interface OutlookCommandAction {
	kind: "outlookCommand";
	actionType: string;
	data?: string;
}

/**
 * An action CBS does not model (or could not reproduce exactly), kept as its
 * original XML and re-emitted verbatim so editing the command never loses it.
 */
export interface RawAction {
	kind: "raw";
	tagName: string;
	xml: string;
}

export interface PowerFxAction {
	kind: "powerFx";
	expression: string;
}

export interface CustomApiAction {
	kind: "customApi";
	actionName: string;
	boundParameter?: string;
	inputParameters: { name: string; value: string }[];
	outputParameters: string[];
}

export type ActionParameter =
	| { kind: "CrmParameter"; name?: string; value: CrmParameterValue }
	| { kind: "BoolParameter"; name?: string; value: boolean }
	| { kind: "IntParameter"; name?: string; value: number }
	| { kind: "DecimalParameter"; name?: string; value: number }
	| { kind: "StringParameter"; name?: string; value: string };

export type CrmParameterValue =
	| "PrimaryControl"
	| "PrimaryControlId"
	| "SelectedControl"
	| "CommandProperties"
	| "PrimaryEntityTypeCode"
	| "PrimaryEntityTypeName"
	| "FirstPrimaryItemId"
	| "PrimaryItemIds"
	| "SelectedEntityTypeCode"
	| "SelectedEntityTypeName"
	| "FirstSelectedItemId"
	| "SelectedControlSelectedItemCount"
	| "SelectedControlSelectedItemIds"
	| "SelectedControlSelectedItemReferences"
	| "SelectedControlAllItemCount"
	| "SelectedControlAllItemIds"
	| "SelectedControlAllItemReferences"
	| "SelectedControlUnselectedItemCount"
	| "SelectedControlUnselectedItemIds"
	| "SelectedControlUnselectedItemReferences"
	| "OrgName"
	| "OrgLcid"
	| "UserLcid";

export interface EnableRule {
	id: string;
	steps: RuleStep[];
}

export interface DisplayRule {
	id: string;
	steps: RuleStep[];
}

/**
 * `StandardRuleAttributes` from RibbonTypes.xsd, shared by every rule kind
 * except OrRule: `Default` and `InvertResult` (both optional xs:boolean).
 * `undefined` means the attribute is absent — the parser never invents a value,
 * so an untouched rule is re-emitted exactly as it was loaded (#29, #42).
 */
export interface StandardRuleAttributes {
	default?: boolean;
	invertResult?: boolean;
}

// RuleStep covers every rule kind of RibbonTypes.xsd's EnableRulesGroup and
// DisplayRulesGroup that CBS models; anything else is kept as a RawRule.
// Where each kind may appear (enable / display / both) is in constants/ruleKinds.ts.
export type AttributedRuleStep = StandardRuleAttributes &
	(
	| {
			kind: "CommandClientTypeRule";
			// "Modern"  = Unified Interface (web, tablets and phones): Mscrm.HideOnModern hides there (#152)
			// "Refresh" = the legacy updated web client (pre-Unified Interface)
			// "Legacy"  = Classic ribbon / Outlook list views
			type: "Modern" | "Refresh" | "Legacy";
	  }
	| { kind: "CrmClientTypeRule"; type: "Web" | "Outlook" }
	| { kind: "CrmOfflineAccessStateRule"; state: "Offline" | "Online" }
	| {
			kind: "CrmOutlookClientTypeRule";
			type: "CrmForOutlook" | "CrmForOutlookOfflineAccess";
	  }
	| {
			// display only
			kind: "CrmOutlookClientVersionRule";
			major: number;
			minor?: number;
			build?: number;
			revision?: number;
	  }
	| {
			kind: "CustomRule";
			library: string;
			functionName: string;
			/** Child parameters passed to the function (RibbonTypes.xsd CustomRuleType → ParameterType, unnamed). */
			params?: ActionParameter[];
	  }
	| {
			// display only
			kind: "DeviceTypeRule";
			type: "None" | "Phone" | "Tablet" | "Web" | "Outlook" | "InteractionCentric";
	  }
	| {
			// display only (RibbonTypes.xsd FeatureControlRuleType)
			kind: "FeatureControlRule";
			featureControlBit: string;
			expectedValue: boolean;
	  }
	| {
			// display only — privilegeDepth REQUIRED
			kind: "EntityPrivilegeRule";
			entityName?: string;
			appliesTo?: "PrimaryEntity" | "SelectedEntity";
			privilegeType:
				| "Create"
				| "Read"
				| "Write"
				| "Delete"
				| "Assign"
				| "Share"
				| "Append"
				| "AppendTo";
			privilegeDepth: "None" | "Basic" | "Local" | "Deep" | "Global";
	  }
	| {
			// display only — propertyValue REQUIRED
			kind: "EntityPropertyRule";
			entityName?: string;
			appliesTo?: "PrimaryEntity" | "SelectedEntity";
			propertyName: EntityProperty;
			propertyValue: boolean;
	  }
	| {
			kind: "EntityRule";
			entityName?: string;
			context?: string;
			appliesTo?: "PrimaryEntity" | "SelectedEntity";
	  }
	| { kind: "FormEntityContextRule"; entityName: string }
	| {
			kind: "FormStateRule";
			state: "Create" | "Existing" | "ReadOnly" | "Disabled" | "BulkEdit";
	  }
	| {
			kind: "FormTypeRule";
			type:
				| "Main"
				| "Preview"
				| "AppointmentBook"
				| "Dashboard"
				| "Quick"
				| "QuickCreate"
				| "Card"
				| "MainInteractionCentric";
	  }
	| { kind: "HideForTabletExperienceRule" }
	| {
			kind: "MiscellaneousPrivilegeRule";
			privilegeName: string;
			privilegeDepth?: "None" | "Basic" | "Local" | "Deep" | "Global";
	  }
	| {
			// display only
			kind: "OptionSetRule";
			optionSet: string;
			stateCode: string;
			objectTypeCode: string;
	  }
	| {
			kind: "OrganizationSettingRule";
			setting:
				| "IsSharepointEnabled"
				| "IsSOPIntegrationEnabled"
				| "IsFiscalCalendarDefined"
				| "IsReadFormModeDefined"
				| "IsBPFEntityCustomizationFeatureEnabled";
	  }
	| {
			kind: "OutlookItemTrackingRule";
			trackedInCrm: boolean;
			appliesTo?: "PrimaryEntity";
	  }
	| { kind: "OutlookRenderTypeRule"; type: "Web" | "Outlook" }
	| { kind: "OutlookVersionRule"; version: "2003" | "2007" | "2010" }
	| { kind: "PageRule"; address: string }
	| {
			kind: "RecordPrivilegeRule";
			privilegeType:
				| "Create"
				| "Read"
				| "Write"
				| "Delete"
				| "Assign"
				| "Share"
				| "Append"
				| "AppendTo";
			appliesTo?: "PrimaryEntity";
	  }
	| { kind: "ReferencingAttributeRequiredRule" }
	| {
			// appliesTo REQUIRED = "SelectedEntity"
			kind: "RelationshipTypeRule";
			appliesTo: "SelectedEntity";
			relationshipType?: "OneToMany" | "ManyToMany" | "NoRelationship";
			allowCustomRelationship?: boolean;
			allowSystemRelationship?: boolean;
	  }
	| {
			kind: "SelectionCountRule";
			minimum?: number;
			maximum?: number;
			appliesTo?: "PrimaryEntity" | "SelectedEntity";
	  }
	| { kind: "SkuRule"; sku: "OnPremise" | "Online" | "Spla" }
	| {
			kind: "ValueRule";
			field: string;
			value: string;
	  }
	);

/**
 * `<OrRule>`: two or more `<Or>` children (RibbonTypes.xsd OrEnableRuleType /
 * OrDisplayRuleType, minOccurs=2). Each `<Or>` holds one or more rules that
 * are ANDed together; the OrRule is true when any group is true. An `<Or>`
 * cannot contain another OrRule. OrRule itself has no Default/InvertResult.
 */
export interface OrRuleStep {
	kind: "OrRule";
	/** One entry per `<Or>` element; the steps inside a group are ANDed. */
	groups: RuleStep[][];
}

/**
 * A rule element CBS does not model — e.g. the `HideIf*Rule` family,
 * `IsExportToExcelOnlineEnabledRule`, `ContextTypeRule` (seen in
 * RetrieveEntityRibbon output but absent from the published XSD) — or one the
 * model could not reproduce exactly. Kept as the original XML and re-emitted
 * verbatim, so editing a rule never drops parts of it (#42).
 */
export interface RawRuleStep {
	kind: "RawRule";
	tagName: string;
	xml: string;
}

export type RuleStep = AttributedRuleStep | OrRuleStep | RawRuleStep;

export type EntityProperty =
	| "DuplicateDetectionEnabled"
	| "GridFiltersEnabled"
	| "HasStateCode"
	| "IsConnectionsEnabled"
	| "MailMergeEnabled"
	| "WorksWithQueue"
	| "HasActivities"
	| "IsActivity"
	| "HasNotes"
	| "IsCustomizable"
	| "IsActivityParty"
	| "HasEmailAddresses"
	| "IsChildEntity"
	| "IsImportable"
	| "IsEnabledForCharts"
	| "IsBusinessProcessEnabled"
	| "HasFeedback"
	| "IsBPFEntity";

export interface TabDisplayRule {
	tabCommand: string;
	rules: TabDisplayRuleStep[];
}

export type TabDisplayRuleStep =
	| {
			kind: "EntityRule";
			entityName?: string;
			appliesTo?: "PrimaryEntity" | "SelectedEntity";
			context?: "Form" | "HomePageGrid" | "SubGridStandard" | "SubGridAssociated";
	  }
	| { kind: "PageRule"; address: string };

export interface LocLabel {
	id: string;
	titles: { languageCode: number; description: string }[];
}

export interface ScalingDefinition {
	tabId: string;
	maxSizes: ScaleStep[];
	scales: ScaleStep[];
}

export interface ScaleStep {
	id: string;
	groupId: string;
	size: string;
	sequence: number;
}

export interface HideCustomAction {
	hideActionId: string;
	location: string;
}

export interface GroupTemplate {
	id: string;
	name: string;
	layouts: GroupTemplateLayout[];
}

export interface GroupTemplateLayout {
	title: string;
	templateAlias: string;
	isOverflow: boolean;
}

export interface ConflictEntry {
	elementId: string;
	elementKind: "button" | "group" | "tab";
	solutions: ConflictSolutionLayer[];
}

export interface ConflictSolutionLayer {
	solutionId: string;
	solutionName: string;
	publisher: string;
	managed: boolean;
	importedOn?: string;
	wins: boolean;
}
