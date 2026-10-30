/**
 * #16 — restoring unsaved changes from a previous session.
 *
 * A restored draft must be equivalent to the session that saved it: on top of
 * a fresh load (the baseline), it yields the same publish plan.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseRibbonXml } from "@/services/xmlParser";
import { partsFromRibbonTables, ownControlIds } from "@/services/ribbonDiffMerge";
import {
	layerSnapshotFromParts,
	locLabelsFromParts,
} from "@/services/dataverse/ribbonLayerService";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { planScope } from "@/services/publishPlan";
import { useRibbonStore, workspaceOf } from "@/store/ribbonStore";
import { useDraftStore, installDraftAutosave } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";
import {
	DRAFT_FORMAT,
	discardOutdatedDrafts,
	draftStorageKey,
	draftWorkspace,
	readDraft,
	type DraftKey,
} from "@/services/ribbonDraft";
import { groupControls } from "@/utils/ribbonMenu";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const MGMT = `${MAIN}.Management`;
const COLLAB = `${MAIN}.Collaborate`;
const DELETE = "Mscrm.DeleteSelectedRecord";
const ASSIGN = "Mscrm.AssignSelectedRecord";
const HIDDEN = `Mscrm.HomepageGrid.${T}.MergeRecords`;

const ASSIGN_XML = `<CommandDefinition Id="${ASSIGN}"><EnableRules><EnableRule Id="Mscrm.SelectionCountAtLeastOne"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="Cbs.assign" Library="$webresource:cbs_/assign.js"/></Actions></CommandDefinition>`;
const MINE_XML = `<CommandDefinition Id="cbs.Mine.Command"><EnableRules><EnableRule Id="cbs.Shared.Rule"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="Cbs.mine" Library="$webresource:cbs_/mine.js"/></Actions></CommandDefinition>`;

/** RetrieveEntityRibbon as the server returns it; `extra` is a button added on the server later. */
const merged = (extra = "") => `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10">
    <Groups Id="${MAIN}.Groups">
      <Group Id="${MGMT}" Sequence="10" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${MGMT}.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="$Resources:Ribbon.HomepageGrid.Edit" ModernImage="Edit" TemplateAlias="o1" />
          <Button Id="Mscrm.HomepageGrid.${T}.Delete" Command="${DELETE}" Sequence="30" LabelText="$Resources:Ribbon.HomepageGrid.Delete" ModernImage="Remove" TemplateAlias="o1" />
          <Button Id="Mscrm.HomepageGrid.${T}.Assign" Command="${ASSIGN}" Sequence="40" LabelText="$Resources:Ribbon.HomepageGrid.Assign" TemplateAlias="o1" />
          <Button Id="cbs.Mine" Command="cbs.Mine.Command" Sequence="900" LabelText="$LocLabels:cbs.Mine.LabelText" TemplateAlias="o1" />
          <Button Id="cbs.Mine2" Command="cbs.Mine.Command" Sequence="910" LabelText="Mine 2" TemplateAlias="o1" />
          ${extra}
        </Controls>
      </Group>
      <Group Id="${COLLAB}" Sequence="20" Template="Mscrm.Templates.Flexible2">
        <Controls Id="${COLLAB}.Controls">
          <Button Id="Mscrm.HomepageGrid.${T}.Share" Command="Mscrm.ShareSelectedRecord" Sequence="10" LabelText="$Resources:Ribbon.HomepageGrid.Share" TemplateAlias="o1" />
        </Controls>
      </Group>
    </Groups>
  </Tab>
</Tabs></Ribbon></UI>
<CommandDefinitions>
  <CommandDefinition Id="${DELETE}"><EnableRules><EnableRule Id="Mscrm.SelectionCountAtLeastOne"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Delete.deleteSelectedRecord" Library="$webresource:Main_system_library.js"><CrmParameter Value="SelectedControl"/></JavaScriptFunction></Actions></CommandDefinition>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules><EnableRule Id="Mscrm.SelectionCountAtLeastOne"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Open.openSelectedRecord" Library="$webresource:Main_system_library.js"/></Actions></CommandDefinition>
  <CommandDefinition Id="Mscrm.ShareSelectedRecord"><EnableRules><EnableRule Id="Mscrm.SelectionCountAtLeastOne"/></EnableRules><DisplayRules/><Actions><JavaScriptFunction FunctionName="XrmCore.Commands.Share.shareSelectedRecords" Library="$webresource:Main_system_library.js"/></Actions></CommandDefinition>
  ${ASSIGN_XML}
  ${MINE_XML}
</CommandDefinitions>
<RuleDefinitions>
  <TabDisplayRules/>
  <DisplayRules/>
  <EnableRules>
    <EnableRule Id="Mscrm.SelectionCountAtLeastOne"><SelectionCountRule AppliesTo="SelectedEntity" Minimum="1"/></EnableRule>
    <EnableRule Id="cbs.Shared.Rule"><CustomRule FunctionName="Cbs.enabled" Library="$webresource:cbs_/mine.js"/></EnableRule>
  </EnableRules>
</RuleDefinitions>
</RibbonDefinition></RibbonDefinitions>`;

