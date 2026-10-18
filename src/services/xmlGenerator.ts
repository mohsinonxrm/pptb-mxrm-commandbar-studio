import type {
	RibbonDefinition,
	RibbonLocation,
	CommandDefinition,
	EnableRule,
	DisplayRule,
	LocLabel,
	RibbonButton,
	RuleStep,
	ActionParameter,
	RibbonAction,
	ScalingDefinition,
	ScaleStep,
	RibbonGroup,
	RibbonTab,
	TabDisplayRule,
} from "@/types/ribbon";
import {
	buttonLabelId,
	buttonTooltipTitleId,
	buttonTooltipBodyId,
	locLabelRef,
} from "@/utils/locLabelRef";
import { resolveDisplayLabel } from "@/utils/displayLabel";

interface GeneratorInput {
	current: RibbonDefinition;
	baseline: RibbonDefinition;
	commands: CommandDefinition[];
	enableRules: EnableRule[];
	displayRules: DisplayRule[];
	locLabels: LocLabel[];
	entityLogicalName: string;
	location: RibbonLocation;
	/**
	 * Organisation base language: edited text is written as this language's
	 * title, other languages are kept (#50). Defaults to 1033.
	 */
	languageCode?: number;
}

/**
 * Generates a RibbonDiffXml document from the delta between current and baseline state.
 * Only elements that differ from the baseline are included (delta-only approach).
 */
/**
 * Properties that mark an OOB button as "modified from baseline" and therefore
 * needing an override CustomAction in the RibbonDiffXml. Behavior properties
 * (sequence, hidden, oob, custom, managed, kind) are intentionally NOT in this
 * list — `sequence` is rewritten by the canvas when ordering changes regardless
 * of edit intent, and `hidden` already has its own HideCustomAction path.
 */
const OOB_OVERRIDE_DIFF_FIELDS = [
	"label",
	"icon",
	"image16",
	"image32",
	"tooltipTitle",
	"tooltipBody",
	"commandId",
	"templateAlias",
] as const satisfies readonly (keyof RibbonButton)[];

export function hasOobOverrideChanges(base: RibbonButton, current: RibbonButton): boolean {
	for (const field of OOB_OVERRIDE_DIFF_FIELDS) {
		if ((base[field] ?? "") !== (current[field] ?? "")) return true;
	}
	return false;
}

export interface IndexedButton {
	button: RibbonButton;
	groupId: string;
	tabId: string;
}

/**
 * Indexes every button of a ribbon by `id#n`, where n counts earlier
 * occurrences of the same id. Microsoft's application ribbon reuses control
 * ids across tabs (e.g. MailApp.ViewEmailActivity.Button on the global and
 * quick-create tabs), so pairing current and baseline buttons by id alone
 * compares the wrong occurrences and reports phantom edits.
 */
export function indexButtons(def: RibbonDefinition): Map<string, IndexedButton> {
	const out = new Map<string, IndexedButton>();
	const seen = new Map<string, number>();
	for (const tab of def.tabs)
		for (const group of tab.groups)
			for (const button of group.buttons) {
				const n = seen.get(button.id) ?? 0;
				seen.set(button.id, n + 1);
				out.set(`${button.id}#${n}`, { button, groupId: group.id, tabId: tab.id });
			}
	return out;
}

/**
 * The `Command` of a tab created in CBS. A tab is only shown when a
 * TabDisplayRule names its Command (TabCommand), so a new tab always gets one
 * (#58; https://learn.microsoft.com/power-apps/developer/model-driven-apps/define-ribbon-tab-display-rules).
 */
export function newTabCommandId(tab: RibbonTab): string {
	return tab.commandId || `${tab.id}.Command`;
}

/**
 * Where a new tab is added. An entity has no tab collection of its own: grid
 * and form tabs go into the application's `Mscrm.Tabs`, and the TabDisplayRule
 * decides where they show. The sub-grid ribbon is a contextual group of the
 * entity ribbon, so its tabs go there (Microsoft's "Add a custom tab to a
 * specific entity" walkthrough).
 */
export function newTabLocation(location: RibbonLocation, entityLogicalName: string): string {
	return location === "SubGrid" ? `Mscrm.SubGrid.${entityLogicalName}.ContextualTabs._children` : "Mscrm.Tabs._children";
}

/**
 * The TabDisplayRule a new entity tab gets when the user didn't define one:
 * an EntityRule for the table in the tab's location. Without a rule the tab is
 * never shown and RetrieveEntityRibbon doesn't return it (#58). The application
 * ribbon has no default (a tab there needs a PageRule or EntityRule the user
 * chooses).
 */
export function defaultTabDisplayRules(
	location: RibbonLocation,
	entityLogicalName: string,
	tabCommand: string,
): TabDisplayRule[] {
	switch (location) {
		case "HomepageGrid":
			return [
				{
					tabCommand,
					rules: [{ kind: "EntityRule", entityName: entityLogicalName, context: "HomePageGrid", appliesTo: "PrimaryEntity" }],
				},
			];
		case "Form":
			return [
				{
					tabCommand,
					rules: [{ kind: "EntityRule", entityName: entityLogicalName, context: "Form", appliesTo: "PrimaryEntity" }],
				},
			];
		case "SubGrid":
			return [
				{
					tabCommand,
					rules: [
						{ kind: "EntityRule", entityName: entityLogicalName, context: "SubGridStandard" },
						{ kind: "EntityRule", entityName: entityLogicalName, context: "SubGridAssociated" },
					],
				},
			];
		default:
			return [];
	}
}

/**
 * A tab created this session as it is written: with a Command, and with the
 * default display rule when it has none. Rules with no TabCommand are bound to
 * the tab's Command.
 */
export function effectiveNewTab(tab: RibbonTab, location: RibbonLocation, entityLogicalName: string): RibbonTab {
	const commandId = newTabCommandId(tab);
	const rules = (tab.tabDisplayRules ?? []).map((r) => ({ ...r, tabCommand: r.tabCommand || commandId }));
	return {
		...tab,
		commandId,
		tabDisplayRules: rules.length > 0 ? rules : defaultTabDisplayRules(location, entityLogicalName, commandId),
	};
}

