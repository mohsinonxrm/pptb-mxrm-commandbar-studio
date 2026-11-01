/**
 * "Customise Command" / "Customise Button" for buttons that aren't yours
 * (#31, #26 — Ribbon Workbench parity).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import {
	partsFromRibbonTables,
	ownControlIds,
	stableElementXml,
	mergeScopeChanges,
	emptyRibbonDiffParts,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { planScope, type PlanInput } from "@/services/publishPlan";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { layerSnapshotFromParts } from "@/services/dataverse/ribbonLayerService";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { commandProvenance } from "@/utils/commandProvenance";
import { copyControl } from "@/utils/ribbonMenu";
import { buttonLabelId, textLabelId } from "@/utils/locLabelRef";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

let layer: RibbonDiffParts;
vi.mock("@/services/dataverse/ribbonLayerService", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/dataverse/ribbonLayerService")>()),
	fetchUnmanagedRibbonParts: vi.fn(async () => layer),
}));

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const MGMT = `${MAIN}.Management`;
const DELETE = "Mscrm.DeleteSelectedRecord";
const ASSIGN = "Mscrm.AssignSelectedRecord";

// The out-of-the-box Delete command as RetrieveEntityRibbon returns it: a
// platform-library action with CrmParameters, and an <EnableRule> inside
// <DisplayRules> (kept verbatim by the parser).
const DELETE_XML = `<CommandDefinition Id="${DELETE}">
  <EnableRules>
    <EnableRule Id="Mscrm.SelectionCountAtLeastOne"/>
    <EnableRule Id="Mscrm.VisualizationPaneNotMaximized"/>
  </EnableRules>
  <DisplayRules>
    <DisplayRule Id="Mscrm.DeleteSelectedEntityPermission"/>
    <EnableRule Id="Mscrm.HideOnPhoneForNonModern"/>
  </DisplayRules>
  <Actions>
    <JavaScriptFunction FunctionName="XrmCore.Commands.Delete.deleteSelectedRecord" Library="$webresource:Main_system_library.js">
      <CrmParameter Value="SelectedControl"/>
      <CrmParameter Value="SelectedControlSelectedItemReferences"/>
      <CrmParameter Value="SelectedEntityTypeName"/>
    </JavaScriptFunction>
  </Actions>
</CommandDefinition>`;

// Assign was customised earlier (e.g. with Ribbon Workbench): the merged
// ribbon returns the layer's copy.
const ASSIGN_XML = `<CommandDefinition Id="${ASSIGN}"><EnableRules><EnableRule Id="Mscrm.SelectionCountAtLeastOne"/><EnableRule Id="cbs.Assign.Rule"/><EnableRule Id="cbs.Shared.Rule"/></EnableRules><DisplayRules><DisplayRule Id="cbs.Assign.Display"/></DisplayRules><Actions><JavaScriptFunction FunctionName="Cbs.assign" Library="$webresource:cbs_/assign.js"/></Actions></CommandDefinition>`;
const MINE_XML = `<CommandDefinition Id="cbs.Mine.Command"><EnableRules><EnableRule Id="cbs.Shared.Rule"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="Cbs.mine" Library="$webresource:cbs_/mine.js"/></Actions></CommandDefinition>`;

const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10">
    <Groups Id="${MAIN}.Groups">
      <Group Id="${MGMT}" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${MGMT}.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="$Resources:Ribbon.HomepageGrid.Edit" ToolTipTitle="$Resources:Mscrm_HomepageGrid_EntityLogicalName_MainTab_Management_Edit_ToolTipTitle" Alt="$Resources:Ribbon.HomepageGrid.Edit" ModernImage="Edit" TemplateAlias="o1" />
          <Button Id="Mscrm.HomepageGrid.${T}.Delete" Command="${DELETE}" Sequence="30" LabelText="$Resources:Ribbon.HomepageGrid.Delete" ModernImage="Remove" TemplateAlias="o1" />
          <Button Id="Mscrm.HomepageGrid.${T}.Assign" Command="${ASSIGN}" Sequence="40" LabelText="$Resources:Ribbon.HomepageGrid.Assign" TemplateAlias="o1" />
          <FlyoutAnchor Id="Mscrm.HomepageGrid.${T}.Flows" Command="Mscrm.Flows" Sequence="50" LabelText="Flow" TemplateAlias="o1" />
          <Button Id="cbs.Mine" Command="cbs.Mine.Command" Sequence="900" LabelText="Mine" TemplateAlias="o1" />
        </Controls>
      </Group>
      <Group Id="${MAIN}.Collaborate" Sequence="20" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${MAIN}.Collaborate.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.Share" Command="Mscrm.ShareSelectedRecord" Sequence="10" LabelText="$Resources:Ribbon.HomepageGrid.Share" TemplateAlias="o1" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  ${DELETE_XML}
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules><EnableRule Id="Mscrm.SelectionCountExactlyOne"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Open.openSelectedRecord" Library="$webresource:Main_system_library.js"><CrmParameter Value="SelectedControl"/></JavaScriptFunction></Actions></CommandDefinition>
  <CommandDefinition Id="Mscrm.ShareSelectedRecord"><EnableRules><EnableRule Id="Mscrm.SelectionCountAtLeastOne"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Share.shareSelectedRecords" Library="$webresource:Main_system_library.js"/></Actions></CommandDefinition>
  ${ASSIGN_XML}
  ${MINE_XML}
</CommandDefinitions>
<RuleDefinitions>
  <TabDisplayRules/>
  <DisplayRules>
    <DisplayRule Id="Mscrm.DeleteSelectedEntityPermission"><EntityPrivilegeRule PrivilegeType="Delete" PrivilegeDepth="Basic" AppliesTo="SelectedEntity"/></DisplayRule>
    <DisplayRule Id="cbs.Assign.Display"><FormStateRule State="Existing"/></DisplayRule>
  </DisplayRules>
  <EnableRules>
    <EnableRule Id="Mscrm.SelectionCountAtLeastOne"><SelectionCountRule AppliesTo="SelectedEntity" Minimum="1"/></EnableRule>
    <EnableRule Id="Mscrm.SelectionCountExactlyOne"><SelectionCountRule AppliesTo="SelectedEntity" Minimum="1" Maximum="1"/></EnableRule>
    <EnableRule Id="Mscrm.VisualizationPaneNotMaximized"><CustomRule FunctionName="XrmCore.Rules.Charts.disableButtonsWhenChartMaximized" Library="$webresource:Main_system_library.js"><CrmParameter Value="SelectedControl"/></CustomRule></EnableRule>
    <EnableRule Id="Mscrm.HideOnPhoneForNonModern"><CommandClientTypeRule Type="Modern" InvertResult="true"/></EnableRule>
    <EnableRule Id="cbs.Assign.Rule"><CustomRule FunctionName="Cbs.canAssign" Library="$webresource:cbs_/assign.js"/></EnableRule>
    <EnableRule Id="cbs.Shared.Rule"><CustomRule FunctionName="Cbs.enabled" Library="$webresource:cbs_/mine.js"/></EnableRule>
  </EnableRules>
</RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const ca = (id: string, location: string, seq: number, inner: string) =>
	`<CustomAction Id="${id}" Location="${location}" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;

// The table's unmanaged layer: your button, its command, the earlier
// customisation of Assign with its rules (one of them a customised
// out-of-the-box rule that Delete and Share use too).
const LAYER_ROWS = {
	diffs: [
		{
			difftype: 0,
			rdx: ca(
				"cbs.Mine.CustomAction",
				`${MGMT}.Controls._children`,
				900,
				`<Button Id="cbs.Mine" Command="cbs.Mine.Command" Sequence="900" LabelText="Mine" TemplateAlias="o1" />`,
			),
		},
	],
	commands: [
		{ command: ASSIGN, commanddefinition: ASSIGN_XML },
		{ command: "cbs.Mine.Command", commanddefinition: MINE_XML },
	],
	rules: [
		{
			ruleid: "Mscrm.SelectionCountAtLeastOne",
			ruletype: 1,
			ruledefinition:
				'<EnableRule Id="Mscrm.SelectionCountAtLeastOne"><SelectionCountRule AppliesTo="SelectedEntity" Minimum="1" /></EnableRule>',
		},
		{
			ruleid: "cbs.Assign.Rule",
			ruletype: 1,
			ruledefinition:
				'<EnableRule Id="cbs.Assign.Rule"><CustomRule FunctionName="Cbs.canAssign" Library="$webresource:cbs_/assign.js" /></EnableRule>',
		},
		{
			ruleid: "cbs.Shared.Rule",
			ruletype: 1,
			ruledefinition:
				'<EnableRule Id="cbs.Shared.Rule"><CustomRule FunctionName="Cbs.enabled" Library="$webresource:cbs_/mine.js" /></EnableRule>',
		},
		{
			ruleid: "cbs.Assign.Display",
			ruletype: 2,
			ruledefinition:
				'<DisplayRule Id="cbs.Assign.Display"><FormStateRule State="Existing" /></DisplayRule>',
		},
	],
};

const layerParts = () => partsFromRibbonTables(LAYER_ROWS);

function load() {
	const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
	applyLayerOwnership(parsed.ribbon, ownControlIds(layerParts()));
	return parsed;
}
type Parsed = ReturnType<typeof load>;

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

function plan(current: RibbonDefinition, parsed: Parsed, extra: Partial<PlanInput> = {}) {
	const base = load();
	return planScope({
		locations: [{ current, baseline: base.ribbon }],
		commands: parsed.commands,
		baselineCommands: base.commands,
		enableRules: parsed.enableRules,
		baselineEnableRules: base.enableRules,
		displayRules: parsed.displayRules,
		baselineDisplayRules: base.displayRules,
		locLabels: parsed.locLabels,
		baselineLocLabels: base.locLabels,
		layer: layerSnapshotFromParts(layerParts()),
		...extra,
	});
}

async function build(current: RibbonDefinition, parsed: Parsed, extra: Partial<PlanInput> = {}) {
	const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
	const p = plan(current, parsed, extra);
	const result = await buildMergedRibbonDiffXml({
		entity: { logicalName: T, schemaName: T },
		locations: [{ current, baseline: load().ribbon }],
		commands: parsed.commands,
		enableRules: parsed.enableRules,
		displayRules: parsed.displayRules,
		locLabels: parsed.locLabels,
		plan: p,
		languageCode: 1033,
	});
	const doc = new DOMParser().parseFromString(result.xml, "application/xml");
	return { ...result, plan: p, doc };
}

const ids = (doc: Document, selector: string, attr = "Id") =>
	Array.from(doc.querySelectorAll(selector)).map((e) => e.getAttribute(attr));
const commandXml = (doc: Document, id: string) => {
	const el = Array.from(doc.querySelectorAll("CommandDefinitions > CommandDefinition")).find(
		(c) => c.getAttribute("Id") === id,
	);
	return el ? new XMLSerializer().serializeToString(el) : undefined;
};

/** Loads the fixture into the store, as fetchRibbonWorkspace would. */
function loadStore(application: RibbonDefinition = empty("Application")) {
	const parsed = load();
	useRibbonStore.getState().loadWorkspace({
		ribbons: {
			HomepageGrid: parsed.ribbon,
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: application,
		},
		commands: parsed.commands,
		displayRules: parsed.displayRules,
		enableRules: parsed.enableRules,
		locLabels: parsed.locLabels,
		layers: { entity: layerSnapshotFromParts(layerParts()), application: null },
	});
}