const ca = (id: string, seq: number, inner: string) =>
	`<CustomAction Id="${id}" Location="${MGMT}.Controls._children" Sequence="${seq}"><CommandUIDefinition>${inner}</CommandUIDefinition></CustomAction>`;

/** The table's unmanaged layer: your two buttons, their label and command, a customised command and a hide. */
const layerParts = () =>
	partsFromRibbonTables({
		diffs: [
			{
				difftype: 0,
				rdx: ca(
					"cbs.Mine.CustomAction",
					900,
					`<Button Id="cbs.Mine" Command="cbs.Mine.Command" Sequence="900" LabelText="$LocLabels:cbs.Mine.LabelText" TemplateAlias="o1" />`,
				),
			},
			{
				difftype: 0,
				rdx: ca(
					"cbs.Mine2.CustomAction",
					910,
					`<Button Id="cbs.Mine2" Command="cbs.Mine.Command" Sequence="910" LabelText="Mine 2" TemplateAlias="o1" />`,
				),
			},
			{
				difftype: 0,
				rdx: `<HideCustomAction HideActionId="cbs.Hide.Merge" Location="${HIDDEN}" />`,
			},
			{
				difftype: 3,
				rdx: `<LocLabel Id="cbs.Mine.LabelText"><Titles><Title languagecode="1033" description="Mine"/><Title languagecode="1036" description="Le mien"/></Titles></LocLabel>`,
			},
		],
		commands: [
			{ command: ASSIGN, commanddefinition: ASSIGN_XML },
			{ command: "cbs.Mine.Command", commanddefinition: MINE_XML },
		],
		rules: [
			{
				ruleid: "cbs.Shared.Rule",
				ruletype: 1,
				ruledefinition: `<EnableRule Id="cbs.Shared.Rule"><CustomRule FunctionName="Cbs.enabled" Library="$webresource:cbs_/mine.js" /></EnableRule>`,
			},
		],
	});

const ORG = "https://contoso.crm.dynamics.com/";
const SOLUTION_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SOLUTION_B = "bbbbbbbb-0000-0000-0000-000000000002";
const KEY: DraftKey = { orgUrl: ORG, solutionId: SOLUTION_A, entityLogicalName: T };

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});
const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

const store = () => useRibbonStore.getState();
const drafts = () => useDraftStore.getState();
/** The workspace the stored draft rebuilds over the loaded ribbon. */
const savedWorkspace = () => draftWorkspace(readDraft(KEY)!, store());

/**
 * A fresh load of the table, as App does it: the load starts, the workspace
 * is seeded from the server, then the draft (if any) is offered.
 */
function freshLoad(
	key: DraftKey = KEY,
	extraServerButton = "",
	server: { without?: string; mutate?: (ribbon: RibbonDefinition) => void } = {},
) {
	drafts().beginLoad();
	const parts = layerParts();
	const labels = locLabelsFromParts(parts);
	let xml = merged(extraServerButton);
	// A button removed on the server since.
	if (server.without) xml = xml.replace(new RegExp(`<Button Id="${server.without}"[^>]*/>`), "");
	const parsed = parseRibbonXml(xml, "HomepageGrid", T, labels);
	applyLayerOwnership(parsed.ribbon, ownControlIds(parts));
	server.mutate?.(parsed.ribbon);
	store().loadWorkspace({
		ribbons: {
			HomepageGrid: parsed.ribbon,
			SubGrid: empty("SubGrid"),
			Form: empty("Form"),
			Application: empty("Application"),
		},
		commands: parsed.commands,
		displayRules: parsed.displayRules,
		enableRules: parsed.enableRules,
		locLabels: labels,
		layers: { entity: layerSnapshotFromParts(parts), application: null },
	});
	drafts().workspaceLoaded(key);
}