export function generateRibbonDiffXml(input: GeneratorInput): string {
	const { current, baseline, commands, enableRules, displayRules, locLabels } = input;
	const lang = input.languageCode ?? 1033;
	const isApplication = input.location === "Application";

	const baselineButtons = indexButtons(baseline);
	const baselineTabIds = new Set<string>();
	const baselineGroupIds = new Set<string>();

	for (const baseTab of baseline.tabs) {
		baselineTabIds.add(baseTab.id);
		for (const baseGroup of baseTab.groups) baselineGroupIds.add(baseGroup.id);
	}
	// Pairs each current button with the same occurrence in the baseline.
	const seenIds = new Map<string, number>();
	const baselineOf = new Map<RibbonButton, RibbonButton | undefined>();
	for (const tab of current.tabs)
		for (const group of tab.groups)
			for (const button of group.buttons) {
				const n = seenIds.get(button.id) ?? 0;
				seenIds.set(button.id, n + 1);
				baselineOf.set(button, baselineButtons.get(`${button.id}#${n}`)?.button);
			}

	// Tabs created this session, as written (Command + display rules).
	const newTabs = current.tabs
		.filter((t) => !baselineTabIds.has(t.id))
		.map((t) => effectiveNewTab(t, input.location, input.entityLogicalName));

	const tabCustomActions: string[] = [];
	const groupCustomActions: string[] = [];
	const customActions: string[] = [];
	const hideCustomActions: string[] = [];

	// LocLabels are emitted per-customization (like Ribbon Workbench) so a
	// `$LocLabels:` reference is NEVER produced without its backing <LocLabel>.
	// `sink` accumulates; we dedupe by Id at the end.
	const collectedLocLabels: LocLabel[] = [];
	const sink = (label: LocLabel) => collectedLocLabels.push(label);

	// The set of buttons that actually produced a CustomAction. Dependency
	// collection (commands / rules / loc-labels) is scoped to THESE only —
	// never the untouched ribbon. Emission is CHANGE-BASED (new / modified /
	// hidden vs. the loaded baseline), NOT provenance-based: ribbon import is
	// additive/merge-by-id, so an unchanged button (OOB, managed first-party,
	// ISV, or your own already-live one) never needs re-emitting and must not be
	// — that's what keeps a publish from ever corrupting components CBS doesn't
	// own. (Provenance — OOB/managed/unmanaged — is a UI concern only; see
	// ribbonLayerService. The generator deliberately ignores button.custom.)
	const emittedButtons: RibbonButton[] = [];

	// Controls written INSIDE a new tab / group (#58, #59). Dataverse files each
	// CustomAction under a tab; a separate `{newGroupId}.Controls._children`
	// CustomAction is filed under the concrete entity tab while the group it
	// targets is filed under the `{!EntityLogicalName}` template tab, so the
	// button never reached the ribbon. Microsoft's samples write a new group's
	// or tab's controls inline. Only buttons created this
	// session are inlined: an existing button moved into the new group keeps its
	// own CustomAction (the merge relocates it and folds it in).
	const inlineControls = (group: RibbonGroup): string[] => {
		const out: string[] = [];
		for (const button of group.buttons) {
			if (button.hidden || baselineOf.get(button)) continue;
			out.push(generateButtonElement(button, locLabels, sink, lang));
			emittedButtons.push(button);
		}
		return out;
	};
	const inNewContainer = new Set<RibbonButton>();

	// 1. New tabs (not present in the baseline) — the whole tab with its groups
	//    and their controls in one CustomAction.
	for (const tab of newTabs) {
		const inline = new Map(tab.groups.map((g) => [g.id, inlineControls(g)] as const));
		for (const g of tab.groups) for (const b of g.buttons) if (!b.hidden && !baselineOf.get(b)) inNewContainer.add(b);
		tabCustomActions.push(
			generateTabCustomAction(
				tab,
				current.scalingByTab?.[tab.id],
				newTabLocation(input.location, input.entityLogicalName),
				inline,
				sink,
				lang,
			),
		);
	}

	// 2. New groups inside an EXISTING tab → Location="{tabId}.Groups._children"
	//    with their controls inline, plus a MaxSize for the group in the tab's
	//    scaling (classic ribbons need one per group; #40).
	const newGroupMaxSizes: string[] = [];
	for (const tab of current.tabs) {
		if (!baselineTabIds.has(tab.id)) continue;
		const scaling = current.scalingByTab?.[tab.id];
		for (const group of tab.groups) {
			if (!baselineGroupIds.has(group.id)) {
				for (const b of group.buttons) if (!b.hidden && !baselineOf.get(b)) inNewContainer.add(b);
				groupCustomActions.push(generateGroupCustomAction(group, tab.id, inlineControls(group), sink, lang));
				// A MaxSize the user configured is emitted by the scaling diff below.
				const maxSize = defaultMaxSize(group);
				if (maxSize && !scaling?.maxSizes.some((m) => m.groupId === group.id)) {
					newGroupMaxSizes.push(generateScalingCustomAction(tab.id, "MaxSize", maxSize));
				}
			}
		}
	}
	groupCustomActions.push(...newGroupMaxSizes);

	// 3. Buttons.
	for (const tab of current.tabs) {
		for (const group of tab.groups) {
			for (const button of group.buttons) {
				if (inNewContainer.has(button)) continue; // written inside its new tab / group
				const baseButton = baselineOf.get(button);

				if (button.hidden && !baseButton?.hidden) {
					// Visible button the user wants hidden.
					hideCustomActions.push(generateHideCustomAction(button, group.id));
				} else if (!baseButton) {
					// Not in the loaded ribbon → user created it this session →
					// emit as a new control under its group.
					customActions.push(generateCustomAction(button, group.id, locLabels, sink, lang));
					emittedButtons.push(button);
				} else if (hasOobOverrideChanges(baseButton, button)) {
					// Present in the loaded ribbon AND modified (icon / label /
					// tooltip / command etc.) → emit an override CustomAction
					// (Location = the button's id). Works for an existing custom
					// button or an OOB one alike.
					customActions.push(generateOobOverrideCustomAction(button, locLabels, sink, lang));
					emittedButtons.push(button);
				}
				// else: unchanged vs. baseline → no diff emitted (correct; it's
				// already live and additive import leaves it untouched).
			}
		}
	}

	// Collect referenced commands / rules from the EMITTED buttons only.
	const referencedCommandIds = new Set<string>();
	for (const button of emittedButtons) {
		if (button.commandId) referencedCommandIds.add(button.commandId);
	}
	// A new tab's Command is defined with it (an empty command, as in
	// Microsoft's custom-tab walkthrough) unless the model already has one.
	const tabCommands: CommandDefinition[] = [];
	for (const tab of newTabs) {
		const id = tab.commandId!;
		referencedCommandIds.add(id);
		if (!commands.some((c) => c.id === id)) tabCommands.push({ id, enableRules: [], displayRules: [], actions: [] });
	}

	// Emit command/rule DEFINITIONS only for custom (non-system) elements.
	// System `Mscrm.*` / `Microsoft.*` commands already exist in the platform —
	// re-emitting the parser's (often action-less) copy would overwrite and
	// corrupt them. The one deliberate exception is an intentional system-command
	// OVERRIDE (e.g. `Mscrm.OpenRecordItem` with a custom JS action), which must
	// be emitted for Dataverse to pick it up. We distinguish by checking whether
	// the command has at least one action defined: a parsed-but-unmodified OOB
	// command has no actions (the parser only understands JS/URL); a deliberate
	// override always has actions.
	const referencedCommands = [
		...commands.filter((c) => referencedCommandIds.has(c.id) && (!isSystemRibbonId(c.id) || c.actions.length > 0)),
		...tabCommands,
	];

	const referencedEnableRuleIds = new Set<string>();
	const referencedDisplayRuleIds = new Set<string>();
	for (const cmd of referencedCommands) {
		cmd.enableRules.forEach((r) => referencedEnableRuleIds.add(r));
		cmd.displayRules.forEach((r) => referencedDisplayRuleIds.add(r));
	}

	const referencedEnableRules = enableRules.filter(
		(r) => referencedEnableRuleIds.has(r.id) && !isSystemRibbonId(r.id),
	);
	const referencedDisplayRules = displayRules.filter(
		(r) => referencedDisplayRuleIds.has(r.id) && !isSystemRibbonId(r.id),
	);
	const referencedLocLabels = dedupeLocLabels(collectedLocLabels);

	const commandDefsXml = referencedCommands.map(generateCommandDefinition).join("\n    ");
	const enableRulesXml = referencedEnableRules.map(generateEnableRule).join("\n      ");
	const displayRulesXml = referencedDisplayRules.map(generateDisplayRule).join("\n      ");
	const locLabelsXml = referencedLocLabels.map(generateLocLabel).join("\n    ");

	const allCustomActions = [
		...tabCustomActions,
		...groupCustomActions,
		...generateScalingCustomActions(current, baseline, baselineTabIds),
		...customActions,
		...hideCustomActions,
	];

	// Tab display rules only for tabs this session created. Existing tabs' rules
	// already live in the platform / unmanaged layer; re-emitting them copied
	// Microsoft's rules into the customization (#40).
	const tabDisplayRulesXml = newTabs
		.filter((t) => t.tabDisplayRules.length > 0)
		.map((t) => generateTabDisplayRulesForTab(t, isApplication))
		.filter(Boolean)
		.join("\n      ");

	// IMPORTANT — no `<?xml ?>` declaration here.
	//
	// This function returns a RibbonDiffXml *fragment* that is later embedded
	// inside customizations.xml by `buildCustomizationsXml`, which supplies
	// the single outer XML declaration the document is allowed to have.
	// Including a declaration here causes Dataverse to reject the import:
	//   0x8004801a: Unexpected XML declaration. The XML declaration must be
	//   the first node in the document, and no white space characters are
	//   allowed to appear before it.
	//
	// If you need a standalone, viewable XML string (e.g. for the XML drawer
	// or a download button), prepend `<?xml version="1.0" encoding="utf-8"?>\n`
	// at the call site.
	return `<RibbonDiffXml>
  <CustomActions>
    ${allCustomActions.join("\n    ")}
  </CustomActions>
  <Templates><RibbonTemplates Id="Mscrm.Templates"/></Templates>
  <CommandDefinitions>
    ${commandDefsXml}
  </CommandDefinitions>
  <RuleDefinitions>
    <TabDisplayRules>
      ${tabDisplayRulesXml}
    </TabDisplayRules>
    <DisplayRules>
      ${displayRulesXml}
    </DisplayRules>
    <EnableRules>
      ${enableRulesXml}
    </EnableRules>
  </RuleDefinitions>
  <LocLabels>
    ${locLabelsXml}
  </LocLabels>
</RibbonDiffXml>`;
}