function storePlan(
	location: RibbonLocation[] = ["HomepageGrid"],
	scope: "entity" | "application" = "entity",
	excludeCommandIds?: Set<string>,
) {
	const s = useRibbonStore.getState();
	return planScope({
		locations: location.map((l) => ({ current: s.ribbons[l], baseline: s.baseline[l] })),
		commands: s.commands,
		baselineCommands: s.baselineCommands,
		enableRules: s.enableRules,
		baselineEnableRules: s.baselineEnableRules,
		displayRules: s.displayRules,
		baselineDisplayRules: s.baselineDisplayRules,
		layer: s.layers[scope] ?? undefined,
		customisedCommandIds: s.customisedCommandIds,
		uncustomisedCommandIds: s.uncustomisedCommandIds[scope],
		excludeCommandIds,
	});
}

const provenanceOf = (id: string) => commandProvenance(id, useRibbonStore.getState());

beforeEach(() => {
	layer = layerParts();
});

describe("#31 — Customise Command", () => {
	it("the layer snapshot lists the commands the layer defines", () => {
		expect(layerSnapshotFromParts(layerParts()).commandIds).toEqual([
			ASSIGN,
			"cbs.Mine.Command",
		]);
	});

	it("an out-of-the-box command customised without other edits is written to the layer with every action and rule reference intact", async () => {
		const parsed = load();
		const p = plan(parsed.ribbon, parsed, { customisedCommandIds: [DELETE] });
		expect(p.hasChanges).toBe(true);
		expect(p.editedCommandIds).toEqual([DELETE]);
		expect(p.unsupported).toEqual([]);

		const { doc, changedKeys } = await build(parsed.ribbon, parsed, {
			customisedCommandIds: [DELETE],
		});
		const written = commandXml(doc, DELETE)!;
		expect(written).toBeDefined();
		// Same command as loaded: actions, CrmParameters, rule references
		// (including the <EnableRule> inside <DisplayRules>) in order.
		expect(stableElementXml("commandDefinitions", written)).toBe(
			stableElementXml("commandDefinitions", DELETE_XML),
		);
		expect(written).toContain('FunctionName="XrmCore.Commands.Delete.deleteSelectedRecord"');
		expect(written).toContain('<CrmParameter Value="SelectedControlSelectedItemReferences"');
		// Rules are referenced, not copied: an out-of-the-box rule written to the
		// layer would replace it for every command of the table.
		expect(ids(doc, "RuleDefinitions > EnableRules > EnableRule")).not.toContain(
			"Mscrm.VisualizationPaneNotMaximized",
		);
		expect(ids(doc, "RuleDefinitions > DisplayRules > DisplayRule")).not.toContain(
			"Mscrm.DeleteSelectedEntityPermission",
		);
		// Nothing else changed; the layer's own elements are kept.
		expect(changedKeys).toEqual([`commandDefinitions:${DELETE}`]);
		expect(commandXml(doc, ASSIGN)).toBe(ASSIGN_XML);
		expect(ids(doc, "CustomActions > CustomAction")).toEqual(["cbs.Mine.CustomAction"]);
	});

	it("an edit after customising is what gets written", async () => {
		const parsed = load();
		const cmd = parsed.commands.find((c) => c.id === DELETE)!;
		cmd.actions.push({
			kind: "javascript",
			library: "$webresource:cbs_/audit.js",
			functionName: "Cbs.audit",
			params: [],
		});
		const { doc, plan: p } = await build(parsed.ribbon, parsed, {
			customisedCommandIds: [DELETE],
		});
		expect(p.editedCommandIds).toEqual([DELETE]);
		const written = commandXml(doc, DELETE)!;
		expect(written).toContain('FunctionName="XrmCore.Commands.Delete.deleteSelectedRecord"');
		expect(written).toContain('FunctionName="Cbs.audit"');
		expect(written).toContain('<EnableRule Id="Mscrm.HideOnPhoneForNonModern"');
	});

	it("customising a command the layer already has rewrites nothing until it is edited", async () => {
		const parsed = load();
		expect(plan(parsed.ribbon, parsed, { customisedCommandIds: [ASSIGN] }).hasChanges).toBe(
			false,
		);
		parsed.commands.find((c) => c.id === ASSIGN)!.actions[0] = {
			kind: "javascript",
			library: "$webresource:cbs_/assign.js",
			functionName: "Cbs.assign2",
			params: [],
		};
		const { doc, plan: p } = await build(parsed.ribbon, parsed, {
			customisedCommandIds: [ASSIGN],
		});
		expect(p.editedCommandIds).toEqual([ASSIGN]);
		expect(commandXml(doc, ASSIGN)).toContain('FunctionName="Cbs.assign2"');
	});

	it("uncustomise removes the layer's copy and the rules nothing else uses", async () => {
		const parsed = load();
		const p = plan(parsed.ribbon, parsed, { uncustomisedCommandIds: [ASSIGN] });
		expect(p.hasChanges).toBe(true);
		expect(p.uncustomisedCommandIds).toEqual([ASSIGN]);
		expect(p.editedCommandIds).toEqual([]);

		const { doc } = await build(parsed.ribbon, parsed, { uncustomisedCommandIds: [ASSIGN] });
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).toEqual(["cbs.Mine.Command"]);
		const enable = ids(doc, "RuleDefinitions > EnableRules > EnableRule");
		const display = ids(doc, "RuleDefinitions > DisplayRules > DisplayRule");
		// Only Assign used these.
		expect(enable).not.toContain("cbs.Assign.Rule");
		expect(display).not.toContain("cbs.Assign.Display");
		// Still used: by your own command in the layer, and by out-of-the-box
		// commands of the table (Delete, Share) through the customised rule.
		expect(enable).toContain("cbs.Shared.Rule");
		expect(enable).toContain("Mscrm.SelectionCountAtLeastOne");
		// Your button stays.
		expect(ids(doc, "CustomActions > CustomAction")).toEqual(["cbs.Mine.CustomAction"]);
	});

	it("an edited rule of the uncustomised command isn't published, and an edit of the command is dropped", async () => {
		const parsed = load();
		parsed.enableRules.find((r) => r.id === "cbs.Assign.Rule")!.steps = [
			{ kind: "SelectionCountRule", minimum: 2 },
		];
		parsed.commands.find((c) => c.id === ASSIGN)!.actions = [];
		const { doc, plan: p } = await build(parsed.ribbon, parsed, {
			uncustomisedCommandIds: [ASSIGN],
		});
		expect(p.editedCommandIds).toEqual([]);
		expect(p.editedEnableRuleIds).toEqual([]);
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).not.toContain(ASSIGN);
		expect(ids(doc, "RuleDefinitions > EnableRules > EnableRule")).not.toContain(
			"cbs.Assign.Rule",
		);
	});

	it("uncustomising a command the layer doesn't define plans nothing", () => {
		const parsed = load();
		const p = plan(parsed.ribbon, parsed, { uncustomisedCommandIds: [DELETE] });
		expect(p.uncustomisedCommandIds).toEqual([]);
		expect(p.hasChanges).toBe(false);
	});
});