/** The publish plans of both scopes, as the publish dialog builds them. */
function plans() {
	const s = store();
	const planFor = (
		locations: RibbonLocation[],
		scope: "entity" | "application",
		excludeCommandIds?: Set<string>,
	) =>
		planScope({
			locations: locations.map((l) => ({ current: s.ribbons[l], baseline: s.baseline[l] })),
			excludeCommandIds,
			locLabels: s.locLabels,
			baselineLocLabels: s.baselineLocLabels,
			layer: s.layers[scope] ?? undefined,
			unhiddenLayerHideIds: s.pendingUnhides[scope],
			customisedCommandIds: s.customisedCommandIds,
			uncustomisedCommandIds: s.uncustomisedCommandIds[scope],
			commands: s.commands,
			baselineCommands: s.baselineCommands,
			enableRules: s.enableRules,
			baselineEnableRules: s.baselineEnableRules,
			displayRules: s.displayRules,
			baselineDisplayRules: s.baselineDisplayRules,
		});
	const tableCommands = new Set<string>();
	for (const l of ENTITY_LOCATIONS)
		for (const tab of s.ribbons[l].tabs)
			for (const group of tab.groups)
				for (const button of groupControls(group))
					if (button.commandId) tableCommands.add(button.commandId);
	return {
		entity: planFor(ENTITY_LOCATIONS, "entity"),
		application: planFor(["Application"], "application", tableCommands),
	};
}

/** Edit → saved draft → a new session loads the table → restore: the same plan and workspace. */
function expectRoundTrip(edit: () => void) {
	freshLoad();
	edit();
	const before = { plans: plans(), workspace: JSON.parse(JSON.stringify(workspaceOf(store()))) };
	expect(before.plans.entity.hasChanges).toBe(true);
	expect(readDraft(KEY)).not.toBeNull();

	// A new session: nothing loaded, then the table loads from the server.
	freshLoad();
	expect(drafts().pending).not.toBeNull();
	expect(plans().entity.hasChanges).toBe(false);

	expect(drafts().restoreDraft()).toBe(true);
	expect(drafts().pending).toBeNull();
	expect(plans()).toEqual(before.plans);
	expect(workspaceOf(store())).toEqual(before.workspace);
	expect(store().mutationsSincePublish).toBeGreaterThan(0);
	// The restored workspace is the draft now (saved again for the next session).
	expect(savedWorkspace()).toEqual(before.workspace);
	return before.plans;
}

const entity = (logicalName: string): EntityMetadata => ({
	metadataId: `md-${logicalName}`,
	logicalName,
	displayName: logicalName,
	isCustomEntity: true,
	isIntersect: false,
});
const solution = (id: string, uniqueName: string): Solution =>
	({
		id,
		uniqueName,
		friendlyName: uniqueName,
		version: "1.0.0.0",
		isManaged: false,
		publisherId: "p",
		publisherUniqueName: "cbs",
		publisherName: "CBS",
		publisherPrefix: "cbs",
	}) as Solution;

let unsubscribe: () => void;

beforeEach(() => {
	localStorage.clear();
	useDraftStore.setState({
		target: null,
		pending: null,
		pendingBaselineChanged: false,
		pendingSwitch: null,
		saveFailed: false,
		lastSavedAt: null,
		restoreError: null,
	});
	useSessionStore.setState({
		connectionUrl: ORG,
		activeSolution: solution(SOLUTION_A, "SolutionA"),
		activeEntity: entity(T),
	});
	unsubscribe = installDraftAutosave();
});

afterEach(() => {
	unsubscribe();
});