/**
 * Returns a structured summary of what changed in this ribbon scope so
 * callers (BulkPublishModal, status indicators) can decide whether there's
 * anything worth publishing at all.
 *
 * Empty summary means the user hasn't touched this scope and importing it
 * would just round-trip an empty RibbonDiffXml through Dataverse — wasteful,
 * and (worse) it surfaces unrelated import errors for scopes the user didn't
 * even modify (the famous Application-ribbon RootComponent issue).
 */
export interface RibbonDiffSummary {
	newButtons: number;
	overriddenButtons: number;
	hiddenButtons: number;
	newTabs: number;
	newGroups: number;
	scalingChanges: number;
	tabDisplayRules: number;
	hasAnyChange: boolean;
}

export function summarizeRibbonDiff(
	current: RibbonDefinition,
	baseline: RibbonDefinition,
): RibbonDiffSummary {
	const baselineButtons = indexButtons(baseline);
	const baselineTabIds = new Set<string>();
	const baselineGroupIds = new Set<string>();

	for (const baseTab of baseline.tabs) {
		baselineTabIds.add(baseTab.id);
		for (const baseGroup of baseTab.groups) baselineGroupIds.add(baseGroup.id);
	}
	// Pairs each current button with the same occurrence in the baseline.
	const seenIds = new Map<string, number>();
	const baselineFor = (button: RibbonButton): RibbonButton | undefined => {
		const n = seenIds.get(button.id) ?? 0;
		seenIds.set(button.id, n + 1);
		return baselineButtons.get(`${button.id}#${n}`)?.button;
	};

	let newButtons = 0;
	let overriddenButtons = 0;
	let hiddenButtons = 0;
	let newTabs = 0;
	let newGroups = 0;
	let tabDisplayRules = 0;

	for (const tab of current.tabs) {
		if (!baselineTabIds.has(tab.id)) newTabs++;
		if (tab.tabDisplayRules && tab.tabDisplayRules.length > 0) {
			tabDisplayRules += tab.tabDisplayRules.length;
		}
		for (const group of tab.groups) {
			if (!baselineGroupIds.has(group.id) && baselineTabIds.has(tab.id)) newGroups++;
			for (const button of group.buttons) {
				const baseButton = baselineFor(button);
				if (button.hidden && !baseButton?.hidden) {
					hiddenButtons++;
				} else if (!baseButton) {
					newButtons++;
				} else if (hasOobOverrideChanges(baseButton, button)) {
					overriddenButtons++;
				}
			}
		}
	}

	// Scaling: count distinct tabs whose scaling differs from baseline.
	const currentScaling = current.scalingByTab ?? {};
	const baselineScaling = baseline.scalingByTab ?? {};
	let scalingChanges = 0;
	for (const [tabId, scaling] of Object.entries(currentScaling)) {
		if (JSON.stringify(scaling) !== JSON.stringify(baselineScaling[tabId])) scalingChanges++;
	}

	const hasAnyChange =
		newButtons + overriddenButtons + hiddenButtons + newTabs + newGroups + scalingChanges > 0;

	return {
		newButtons,
		overriddenButtons,
		hiddenButtons,
		newTabs,
		newGroups,
		scalingChanges,
		tabDisplayRules,
		hasAnyChange,
	};
}

