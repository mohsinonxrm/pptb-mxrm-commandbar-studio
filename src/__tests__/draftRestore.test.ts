/**
 * #16 — restoring unsaved changes from a previous session.
 *
 * A restored draft must be equivalent to the session that saved it: on top of
 * a fresh load (the baseline), it yields the same publish plan.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { partsFromRibbonTables, ownControlIds } from "@/services/ribbonDiffMerge";
import { layerSnapshotFromParts, locLabelsFromParts } from "@/services/dataverse/ribbonLayerService";
import { applyLayerOwnership } from "@/utils/ribbonProvenance";
import { planScope } from "@/services/publishPlan";
import { useRibbonStore, workspaceOf } from "@/store/ribbonStore";
import { useDraftStore, installDraftAutosave } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";
import {
	DRAFT_FORMAT,
	discardOutdatedDrafts,
	draftStorageKey,
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
			{ difftype: 0, rdx: `<HideCustomAction HideActionId="cbs.Hide.Merge" Location="${HIDDEN}" />` },
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

const empty = (location: RibbonLocation): RibbonDefinition => ({ location, entityLogicalName: T, tabs: [] });
const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

const store = () => useRibbonStore.getState();
const drafts = () => useDraftStore.getState();

/**
 * A fresh load of the table, as App does it: the load starts, the workspace
 * is seeded from the server, then the draft (if any) is offered.
 */
function freshLoad(key: DraftKey = KEY, extraServerButton = "") {
	drafts().beginLoad();
	const parts = layerParts();
	const labels = locLabelsFromParts(parts);
	const parsed = parseRibbonXml(merged(extraServerButton), "HomepageGrid", T, labels);
	applyLayerOwnership(parsed.ribbon, ownControlIds(parts));
	store().loadWorkspace({
		ribbons: { HomepageGrid: parsed.ribbon, SubGrid: empty("SubGrid"), Form: empty("Form"), Application: empty("Application") },
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
	const planFor = (locations: RibbonLocation[], scope: "entity" | "application", excludeCommandIds?: Set<string>) =>
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
				for (const button of groupControls(group)) if (button.commandId) tableCommands.add(button.commandId);
	return { entity: planFor(ENTITY_LOCATIONS, "entity"), application: planFor(["Application"], "application", tableCommands) };
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
	expect(readDraft(KEY)?.workspace).toEqual(before.workspace);
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
	useDraftStore.setState({ target: null, pending: null, pendingBaselineChanged: false, pendingSwitch: null });
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
			store().upsertEnableRule({ id: "cbs.New.Rule", steps: [{ kind: "SelectionCountRule", minimum: 1 }] });
			store().upsertCommand({
				id: "cbs.New.Command",
				actions: [{ kind: "javascript", library: "$webresource:cbs_/new.js", functionName: "Cbs.go", params: [] }],
				enableRules: ["cbs.New.Rule"],
				displayRules: [],
			});
			store().createButton({
				location: "HomepageGrid",
				tabId: MAIN,
				groupId: MGMT,
				button: { id: "cbs.New", label: "New one", kind: "button", templateAlias: "o1", commandId: "cbs.New.Command", hidden: false, oob: false, custom: true, managed: false },
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
				actions: [...cmd.actions, { kind: "javascript", library: "$webresource:cbs_/audit.js", functionName: "Cbs.audit", params: [] }],
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
			store().upsertEnableRule({ ...rule, steps: [...rule.steps, { kind: "SelectionCountRule", minimum: 1 }] });
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
			store().setButtonProp("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`, { label: "Share it" });
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
			expect(store().customiseButton("HomepageGrid", MAIN, MGMT, `Mscrm.HomepageGrid.${T}.Edit`, "cbs")).toBe(
				`cbs.Mscrm.HomepageGrid.${T}.Edit`,
			);
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
		expect(readDraft(KEY)?.workspace).toEqual(saved.workspace);
		store().undo();
		expect(readDraft(KEY)?.workspace).toEqual(saved.workspace);
		store().redo();

		drafts().discardDraft();
		expect(drafts().pending).toBeNull();
		const now = readDraft(KEY)!;
		expect(now.workspace).toEqual(JSON.parse(JSON.stringify(workspaceOf(store()))));
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
		expect(discardOutdatedDrafts()).toBe(1);
		expect(localStorage.length).toBe(0);

		localStorage.setItem(draftStorageKey(KEY), JSON.stringify({ format: DRAFT_FORMAT - 1, key: KEY, workspace: {} }));
		freshLoad();
		expect(drafts().pending).toBeNull();
		expect(localStorage.getItem(draftStorageKey(KEY))).toBeNull();
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
		freshLoad(KEY, `<Button Id="other.Button" Command="${DELETE}" Sequence="950" LabelText="Other" TemplateAlias="o1" />`);
		expect(drafts().pendingBaselineChanged).toBe(true);
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
		const kept = readDraft(KEY)!.workspace;
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		expect(readDraft(KEY)!.workspace).toEqual(kept);
	});

	it("while an earlier draft waits for Restore / Discard, switching keeps that draft", () => {
		freshLoad();
		store().deleteButton("HomepageGrid", MAIN, MGMT, "cbs.Mine2");
		const saved = readDraft(KEY)!;
		freshLoad();
		store().hideOobButton("HomepageGrid", MAIN, COLLAB, `Mscrm.HomepageGrid.${T}.Share`);
		drafts().requestEntitySwitch(entity("account"));
		drafts().resolveSwitch("discard");
		expect(readDraft(KEY)?.workspace).toEqual(saved.workspace);
	});
});