describe("#16 — a restored draft publishes what the session that saved it would have", () => {
	it("a new button with a new command and rule", () => {
		const p = expectRoundTrip(() => {
			store().upsertEnableRule({
				id: "cbs.New.Rule",
				steps: [{ kind: "SelectionCountRule", minimum: 1 }],
			});
			store().upsertCommand({
				id: "cbs.New.Command",
				actions: [
					{
						kind: "javascript",
						library: "$webresource:cbs_/new.js",
						functionName: "Cbs.go",
						params: [],
					},
				],
				enableRules: ["cbs.New.Rule"],
				displayRules: [],
			});
			store().createButton({
				location: "HomepageGrid",
				tabId: MAIN,
				groupId: MGMT,
				button: {
					id: "cbs.New",
					label: "New one",
					kind: "button",
					templateAlias: "o1",
					commandId: "cbs.New.Command",
					hidden: false,
					oob: false,
					custom: true,
					managed: false,
				},
			});
		});
		expect(p.entity.editedCommandIds).toContain("cbs.New.Command");
		expect(p.entity.editedEnableRuleIds).toContain("cbs.New.Rule");
	});

	it("an edited out-of-the-box command", () => {
		const p = expectRoundTrip(() => {
			expect(store().customiseCommand(DELETE)).toBe(true);
			const cmd = store().commands.find((c) => c.id === DELETE)!;
			store().upsertCommand({
				...cmd,
				actions: [
					...cmd.actions,
					{
						kind: "javascript",
						library: "$webresource:cbs_/audit.js",
						functionName: "Cbs.audit",
						params: [],
					},
				],
			});
		});
		expect(p.entity.editedCommandIds).toEqual([DELETE]);
	});

	it("an out-of-the-box command customised without other edits", () => {
		const p = expectRoundTrip(() => {
			expect(store().customiseCommand(DELETE)).toBe(true);
		});
		expect(p.entity.editedCommandIds).toEqual([DELETE]);
	});

	it("an edited rule", () => {
		const p = expectRoundTrip(() => {
			const rule = store().enableRules.find((r) => r.id === "cbs.Shared.Rule")!;
			store().upsertEnableRule({
				...rule,
				steps: [...rule.steps, { kind: "SelectionCountRule", minimum: 1 }],
			});
		});
		expect(p.entity.editedEnableRuleIds).toEqual(["cbs.Shared.Rule"]);
	});

	it("a label edit: button text and a translation", () => {
		const p = expectRoundTrip(() => {
			store().upsertLocLabel({
				id: "cbs.Mine.LabelText",
				titles: [
					{ languageCode: 1033, description: "Mine" },
					{ languageCode: 1036, description: "À moi" },
				],
			});
			store().setButtonProp("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`, {
				label: "Share it",
			});
		});
		expect(p.entity.editedLocLabelIds).toEqual(["cbs.Mine.LabelText"]);
	});

	it("hiding a button and un-hiding one the layer hides", () => {
		const p = expectRoundTrip(() => {
			store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
			store().setLayerHideUnhidden("entity", HIDDEN, true);
		});
		expect(p.entity.unhiddenButtonIds).toEqual([HIDDEN]);
		expect(store().pendingUnhides.entity).toEqual([HIDDEN]);
	});

	it("deleting your own button", () => {
		const p = expectRoundTrip(() => {
			store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		});
		expect(p.entity.deletedButtonIds).toEqual(["cbs.Mine2"]);
	});

	it("moving your own button", () => {
		const p = expectRoundTrip(() => {
			store().moveButton(
				{ location: "HomepageGrid", tabId: MAIN, groupId: MGMT, buttonId: "cbs.Mine" },
				{ location: "HomepageGrid", tabId: MAIN, groupId: COLLAB },
			);
		});
		expect(p.entity.movedButtons.map((m) => [m.id, m.groupId])).toEqual([["cbs.Mine", COLLAB]]);
	});

	it("customising a button and uncustomising a command", () => {
		const p = expectRoundTrip(() => {
			expect(
				store().customiseButton(
					"HomepageGrid",
					MAIN,
					MGMT,
					`Mscrm.HomepageGrid.${T}.Edit`,
					"cbs",
				),
			).toBe(`cbs.Mscrm.HomepageGrid.${T}.Edit`);
			store().uncustomiseCommand(ASSIGN, "entity");
		});
		expect(p.entity.uncustomisedCommandIds).toEqual([ASSIGN]);
		expect(store().uncustomisedCommandIds.entity).toEqual([ASSIGN]);
	});

	it("restoring is one undo step back to the loaded ribbon", () => {
		expectRoundTrip(() => {
			store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
			store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		});
		store().undo();
		expect(plans().entity.hasChanges).toBe(false);
		expect(store().mutationsSincePublish).toBe(0);
	});
});