/**
 * Scaling changes for EXISTING tabs. `<Scalings>` is not a RibbonDiffXml
 * element: each new or changed `MaxSize` / `Scale` is its own CustomAction at
 * `Location="{tabId}.Scaling._children"`, and every MaxSize must come before
 * any Scale, because scaling is applied in document order (#40;
 * https://learn.microsoft.com/power-apps/developer/model-driven-apps/define-scaling-ribbon-elements).
 * New tabs carry their whole `<Scaling>` inline (generateTabCustomAction).
 */
function generateScalingCustomActions(
	current: RibbonDefinition,
	baseline: RibbonDefinition,
	baselineTabIds: Set<string>,
): string[] {
	const maxSizes: string[] = [];
	const scales: string[] = [];
	for (const [tabId, scaling] of Object.entries(current.scalingByTab ?? {})) {
		if (!baselineTabIds.has(tabId)) continue;
		const base = baseline.scalingByTab?.[tabId];
		const unchanged = (step: ScaleStep, list: ScaleStep[] | undefined) =>
			list?.some((b) => JSON.stringify(b) === JSON.stringify(step)) ?? false;
		for (const step of scaling.maxSizes) {
			if (!unchanged(step, base?.maxSizes)) maxSizes.push(generateScalingCustomAction(tabId, "MaxSize", step));
		}
		for (const step of scaling.scales) {
			if (!unchanged(step, base?.scales)) scales.push(generateScalingCustomAction(tabId, "Scale", step));
		}
	}
	return [...maxSizes, ...scales];
}

function generateScaleStep(tag: "MaxSize" | "Scale", step: ScaleStep): string {
	return `<${tag} Id="${escapeXml(step.id)}" GroupId="${escapeXml(step.groupId)}" Sequence="${step.sequence}" Size="${escapeXml(step.size)}"/>`;
}

function generateScalingCustomAction(tabId: string, tag: "MaxSize" | "Scale", step: ScaleStep): string {
	return `<CustomAction Id="${escapeXml(step.id)}.CustomAction"
    Location="${escapeXml(tabId)}.Scaling._children"
    Sequence="${step.sequence}">
    <CommandUIDefinition>
      ${generateScaleStep(tag, step)}
    </CommandUIDefinition>
  </CustomAction>`;
}

/**
 * The largest layout of each platform group template — the first `<Layout
 * Title>` of the template in Microsoft's ribbon (RetrieveApplicationRibbon).
 * A MaxSize `Size` must equal one of the template's layout titles
 * (case-sensitive), so groups using any other template get no default MaxSize.
 */
const TEMPLATE_MAX_SIZE: Record<string, string> = {
	"Mscrm.Templates.Flexible": "Large",
	"Mscrm.Templates.Flexible2": "LargeLarge",
	"Mscrm.Templates.Flexible3": "LargeLargeMedium",
	"Mscrm.Templates.Flexible4": "LargeMediumLargeLarge",
	"Mscrm.Templates.3": "Large",
	"Mscrm.Templates.3.3": "LargeLarge",
	"Mscrm.Templates.3.3.3": "LargeLargeMedium",
	"Mscrm.Templates.4.3.3": "LargeMediumLarge",
	"Mscrm.Templates.FourOverflow": "LargeMediumLargeLarge",
	"Mscrm.Templates.FourLargeButtons": "Large",
	"Mscrm.Templates.OneLargeTwoMedium": "Large",
	"Mscrm.Templates.OneLargeThreeMedium": "Large",
	"Mscrm.Templates.TwoLargeTwoMedium": "Large",
	"Mscrm.Templates.TwoLargeThreeMedium": "Large",
	"Mscrm.Templates.ThreeLargeThreeMedium": "Large",
};

/** The MaxSize a new group gets by default, or undefined when its template's layouts aren't known. */
function defaultMaxSize(group: RibbonGroup): ScaleStep | undefined {
	const size = TEMPLATE_MAX_SIZE[normalizeGroupTemplate(group.template)];
	if (!size) return undefined;
	return { id: `${group.id}.MaxSize`, groupId: group.id, size, sequence: group.sequence };
}

// ---------------------------------------------------------------------------
// CustomAction generators
// ---------------------------------------------------------------------------

function generateCustomAction(
	button: RibbonButton,
	groupId: string,
	storeLocLabels: LocLabel[],
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	const location = `${groupId}.Controls._children`;
	return `<CustomAction Id="${escapeXml(button.id)}.CustomAction"
    Location="${escapeXml(location)}"
    Sequence="${button.sequence}">
    <CommandUIDefinition>
      ${generateButtonElement(button, storeLocLabels, sink, lang)}
    </CommandUIDefinition>
  </CustomAction>`;
}

function generateOobOverrideCustomAction(
	button: RibbonButton,
	storeLocLabels: LocLabel[],
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	// Override: Location = existing button ID (MS-documented pattern for
	// "change the definition of an existing item").
	return `<CustomAction Id="${escapeXml(button.id)}.Override.CustomAction"
    Location="${escapeXml(button.id)}"
    Sequence="${button.sequence}">
    <CommandUIDefinition>
      ${generateButtonElement(button, storeLocLabels, sink, lang)}
    </CommandUIDefinition>
  </CustomAction>`;
}

function generateHideCustomAction(button: RibbonButton, _groupId: string): string {
	return `<HideCustomAction HideActionId="${escapeXml(button.id)}.HideAction"
    Location="${escapeXml(button.id)}"/>`;
}

/**
 * Emits a CustomAction that creates a NEW group inside an existing tab.
 * Location pattern per Microsoft docs: `{tabId}.Groups._children`. The
 * controls created with the group are written inside its `<Controls>` (#59).
 */
function generateGroupCustomAction(
	group: RibbonGroup,
	tabId: string,
	controls: string[],
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	const titleId = `${group.id}.Title`;
	sink({ id: titleId, titles: [{ languageCode: lang, description: group.label }] });
	return `<CustomAction Id="${escapeXml(group.id)}.CustomAction"
    Location="${escapeXml(tabId)}.Groups._children"
    Sequence="${group.sequence}">
    <CommandUIDefinition>
      ${generateGroupElement(group, sink, false, controls, lang)}
    </CommandUIDefinition>
  </CustomAction>`;
}

/**
 * Emits a CustomAction that creates a NEW tab (`tab` as returned by
 * effectiveNewTab, so it has a Command). Grid and form tabs are added at
 * `Mscrm.Tabs._children`, sub-grid tabs at the entity's contextual group
 * (newTabLocation). Groups and the controls created with them are written
 * inline (#58).
 */
