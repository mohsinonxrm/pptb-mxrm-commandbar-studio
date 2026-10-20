/**
 * #120 — the tool's connection changing in Power Platform ToolBox while it runs.
 *
 * The host switches a running tool's connection in place and raises
 * `connection:updated` (also sent for token refreshes and edits of any
 * connection). CBS must then close what it loaded from the previous
 * environment, keep the unpublished changes as a draft under that
 * environment, reload for the new one, and never write to it with the old
 * workspace.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseRibbonXml } from "@/services/xmlParser";
import { readDraft, sameDraftKey, type DraftKey } from "@/services/ribbonDraft";
import {
	ConnectionChangedError,
	assertWorkspaceConnection,
	connectionKey,
	watchHostConnection,
	writeGuard,
	type HostConnection,
} from "@/services/hostConnection";
import { applyHostConnection } from "@/services/connectionSwitch";
import { useRibbonStore, hasPendingChanges } from "@/store/ribbonStore";
import { useDraftStore, installDraftAutosave } from "@/store/draftStore";
import { useSessionStore } from "@/store/sessionStore";
import type { EntityMetadata } from "@/types/entity";
import type { Solution } from "@/types/solution";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

const T = "cbstest_ribbontest";
const MAIN = `Mscrm.HomepageGrid.${T}.MainTab`;
const DEV: HostConnection = {
	id: "c-dev",
	name: "Contoso Dev",
	url: "https://contoso-dev.crm.dynamics.com/",
	environment: "Dev",
};
const PROD: HostConnection = {
	id: "c-prod",
	name: "Contoso Prod",
	url: "https://contoso.crm.dynamics.com/",
	environment: "Production",
};
const SOLUTION_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const DEV_KEY: DraftKey = { orgUrl: DEV.url, solutionId: SOLUTION_ID, entityLogicalName: T };
const PROD_KEY: DraftKey = { ...DEV_KEY, orgUrl: PROD.url };

const XML = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="${MAIN}" Command="${MAIN}" Sequence="10"><Groups Id="${MAIN}.Groups">
    <Group Id="${MAIN}.Management" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="${MAIN}.Management.Controls">
      <Button Id="Mscrm.HomepageGrid.${T}.Edit" Command="Mscrm.EditSelectedRecord" Sequence="20" LabelText="Edit" TemplateAlias="o1" />
    </Controls></Group>
  </Groups></Tab>
</Tabs></Ribbon></UI><CommandDefinitions>
  <CommandDefinition Id="Mscrm.EditSelectedRecord"><EnableRules/><DisplayRules/><Actions><JavaScriptFunction FunctionName="edit" Library="$webresource:lib.js"/></Actions></CommandDefinition>
</CommandDefinitions><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;

const empty = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});
const entity: EntityMetadata = {
	metadataId: "md",
	logicalName: T,
	displayName: T,
	isCustomEntity: true,
	isIntersect: false,
};
const solution = {
	id: SOLUTION_ID,
	uniqueName: "CBSLiveTest",
	friendlyName: "CBS Live Test",
	version: "1.0.0.0",
	isManaged: false,
	publisherPrefix: "cbs",
	publisherUniqueName: "cbs",
	publisherName: "CBS",
} as Solution;

const store = () => useRibbonStore.getState();
const session = () => useSessionStore.getState();

/** The host: its current connection for this tool, and the event subscribers. */
let hostConnection: HostConnection | null;
let handlers: Array<(event: unknown, payload: { event: string; data: unknown }) => void>;
const getConnection = vi.fn(async (_slot: unknown) => hostConnection);
const emit = (event: string) => handlers.forEach((h) => h({}, { event, data: {} }));
const flush = () => new Promise((r) => setTimeout(r, 0));

function loadTable() {
	useDraftStore.getState().beginLoad();
	const parsed = parseRibbonXml(XML, "HomepageGrid", T);
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
		locLabels: [],
	});
	useDraftStore.getState().workspaceLoaded(DEV_KEY);
}