describe("#16 — when a draft is offered, saved and removed", () => {
	it("a Restore clicked while the table is loading does nothing; the draft is offered once it has loaded", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const expected = plans();

		// A new session: the table is loading.
		drafts().beginLoad();
		expect(drafts().pending).toBeNull();
		expect(drafts().restoreDraft()).toBe(false);
		// The draft is still saved.
		expect(readDraft(KEY)).not.toBeNull();

		// The load finishes (it would have overwritten an early restore).
		freshLoad();
		expect(drafts().pending).not.toBeNull();
		expect(drafts().restoreDraft()).toBe(true);
		expect(plans()).toEqual(expected);
	});

	it("a load never removes the saved draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad();
		freshLoad();
		expect(readDraft(KEY)).not.toBeNull();
		expect(drafts().pending).not.toBeNull();
	});

	it("editing before Restore / Discard leaves the earlier draft alone; Discard then saves the new edits", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const saved = readDraft(KEY)!;

		freshLoad();
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		expect(readDraft(KEY)?.delta).toEqual(saved.delta);
		store().undo();
		expect(readDraft(KEY)?.delta).toEqual(saved.delta);
		store().redo();

		drafts().discardDraft();
		expect(drafts().pending).toBeNull();
		const now = readDraft(KEY)!;
		expect(draftWorkspace(now, store())).toEqual(
			JSON.parse(JSON.stringify(workspaceOf(store()))),
		);
		expect(plans().entity.deletedButtonIds).toEqual([]);
	});

	it("Discard with no edits removes the draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad();
		drafts().discardDraft();
		expect(readDraft(KEY)).toBeNull();
		freshLoad();
		expect(drafts().pending).toBeNull();
	});

	it("the draft mirrors the workspace: undoing back to the loaded ribbon removes it, redo saves it again", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		expect(readDraft(KEY)).not.toBeNull();
		store().undo();
		expect(readDraft(KEY)).toBeNull();
		store().redo();
		expect(readDraft(KEY)).not.toBeNull();
	});

	it("a publish of everything removes the draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		store().markPublished();
		expect(store().mutationsSincePublish).toBe(0);
		expect(readDraft(KEY)).toBeNull();
	});

	it("a draft of another solution, org or table is not offered", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad({ ...KEY, solutionId: SOLUTION_B });
		expect(drafts().pending).toBeNull();
		freshLoad({ ...KEY, orgUrl: "https://fabrikam.crm.dynamics.com" });
		expect(drafts().pending).toBeNull();
		// The same org written differently is the same draft.
		freshLoad({ ...KEY, orgUrl: "https://CONTOSO.crm.dynamics.com" });
		expect(drafts().pending).not.toBeNull();
	});

	it("drafts of an older format are discarded", () => {
		localStorage.setItem(
			`cbs:ribbon:https___contoso.crm.dynamics.com:${T}`,
			JSON.stringify({ ribbons: {}, commands: [], savedAt: "2026-01-01T00:00:00Z" }),
		);
		// A draft of the first #16 format (the whole workspace, uncompressed) too.
		localStorage.setItem(
			`cbs:draft:v2:https%3A%2F%2Fcontoso.crm.dynamics.com:${SOLUTION_A}:${T}`,
			"{}",
		);
		expect(discardOutdatedDrafts()).toBe(2);
		expect(localStorage.length).toBe(0);

		localStorage.setItem(
			draftStorageKey(KEY),
			JSON.stringify({ format: DRAFT_FORMAT - 1, key: KEY, workspace: {} }),
		);
		freshLoad();
		expect(drafts().pending).toBeNull();
		expect(localStorage.getItem(draftStorageKey(KEY))).toBeNull();
	});

	it("a draft that fails to restore stays offered, with the error, and isn't overwritten", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const saved = readDraft(KEY)!;
		freshLoad();
		// Well-formed outside, broken inside.
		const broken = {
			...drafts().pending!,
			delta: {
				...drafts().pending!.delta,
				lists: {
					...drafts().pending!.delta.lists,
					commands: { set: [null], drop: [], add: [] },
				},
			},
		};
		useDraftStore.setState({ pending: broken });
		const before = JSON.stringify(workspaceOf(store()));

		expect(drafts().restoreDraft()).toBe(false);
		expect(drafts().pending).toBe(broken);
		expect(drafts().restoreError).toBeTruthy();
		expect(JSON.stringify(workspaceOf(store()))).toBe(before);
		// The stored draft is untouched by later changes until it is discarded.
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		expect(readDraft(KEY)?.delta).toEqual(saved.delta);

		drafts().discardDraft();
		expect(drafts().pending).toBeNull();
		expect(drafts().restoreError).toBeNull();
	});

	it("a damaged draft is not offered", () => {
		localStorage.setItem(draftStorageKey(KEY), "{not json");
		freshLoad();
		expect(drafts().pending).toBeNull();
	});

	it("says so when the table's ribbon changed on the server since the draft was saved", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad();
		expect(drafts().pendingBaselineChanged).toBe(false);
		freshLoad(
			KEY,
			`<Button Id="other.Button" Command="${DELETE}" Sequence="950" LabelText="Other" TemplateAlias="o1" />`,
		);
		expect(drafts().pendingBaselineChanged).toBe(true);
	});

	it("only the changes are restored: what the server added since is kept", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad(
			KEY,
			`<Button Id="other.Button" Command="${DELETE}" Sequence="950" LabelText="Other" TemplateAlias="o1" />`,
		);
		expect(drafts().restoreDraft()).toBe(true);
		const ids = store().ribbons.HomepageGrid.tabs[0].groups[0].buttons.map((b) => b.id);
		expect(ids).toContain("other.Button");
		expect(ids).not.toContain("cbs.Mine2");
		expect(plans().entity.deletedButtonIds).toEqual(["cbs.Mine2"]);
		expect(plans().entity.unsupported).toEqual([]);
	});

	it("a failed table publish keeps the draft of command and translation edits", () => {
		freshLoad();
		const cmd = store().commands.find((c) => c.id === "cbs.Mine.Command")!;
		store().upsertCommand({
			...cmd,
			actions: [
				...cmd.actions,
				{
					kind: "javascript",
					library: "$webresource:cbs_/b.js",
					functionName: "Cbs.b",
					params: [],
				},
			],
		});
		store().upsertLocLabel({
			id: "cbs.Mine.LabelText",
			titles: [
				{ languageCode: 1033, description: "Mine" },
				{ languageCode: 1036, description: "À moi" },
			],
		});
		// The table import failed; the application ribbon had nothing to publish.
		store().markPublished(["Application"]);
		expect(plans().entity.hasChanges).toBe(true);
		expect(store().mutationsSincePublish).toBeGreaterThan(0);
		expect(readDraft(KEY)).not.toBeNull();
		drafts().requestEntitySwitch(entity("account"));
		expect(drafts().pendingSwitch).not.toBeNull();
	});

	it("a button added by the draft that the server has since is restored once, not twice", () => {
		freshLoad();
		store().createButton({
			location: "HomepageGrid",
			tabId: MAIN,
			groupId: MGMT,
			button: {
				id: "cbs.New",
				label: "New one",
				kind: "button",
				templateAlias: "o1",
				commandId: "cbs.Mine.Command",
				hidden: false,
				oob: false,
				custom: true,
				managed: false,
			},
		});
		freshLoad(
			KEY,
			`<Button Id="cbs.New" Command="cbs.Mine.Command" Sequence="990" LabelText="New one" TemplateAlias="o1" />`,
		);
		drafts().restoreDraft();
		const ids = store().ribbons.HomepageGrid.tabs[0].groups[0].buttons.map((b) => b.id);
		expect(ids.filter((id) => id === "cbs.New")).toHaveLength(1);
	});

	it("a changed item the server removed since is kept, as the user left it", () => {
		freshLoad();
		store().setButtonProp("HomepageGrid", MAIN, MGMT, "cbs.Mine2", { label: "Mine two" });
		freshLoad(KEY, "", { without: "cbs.Mine2" });
		drafts().restoreDraft();
		const mine2 = store().ribbons.HomepageGrid.tabs[0].groups[0].buttons.find(
			(b) => b.id === "cbs.Mine2",
		);
		expect(mine2?.label).toBe("Mine two");
	});

	it("restoring a draft the server already has changes nothing", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad(KEY, "", { without: "cbs.Mine2" });
		const past = store().past.length;
		drafts().restoreDraft();
		expect(store().mutationsSincePublish).toBe(0);
		expect(store().past.length).toBe(past);
		expect(readDraft(KEY)).toBeNull();
	});

	it("location settings the draft didn't change come from the fresh load", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const scaling = {
			[MAIN]: {
				tabId: MAIN,
				maxSizes: [
					{ id: `${MAIN}.MaxSize`, groupId: MGMT, sequence: 10, size: "LargeLarge" },
				],
				scales: [],
			},
		};
		freshLoad(KEY, "", { mutate: (r) => (r.scalingByTab = scaling as never) });
		drafts().restoreDraft();
		expect(store().ribbons.HomepageGrid.scalingByTab).toEqual(scaling);
		expect(plans().entity.deletedButtonIds).toEqual(["cbs.Mine2"]);
	});

	it("undoing a restore keeps the draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad();
		drafts().restoreDraft();
		store().undo();
		expect(store().mutationsSincePublish).toBe(0);
		expect(readDraft(KEY)).not.toBeNull();
		store().redo();
		expect(readDraft(KEY)).not.toBeNull();
		// A new edit after the undo is what the draft holds then.
		store().undo();
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		expect(savedWorkspace()).toEqual(JSON.parse(JSON.stringify(workspaceOf(store()))));
	});

	it("a publish after undoing a restore deletes the draft; a redo saves it again (#129)", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		freshLoad();
		drafts().restoreDraft();
		store().undo();
		expect(readDraft(KEY)).not.toBeNull();
		store().markPublished();
		expect(readDraft(KEY)).toBeNull();
		// The undone restore is still redoable, and its changes are a draft again.
		store().redo();
		expect(store().mutationsSincePublish).toBeGreaterThan(0);
		expect(readDraft(KEY)).not.toBeNull();
	});

	it("drafts older than 30 days are discarded", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const k = draftStorageKey(KEY);
		const stored = JSON.parse(localStorage.getItem(k)!);
		localStorage.setItem(
			k,
			JSON.stringify({
				...stored,
				savedAt: new Date(Date.now() - 31 * 86_400_000).toISOString(),
			}),
		);
		const recent = draftStorageKey({ ...KEY, entityLogicalName: "account" });
		localStorage.setItem(
			recent,
			JSON.stringify({
				...stored,
				savedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
			}),
		);
		expect(discardOutdatedDrafts()).toBe(1);
		expect(localStorage.getItem(k)).toBeNull();
		expect(localStorage.getItem(recent)).not.toBeNull();
	});

	it("nothing is saved while no table is loaded", () => {
		freshLoad();
		drafts().beginLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		expect(readDraft(KEY)).toBeNull();
	});
});