function generateTabCustomAction(
	tab: RibbonTab,
	scaling: ScalingDefinition | undefined,
	location: string,
	controlsByGroup: Map<string, string[]>,
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	const titleId = `${tab.id}.Title`;
	sink({ id: titleId, titles: [{ languageCode: lang, description: tab.label }] });
	const commandAttr = tab.commandId ? ` Command="${escapeXml(tab.commandId)}"` : "";
	const groupsXml = tab.groups
		.map((g) => generateGroupElement(g, sink, true, controlsByGroup.get(g.id) ?? [], lang))
		.join("\n        ");
	// RibbonCore.xsd TabType: <Scaling Id> comes before <Groups>, with a MaxSize
	// for each group (MaxSize elements before Scale elements) — #40.
	const maxSizes = scaling?.maxSizes.length
		? scaling.maxSizes
		: tab.groups.map(defaultMaxSize).filter((s): s is ScaleStep => !!s);
	const scalingSteps = [
		...maxSizes.map((s) => generateScaleStep("MaxSize", s)),
		...(scaling?.scales ?? []).map((s) => generateScaleStep("Scale", s)),
	];
	const scalingXml =
		scalingSteps.length === 0
			? `<Scaling Id="${escapeXml(tab.id)}.Scaling"/>`
			: `<Scaling Id="${escapeXml(tab.id)}.Scaling">
          ${scalingSteps.join("\n          ")}
        </Scaling>`;
	return `<CustomAction Id="${escapeXml(tab.id)}.CustomAction"
    Location="${escapeXml(location)}"
    Sequence="${tab.sequence}">
    <CommandUIDefinition>
      <Tab Id="${escapeXml(tab.id)}"${commandAttr} Title="${escapeXml(locLabelRef(titleId))}" Sequence="${tab.sequence}">
        ${scalingXml}
        <Groups Id="${escapeXml(tab.id)}.Groups">
        ${groupsXml}
        </Groups>
      </Tab>
    </CommandUIDefinition>
  </CustomAction>`;
}

/**
 * A `<Group>` element with its `<Controls>` (the given control elements, or
 * empty). Used both inside a new-tab CustomAction and (standalone) inside a
 * new-group CustomAction. `nested` = inside a new tab.
 */
function generateGroupElement(
	group: RibbonGroup,
	sink: (label: LocLabel) => void,
	nested: boolean,
	controls: string[] = [],
	lang = 1033,
): string {
	const titleId = `${group.id}.Title`;
	if (nested) {
		// Group title LocLabel is registered by the caller for standalone groups;
		// for nested (new-tab) groups, register it here.
		sink({ id: titleId, titles: [{ languageCode: lang, description: group.label }] });
	}
	const template = normalizeGroupTemplate(group.template);
	const controlsXml =
		controls.length === 0
			? `<Controls Id="${escapeXml(group.id)}.Controls"/>`
			: `<Controls Id="${escapeXml(group.id)}.Controls">
            ${controls.join("\n            ")}
          </Controls>`;
	return `<Group Id="${escapeXml(group.id)}" Title="${escapeXml(locLabelRef(titleId))}" Sequence="${group.sequence}" Template="${escapeXml(template)}">
          ${controlsXml}
        </Group>`;
}

/**
 * Group `Template` must be a fully-qualified template id (e.g.
 * `Mscrm.Templates.Flexible2`). The CBS model often stores just the short name
 * (`Flexible2`), so qualify it when no namespace is present.
 */
function normalizeGroupTemplate(template: string): string {
	const t = template?.trim();
	if (!t) return "Mscrm.Templates.Flexible2";
	return t.includes(".") ? t : `Mscrm.Templates.${t}`;
}

/**
 * Resolves a button text field (label / tooltip) into a ribbon attribute value,
 * registering the backing LocLabel so a `$LocLabels:` reference is never
 * dangling (the #1 documented cause of "import succeeds but button doesn't
 * appear" — the ribbon-metadata compile fails to resolve the missing label).
 *
 *   - `$LocLabels:<id>`  → reference as-is; emit the matching store LocLabel
 *                          (or a placeholder so the reference still resolves).
 *   - `$Resources:<key>` → built-in platform resource; reference as-is, no LocLabel.
 *   - plain text         → synthesize `$LocLabels:<conventionId>` and emit a
 *                          LocLabel whose 1033 title is the text, merged with any
 *                          extra-language titles from the Localization editor.
 */
function resolveLocalizedAttr(
	rawValue: string,
	conventionId: string,
	storeLocLabels: LocLabel[],
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	const value = rawValue ?? "";
	if (value.startsWith("$LocLabels:")) {
		const id = value.slice("$LocLabels:".length);
		const existing = storeLocLabels.find((l) => l.id === id);
		sink(existing ?? { id, titles: [{ languageCode: lang, description: id }] });
		return value;
	}
	if (value.startsWith("$Resources:")) {
		return value;
	}
	const titles = [{ languageCode: lang, description: value }];
	const existing = storeLocLabels.find((l) => l.id === conventionId);
	if (existing) {
		for (const t of existing.titles) {
			if (t.languageCode !== lang) titles.push(t);
		}
	}
	sink({ id: conventionId, titles });
	return locLabelRef(conventionId);
}

const IMAGE_ATTRIBUTES = ["ModernImage", "Image16by16", "Image32by32"];
const DISALLOWED_CONTROL_ATTRIBUTES: Partial<Record<RibbonButton["kind"], string[]>> = {
	textBox: ["LabelText", ...IMAGE_ATTRIBUTES],
	comboBox: ["LabelText", ...IMAGE_ATTRIBUTES],
	checkBox: IMAGE_ATTRIBUTES,
};

/** Attributes RetrieveEntityRibbon adds to controls that are not valid in RibbonDiffXml. */
const NON_DIFF_ATTRIBUTES = new Set(["SolutionUniqueName"]);

/** Same normalisation the parser applies to ModernImage for the canvas preview. */
function normalizeModernImage(name?: string): string | undefined {
	if (!name) return undefined;
	if (name.includes("_")) return name.toLowerCase();
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.toLowerCase();
}

/**
 * A text field (label / tooltip) as a ribbon attribute value. When the button
 * was loaded from Dataverse and the field is unchanged, the ORIGINAL token
 * (`$Resources:…`, `$LocLabels:…`, literal) is written back verbatim (#12).
 * An edited `$LocLabels:` field keeps its LocLabel id (other languages are
 * preserved); anything else gets the convention id.
 */
function resolveButtonText(
	current: string | undefined,
	token: string | undefined,
	conventionId: string,
	storeLocLabels: LocLabel[],
	sink: (label: LocLabel) => void,
	lang = 1033,
): string | undefined {
	if (token !== undefined && (current ?? "") === resolveDisplayLabel(token, storeLocLabels, lang)) {
		if (token.startsWith("$LocLabels:")) {
			const existing = storeLocLabels.find((l) => l.id === token.slice("$LocLabels:".length));
			if (existing) sink(existing);
			// Not loaded → the unmanaged layer's row is kept by the merge.
		}
		return token;
	}
	if (!current) return undefined;
	const locId = token?.startsWith("$LocLabels:") ? token.slice("$LocLabels:".length) : conventionId;
	return resolveLocalizedAttr(current, locId, storeLocLabels, sink, lang);
}

