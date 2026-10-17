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
	ScalingDefinition,
	RibbonGroup,
	RibbonTab,
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

export function generateRibbonDiffXml(input: GeneratorInput): string {
	const { current, baseline, commands, enableRules, displayRules, locLabels } = input;
	const lang = input.languageCode ?? 1033;

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

	// 1. New tabs (not present in the OOB baseline) — emit the whole tab with
	//    its groups so the buttons inside have an anchor. Documented anchor:
	//    Location="Mscrm.Tabs._children".
	for (const tab of current.tabs) {
		if (!baselineTabIds.has(tab.id)) {
			tabCustomActions.push(generateTabCustomAction(tab, sink, lang));
		}
	}

	// 2. New groups inside an EXISTING tab → Location="{tabId}.Groups._children".
	//    (Groups inside a brand-new tab are emitted by the new-tab branch above.)
	for (const tab of current.tabs) {
		if (!baselineTabIds.has(tab.id)) continue;
		for (const group of tab.groups) {
			if (!baselineGroupIds.has(group.id)) {
				groupCustomActions.push(generateGroupCustomAction(group, tab.id, sink, lang));
			}
		}
	}

	// 3. Buttons.
	for (const tab of current.tabs) {
		for (const group of tab.groups) {
			for (const button of group.buttons) {
				const baseButton = baselineFor(button);

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

	// Emit command/rule DEFINITIONS only for custom (non-system) elements.
	// System `Mscrm.*` / `Microsoft.*` commands already exist in the platform —
	// re-emitting the parser's (often action-less) copy would overwrite and
	// corrupt them. The one deliberate exception is an intentional system-command
	// OVERRIDE (e.g. `Mscrm.OpenRecordItem` with a custom JS action), which must
	// be emitted for Dataverse to pick it up. We distinguish by checking whether
	// the command has at least one action defined: a parsed-but-unmodified OOB
	// command has no actions (the parser only understands JS/URL); a deliberate
	// override always has actions.
	const referencedCommands = commands.filter(
		(c) => referencedCommandIds.has(c.id) && (!isSystemRibbonId(c.id) || c.actions.length > 0),
	);

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
		...customActions,
		...hideCustomActions,
	];

	// Tab display rules only for tabs this session created. Existing tabs' rules
	// already live in the platform / unmanaged layer; re-emitting them copied
	// Microsoft's rules into the customization (#40).
	const tabDisplayRulesXml = current.tabs
		.filter((t) => !baselineTabIds.has(t.id))
		.filter((t) => t.tabDisplayRules && t.tabDisplayRules.length > 0)
		.map(generateTabDisplayRulesForTab)
		.join("\n      ");

	const scalingXml = generateScalingsXml(current, baseline);

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
  ${scalingXml}
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

function generateScalingsXml(current: RibbonDefinition, baseline: RibbonDefinition): string {
	const currentScaling = current.scalingByTab ?? {};
	const baselineScaling = baseline.scalingByTab ?? {};
	const changed = Object.entries(currentScaling)
		.filter(
			([tabId, scaling]) => JSON.stringify(scaling) !== JSON.stringify(baselineScaling[tabId]),
		)
		.map(([_, scaling]) => scaling);

	if (changed.length === 0) {
		return "";
	}

	const body = changed.map(generateScalingDefinition).join("\n    ");
	return `<Scalings>
    ${body}
  </Scalings>`;
}

function generateScalingDefinition(scaling: ScalingDefinition): string {
	const maxSizeXml = scaling.maxSizes
		.map(
			(step) =>
				`<MaxSize Id="${escapeXml(step.id)}" GroupId="${escapeXml(step.groupId)}" Size="${escapeXml(step.size)}" Sequence="${step.sequence}"/>`,
		)
		.join("\n      ");
	const scaleXml = scaling.scales
		.map(
			(step) =>
				`<Scale Id="${escapeXml(step.id)}" GroupId="${escapeXml(step.groupId)}" Size="${escapeXml(step.size)}" Sequence="${step.sequence}"/>`,
		)
		.join("\n      ");

	return `<Scaling TabId="${escapeXml(scaling.tabId)}">
      ${maxSizeXml}
      ${scaleXml}
    </Scaling>`;
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
 * Location pattern per Microsoft docs: `{tabId}.Groups._children`. The group's
 * `<Controls>` is left empty here — the buttons inside it are emitted as their
 * own CustomActions targeting `{groupId}.Controls._children`.
 */
function generateGroupCustomAction(
	group: RibbonGroup,
	tabId: string,
	sink: (label: LocLabel) => void,
	lang = 1033,
): string {
	const titleId = `${group.id}.Title`;
	sink({ id: titleId, titles: [{ languageCode: lang, description: group.label }] });
	return `<CustomAction Id="${escapeXml(group.id)}.CustomAction"
    Location="${escapeXml(tabId)}.Groups._children"
    Sequence="${group.sequence}">
    <CommandUIDefinition>
      ${generateGroupElement(group, sink, false, lang)}
    </CommandUIDefinition>
  </CustomAction>`;
}

/**
 * Emits a CustomAction that creates a NEW tab. Documented anchor for adding a
 * tab to an entity ribbon: `Location="Mscrm.Tabs._children"`. The tab's groups
 * are emitted inline (so buttons inside them have an anchor); the buttons
 * themselves are still emitted as separate CustomActions targeting
 * `{groupId}.Controls._children`.
 */
function generateTabCustomAction(tab: RibbonTab, sink: (label: LocLabel) => void, lang = 1033): string {
	const titleId = `${tab.id}.Title`;
	sink({ id: titleId, titles: [{ languageCode: lang, description: tab.label }] });
	const commandAttr = tab.commandId ? ` Command="${escapeXml(tab.commandId)}"` : "";
	const groupsXml = tab.groups.map((g) => generateGroupElement(g, sink, true, lang)).join("\n        ");
	return `<CustomAction Id="${escapeXml(tab.id)}.CustomAction"
    Location="Mscrm.Tabs._children"
    Sequence="${tab.sequence}">
    <CommandUIDefinition>
      <Tab Id="${escapeXml(tab.id)}"${commandAttr} Title="${escapeXml(locLabelRef(titleId))}" Sequence="${tab.sequence}">
        <Groups Id="${escapeXml(tab.id)}.Groups">
        ${groupsXml}
        </Groups>
      </Tab>
    </CommandUIDefinition>
  </CustomAction>`;
}

/**
 * A `<Group>` element with an empty `<Controls>` collection. Used both inside a
 * new-tab CustomAction and (standalone) inside a new-group CustomAction.
 * `nested` controls indentation only.
 */
function generateGroupElement(
	group: RibbonGroup,
	sink: (label: LocLabel) => void,
	nested: boolean,
	lang = 1033,
): string {
	const titleId = `${group.id}.Title`;
	if (nested) {
		// Group title LocLabel is registered by the caller for standalone groups;
		// for nested (new-tab) groups, register it here.
		sink({ id: titleId, titles: [{ languageCode: lang, description: group.label }] });
	}
	const template = normalizeGroupTemplate(group.template);
	return `<Group Id="${escapeXml(group.id)}" Title="${escapeXml(locLabelRef(titleId))}" Sequence="${group.sequence}" Template="${escapeXml(template)}">
          <Controls Id="${escapeXml(group.id)}.Controls"/>
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
	const iconUnchanged = src && normalizeModernImage(src.modernImage) === button.icon;
	const modernImage = iconUnchanged
		? src?.modernImage
		: [button.image32, button.image16, button.icon].find((v) => v?.startsWith("$webresource:"));
	set("ModernImage", modernImage);
	set("Image16by16", isResourceRef(button.image16) ? button.image16 : undefined);
	set("Image32by32", isResourceRef(button.image32) ? button.image32 : undefined);

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

/** A bare web resource name (`new_/scripts/x.js`) needs the `$webresource:` directive. */
function normalizeLibrary(library: string): string {
	const v = (library ?? "").trim();
	if (!v || v.startsWith("$webresource:") || /^https?:\/\//i.test(v) || v.startsWith("/")) return v;
	return `$webresource:${v}`;
}

export function generateCommandDefinition(cmd: CommandDefinition): string {
	const enableRulesXml = cmd.enableRules
		.map((r) => `<EnableRule Id="${escapeXml(r)}"/>`)
		.join("\n        ");
	const displayRulesXml = cmd.displayRules
		.map((r) => `<DisplayRule Id="${escapeXml(r)}"/>`)
		.join("\n        ");
	const actionsXml = cmd.actions
		.map((a) => {
			if (a.kind === "javascript") {
				const paramsXml = a.params.map(generateActionParam).join("\n          ");
				return `<JavaScriptFunction FunctionName="${escapeXml(a.functionName)}"
          Library="${escapeXml(normalizeLibrary(a.library))}">
          ${paramsXml}
        </JavaScriptFunction>`;
			}
			if (a.kind === "url") {
				const paramsXml = a.params.map(generateActionParam).join("\n          ");
				const passParams = a.passParams ? ' PassParams="1"' : "";
				const winMode = a.winMode !== undefined ? ` WinMode="${a.winMode}"` : "";
				return `<Url Address="${escapeXml(a.address)}"${passParams}${winMode}>
          ${paramsXml}
        </Url>`;
			}
			// Classic ribbon serialization currently supports JavaScriptFunction and Url only.
			return "";
		})
		.filter(Boolean)
		.join("\n        ");

	return `<CommandDefinition Id="${escapeXml(cmd.id)}">
      <EnableRules>
        ${enableRulesXml}
      </EnableRules>
      <DisplayRules>
        ${displayRulesXml}
      </DisplayRules>
      <Actions>
        ${actionsXml}
      </Actions>
    </CommandDefinition>`;
}

function generateActionParam(param: ActionParameter): string {
	const nameAttr = param.name ? ` Name="${escapeXml(param.name)}"` : "";
	switch (param.kind) {
		case "CrmParameter":
			return `<CrmParameter${nameAttr} Value="${escapeXml(String(param.value))}"/>`;
		case "BoolParameter":
			return `<BoolParameter${nameAttr} Value="${param.value}"/>`;
		case "IntParameter":
			return `<IntParameter${nameAttr} Value="${param.value}"/>`;
		case "DecimalParameter":
			return `<DecimalParameter${nameAttr} Value="${param.value}"/>`;
		case "StringParameter":
			return `<StringParameter${nameAttr} Value="${escapeXml(String(param.value))}"/>`;
	}
}

// ---------------------------------------------------------------------------
// Rule generators
// ---------------------------------------------------------------------------

export function generateEnableRule(rule: EnableRule): string {
	const steps = rule.steps.map(generateRuleStep).join("\n        ");
	return `<EnableRule Id="${escapeXml(rule.id)}">
        ${steps}
      </EnableRule>`;
}

export function generateDisplayRule(rule: DisplayRule): string {
	const steps = rule.steps.map(generateRuleStep).join("\n        ");
	return `<DisplayRule Id="${escapeXml(rule.id)}">
        ${steps}
      </DisplayRule>`;
}

function generateRuleStep(step: RuleStep): string {
	const invert = "invertResult" in step && step.invertResult ? ' InvertResult="1"' : "";

	switch (step.kind) {
		case "SelectionCountRule": {
			const min = step.minimum !== undefined ? ` Minimum="${step.minimum}"` : "";
			const max = step.maximum !== undefined ? ` Maximum="${step.maximum}"` : "";
			const applies = step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "";
			return `<SelectionCountRule${min}${max}${applies}${invert}/>`;
		}
		case "EntityRule": {
			const entity = step.entityName ? ` EntityName="${escapeXml(step.entityName)}"` : "";
			const ctx = step.context ? ` Context="${step.context}"` : "";
			const applies = step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "";
			return `<EntityRule${entity}${ctx}${applies}${invert}/>`;
		}
		case "FormStateRule":
			return `<FormStateRule State="${step.state}"${invert}/>`;
		case "CommandClientTypeRule": {
			const def = step.default !== undefined ? ` Default="${step.default}"` : "";
			return `<CommandClientTypeRule Type="${step.type}"${def}${invert}/>`;
		}
		case "CrmClientTypeRule":
			return `<CrmClientTypeRule Type="${step.type}"${invert}/>`;
		case "CustomRule": {
			const def = step.default !== undefined ? ` Default="${step.default}"` : "";
			return `<CustomRule Library="${escapeXml(step.library)}" FunctionName="${escapeXml(step.functionName)}"${def}${invert}/>`;
		}
		case "OrRule": {
			const nested = step.rules.map((r) => `<Or>${generateRuleStep(r)}</Or>`).join("\n          ");
			return `<OrRule>\n          ${nested}\n        </OrRule>`;
		}
		case "MiscellaneousPrivilegeRule": {
			const depth = step.privilegeDepth ? ` PrivilegeDepth="${step.privilegeDepth}"` : "";
			return `<MiscellaneousPrivilegeRule PrivilegeName="${escapeXml(step.privilegeName)}"${depth}${invert}/>`;
		}
		case "FormTypeRule":
			return `<FormTypeRule Type="${step.type}"${invert}/>`;
		case "ValueRule":
			return `<ValueRule Field="${escapeXml(step.field)}" Value="${escapeXml(step.value)}"${invert}/>`;
		case "SkuRule":
			return `<SkuRule Sku="${step.sku}"${invert}/>`;
		case "HideForTabletExperienceRule":
			return `<HideForTabletExperienceRule${invert}/>`;
		case "OrganizationSettingRule":
			return `<OrganizationSettingRule Setting="${step.setting}"${invert}/>`;
		case "EntityPrivilegeRule": {
			const entity = step.entityName ? ` EntityName="${escapeXml(step.entityName)}"` : "";
			const applies = step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "";
			return `<EntityPrivilegeRule${entity}${applies} PrivilegeType="${step.privilegeType}" PrivilegeDepth="${step.privilegeDepth}"${invert}/>`;
		}
		case "EntityPropertyRule": {
			const entity = step.entityName ? ` EntityName="${escapeXml(step.entityName)}"` : "";
			const applies = step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "";
			return `<EntityPropertyRule${entity}${applies} PropertyName="${step.propertyName}" PropertyValue="${step.propertyValue}"${invert}/>`;
		}
		case "DeviceTypeRule":
			return `<DeviceTypeRule Type="${step.type}"${invert}/>`;
		case "RelationshipTypeRule": {
			const relType = step.relationshipType ? ` RelationshipType="${step.relationshipType}"` : "";
			const custom =
				step.allowCustomRelationship !== undefined
					? ` AllowCustomRelationship="${step.allowCustomRelationship}"`
					: "";
			const system =
				step.allowSystemRelationship !== undefined
					? ` AllowSystemRelationship="${step.allowSystemRelationship}"`
					: "";
			return `<RelationshipTypeRule AppliesTo="${step.appliesTo}"${relType}${custom}${system}${invert}/>`;
		}
		case "RecordPrivilegeRule": {
			const applies = step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "";
			return `<RecordPrivilegeRule PrivilegeType="${step.privilegeType}"${applies}${invert}/>`;
		}
		case "FormEntityContextRule":
			return `<FormEntityContextRule EntityName="${escapeXml(step.entityName)}"${invert}/>`;
		case "PageRule":
			return `<PageRule Address="${escapeXml(step.address)}"${invert}/>`;
		case "ShowOnQuickActionRule":
			return `<ShowOnQuickActionRule/>`;
		case "ShowOnGridAndQuickActionRule":
			return `<ShowOnGridAndQuickActionRule/>`;
		case "ShowOnGridRule":
			return `<ShowOnGridRule/>`;
		case "ReferencingAttributeRequiredRule":
			return `<ReferencingAttributeRequiredRule${invert}/>`;
		case "OutlookItemTrackingRule": {
			const applies = step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "";
			return `<OutlookItemTrackingRule TrackedInCrm="${step.trackedInCrm}"${applies}${invert}/>`;
		}
		case "OutlookRenderTypeRule":
			return `<OutlookRenderTypeRule Type="${step.type}"${invert}/>`;
		case "OutlookVersionRule":
			return `<OutlookVersionRule Version="${step.version}"${invert}/>`;
		case "CrmOfflineAccessStateRule":
			return `<CrmOfflineAccessStateRule State="${step.state}"${invert}/>`;
		case "CrmOutlookClientTypeRule":
			return `<CrmOutlookClientTypeRule Type="${step.type}"${invert}/>`;
		case "CrmOutlookClientVersionRule": {
			const minor = step.minor !== undefined ? ` Minor="${step.minor}"` : "";
			const build = step.build !== undefined ? ` Build="${step.build}"` : "";
			const revision = step.revision !== undefined ? ` Revision="${step.revision}"` : "";
			return `<CrmOutlookClientVersionRule Major="${step.major}"${minor}${build}${revision}${invert}/>`;
		}
		case "OptionSetRule":
			return `<OptionSetRule OptionSet="${escapeXml(step.optionSet)}" StateCode="${escapeXml(step.stateCode)}" ObjectTypeCode="${escapeXml(step.objectTypeCode)}"${invert}/>`;
		default:
			return `<!-- Unknown rule kind -->`;
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

export function generateTabDisplayRulesForTab(tab: import("@/types/ribbon").RibbonTab): string {
	return tab.tabDisplayRules
		.map((tdr) => {
			const stepsXml = tdr.rules
				.map((step) => {
					if (step.kind === "EntityRule") {
						const attrs = [
							step.appliesTo ? ` AppliesTo="${step.appliesTo}"` : "",
							step.entityName ? ` EntityName="${escapeXml(step.entityName)}"` : "",
							step.context ? ` Context="${step.context}"` : "",
						].join("");
						return `<EntityRule${attrs}/>`;
					}
					if (step.kind === "PageRule") {
						return `<PageRule Address="${escapeXml(step.address)}"/>`;
					}
					return "";
				})
				.filter(Boolean)
				.join("\n          ");
			// Rules are direct children of TabDisplayRule (RibbonCore.xsd) — no
			// <DisplayRules> wrapper.
			return `<TabDisplayRule TabCommand="${escapeXml(tdr.tabCommand)}">
          ${stepsXml}
      </TabDisplayRule>`;
		})
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