describe("#16 — switching table or solution with unpublished changes", () => {
	it("switches at once when nothing is unpublished", () => {
		freshLoad();
		drafts().requestEntitySwitch(entity("account"));
		expect(drafts().pendingSwitch).toBeNull();
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe("account");
	});

	it("asks first; Cancel leaves everything as it is", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		drafts().requestEntitySwitch(entity("account"));
		expect(drafts().pendingSwitch).toEqual({ kind: "entity", entity: entity("account") });
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);

		drafts().resolveSwitch("cancel");
		expect(drafts().pendingSwitch).toBeNull();
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);
		expect(plans().entity.deletedButtonIds).toEqual(["cbs.Mine2"]);
		expect(readDraft(KEY)).not.toBeNull();
	});

	it("Keep as draft switches and offers the changes again when the table is reopened", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const expected = plans();
		drafts().requestEntitySwitch(entity("account"));
		drafts().resolveSwitch("keep");
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe("account");
		expect(readDraft(KEY)).not.toBeNull();
		// The workspace left behind no longer has the changes.
		expect(store().mutationsSincePublish).toBe(0);

		useSessionStore.setState({ activeEntity: entity(T) });
		freshLoad();
		expect(drafts().restoreDraft()).toBe(true);
		expect(plans()).toEqual(expected);
	});

	it("Discard switches and deletes the draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		drafts().requestEntitySwitch(entity("account"));
		drafts().resolveSwitch("discard");
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe("account");
		expect(readDraft(KEY)).toBeNull();
	});

	it("a solution switch asks too; picking the active solution again is not a switch", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		drafts().requestSolutionSwitch(solution(SOLUTION_A, "SolutionA"));
		expect(drafts().pendingSwitch).toBeNull();
		expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);

		drafts().requestSolutionSwitch(solution(SOLUTION_B, "SolutionB"));
		expect(drafts().pendingSwitch?.kind).toBe("solution");
		expect(useSessionStore.getState().activeSolution?.id).toBe(SOLUTION_A);
		drafts().resolveSwitch("keep");
		expect(useSessionStore.getState().activeSolution?.id).toBe(SOLUTION_B);
		expect(useSessionStore.getState().activeEntity).toBeNull();
		expect(readDraft(KEY)).not.toBeNull();
		// Editing what is left on the canvas doesn't touch the kept draft.
		const kept = readDraft(KEY)!.delta;
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		expect(readDraft(KEY)!.delta).toEqual(kept);
	});

	it("while an earlier draft waits for Restore / Discard, switching keeps that draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const saved = readDraft(KEY)!;
		freshLoad();
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		drafts().requestEntitySwitch(entity("account"));
		drafts().resolveSwitch("discard");
		expect(readDraft(KEY)?.delta).toEqual(saved.delta);
	});
});