/** An unpublished change: a new command. */
function edit() {
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
		enableRules: [],
		displayRules: [],
	});
}

let unsubscribe: () => void;

beforeEach(() => {
	localStorage.clear();
	hostConnection = DEV;
	handlers = [];
	getConnection.mockClear();
	(window as unknown as { toolboxAPI: unknown }).toolboxAPI = {
		connections: { getConnection, getActiveConnection: vi.fn(async () => hostConnection) },
		events: { on: (h: (typeof handlers)[number]) => handlers.push(h), off: vi.fn() },
	};
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
		solutions: [solution],
		activeSolution: solution,
		entities: [entity],
		activeEntity: entity,
		solutionEntityIds: ["md"],
		currentUserId: "u1",
		currentUserName: "Maker",
		publisherPrefix: "cbs",
		connectionVersion: 0,
		connectionNotice: null,
	});
	session().setConnection(DEV.url, DEV.name, DEV.environment, DEV.id);
	unsubscribe = installDraftAutosave();
	loadTable();
});

afterEach(() => {
	unsubscribe();
	delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
});

describe("connectionKey", () => {
	it("identifies a connection by id and URL, ignoring case and a trailing slash", () => {
		expect(connectionKey({ id: "a", url: "https://X.crm.dynamics.com/" })).toBe(
			connectionKey({ id: "a", url: "https://x.crm.dynamics.com" }),
		);
		expect(connectionKey({ id: "a", url: "https://x.crm.dynamics.com" })).not.toBe(
			connectionKey({ id: "b", url: "https://x.crm.dynamics.com" }),
		);
		expect(connectionKey(null)).toBe("");
	});
});

describe("applyHostConnection (#120)", () => {
	it("an event for the same connection (token refresh, another connection edited) changes nothing", () => {
		edit();
		expect(applyHostConnection({ ...DEV })).toBe("none");
		expect(session().activeEntity?.logicalName).toBe(T);
		expect(session().connectionVersion).toBe(0);
		expect(hasPendingChanges(store())).toBe(true);
	});

	it("the same connection with new details (environment type, name) updates them only", () => {
		edit();
		expect(
			applyHostConnection({
				...DEV,
				name: "Contoso Dev (renamed)",
				environment: "Production",
			}),
		).toBe("details");
		expect(session().environment).toBe("Production");
		expect(session().connectionName).toBe("Contoso Dev (renamed)");
		expect(session().activeEntity?.logicalName).toBe(T);
		expect(session().connectionVersion).toBe(0);
		expect(hasPendingChanges(store())).toBe(true);
	});

	it("another connection closes the previous environment's workspace and keeps its changes as a draft there", () => {
		edit();
		expect(readDraft(DEV_KEY)).not.toBeNull();

		expect(applyHostConnection(PROD)).toBe("switched");

		const s = session();
		expect([s.connectionId, s.connectionUrl, s.connectionName, s.environment]).toEqual([
			PROD.id,
			PROD.url,
			PROD.name,
			"Production",
		]);
		expect(s.activeSolution).toBeNull();
		expect(s.activeEntity).toBeNull();
		expect(s.solutions).toEqual([]);
		expect(s.entities).toEqual([]);
		expect(s.currentUserId).toBe("");
		expect(s.publisherPrefix).toBe("new");
		expect(s.connectionVersion).toBe(1);
		// Nothing of the previous environment is left to publish.
		expect(hasPendingChanges(store())).toBe(false);
		expect(store().ribbons.HomepageGrid.tabs).toEqual([]);
		expect(store().past).toEqual([]);
		expect(useDraftStore.getState().target).toBeNull();
		// The changes wait under the previous org, never under the new one.
		expect(sameDraftKey(readDraft(DEV_KEY)!.key, DEV_KEY)).toBe(true);
		expect(readDraft(PROD_KEY)).toBeNull();
		expect(s.connectionNotice).toMatchObject({
			from: { name: DEV.name, environment: "Dev" },
			to: { name: PROD.name, environment: "Production" },
			draftKept: true,
			draftLost: false,
		});
	});

	it("without unpublished changes, nothing is kept and nothing is reported lost", () => {
		applyHostConnection(PROD);
		expect(session().connectionNotice).toMatchObject({ draftKept: false, draftLost: false });
		expect(readDraft(DEV_KEY)).toBeNull();
	});

	it("the draft kept for the previous environment is offered again when the tool is back on it", () => {
		edit();
		applyHostConnection(PROD);
		applyHostConnection(DEV);
		useSessionStore.setState({ activeSolution: solution, activeEntity: entity });
		loadTable();
		expect(sameDraftKey(useDraftStore.getState().pending!.key, DEV_KEY)).toBe(true);
		expect(useDraftStore.getState().restoreDraft()).toBe(true);
		expect(store().commands.some((c) => c.id === "cbs.New.Command")).toBe(true);
	});
});