describe("#31 — store and provenance", () => {
	it("tells out-of-the-box, customised and custom commands apart", () => {
		loadStore();
		expect(provenanceOf(DELETE).provenance).toBe("oob");
		expect(provenanceOf(ASSIGN).provenance).toBe("customised");
		expect(provenanceOf("cbs.Mine.Command").provenance).toBe("custom");
	});

	it("customise → customising → planned; discard → back to out of the box", () => {
		loadStore();
		expect(useRibbonStore.getState().customiseCommand(DELETE)).toBe(true);
		expect(useRibbonStore.getState().customiseCommand("nope")).toBe(false);
		expect(provenanceOf(DELETE).provenance).toBe("customising");
		expect(useRibbonStore.getState().mutationsSincePublish).toBe(1);
		expect(storePlan().editedCommandIds).toEqual([DELETE]);

		useRibbonStore.getState().discardCommandChanges(DELETE);
		expect(provenanceOf(DELETE).provenance).toBe("oob");
		expect(storePlan().hasChanges).toBe(false);
	});

	it("editing an out-of-the-box command customises it; discarding restores the loaded definition", () => {
		loadStore();
		const cmd = useRibbonStore.getState().commands.find((c) => c.id === DELETE)!;
		useRibbonStore.getState().upsertCommand({ ...cmd, actions: [] });
		expect(provenanceOf(DELETE).provenance).toBe("customising");
		useRibbonStore.getState().discardCommandChanges(DELETE);
		expect(
			useRibbonStore.getState().commands.find((c) => c.id === DELETE)!.actions,
		).toHaveLength(1);
	});

	it("uncustomise discards edits and plans the removal; undo brings the copy back", () => {
		loadStore();
		const cmd = useRibbonStore.getState().commands.find((c) => c.id === ASSIGN)!;
		useRibbonStore.getState().upsertCommand({ ...cmd, actions: [] });
		useRibbonStore.getState().uncustomiseCommand(ASSIGN, "entity");
		expect(provenanceOf(ASSIGN).provenance).toBe("uncustomising");
		expect(
			useRibbonStore.getState().commands.find((c) => c.id === ASSIGN)!.actions,
		).toHaveLength(1);
		expect(storePlan().uncustomisedCommandIds).toEqual([ASSIGN]);

		useRibbonStore.getState().discardCommandChanges(ASSIGN);
		expect(provenanceOf(ASSIGN).provenance).toBe("customised");
		expect(storePlan().hasChanges).toBe(false);
	});

	it("publishing everything clears the pending customisations", () => {
		loadStore();
		useRibbonStore.getState().customiseCommand(DELETE);
		useRibbonStore.getState().uncustomiseCommand(ASSIGN, "entity");
		useRibbonStore.getState().markPublished(["HomepageGrid"]);
		expect(useRibbonStore.getState().customisedCommandIds).toEqual([DELETE]);
		expect(useRibbonStore.getState().uncustomisedCommandIds.entity).toEqual([ASSIGN]);
		useRibbonStore.getState().markPublished();
		expect(useRibbonStore.getState().customisedCommandIds).toEqual([]);
		expect(useRibbonStore.getState().uncustomisedCommandIds).toEqual({
			entity: [],
			application: [],
		});
	});

	it("an uncustomise that was published needs a reload before the command can be customised again", () => {
		loadStore();
		useRibbonStore.getState().uncustomiseCommand(ASSIGN, "entity");
		useRibbonStore.getState().markPublished();
		// The session still holds the removed copy: read-only, no Customise.
		expect(provenanceOf(ASSIGN).provenance).toBe("reloadRequired");
		expect(useRibbonStore.getState().customiseCommand(ASSIGN)).toBe(false);
		expect(storePlan().hasChanges).toBe(false);
		// Reloading the table clears it.
		loadStore();
		expect(useRibbonStore.getState().reloadRequiredCommandIds).toEqual([]);
	});

	it("customise / uncustomise / discard are in the history: undo and redo restore commands and lists", () => {
		loadStore();
		const s = () => useRibbonStore.getState();
		const cmd = s().commands.find((c) => c.id === ASSIGN)!;
		s().upsertCommand({ ...cmd, actions: [] });
		s().uncustomiseCommand(ASSIGN, "entity");
		expect(s().past.at(-1)).toMatchObject({ op: "uncustomised", target: ASSIGN });
		s().undo();
		// The edit discarded by Uncustomise is back, and so is the copy.
		expect(s().uncustomisedCommandIds.entity).toEqual([]);
		expect(s().commands.find((c) => c.id === ASSIGN)!.actions).toEqual([]);
		s().redo();
		expect(s().uncustomisedCommandIds.entity).toEqual([ASSIGN]);
		expect(s().commands.find((c) => c.id === ASSIGN)!.actions).toHaveLength(1);

		s().customiseCommand(DELETE);
		s().undo();
		expect(s().customisedCommandIds).toEqual([]);
		s().redo();
		expect(s().customisedCommandIds).toEqual([DELETE]);
		s().discardCommandChanges(DELETE);
		expect(s().past.at(-1)).toMatchObject({ op: "discarded", target: DELETE });
		s().undo();
		expect(s().customisedCommandIds).toEqual([DELETE]);
	});
});