const fixture = (name: string) =>
	readFileSync(resolve(__dirname, "../__fixtures__/ribbon", name), "utf-8");

describe("#16 — draft size and a full browser storage", () => {
	const CONTACT_TAB = "Mscrm.HomepageGrid.contact.MainTab";

	/** A realistic workspace: contact's home grid, an application ribbon, ~500 commands and ~250 rules. */
	function loadContact() {
		drafts().beginLoad();
		const home = parseRibbonXml(
			fixture("contact-homepage-menus.xml"),
			"HomepageGrid",
			"contact",
		);
		const defs = parseRibbonXml(
			fixture("contact-oob-commands-rules.xml"),
			"HomepageGrid",
			"contact",
		);
		const app = parseRibbonXml(
			fixture("app-oob-subset.xml"),
			"Application",
			"{!EntityLogicalName}",
		);
		const byId = <X extends { id: string }>(...lists: X[][]) => [
			...new Map(lists.flat().map((x) => [x.id, x])).values(),
		];
		// The home grid tab on every location, as a table ribbon has them.
		const asLocation = (location: RibbonLocation): RibbonDefinition => ({
			...JSON.parse(JSON.stringify(home.ribbon)),
			location,
		});
		store().loadWorkspace({
			ribbons: {
				HomepageGrid: asLocation("HomepageGrid"),
				SubGrid: asLocation("SubGrid"),
				Form: asLocation("Form"),
				Application: app.ribbon,
			},
			commands: byId(defs.commands, home.commands, app.commands),
			enableRules: byId(defs.enableRules, home.enableRules, app.enableRules),
			displayRules: byId(defs.displayRules, home.displayRules, app.displayRules),
			locLabels: [],
		});
		drafts().workspaceLoaded({ ...KEY, entityLogicalName: "contact" });
		const s = store();
		expect(s.commands.length).toBeGreaterThan(300);
		expect(s.enableRules.length + s.displayRules.length).toBeGreaterThan(200);
	}
	const CONTACT_KEY = { ...KEY, entityLogicalName: "contact" };

	function twoEdits() {
		const s = store();
		const group = s.ribbons.HomepageGrid.tabs.find((t) => t.id === CONTACT_TAB)!.groups[0];
		const button = group.buttons.find((b) => !b.hidden)!;
		s.hideOobButton("HomepageGrid", CONTACT_TAB, group.id, button.id);
		const cmd = store().commands[0];
		store().upsertCommand({
			...cmd,
			actions: [
				...cmd.actions,
				{
					kind: "javascript",
					library: "$webresource:cbs_/a.js",
					functionName: "Cbs.a",
					params: [],
				},
			],
		});
	}

	it("stores only the changes, compressed: a small fraction of the workspace", () => {
		useSessionStore.setState({ activeEntity: entity("contact") });
		loadContact();
		twoEdits();
		const stored = localStorage.getItem(draftStorageKey(CONTACT_KEY))!;
		const whole = JSON.stringify(workspaceOf(store())).length;
		// Before: the whole workspace, uncompressed.
		expect(whole).toBeGreaterThan(500_000);
		expect(stored.length).toBeLessThan(5_000);
		expect(stored.length).toBeLessThan(whole / 100);
		// Only the changed location is in it, and only the changed command in full.
		const { delta } = readDraft(CONTACT_KEY)!;
		expect(Object.keys(delta.ribbons)).toEqual(["HomepageGrid"]);
		expect(delta.lists.commands).toEqual({
			set: [expect.objectContaining({ id: store().commands[0].id })],
			drop: [],
			add: [],
		});
	});

	it("the compact draft restores the same plan over a fresh load", () => {
		useSessionStore.setState({ activeEntity: entity("contact") });
		loadContact();
		twoEdits();
		const before = {
			plans: plans(),
			workspace: JSON.parse(JSON.stringify(workspaceOf(store()))),
		};
		expect(before.plans.entity.hasChanges).toBe(true);
		loadContact();
		expect(drafts().restoreDraft()).toBe(true);
		expect(plans()).toEqual(before.plans);
		expect(workspaceOf(store())).toEqual(before.workspace);
	});

	describe("with the storage full", () => {
		let setItem: ReturnType<typeof vi.spyOn>;
		const fillStorage = () => {
			setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
				throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
			});
		};
		afterEach(() => setItem?.mockRestore());

		it("says so, and Keep as draft doesn't switch (nothing is lost); Discard still does", () => {
			freshLoad();
			fillStorage();
			store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
			expect(drafts().saveFailed).toBe(true);
			expect(readDraft(KEY)).toBeNull();

			drafts().requestEntitySwitch(entity("account"));
			expect(drafts().pendingSwitch).not.toBeNull();
			drafts().resolveSwitch("keep");
			expect(drafts().pendingSwitch).not.toBeNull();
			expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);
			expect(plans().entity.deletedButtonIds).toEqual(["cbs.Mine2"]);

			drafts().resolveSwitch("discard");
			expect(useSessionStore.getState().activeEntity?.logicalName).toBe("account");
		});

		it("Keep works again once the draft can be saved", () => {
			freshLoad();
			fillStorage();
			store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
			drafts().requestEntitySwitch(entity("account"));
			drafts().resolveSwitch("keep");
			expect(useSessionStore.getState().activeEntity?.logicalName).toBe(T);

			setItem.mockRestore();
			drafts().resolveSwitch("keep");
			expect(drafts().saveFailed).toBe(false);
			expect(useSessionStore.getState().activeEntity?.logicalName).toBe("account");
			expect(readDraft(KEY)).not.toBeNull();
		});
	});
});