describe("assertWorkspaceConnection (#120)", () => {
	it("allows writes while the host is on the workspace's connection", async () => {
		await expect(assertWorkspaceConnection("Publishing")).resolves.toBeUndefined();
	});

	it("refuses writes once the host is on another connection", async () => {
		hostConnection = PROD;
		await expect(assertWorkspaceConnection("Publishing")).rejects.toBeInstanceOf(
			ConnectionChangedError,
		);
		await expect(assertWorkspaceConnection("Publishing")).rejects.toThrow(
			/Publishing was stopped.*Nothing was written/,
		);
	});

	it("refuses when the host can't say which connection the tool is on", async () => {
		getConnection.mockRejectedValueOnce(new Error("host gone"));
		await expect(assertWorkspaceConnection("The import")).rejects.toBeInstanceOf(
			ConnectionChangedError,
		);
	});

	it("follows the switch: the new connection's workspace may be written", async () => {
		applyHostConnection(PROD);
		hostConnection = PROD;
		await expect(assertWorkspaceConnection("Publishing")).resolves.toBeUndefined();
	});

	it("an operation started before a switch writes nothing after it, even to the new workspace's connection", async () => {
		const guard = writeGuard(); // a publish starts on Dev
		await expect(guard("The import")).resolves.toBeUndefined();
		applyHostConnection(PROD); // the switch is handled mid-publish
		hostConnection = PROD;
		await expect(guard("The import")).rejects.toBeInstanceOf(ConnectionChangedError);
		// A new operation on the new connection is fine.
		await expect(writeGuard()("Publishing")).resolves.toBeUndefined();
	});

	it("a real write is refused before anything is sent", async () => {
		const execute = vi.fn(async () => ({}));
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = { execute };
		hostConnection = PROD;
		const { publishWebResource } = await import("@/services/dataverse/webResourceService");
		await expect(
			publishWebResource("00000000-0000-0000-0000-000000000001"),
		).rejects.toBeInstanceOf(ConnectionChangedError);
		expect(execute).not.toHaveBeenCalled();
	});
});

describe("watchHostConnection (#120)", () => {
	it("re-reads the tool's connection on connection events only, and reports the latest answer", async () => {
		const seen: Array<string | undefined> = [];
		watchHostConnection((c) => seen.push(c?.id));
		emit("settings:updated");
		await flush();
		expect(getConnection).not.toHaveBeenCalled();

		hostConnection = PROD;
		emit("connection:updated");
		emit("connection:updated");
		await flush();
		expect(getConnection).toHaveBeenCalledWith(0);
		expect(seen).toEqual(["c-prod"]);

		emit("connection:deleted");
		await flush();
		expect(seen).toEqual(["c-prod", "c-prod"]);
	});

	it("drives the reset end to end: a switch closes the workspace, a refresh doesn't", async () => {
		watchHostConnection((c) => applyHostConnection(c));
		edit();
		emit("connection:updated");
		await flush();
		expect(session().activeEntity?.logicalName).toBe(T);

		hostConnection = PROD;
		emit("connection:updated");
		await flush();
		expect(session().activeEntity).toBeNull();
		expect(session().connectionVersion).toBe(1);
	});
});