describe("#31 review — your own command is never uncustomised", () => {
	// An out-of-the-box button overridden ("Create override") to use your own
	// command, which your own button uses too: nothing defines it below the layer.
	const OVER_XML = `<CommandDefinition Id="cbs.Over.Command"><EnableRules><EnableRule Id="cbs.Over.Rule"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="Cbs.over" Library="$webresource:cbs_/over.js"/></Actions></CommandDefinition>`;
	const SHARE = `Mscrm.HomepageGrid.${T}.Share`;
	const overRows = () => ({
		diffs: [
			...LAYER_ROWS.diffs,
			{
				difftype: 0,
				rdx: ca(
					"cbs.Share.Override",
					SHARE,
					10,
					`<Button Id="${SHARE}" Command="cbs.Over.Command" Sequence="10" LabelText="$Resources:Ribbon.HomepageGrid.Share" TemplateAlias="o1" />`,
				),
			},
			{
				difftype: 0,
				rdx: ca(
					"cbs.Mine2.CustomAction",
					`${MGMT}.Controls._children`,
					910,
					`<Button Id="cbs.Mine2" Command="cbs.Over.Command" Sequence="910" LabelText="Mine2" TemplateAlias="o1" />`,
				),
			},
		],
		commands: [
			...LAYER_ROWS.commands,
			{ command: "cbs.Over.Command", commanddefinition: OVER_XML },
		],
		rules: [
			...LAYER_ROWS.rules,
			{
				ruleid: "cbs.Over.Rule",
				ruletype: 1,
				ruledefinition:
					'<EnableRule Id="cbs.Over.Rule"><CustomRule FunctionName="Cbs.overOk" Library="$webresource:cbs_/over.js" /></EnableRule>',
			},
		],
	});
	const overMerged = () =>
		MERGED.replace(
			`Command="Mscrm.ShareSelectedRecord" Sequence="10"`,
			`Command="cbs.Over.Command" Sequence="10"`,
		)
			.replace(
				`<Button Id="cbs.Mine" `,
				`<Button Id="cbs.Mine2" Command="cbs.Over.Command" Sequence="910" LabelText="Mine2" TemplateAlias="o1" /><Button Id="cbs.Mine" `,
			)
			.replace(`${MINE_XML}`, `${MINE_XML}${OVER_XML}`)
			.replace(
				'<EnableRules>\n    <EnableRule Id="Mscrm.SelectionCountAtLeastOne">',
				`<EnableRules><EnableRule Id="cbs.Over.Rule"><CustomRule FunctionName="Cbs.overOk" Library="$webresource:cbs_/over.js"/></EnableRule>\n    <EnableRule Id="Mscrm.SelectionCountAtLeastOne">`,
			);
	const loadOver = () => {
		const parts = partsFromRibbonTables(overRows());
		const parsed = parseRibbonXml(overMerged(), "HomepageGrid", T);
		applyLayerOwnership(parsed.ribbon, ownControlIds(parts));
		return { parts, parsed };
	};

	it("is shown as custom, not customised, so Uncustomise isn't offered", () => {
		const { parts, parsed } = loadOver();
		expect(layerSnapshotFromParts(parts).commandRefIds).toContain("cbs.Over.Command");
		useRibbonStore.getState().loadWorkspace({
			ribbons: {
				HomepageGrid: parsed.ribbon,
				SubGrid: empty("SubGrid"),
				Form: empty("Form"),
				Application: empty("Application"),
			},
			commands: parsed.commands,
			displayRules: parsed.displayRules,
			enableRules: parsed.enableRules,
			locLabels: parsed.locLabels,
			layers: { entity: layerSnapshotFromParts(parts), application: null },
		});
		expect(provenanceOf("cbs.Over.Command").provenance).toBe("custom");
		// A platform command your buttons use is still a customisation.
		expect(provenanceOf(ASSIGN).provenance).toBe("customised");
	});

	it("an uncustomise of it is reported, refused on publish and never merged", async () => {
		const { parts, parsed } = loadOver();
		layer = parts;
		const p = planScope({
			locations: [{ current: parsed.ribbon, baseline: loadOver().parsed.ribbon }],
			commands: parsed.commands,
			baselineCommands: loadOver().parsed.commands,
			enableRules: parsed.enableRules,
			baselineEnableRules: parsed.enableRules,
			displayRules: parsed.displayRules,
			baselineDisplayRules: parsed.displayRules,
			layer: layerSnapshotFromParts(parts),
			uncustomisedCommandIds: ["cbs.Over.Command"],
		});
		expect(p.unsupported.join("\n")).toContain("Uncustomising cbs.Over.Command");

		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		await expect(
			buildMergedRibbonDiffXml({
				entity: { logicalName: T, schemaName: T },
				locations: [{ current: parsed.ribbon, baseline: parsed.ribbon }],
				commands: parsed.commands,
				enableRules: parsed.enableRules,
				displayRules: parsed.displayRules,
				locLabels: parsed.locLabels,
				// Even if the plan's report were ignored, the publish refuses it.
				plan: p,
				languageCode: 1033,
			}),
		).rejects.toThrow(/Can't uncustomise cbs\.Over\.Command/);

		const merged = mergeScopeChanges(parts, emptyRibbonDiffParts(), {
			uncustomisedCommandIds: ["cbs.Over.Command"],
		});
		expect(merged.commandDefinitions.has("cbs.Over.Command")).toBe(true);
		expect(merged.enableRules.has("cbs.Over.Rule")).toBe(true);
	});
});

describe("#31 review — uncustomise is per layer", () => {
	it("uncustomising for the table leaves the application ribbon's copy", () => {
		const app: RibbonDefinition = {
			location: "Application",
			entityLogicalName: "",
			tabs: [
				{
					id: "Mscrm.BasicHomeTab",
					label: "Home",
					sequence: 10,
					tabDisplayRules: [],
					groups: [
						{
							id: "Mscrm.BasicHomeTab.Records",
							label: "Records",
							sequence: 10,
							template: "Mscrm.Templates.Flexible2",
							buttons: [
								{
									id: "Mscrm.Home.Delete",
									label: "Delete",
									kind: "button",
									sequence: 10,
									templateAlias: "o1",
									commandId: DELETE,
									hidden: false,
									oob: true,
									custom: false,
									managed: false,
									origin: "oob",
								},
							],
						},
					],
				},
			],
		};
		loadStore(app);
		// Both layers have a copy of Delete.
		useRibbonStore.setState((s) => ({
			layers: {
				entity: {
					...s.layers.entity!,
					commandIds: [...(s.layers.entity!.commandIds ?? []), DELETE],
				},
				application: {
					controlIds: [],
					containerIds: [],
					locLabelIds: [],
					hides: [],
					commandIds: [DELETE],
					commandRefIds: [],
				},
			},
		}));
		const info = provenanceOf(DELETE);
		expect(info).toMatchObject({
			provenance: "customised",
			scope: "entity",
			sharedWithApplication: true,
		});
		useRibbonStore.getState().uncustomiseCommand(DELETE, info.scope);
		expect(provenanceOf(DELETE)).toMatchObject({
			provenance: "uncustomising",
			scope: "entity",
		});

		const tableCommands = new Set(
			useRibbonStore
				.getState()
				.ribbons.HomepageGrid.tabs.flatMap((t) =>
					t.groups.flatMap((g) => g.buttons.map((b) => b.commandId)),
				),
		);
		expect(storePlan(["HomepageGrid", "SubGrid", "Form"]).uncustomisedCommandIds).toEqual([
			DELETE,
		]);
		const appPlan = storePlan(["Application"], "application", tableCommands);
		expect(appPlan.uncustomisedCommandIds).toEqual([]);
		expect(appPlan.hasChanges).toBe(false);
	});
});

describe("#31 — commands shared with the application ribbon", () => {
	const appButton = (id: string, commandId: string): RibbonButton => ({
		id,
		label: id,
		kind: "button",
		sequence: 10,
		templateAlias: "o1",
		commandId,
		hidden: false,
		oob: true,
		custom: false,
		managed: false,
		origin: "oob",
	});
	const application = (): RibbonDefinition => ({
		location: "Application",
		entityLogicalName: "",
		tabs: [
			{
				id: "Mscrm.BasicHomeTab",
				label: "Home",
				sequence: 10,
				tabDisplayRules: [],
				groups: [
					{
						id: "Mscrm.BasicHomeTab.Records",
						label: "Records",
						sequence: 10,
						template: "Mscrm.Templates.Flexible2",
						buttons: [
							appButton("Mscrm.Home.Delete", DELETE),
							appButton("Mscrm.Home.Share", "Mscrm.ShareSelectedRecord"),
						],
					},
				],
			},
		],
	});
	const tableCommands = () => {
		const out = new Set<string>();
		for (const l of ["HomepageGrid", "SubGrid", "Form"] as const)
			for (const t of useRibbonStore.getState().ribbons[l].tabs)
				for (const g of t.groups) for (const b of g.buttons) out.add(b.commandId);
		return out;
	};

	it("a command the table's buttons use is customised in the table's layer only", () => {
		loadStore(application());
		useRibbonStore.getState().customiseCommand(DELETE);
		const info = provenanceOf(DELETE);
		expect(info.scope).toBe("entity");
		expect(info.sharedWithApplication).toBe(true);
		expect(storePlan(["HomepageGrid", "SubGrid", "Form"]).editedCommandIds).toEqual([DELETE]);
		const app = storePlan(["Application"], "application", tableCommands());
		expect(app.editedCommandIds).toEqual([]);
		expect(app.hasChanges).toBe(false);
	});

	it("a command only the application ribbon uses is customised in the application ribbon's layer", () => {
		const app = application();
		app.tabs[0].groups[0].buttons.push(appButton("Mscrm.Home.AppOnly", "Mscrm.AppOnly"));
		loadStore(app);
		useRibbonStore.setState((s) => ({
			commands: [
				...s.commands,
				{ id: "Mscrm.AppOnly", enableRules: [], displayRules: [], actions: [] },
			],
			baselineCommands: [
				...s.baselineCommands,
				{ id: "Mscrm.AppOnly", enableRules: [], displayRules: [], actions: [] },
			],
		}));
		useRibbonStore.getState().customiseCommand("Mscrm.AppOnly");
		expect(provenanceOf("Mscrm.AppOnly").scope).toBe("application");
		expect(storePlan(["HomepageGrid", "SubGrid", "Form"]).editedCommandIds).toEqual([]);
		expect(storePlan(["Application"], "application", tableCommands()).editedCommandIds).toEqual(
			["Mscrm.AppOnly"],
		);
	});
});

describe("#26 / #31 — Customise Button", () => {
	const EDIT = `Mscrm.HomepageGrid.${T}.Edit`;
	const mgmt = () =>
		useRibbonStore.getState().ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === MGMT)!;

	it("copies the button under your prefix, hides the original and plans both", async () => {
		loadStore();
		const id = useRibbonStore
			.getState()
			.customiseButton("HomepageGrid", MAIN, MGMT, EDIT, "cbs");
		expect(id).toBe(`cbs.${EDIT}`);
		const buttons = mgmt().buttons;
		const original = buttons.find((b) => b.id === EDIT)!;
		const copy = buttons.find((b) => b.id === id)!;
		expect(original.hidden).toBe(true);
		expect(buttons.indexOf(copy)).toBe(buttons.indexOf(original) + 1);
		expect(copy).toMatchObject({
			origin: "unmanaged",
			hidden: false,
			commandId: "Mscrm.EditSelectedRecord",
			sequence: 21,
		});

		const s = useRibbonStore.getState();
		const p = storePlan();
		expect(p.unsupported).toEqual([]);
		expect(p.hasChanges).toBe(true);
		expect(p.editedCommandIds).toEqual([]);

		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		const result = await buildMergedRibbonDiffXml({
			entity: { logicalName: T, schemaName: T },
			locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
			plan: p,
			languageCode: 1033,
		});
		const doc = new DOMParser().parseFromString(result.xml, "application/xml");
		const added = Array.from(doc.querySelectorAll("CustomActions > CustomAction")).find(
			(c) => c.querySelector("Button")?.getAttribute("Id") === id,
		)!;
		expect(added.getAttribute("Location")).toBe(`${MGMT}.Controls._children`);
		const btn = added.querySelector("Button")!;
		// Same command (out of the box, so not copied), same platform texts and image.
		expect(btn.getAttribute("Command")).toBe("Mscrm.EditSelectedRecord");
		expect(btn.getAttribute("LabelText")).toBe("$Resources:Ribbon.HomepageGrid.Edit");
		expect(btn.getAttribute("Alt")).toBe("$Resources:Ribbon.HomepageGrid.Edit");
		expect(btn.getAttribute("ModernImage")).toBe("Edit");
		expect(ids(doc, "CustomActions > HideCustomAction", "Location")).toEqual([EDIT]);
		expect(ids(doc, "CommandDefinitions > CommandDefinition")).not.toContain(
			"Mscrm.EditSelectedRecord",
		);
	});

	it("the copy can be moved to another group like any button of yours", () => {
		loadStore();
		const id = useRibbonStore
			.getState()
			.customiseButton("HomepageGrid", MAIN, MGMT, EDIT, "cbs")!;
		useRibbonStore
			.getState()
			.moveButton(
				{ groupId: MGMT, buttonId: id, tabId: MAIN, location: "HomepageGrid" },
				{ groupId: `${MAIN}.Collaborate`, tabId: MAIN, location: "HomepageGrid" },
			);
		const p = storePlan();
		expect(p.unsupported).toEqual([]);
		expect(p.hasChanges).toBe(true);
	});

	describe("#26 — moving a button that isn't yours moves a copy", () => {
		const COLLAB = `${MAIN}.Collaborate`;
		const src = (buttonId: string) => ({
			groupId: MGMT,
			buttonId,
			tabId: MAIN,
			location: "HomepageGrid" as const,
		});
		const collab = () =>
			useRibbonStore
				.getState()
				.ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === COLLAB)!;
		// The copy takes the active solution's publisher prefix.
		beforeEach(() =>
			useSessionStore.setState({ activeSolution: null, publisherPrefix: "cbs" }),
		);

		it("to another group: the original stays hidden in place, your copy moves, publish is allowed", () => {
			loadStore();
			const before = useRibbonStore.getState().past.length;
			useRibbonStore
				.getState()
				.moveButton(src(EDIT), { groupId: COLLAB, tabId: MAIN, location: "HomepageGrid" });
			const original = mgmt().buttons.find((b) => b.id === EDIT)!;
			expect(original.hidden).toBe(true);
			expect(mgmt().buttons.some((b) => b.id === `cbs.${EDIT}`)).toBe(false);
			expect(collab().buttons.map((b) => b.id)).toEqual([
				`Mscrm.HomepageGrid.${T}.Share`,
				`cbs.${EDIT}`,
			]);
			const p = storePlan();
			expect(p.unsupported).toEqual([]);
			expect(p.hasChanges).toBe(true);
			// Copy, hide and move are one undo step.
			expect(useRibbonStore.getState().past.length).toBe(before + 1);
			useRibbonStore.getState().undo();
			expect(mgmt().buttons.find((b) => b.id === EDIT)!.hidden).toBeFalsy();
			expect(collab().buttons.map((b) => b.id)).toEqual([`Mscrm.HomepageGrid.${T}.Share`]);
			expect(storePlan().hasChanges).toBe(false);
		});

		it("re-ordering in its own group moves the copy before the target", () => {
			loadStore();
			useRibbonStore.getState().moveButton(src(`Mscrm.HomepageGrid.${T}.Assign`), {
				groupId: MGMT,
				tabId: MAIN,
				location: "HomepageGrid",
				beforeButtonId: EDIT,
			});
			const ids = mgmt().buttons.map((b) => b.id);
			expect(ids.indexOf(`cbs.Mscrm.HomepageGrid.${T}.Assign`)).toBe(ids.indexOf(EDIT) - 1);
			expect(
				mgmt().buttons.find((b) => b.id === `Mscrm.HomepageGrid.${T}.Assign`)!.hidden,
			).toBe(true);
			expect(storePlan().unsupported).toEqual([]);
		});

		it("a drop in place changes nothing", () => {
			loadStore();
			const s = useRibbonStore.getState();
			s.moveButton(src(EDIT), {
				groupId: MGMT,
				tabId: MAIN,
				location: "HomepageGrid",
				beforeButtonId: EDIT,
			});
			s.moveButton(src(EDIT), {
				groupId: MGMT,
				tabId: MAIN,
				location: "HomepageGrid",
				beforeButtonId: `Mscrm.HomepageGrid.${T}.Delete`,
			});
			expect(useRibbonStore.getState().past).toHaveLength(0);
			expect(storePlan().hasChanges).toBe(false);
		});

		it("returns the id now at the target: the copy's, your own button's, or null", () => {
			loadStore();
			const s = useRibbonStore.getState();
			expect(
				s.moveButton(src(EDIT), { groupId: COLLAB, tabId: MAIN, location: "HomepageGrid" }),
			).toBe(`cbs.${EDIT}`);
			expect(
				s.moveButton(src("cbs.Mine"), {
					groupId: COLLAB,
					tabId: MAIN,
					location: "HomepageGrid",
				}),
			).toBe("cbs.Mine");
			expect(
				s.moveButton(src(EDIT), {
					groupId: MGMT,
					tabId: MAIN,
					location: "HomepageGrid",
					beforeButtonId: EDIT,
				}),
			).toBeNull();
		});

		it("a move to a missing group changes nothing (no copy, no hide, no history)", () => {
			loadStore();
			expect(
				useRibbonStore.getState().moveButton(src(EDIT), {
					groupId: "nope",
					tabId: MAIN,
					location: "HomepageGrid",
				}),
			).toBeNull();
			expect(useRibbonStore.getState().past).toHaveLength(0);
			expect(mgmt().buttons.find((b) => b.id === EDIT)!.hidden).toBeFalsy();
			expect(mgmt().buttons.some((b) => b.id === `cbs.${EDIT}`)).toBe(false);
		});

		it("the hidden original of a copy-move can't be moved again, nor copied to another ribbon", () => {
			loadStore({
				location: "Application",
				entityLogicalName: "",
				tabs: [
					{
						id: "Mscrm.BasicHomeTab",
						label: "Home",
						sequence: 10,
						tabDisplayRules: [],
						groups: [
							{
								id: "App.G",
								label: "G",
								sequence: 10,
								template: "Mscrm.Templates.Flexible2",
								buttons: [],
							},
						],
					},
				],
			} as RibbonDefinition);
			const s = useRibbonStore.getState();
			s.moveButton(src(EDIT), { groupId: COLLAB, tabId: MAIN, location: "HomepageGrid" });
			const before = useRibbonStore.getState().past.length;
			expect(
				s.moveButton(src(EDIT), { groupId: COLLAB, tabId: MAIN, location: "HomepageGrid" }),
			).toBeNull();
			expect(useRibbonStore.getState().past.length).toBe(before);
			expect(storePlan().unsupported).toEqual([]);
			expect(
				s.moveButton(src(`Mscrm.HomepageGrid.${T}.Delete`), {
					groupId: "App.G",
					tabId: "Mscrm.BasicHomeTab",
					location: "Application",
				}),
			).toBeNull();
			expect(useRibbonStore.getState().past.length).toBe(before);
			expect(useRibbonStore.getState().ribbons.Application.tabs[0].groups[0].buttons).toEqual(
				[],
			);
		});

		it("is judged by the loaded origin: an overridden OOB button isn't moved in place (review)", () => {
			loadStore();
			const s = useRibbonStore.getState();
			s.customizeOobButton("HomepageGrid", MAIN, MGMT, EDIT);
			const before = useRibbonStore.getState().past.length;
			expect(
				s.moveButton(src(EDIT), { groupId: COLLAB, tabId: MAIN, location: "HomepageGrid" }),
			).toBeNull();
			expect(useRibbonStore.getState().past.length).toBe(before);
			expect(collab().buttons.some((b) => b.id === EDIT)).toBe(false);
		});

		it("your own buttons still move in place, and flyouts are not copied", () => {
			loadStore();
			const s = useRibbonStore.getState();
			s.moveButton(src("cbs.Mine"), {
				groupId: COLLAB,
				tabId: MAIN,
				location: "HomepageGrid",
			});
			expect(collab().buttons.map((b) => b.id)).toContain("cbs.Mine");
			expect(collab().buttons.some((b) => b.id.startsWith("cbs.cbs."))).toBe(false);
			s.moveButton(src(`Mscrm.HomepageGrid.${T}.Flows`), {
				groupId: COLLAB,
				tabId: MAIN,
				location: "HomepageGrid",
			});
			expect(collab().buttons.map((b) => b.id)).toContain(`Mscrm.HomepageGrid.${T}.Flows`);
			expect(storePlan().unsupported).toEqual([
				expect.stringMatching(/^Moving or re-ordering "Flow"/),
			]);
		});
	});

	it("customising the button and its command together", async () => {
		loadStore();
		const id = useRibbonStore
			.getState()
			.customiseButton("HomepageGrid", MAIN, MGMT, `Mscrm.HomepageGrid.${T}.Delete`, "cbs");
		expect(id).toBeTruthy();
		useRibbonStore.getState().customiseCommand(DELETE);
		expect(storePlan().editedCommandIds).toEqual([DELETE]);
	});

	it("is refused for your own buttons, menus and hidden buttons, and ids stay unique", () => {
		loadStore();
		const s = useRibbonStore.getState();
		expect(s.customiseButton("HomepageGrid", MAIN, MGMT, "cbs.Mine", "cbs")).toBeNull();
		expect(
			s.customiseButton("HomepageGrid", MAIN, MGMT, `Mscrm.HomepageGrid.${T}.Flows`, "cbs"),
		).toBeNull();
		const first = s.customiseButton("HomepageGrid", MAIN, MGMT, EDIT, "cbs");
		expect(
			useRibbonStore.getState().customiseButton("HomepageGrid", MAIN, MGMT, EDIT, "cbs"),
		).toBeNull();
		// Undo the hide: customising again yields a second, distinct copy.
		useRibbonStore
			.getState()
			.setButtonProp("HomepageGrid", MAIN, MGMT, EDIT, { hidden: false });
		const second = useRibbonStore
			.getState()
			.customiseButton("HomepageGrid", MAIN, MGMT, EDIT, "cbs");
		expect(second).toBe(`${first}.2`);
	});

	it("the copy of a button with its own LocLabels keeps every language (#31 review)", async () => {
		loadStore();
		const THING = "msdyn.HomepageGrid.Thing";
		// A managed button whose texts are LocLabels of its solution.
		const thing: RibbonButton = {
			id: THING,
			label: "Thing",
			// Its label isn't loaded (below), so the canvas shows the id, as a load does.
			tooltipTitle: "msdyn.Thing.Tip",
			kind: "button",
			sequence: 30,
			templateAlias: "o1",
			commandId: "Mscrm.ShareSelectedRecord",
			hidden: false,
			oob: false,
			custom: false,
			managed: true,
			origin: "managed",
			source: {
				labelToken: "$LocLabels:msdyn.Thing.LabelText",
				tooltipTitleToken: "$LocLabels:msdyn.Thing.Tip",
				attributes: {
					Id: THING,
					Command: "Mscrm.ShareSelectedRecord",
					LabelText: "$LocLabels:msdyn.Thing.LabelText",
					ToolTipTitle: "$LocLabels:msdyn.Thing.Tip",
					Sequence: "30",
					TemplateAlias: "o1",
				},
			},
		};
		useRibbonStore.setState((s) => {
			const ribbons = JSON.parse(JSON.stringify(s.ribbons)) as typeof s.ribbons;
			ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === MGMT)!.buttons.push(thing);
			const baseline = JSON.parse(JSON.stringify(ribbons)) as typeof s.ribbons;
			const label = {
				id: "msdyn.Thing.LabelText",
				titles: [
					{ languageCode: 1033, description: "Thing" },
					{ languageCode: 1031, description: "Ding" },
				],
			};
			return {
				ribbons,
				baseline,
				locLabels: [...s.locLabels, label],
				baselineLocLabels: [...s.baselineLocLabels, label],
			};
		});
		useRuntimeLogStore.getState().clear();

		const id = useRibbonStore
			.getState()
			.customiseButton("HomepageGrid", MAIN, MGMT, THING, "cbs")!;
		const s = useRibbonStore.getState();
		expect(s.locLabels.find((l) => l.id === `${id}.LabelText`)?.titles).toEqual([
			{ languageCode: 1033, description: "Thing" },
			{ languageCode: 1031, description: "Ding" },
		]);
		// The tooltip's label isn't loaded — another solution defines it: the copy
		// keeps using it, not a label of its own reading the id (#137).
		expect(useRuntimeLogStore.getState().entries.at(-1)?.message).toContain(
			"$LocLabels:msdyn.Thing.Tip is defined by another solution",
		);
		expect(s.past.at(-1)?.detail).toContain("keeps another solution's labels");
		const copied = s.ribbons.HomepageGrid.tabs[0].groups
			.find((g) => g.id === MGMT)!
			.buttons.find((b) => b.id === id)!;
		expect(copied.source?.tooltipTitleToken).toBe("$LocLabels:msdyn.Thing.Tip");
		expect(copied.source?.labelToken).toBeUndefined();

		const p = storePlan();
		expect(p.unsupported).toEqual([]);
		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		const result = await buildMergedRibbonDiffXml({
			entity: { logicalName: T, schemaName: T },
			locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
			plan: p,
			languageCode: 1033,
		});
		const doc = new DOMParser().parseFromString(result.xml, "application/xml");
		const btn = Array.from(doc.querySelectorAll("CustomAction Button")).find(
			(b) => b.getAttribute("Id") === id,
		)!;
		expect(btn.getAttribute("LabelText")).toBe(`$LocLabels:${id}.LabelText`);
		const titles = Array.from(
			Array.from(doc.querySelectorAll("LocLabels > LocLabel"))
				.find((l) => l.getAttribute("Id") === `${id}.LabelText`)!
				.querySelectorAll("Title"),
		).map((t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`);
		expect(titles.sort()).toEqual(["1031=Ding", "1033=Thing"]);
		expect(btn.getAttribute("ToolTipTitle")).toBe("$LocLabels:msdyn.Thing.Tip");
		// The original's labels aren't touched.
		expect(ids(doc, "LocLabels > LocLabel")).not.toContain("msdyn.Thing.LabelText");
		expect(ids(doc, "LocLabels > LocLabel")).not.toContain("msdyn.Thing.Tip");
	});
});

describe("#137 — copies of controls whose labels another solution defines", () => {
	const OTHER = "msdyn.HomepageGrid.Other";
	// What a load shows for a label the session doesn't have: its id (#137).
	const other: RibbonButton = {
		id: OTHER,
		label: "msdyn.Other.LabelText",
		tooltipTitle: "msdyn.Other.Tip",
		kind: "button",
		sequence: 30,
		templateAlias: "o1",
		commandId: "Mscrm.ShareSelectedRecord",
		hidden: false,
		oob: false,
		custom: false,
		managed: true,
		origin: "managed",
		source: {
			labelToken: "$LocLabels:msdyn.Other.LabelText",
			tooltipTitleToken: "$LocLabels:msdyn.Other.Tip",
			attributes: {
				Id: OTHER,
				Command: "Mscrm.ShareSelectedRecord",
				LabelText: "$LocLabels:msdyn.Other.LabelText",
				ToolTipTitle: "$LocLabels:msdyn.Other.Tip",
				Sequence: "30",
				TemplateAlias: "o1",
			},
		},
	};

	function loadWithOther() {
		loadStore();
		useRibbonStore.setState((s) => {
			const ribbons = JSON.parse(JSON.stringify(s.ribbons)) as typeof s.ribbons;
			ribbons.HomepageGrid.tabs[0].groups.find((g) => g.id === MGMT)!.buttons.push(other);
			return { ribbons, baseline: JSON.parse(JSON.stringify(ribbons)) as typeof s.ribbons };
		});
	}

	async function published() {
		const s = useRibbonStore.getState();
		const { buildMergedRibbonDiffXml } = await import("@/services/dataverse/publishService");
		const result = await buildMergedRibbonDiffXml({
			entity: { logicalName: T, schemaName: T },
			locations: [{ current: s.ribbons.HomepageGrid, baseline: s.baseline.HomepageGrid }],
			commands: s.commands,
			enableRules: s.enableRules,
			displayRules: s.displayRules,
			locLabels: s.locLabels,
			plan: storePlan(),
			languageCode: 1033,
		});
		return new DOMParser().parseFromString(result.xml, "application/xml");
	}
	const buttonIn = (doc: Document, id: string) =>
		Array.from(doc.querySelectorAll("CustomAction Button")).find(
			(b) => b.getAttribute("Id") === id,
		)!;
	const copies = (prefix: string) =>
		useRibbonStore
			.getState()
			.ribbons.HomepageGrid.tabs[0].groups.flatMap((g) => g.buttons)
			.filter((b) => b.id.includes(prefix));

	it("Duplicate button keeps the labels and their text, with no label of its own", async () => {
		loadWithOther();
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, MGMT, OTHER);
		const [copy] = copies(`${OTHER}_copy_`);
		expect(copy.source?.labelToken).toBe("$LocLabels:msdyn.Other.LabelText");
		expect(copy.source?.tooltipTitleToken).toBe("$LocLabels:msdyn.Other.Tip");
		// No " (copy)" suffix: it would become a label of the copy's own reading the id.
		expect(copy.label).toBe("msdyn.Other.LabelText");

		const doc = await published();
		expect(buttonIn(doc, copy.id).getAttribute("LabelText")).toBe(
			"$LocLabels:msdyn.Other.LabelText",
		);
		expect(buttonIn(doc, copy.id).getAttribute("ToolTipTitle")).toBe(
			"$LocLabels:msdyn.Other.Tip",
		);
		// Neither the other solution's labels nor new ones reading their ids.
		expect(ids(doc, "LocLabels > LocLabel").filter((id) => id?.includes("Other"))).toEqual([]);
	});

	it("Duplicate group keeps them on the copied buttons", async () => {
		loadWithOther();
		useRibbonStore.getState().duplicateGroup("HomepageGrid", MAIN, MGMT);
		const copy = copies(`${OTHER}_copy_`)[0];
		expect(copy.source?.labelToken).toBe("$LocLabels:msdyn.Other.LabelText");
		const doc = await published();
		expect(buttonIn(doc, copy.id).getAttribute("LabelText")).toBe(
			"$LocLabels:msdyn.Other.LabelText",
		);
		expect(ids(doc, "LocLabels > LocLabel").filter((id) => id?.includes("Other"))).toEqual([]);
	});

	it("an edited text gets a label of the copy's own; the shared one is never written", async () => {
		loadWithOther();
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, MGMT, OTHER);
		const [copy] = copies(`${OTHER}_copy_`);
		useRibbonStore
			.getState()
			.setButtonProp("HomepageGrid", MAIN, MGMT, copy.id, { label: "Book it" });
		const doc = await published();
		expect(buttonIn(doc, copy.id).getAttribute("LabelText")).toBe(
			`$LocLabels:${copy.id}.LabelText`,
		);
		expect(buttonIn(doc, copy.id).getAttribute("ToolTipTitle")).toBe(
			"$LocLabels:msdyn.Other.Tip",
		);
		const labels = ids(doc, "LocLabels > LocLabel");
		expect(labels).toContain(`${copy.id}.LabelText`);
		expect(labels).not.toContain("msdyn.Other.LabelText");
	});

	it("Translations target the label the copy publishes to, never the shared one (#137 review)", async () => {
		loadWithOther();
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, MGMT, OTHER);
		const [copy] = copies(`${OTHER}_copy_`);
		const target = () => {
			const c = copies(`${OTHER}_copy_`)[0];
			const s = useRibbonStore.getState();
			return textLabelId(
				c.source?.labelToken,
				buttonLabelId(c.id),
				c.label,
				s.locLabels,
				s.baseLanguageCode,
			);
		};
		// Unchanged: the shared label isn't edited.
		expect(target()).toBeNull();
		// Its text edited: the copy's own label, which the translation joins.
		useRibbonStore
			.getState()
			.setButtonProp("HomepageGrid", MAIN, MGMT, copy.id, { label: "Book it" });
		expect(target()).toBe(`${copy.id}.LabelText`);
		useRibbonStore.getState().upsertLocLabel({
			id: target()!,
			titles: [{ languageCode: 1036, description: "Réserver" }],
		});
		const doc = await published();
		expect(buttonIn(doc, copy.id).getAttribute("LabelText")).toBe(
			`$LocLabels:${copy.id}.LabelText`,
		);
		const titles = Array.from(
			Array.from(doc.querySelectorAll("LocLabels > LocLabel"))
				.find((l) => l.getAttribute("Id") === `${copy.id}.LabelText`)!
				.querySelectorAll("Title"),
		).map((t) => `${t.getAttribute("languagecode")}=${t.getAttribute("description")}`);
		expect(titles.sort()).toEqual(["1033=Book it", "1036=Réserver"]);
		expect(ids(doc, "LocLabels > LocLabel")).not.toContain("msdyn.Other.LabelText");
	});

	it("while a layer is unread, copies keep no label token: it could be one of yours (#137 review)", () => {
		loadWithOther();
		useRibbonStore.setState({ labelsUnknown: true });
		useRibbonStore.getState().duplicateButton("HomepageGrid", MAIN, MGMT, OTHER);
		const [copy] = copies(`${OTHER}_copy_`);
		expect(copy.source?.labelToken).toBeUndefined();
		expect(copy.label).toBe("msdyn.Other.LabelText (copy)");
		const id = useRibbonStore
			.getState()
			.customiseButton("HomepageGrid", MAIN, MGMT, OTHER, "cbs")!;
		const customised = copies(id)[0];
		expect(customised.source?.tooltipTitleToken).toBeUndefined();
	});

	it("a menu item's label from another solution is kept too; a loaded one isn't", () => {
		const item = (id: string, token: string): RibbonButton => ({
			...other,
			id,
			label: token.slice("$LocLabels:".length),
			source: { labelToken: token, attributes: { Id: id, LabelText: token } },
		});
		const flyout: RibbonButton = {
			...other,
			id: "msdyn.Fly",
			kind: "flyout",
			menu: {
				id: "msdyn.Fly.Menu",
				sections: [
					{
						id: "msdyn.Fly.Menu.S",
						sequence: 10,
						controlsId: "msdyn.Fly.Menu.S.Controls",
						controls: [
							item("msdyn.Fly.A", "$LocLabels:msdyn.A.LabelText"),
							item("msdyn.Fly.B", "$LocLabels:mine.B.LabelText"),
						],
					},
				],
			},
		};
		const copy = copyControl(flyout, "cbs.Fly2", new Set(["mine.B.LabelText"]));
		const [a, b] = copy.menu!.sections[0].controls;
		expect(a.source?.labelToken).toBe("$LocLabels:msdyn.A.LabelText");
		expect(b.source?.labelToken).toBeUndefined();
		// Without the session's labels (as before #137), none is kept.
		expect(copyControl(flyout, "cbs.Fly3").source?.labelToken).toBeUndefined();
	});
});