/**
 * The ModernImage value CBS writes for a button. Unchanged → the loaded value
 * (out-of-the-box names like "New"). Otherwise the first `$webresource:` among
 * image32 / image16 / icon — a Fluent icon picked in CBS is uploaded as an SVG
 * web resource (#51); a bare Fluent name is a canvas-preview value only and is
 * never written (it doesn't resolve).
 *
 * "Unchanged" needs both the icon name AND the image fields to match what was
 * loaded: picking the filled variant of an icon whose name equals the loaded
 * ModernImage (e.g. "Add" → `$webresource:…/add.filled.svg`) leaves `icon`
 * as it was but points the images at a new web resource, which must win.
 */
export function effectiveModernImage(button: RibbonButton): string | undefined {
	const src = button.source;
	const isWebResource = (v?: string): v is string => !!v?.startsWith("$webresource:");
	const pickedImages = (
		[
			[button.image32, "Image32by32"],
			[button.image16, "Image16by16"],
		] as const
	)
		.filter(([value, attr]) => isWebResource(value) && value !== src?.attributes[attr])
		.map(([value]) => value);
	if (src && normalizeModernImage(src.modernImage) === button.icon && pickedImages.length === 0) {
		return src.modernImage;
	}
	return pickedImages[0] ?? [button.image32, button.image16, button.icon].find(isWebResource);
}

function generateButtonElement(
	button: RibbonButton,
	storeLocLabels: LocLabel[],
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	const tag = buttonKindToTag(button.kind);
	const src = button.source;
	// Start from the control exactly as loaded so attributes CBS doesn't model
	// (Alt, Description, PopulateDynamically, …) survive an edit.
	const attrs = new Map<string, string>();
	for (const [k, v] of Object.entries(src?.attributes ?? {})) {
		if (!NON_DIFF_ATTRIBUTES.has(k)) attrs.set(k, v);
	}
	const set = (k: string, v: string | undefined) => (v === undefined || v === "" ? attrs.delete(k) : attrs.set(k, v));

	set("Id", button.id);
	set("Command", button.commandId || undefined);
	set(
		"LabelText",
		resolveButtonText(button.label, src?.labelToken, buttonLabelId(button.id), storeLocLabels, sink, lang) ?? "",
	);
	if (!attrs.has("LabelText")) attrs.set("LabelText", "");
	set(
		"ToolTipTitle",
		resolveButtonText(button.tooltipTitle, src?.tooltipTitleToken, buttonTooltipTitleId(button.id), storeLocLabels, sink, lang),
	);
	set(
		"ToolTipDescription",
		resolveButtonText(button.tooltipBody, src?.tooltipBodyToken, buttonTooltipBodyId(button.id), storeLocLabels, sink, lang),
	);
	set("TemplateAlias", button.templateAlias);
	set("Sequence", String(button.sequence));

	// Icons. Unchanged → keep the loaded value (out-of-the-box names like
	// "New", /_imgs/ paths). A bare Fluent icon name chosen in CBS is a
	// canvas-preview value only and must never be emitted (it doesn't resolve).
	const isResourceRef = (v?: string) => !!v && (v.startsWith("$webresource:") || v.includes("/") || v.includes("."));
	set("ModernImage", effectiveModernImage(button));
	set("Image16by16", isResourceRef(button.image16) ? button.image16 : undefined);
	set("Image32by32", isResourceRef(button.image32) ? button.image32 : undefined);

	// RibbonCore.xsd: TextBox / ComboBox have no LabelText or images, CheckBox
	// has no images — emit only what the control type allows (#41).
	for (const name of DISALLOWED_CONTROL_ATTRIBUTES[button.kind] ?? []) attrs.delete(name);

	const attrXml = Array.from(attrs.entries())
		.map(([k, v]) => `${k}="${escapeXml(v)}"`)
		.join(" ");
	return `<${tag} ${attrXml}/>`;
}

/**
 * True for platform-owned ribbon element ids that must never be re-defined by a
 * customization (only referenced). Custom solution elements use a publisher
 * prefix, never `Mscrm.` / `Microsoft.`.
 */
function isSystemRibbonId(id: string): boolean {
	return /^(Mscrm|Microsoft)\./.test(id);
}

function dedupeLocLabels(labels: LocLabel[]): LocLabel[] {
	const byId = new Map<string, LocLabel>();
	for (const label of labels) {
		const prev = byId.get(label.id);
		// Prefer the richest definition (most titles) when the same id is
		// collected more than once (e.g. a placeholder vs. a real store entry).
		if (!prev || label.titles.length > prev.titles.length) byId.set(label.id, label);
	}
	return Array.from(byId.values());
}

function buttonKindToTag(kind: RibbonButton["kind"]): string {
	switch (kind) {
		case "flyout":
			return "FlyoutAnchor";
		case "splitButton":
			return "SplitButton";
		case "textBox":
			return "TextBox";
		case "comboBox":
			return "ComboBox";
		case "checkBox":
			return "CheckBox";
		default:
			return "Button";
	}
}

// ---------------------------------------------------------------------------
// Command definition generators
// ---------------------------------------------------------------------------

/**
 * A bare web resource name (`new_/scripts/x.js`) needs the `$webresource:`
 * directive. The directive is matched case-insensitively: out-of-the-box
 * commands use `$Webresource:Main_system_library.js`, which must be kept as is
 * (prefixing it again produced `$webresource:$Webresource:…`).
 */
export function normalizeLibrary(library: string): string {
	const v = (library ?? "").trim();
	if (!v || /^\$webresource:/i.test(v) || /^https?:\/\//i.test(v) || v.startsWith("/")) return v;
	return `$webresource:${v}`;
}

/** ` Name="value"`, or nothing when the value is undefined. */
function attr(name: string, value: string | number | boolean | undefined): string {
	return value === undefined ? "" : ` ${name}="${escapeXml(String(value))}"`;
}

/** Opening tag + children + closing tag, or a self-closing tag without children. */
function element(tag: string, attrs: string, children: string[], indent: string): string {
	if (children.length === 0) return `<${tag}${attrs}/>`;
	return `<${tag}${attrs}>\n${children.map((c) => `${indent}  ${c}`).join("\n")}\n${indent}</${tag}>`;
}

/**
 * One `<Actions>` child. JavaScriptFunction parameters are unnamed
 * (RibbonTypes.xsd `ParameterType` has no Name); Url parameters are named
 * (`NamedParameterType`, Name required) — #41.
 */
export function generateAction(a: RibbonAction, indent = "        "): string {
	switch (a.kind) {
		case "javascript":
			return element(
				"JavaScriptFunction",
				`${attr("FunctionName", a.functionName)}${attr("Library", normalizeLibrary(a.library))}`,
				a.params.map((p) => generateActionParam(p, false)),
				indent,
			);
		case "url":
			return element(
				"Url",
				`${attr("Address", a.address)}${attr("PassParams", a.passParams)}${attr("WinMode", a.winMode)}${attr("WinParams", a.winParams)}`,
				a.params.map((p) => generateActionParam(p, true)),
				indent,
			);
		case "outlookCommand":
			return `<OutlookCommand${attr("ActionType", a.actionType)}${attr("Data", a.data)}/>`;
		case "raw":
			return a.xml;
		default:
			// Power Fx / Custom API actions have no classic ribbon serialization
			// (#28); the publish plan reports them as unsupported.
			return "";
	}
}

export function generateCommandDefinition(cmd: CommandDefinition): string {
	const i = "      ";
	// Unmodelled children of the reference containers go back where they were.
	const withRaw = (container: "EnableRules" | "DisplayRules", refs: string[]) => {
		const out = [...refs];
		for (const raw of cmd.rawRuleRefs ?? []) {
			if (raw.container === container) out.splice(Math.min(raw.index, out.length), 0, raw.xml);
		}
		return out;
	};
	const enableRulesXml = withRaw(
		"EnableRules",
		cmd.enableRules.map((r) => `<EnableRule Id="${escapeXml(r)}"/>`),
	);
	const displayRulesXml = withRaw(
		"DisplayRules",
		cmd.displayRules.map((r) => `<DisplayRule Id="${escapeXml(r)}"/>`),
	);
	const actionsXml = cmd.actions.map((a) => generateAction(a, `${i}    `)).filter(Boolean);
	// RibbonTypes.xsd CommandDefinitionType: EnableRules, DisplayRules and
	// Actions are all required (minOccurs=1), in this order.
	return `<CommandDefinition Id="${escapeXml(cmd.id)}">
${i}  ${element("EnableRules", "", enableRulesXml, `${i}  `)}
${i}  ${element("DisplayRules", "", displayRulesXml, `${i}  `)}
${i}  ${element("Actions", "", actionsXml, `${i}  `)}
${i}</CommandDefinition>`;
}

/**
 * A parameter of a JavaScriptFunction / CustomRule (`named` = false: the schema
 * has no Name attribute there, so none is written) or of a Url (`named` = true:
 * Name is required and always written — empty when missing, which the validator
 * reports).
 */
export function generateActionParam(param: ActionParameter, named: boolean): string {
	const nameAttr = named ? attr("Name", param.name ?? "") : "";
	switch (param.kind) {
		case "CrmParameter":
			return `<CrmParameter${nameAttr}${attr("Value", param.value)}/>`;
		case "BoolParameter":
			return `<BoolParameter${nameAttr}${attr("Value", param.value)}/>`;
		case "IntParameter":
			return `<IntParameter${nameAttr}${attr("Value", param.value)}/>`;
		case "DecimalParameter":
			return `<DecimalParameter${nameAttr}${attr("Value", param.value)}/>`;
		case "StringParameter":
			return `<StringParameter${nameAttr}${attr("Value", param.value)}/>`;
	}
}

// ---------------------------------------------------------------------------
// Rule generators
// ---------------------------------------------------------------------------

export function generateEnableRule(rule: EnableRule): string {
	return element(
		"EnableRule",
		attr("Id", rule.id),
		rule.steps.map((s) => generateRuleStep(s, "        ")),
		"      ",
	);
}

export function generateDisplayRule(rule: DisplayRule): string {
	return element(
		"DisplayRule",
		attr("Id", rule.id),
		rule.steps.map((s) => generateRuleStep(s, "        ")),
		"      ",
	);
}

/**
 * One rule element. `Default` and `InvertResult` (RibbonTypes.xsd
 * StandardRuleAttributes) are written only when set, so a rule loaded without
 * them is re-emitted without them. A RawRule is written back verbatim.
 */
export function generateRuleStep(step: RuleStep, indent = ""): string {
	if (step.kind === "RawRule") return step.xml;
	if (step.kind === "OrRule") {
		// Each <Or> is one AND-group (RibbonTypes.xsd OrEnableRuleType /
		// OrDisplayRuleType: two or more <Or>, each holding one or more rules).
		const ors = step.groups.map((group) =>
			element(
				"Or",
				"",
				group.map((s) => generateRuleStep(s, `${indent}    `)),
				`${indent}  `,
			),
		);
		return element("OrRule", "", ors, indent);
	}

	const std = `${attr("Default", step.default)}${attr("InvertResult", step.invertResult)}`;
	const tag = (name: string, attrs: string) => `<${name}${attrs}${std}/>`;

	switch (step.kind) {
		case "SelectionCountRule":
			return tag(
				"SelectionCountRule",
				`${attr("AppliesTo", step.appliesTo)}${attr("Minimum", step.minimum)}${attr("Maximum", step.maximum)}`,
			);
		case "EntityRule":
			return tag(
				"EntityRule",
				`${attr("EntityName", step.entityName)}${attr("AppliesTo", step.appliesTo)}${attr("Context", step.context)}`,
			);
		case "FormStateRule":
			return tag("FormStateRule", attr("State", step.state));
		case "CommandClientTypeRule":
			return tag("CommandClientTypeRule", attr("Type", step.type));
		case "CrmClientTypeRule":
			return tag("CrmClientTypeRule", attr("Type", step.type));
		case "CustomRule":
			// Parameters are unnamed, like JavaScriptFunction's (CustomRuleType → ParameterType).
			return element(
				"CustomRule",
				`${attr("FunctionName", step.functionName)}${attr("Library", step.library)}${std}`,
				(step.params ?? []).map((p) => generateActionParam(p, false)),
				indent,
			);
		case "FeatureControlRule":
			return tag(
				"FeatureControlRule",
				`${attr("FeatureControlBit", step.featureControlBit)}${attr("ExpectedValue", step.expectedValue)}`,
			);
		case "MiscellaneousPrivilegeRule":
			return tag(
				"MiscellaneousPrivilegeRule",
				`${attr("PrivilegeName", step.privilegeName)}${attr("PrivilegeDepth", step.privilegeDepth)}`,
			);
		case "FormTypeRule":
			return tag("FormTypeRule", attr("Type", step.type));
		case "ValueRule":
			return tag("ValueRule", `${attr("Field", step.field)}${attr("Value", step.value)}`);
		case "SkuRule":
			return tag("SkuRule", attr("Sku", step.sku));
		case "HideForTabletExperienceRule":
			return tag("HideForTabletExperienceRule", "");
		case "OrganizationSettingRule":
			return tag("OrganizationSettingRule", attr("Setting", step.setting));
		case "EntityPrivilegeRule":
			return tag(
				"EntityPrivilegeRule",
				`${attr("PrivilegeType", step.privilegeType)}${attr("PrivilegeDepth", step.privilegeDepth)}${attr("AppliesTo", step.appliesTo)}${attr("EntityName", step.entityName)}`,
			);
		case "EntityPropertyRule":
			return tag(
				"EntityPropertyRule",
				`${attr("EntityName", step.entityName)}${attr("AppliesTo", step.appliesTo)}${attr("PropertyName", step.propertyName)}${attr("PropertyValue", step.propertyValue)}`,
			);
		case "DeviceTypeRule":
			return tag("DeviceTypeRule", attr("Type", step.type));
		case "RelationshipTypeRule":
			return tag(
				"RelationshipTypeRule",
				`${attr("AppliesTo", step.appliesTo)}${attr("RelationshipType", step.relationshipType)}${attr("AllowCustomRelationship", step.allowCustomRelationship)}${attr("AllowSystemRelationship", step.allowSystemRelationship)}`,
			);
		case "RecordPrivilegeRule":
			return tag(
				"RecordPrivilegeRule",
				`${attr("PrivilegeType", step.privilegeType)}${attr("AppliesTo", step.appliesTo)}`,
			);
		case "FormEntityContextRule":
			return tag("FormEntityContextRule", attr("EntityName", step.entityName));
		case "PageRule":
			return tag("PageRule", attr("Address", step.address));
		case "ReferencingAttributeRequiredRule":
			return tag("ReferencingAttributeRequiredRule", "");
		case "OutlookItemTrackingRule":
			return tag(
				"OutlookItemTrackingRule",
				`${attr("TrackedInCrm", step.trackedInCrm)}${attr("AppliesTo", step.appliesTo)}`,
			);
		case "OutlookRenderTypeRule":
			return tag("OutlookRenderTypeRule", attr("Type", step.type));
		case "OutlookVersionRule":
			return tag("OutlookVersionRule", attr("Version", step.version));
		case "CrmOfflineAccessStateRule":
			return tag("CrmOfflineAccessStateRule", attr("State", step.state));
		case "CrmOutlookClientTypeRule":
			return tag("CrmOutlookClientTypeRule", attr("Type", step.type));
		case "CrmOutlookClientVersionRule":
			return tag(
				"CrmOutlookClientVersionRule",
				`${attr("Major", step.major)}${attr("Minor", step.minor)}${attr("Build", step.build)}${attr("Revision", step.revision)}`,
			);
		case "OptionSetRule":
			return tag(
				"OptionSetRule",
				`${attr("OptionSet", step.optionSet)}${attr("StateCode", step.stateCode)}${attr("ObjectTypeCode", step.objectTypeCode)}`,
			);
		default: {
			const unknown: never = step;
			throw new Error(`Unknown rule kind: ${(unknown as { kind: string }).kind}`);
		}
	}
}

// ---------------------------------------------------------------------------
// LocLabel generators
// ---------------------------------------------------------------------------

function generateLocLabel(label: LocLabel): string {
	const titles = label.titles
		.map(
			(t) => `<Title languagecode="${t.languageCode}" description="${escapeXml(t.description)}"/>`,
		)
		.join("\n        ");
	return `<LocLabel Id="${escapeXml(label.id)}">
      <Titles>
        ${titles}
      </Titles>
    </LocLabel>`;
}

/**
 * TabDisplayRules for one tab. The rules are direct children of
 * TabDisplayRule (no <DisplayRules> wrapper). An entity ribbon only allows
 * EntityRule there; PageRule is valid only in the application ribbon
 * (RibbonTypes.xsd TabDisplayRulesEntityType vs TabDisplayRulesGlobalType — #40),
 * so it is left out of entity scopes, and a TabDisplayRule left with no rules
 * (choice minOccurs=1) is not emitted.
 */
export function generateTabDisplayRulesForTab(tab: RibbonTab, isApplication: boolean): string {
	return tab.tabDisplayRules
		.map((tdr) => {
			const steps = tdr.rules
				.map((step) => {
					if (step.kind === "EntityRule") {
						return `<EntityRule${attr("EntityName", step.entityName)}${attr("AppliesTo", step.appliesTo)}${attr("Context", step.context)}/>`;
					}
					if (step.kind === "PageRule" && isApplication) {
						return `<PageRule${attr("Address", step.address)}/>`;
					}
					return "";
				})
				.filter(Boolean);
			if (steps.length === 0) return "";
			return `<TabDisplayRule TabCommand="${escapeXml(tdr.tabCommand)}">
        ${steps.join("\n        ")}
      </TabDisplayRule>`;
		})
		.filter(Boolean)
		.join("\n      ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escapes special XML characters. & must always be escaped first.
 */
export function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export interface CustomizationsEntityRibbon {
	/** Table SchemaName (e.g. `Account`). Dataverse matches it case-insensitively,
	 * so the logical name is an acceptable fallback. */
	schemaName: string;
	/** Display name for the `<Name LocalizedName>` attribute. */
	localizedName: string;
	/** The COMPLETE RibbonDiffXml for the table (it replaces the table's whole
	 * unmanaged ribbon customization on import — see #11). */
	ribbonDiffXml: string;
}

/**
 * Builds customizations.xml for a ribbon-only solution import.
 *
 * Entity ribbons go under `Entities/Entity`, identified by a `<Name>` CHILD
 * element. The previous `<Entity Name="…" unmodified="0">` attribute form is
 * not in the schema; Dataverse accepted the import but silently ignored the
 * entity block, so every entity-ribbon publish was a no-op (#8, verified live).
 * The application ribbon is a root-level `<RibbonDiffXml>`.
 *
 * Form-specific ribbons (`FormXml/forms/systemform/form/RibbonDiffXml`) are not
 * supported on Unified Interface and a ribbon-only systemform import risks
 * overwriting the form, so they are intentionally not produced (#14).
 */
export function buildCustomizationsXml(input: {
	entities?: CustomizationsEntityRibbon[];
	applicationRibbonDiffXml?: string;
}): string {
	const entities = input.entities ?? [];
	const entityBlock =
		entities.length === 0
			? ""
			: `
  <Entities>
${entities
	.map(
		(e) => `    <Entity>
      <Name LocalizedName="${escapeXml(e.localizedName)}" OriginalName="${escapeXml(e.localizedName)}">${escapeXml(e.schemaName)}</Name>
      ${e.ribbonDiffXml}
    </Entity>`,
	)
	.join("\n")}
  </Entities>`;

	return `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${entityBlock}
  ${input.applicationRibbonDiffXml ?? ""}
</ImportExportXml>`;
}
