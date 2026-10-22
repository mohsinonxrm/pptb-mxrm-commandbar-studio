/**
 * Publishing against a real environment (#46, #50, #52): busy environments are
 * waited for / retried, the published layer is verified, and a load reconciles
 * commands the merged ribbon is missing from the unmanaged layer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import {
	isEnvironmentBusyError,
	withBusyRetry,
	waitForEnvironmentIdle,
	findRunningSolutionOperations,
} from "@/services/dataverse/environmentService";
import { parseRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import { parseRibbonXml } from "@/services/xmlParser";

// Module re-imports and DOM parsing are slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });

type Api = Record<string, (...args: never[]) => unknown>;
const setApi = (api: Api) => {
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
};

const BUSY_IMPORT =
	"0x80071151: Cannot start the requested operation [Import] because there is another [RibbonMetadataGeneration] running at this moment. Use Solution History for more details.";
const BUSY_PREVIOUS = "Cannot start another [Import] because there is a previous [Import] running at this moment.";

describe("isEnvironmentBusyError", () => {
	it("recognises the 0x80071151 messages seen in solution history", () => {
		expect(isEnvironmentBusyError(new Error(BUSY_IMPORT))).toBe(true);
		expect(isEnvironmentBusyError(new Error(BUSY_PREVIOUS))).toBe(true);
		expect(isEnvironmentBusyError("Cannot start the requested operation [Publish] because there is another [Import] running")).toBe(true);
		expect(isEnvironmentBusyError(new Error("0x8004803A: component of type 50 is not declared"))).toBe(false);
		expect(isEnvironmentBusyError(undefined)).toBe(false);
	});
});

describe("withBusyRetry", () => {
	it("retries a busy failure with backoff and reports progress", async () => {
		const sleep = vi.fn(async () => undefined);
		const progress: string[] = [];
		let calls = 0;
		const result = await withBusyRetry(
			"Import",
			async () => {
				if (++calls < 3) throw new Error(BUSY_IMPORT);
				return "ok";
			},
			{ sleep, onProgress: (m) => progress.push(m), now: () => 0 },
		);
		expect(result).toBe("ok");
		expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([15_000, 30_000]);
		expect(progress[0]).toMatch(/another solution operation is running.*retrying in 15 s/);
	});

	it("rethrows any other error at once", async () => {
		const sleep = vi.fn(async () => undefined);
		await expect(withBusyRetry("Import", async () => Promise.reject(new Error("boom")), { sleep })).rejects.toThrow("boom");
		expect(sleep).not.toHaveBeenCalled();
	});

	it("gives up after the timeout", async () => {
		let t = 0;
		const sleep = vi.fn(async (ms: number) => {
			t += ms;
		});
		await expect(
			withBusyRetry("Publish", async () => Promise.reject(new Error(BUSY_PREVIOUS)), { sleep, now: () => t, timeoutMs: 120_000 }),
		).rejects.toThrow(/Publish kept failing because another solution operation is running/);
		expect(t).toBeLessThanOrEqual(120_000);
	});
});

describe("waitForEnvironmentIdle", () => {
	it("waits while an import / ribbon metadata generation runs, ignoring exports and finished rows", async () => {
		const queries: string[] = [];
		const recent = new Date(Date.now() - 60_000).toISOString();
		const answers = [
			[
				{ msdyn_name: "Other", msdyn_operation: 7, msdyn_status: 0, msdyn_starttime: recent },
				{ msdyn_name: "Exp", msdyn_operation: 2, msdyn_status: 0, msdyn_starttime: recent },
				{ msdyn_name: "Done", msdyn_operation: 0, msdyn_status: 1, msdyn_starttime: recent },
				// Stuck "Started" for days: ignored.
				{ msdyn_name: "Stale", msdyn_operation: 0, msdyn_status: 0, msdyn_starttime: "2026-01-01T00:00:00Z" },
			],
			[{ msdyn_name: "Exp", msdyn_operation: 2, msdyn_status: 0, msdyn_starttime: recent }],
		];
		setApi({
			queryData: vi.fn(async (q: string) => {
				queries.push(q);
				return { value: answers.shift() ?? [] };
			}),
		});
		const progress: string[] = [];
		const sleep = vi.fn(async () => undefined);
		await waitForEnvironmentIdle({ sleep, onProgress: (m) => progress.push(m) });
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(progress).toEqual(["Waiting for another operation to finish: RibbonMetadataGeneration (Other)…"]);
		// No server-side $filter: it is unreliable on this virtual table.
		expect(queries[0]).toMatch(/^msdyn_solutionhistories\?.*\$orderby=msdyn_starttime desc/);
		expect(queries[0]).not.toContain("$filter");
	});

	it("treats an unreadable history as idle", async () => {
		setApi({ queryData: vi.fn(async () => Promise.reject(new Error("403"))) });
		expect(await findRunningSolutionOperations()).toEqual([]);
	});

	it("gives up when the environment stays busy", async () => {
		let t = 0;
		setApi({
			queryData: vi.fn(async () => ({ value: [{ msdyn_name: "CBSLiveTest", msdyn_operation: 0, msdyn_status: 0 }] })),
		});
		await expect(
			waitForEnvironmentIdle({ sleep: async (ms) => void (t += ms), now: () => t, timeoutMs: 60_000 }),
		).rejects.toThrow(/still busy \(Import \(CBSLiveTest\) running\)/);
	});
});

// ---------------------------------------------------------------------------
// publishRibbon against a fake environment that stores what is imported.
// ---------------------------------------------------------------------------

function rowsOf(parts: RibbonDiffParts) {
	return {
		ribbondiffs: [
			...[...parts.customActions.values()].map((rdx) => ({ difftype: 0, rdx })),
			...[...parts.templates.values()].map((rdx) => ({ difftype: 2, rdx })),
			...[...parts.locLabels.values()].map((rdx) => ({ difftype: 3, rdx })),
		],
		ribboncommands: [...parts.commandDefinitions].map(([command, commanddefinition]) => ({ command, commanddefinition })),
		ribbonrules: [
			...[...parts.enableRules].map(([ruleid, ruledefinition]) => ({ ruleid, ruletype: 1, ruledefinition })),
			...[...parts.displayRules].map(([ruleid, ruledefinition]) => ({ ruleid, ruletype: 2, ruledefinition })),
			...[...parts.tabDisplayRules].map(([ruleid, ruledefinition]) => ({ ruleid, ruletype: 3, ruledefinition })),
		],
	};
}

function ribbonDiffOf(base64Zip: string): string {
	const bin = atob(base64Zip);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	const cust = strFromU8(unzipSync(bytes)["customizations.xml"]);
	return cust.match(/<RibbonDiffXml>[\s\S]*<\/RibbonDiffXml>/)![0];
}

const T = "cbstest_ribbontest";
const MERGED = `<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs>
  <Tab Id="Mscrm.HomepageGrid.${T}.MainTab" Command="Mscrm.HomepageGrid.${T}.MainTab" Sequence="10"><Groups Id="g">
    <Group Id="Mscrm.HomepageGrid.${T}.MainTab.Management" Sequence="10" Template="Mscrm.Templates.Flexible2"><Controls Id="c">
      <Button Id="cbs.Go" Command="cbs.Go.Command" Sequence="900" LabelText="$LocLabels:cbs.Go.LabelText" TemplateAlias="o1" />
    </Controls></Group>
  </Groups></Tab>
</Tabs></Ribbon></UI><CommandDefinitions/><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules/></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`;
const LAYER_XML = `<RibbonDiffXml><CustomActions>
  <CustomAction Id="cbs.Go.CustomAction" Location="Mscrm.HomepageGrid.${T}.MainTab.Management.Controls._children" Sequence="900"><CommandUIDefinition><Button Id="cbs.Go" Command="cbs.Go.Command" Sequence="900" LabelText="$LocLabels:cbs.Go.LabelText" TemplateAlias="o1" /></CommandUIDefinition></CustomAction>
  <HideCustomAction HideActionId="cbs.HideEdit" Location="Mscrm.HomepageGrid.${T}.Edit" />
</CustomActions>
<CommandDefinitions><CommandDefinition Id="cbs.Go.Command"><EnableRules><EnableRule Id="cbs.Go.Rule" /></EnableRules><DisplayRules /><Actions><JavaScriptFunction Library="$webresource:cbs.js" FunctionName="go" /></Actions></CommandDefinition></CommandDefinitions>
<RuleDefinitions><TabDisplayRules /><DisplayRules /><EnableRules><EnableRule Id="cbs.Go.Rule"><SelectionCountRule Minimum="1" /></EnableRule></EnableRules></RuleDefinitions>
<LocLabels><LocLabel Id="cbs.Go.LabelText"><Titles><Title languagecode="1033" description="Go" /><Title languagecode="1031" description="Los" /></Titles></LocLabel></LocLabels>
</RibbonDiffXml>`;

function fakeEnvironment(
	opts: {
		busyImports?: number;
		busyHistory?: number;
		/** An element the publish (every one, or only the n-th) leaves out of the published layer. */
		dropOnPublish?: string;
		dropOnPublishNumber?: number;
		languageCode?: number;
		/** Someone else writes to the layer just before its n-th read (#102). */
		onLayerRead?: (n: number, server: RibbonDiffParts) => void;
	} = {},
) {
	let server = parseRibbonDiffParts(LAYER_XML);
	let busyImports = opts.busyImports ?? 0;
	let busyHistory = opts.busyHistory ?? 0;
	let layerReads = 0;
	let publishes = 0;
	const calls: string[] = [];
	const api = {
		calls,
		get server() {
			return server;
		},
		queryData: vi.fn(async (q: string) => {
			calls.push(`query ${q.split("?")[0]}`);
			if (q.startsWith("organizations")) return { value: [{ languagecode: opts.languageCode ?? 1033 }] };
			if (q.startsWith("msdyn_solutionhistories")) {
				return busyHistory-- > 0 ? { value: [{ msdyn_name: "X", msdyn_operation: 0, msdyn_status: 0 }] } : { value: [] };
			}
			if (q.startsWith("RetrieveEntityRibbon(")) {
				let b = "";
				for (const c of zipSync({ "RibbonXml.xml": strToU8(MERGED) })) b += String.fromCharCode(c);
				return { CompressedEntityXml: btoa(b) };
			}
			const table = q.split("?")[0] as "ribbondiffs" | "ribboncommands" | "ribbonrules";
			if (table === "ribbondiffs" && !q.includes("entity eq null")) opts.onLayerRead?.(++layerReads, server);
			if (q.includes("entity eq null")) return { value: [] };
			return { value: rowsOf(server)[table] };
		}),
		importSolution: vi.fn(async (zip: string) => {
			calls.push("import");
			if (busyImports-- > 0) throw new Error(BUSY_IMPORT);
			server = parseRibbonDiffParts(ribbonDiffOf(zip));
		}),
		getImportJobStatus: vi.fn(async () => ({ progress: 100 })),
		retrieve: vi.fn(async () => ({
			data: `<importexportxml><entityRibbon id="${T}" processed="true"><result result="success" /></entityRibbon></importexportxml>`,
		})),
		publishXml: vi.fn(async () => {
			calls.push("publish");
			publishes++;
			if (opts.dropOnPublish && (opts.dropOnPublishNumber ?? publishes) === publishes) server.customActions.delete(opts.dropOnPublish);
		}),
		execute: vi.fn(async (req: { operationName: string; parameters?: Record<string, string> }) => {
			if (req.operationName === "ImportSolution") return api.importSolution(req.parameters!.CustomizationFile);
			if (req.operationName === "PublishXml") return api.publishXml();
			if (req.operationName === "RetrieveApplicationRibbon") {
				let b = "";
				for (const c of zipSync({ "RibbonXml.xml": strToU8("<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs/></Ribbon></UI></RibbonDefinition></RibbonDefinitions>") }))
					b += String.fromCharCode(c);
				return { CompressedApplicationRibbonXml: btoa(b) };
			}
			throw new Error(`unexpected ${req.operationName}`);
		}),
	};
	setApi(api as unknown as Api);
	return api;
}

const SOLUTION = {
	uniqueName: "CBSLiveTest",
	friendlyName: "CBS Live Test",
	version: "1.0.0.0",
	publisherUniqueName: "cbstest",
	publisherName: "CBS Test",
	publisherPrefix: "cbstest",
};

async function publishUnhide(env: ReturnType<typeof fakeEnvironment>, extra: { guard?: (action: string) => Promise<void> } = {}) {
	vi.resetModules();
	const { publishRibbon } = await import("@/services/dataverse/publishService");
	const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
	const progress: string[] = [];
	const result = await publishRibbon(
		{
			entity: { logicalName: T, schemaName: T },
			locations: [{ current: parsed.ribbon, baseline: parsed.ribbon }],
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			plan: {
				editedCommandIds: [],
				editedEnableRuleIds: [],
				editedDisplayRuleIds: [],
				deletedButtonIds: [],
				unhiddenButtonIds: [`Mscrm.HomepageGrid.${T}.Edit`],
			},
			solution: SOLUTION,
			busy: { sleep: async () => undefined },
			verifyDelayMs: 0,
			...extra,
		},
		(m) => progress.push(m),
	);
	return { result, progress, env };
}

describe("a publish run and a connection switch (#120)", () => {
	it("a scope that starts after the switch imports nothing, even though the new connection is current by then", async () => {
		const env = fakeEnvironment();
		const host = await import("@/services/hostConnection");
		const dev = { id: "c-dev", url: "https://dev.crm.dynamics.com" };
		const prod = { id: "c-prod", url: "https://prod.crm.dynamics.com" };
		let current = dev;
		(window as unknown as { toolboxAPI: unknown }).toolboxAPI = { connections: { getConnection: async () => current } };
		try {
			host.setWorkspaceConnection(dev);
			const runGuard = host.writeGuard(); // the publish dialog's run starts on Dev
			// The table scope imports on Dev; then the tool switches to Prod and the switch is handled.
			host.setWorkspaceConnection(prod);
			current = prod;
			// The application-ribbon scope of the same run starts now.
			await expect(publishUnhide(env, { guard: runGuard })).rejects.toBeInstanceOf(host.ConnectionChangedError);
			expect(env.calls).not.toContain("import");
			expect(env.calls).not.toContain("publish");
		} finally {
			delete (window as unknown as { toolboxAPI?: unknown }).toolboxAPI;
		}
	});
});

describe("publishRibbon in a busy environment (#46)", () => {
	it("waits for a running operation, retries a busy import, and verifies the published layer", async () => {
		const env = fakeEnvironment({ busyHistory: 1, busyImports: 1 });
		const { result, progress } = await publishUnhide(env);
		expect(progress.some((m) => m.startsWith("Waiting for another operation to finish: Import"))).toBe(true);
		expect(progress.some((m) => /Import: another solution operation is running/.test(m))).toBe(true);
		// 1 busy attempt + 2 real imports (the Unified Interface refresh pass).
		expect(env.calls.filter((c) => c === "import")).toHaveLength(3);
		expect(env.server.customActions.has(`hide:cbs.HideEdit`)).toBe(false);
		expect(result.verification).toMatchObject({ ok: true, missing: [], unexpected: [] });
	});

	it("sends the Dataverse actions itself, the same requests in every PPTB host (#89)", async () => {
		const env = fakeEnvironment();
		await publishUnhide(env);
		const requests = env.execute.mock.calls.map(([req]) => req as { operationName: string; parameters?: Record<string, unknown> });
		const imports = requests.filter((r) => r.operationName === "ImportSolution");
		expect(imports).toHaveLength(2);
		for (const r of imports) {
			// The job CBS polls and verifies: a host that drops ImportJobId can't lose it.
			expect(r.parameters).toMatchObject({ OverwriteUnmanagedCustomizations: true, PublishWorkflows: false });
			expect(r.parameters!.ImportJobId).toMatch(/^[0-9a-f-]{36}$/);
		}
		// A table publish after each import, never PublishAllXml.
		const tablePublish = { ParameterXml: `<importexportxml><entities><entity>${T}</entity></entities></importexportxml>` };
		expect(requests.filter((r) => r.operationName === "PublishXml").map((r) => r.parameters)).toEqual([tablePublish, tablePublish]);
		expect(requests.some((r) => r.operationName === "PublishAllXml")).toBe(false);
	});

	it("reads the table ribbon with the enum parameter unquoted, the one form Dataverse accepts (#89)", async () => {
		vi.resetModules();
		const { retrieveEntityRibbonQuery } = await import("@/services/dataverse/ribbonService");
		// Verified live: quoted ('…'All''), 'All' or 7 are all a 400.
		expect(retrieveEntityRibbonQuery(T)).toBe(
			`RetrieveEntityRibbon(EntityName=@e,RibbonLocationFilter=@f)?@e='${T}'&@f=Microsoft.Dynamics.CRM.RibbonLocationFilters'All'`,
		);
	});

	it("retries a busy publish", async () => {
		const env = fakeEnvironment();
		let busy = 1;
		const publish = env.publishXml;
		env.publishXml = vi.fn(async () => {
			if (busy-- > 0) throw new Error("Cannot start the requested operation [Publish] because there is another [Import] running at this moment.");
			return publish();
		});
		await publishUnhide(env);
		expect(env.publishXml).toHaveBeenCalledTimes(3);
	});

	it("reports a published layer that doesn't match what was imported", async () => {
		// After the second import (the first one is checked before re-importing, #102).
		const env = fakeEnvironment({ dropOnPublish: "ca:cbs.Go.CustomAction", dropOnPublishNumber: 2 });
		const { result } = await publishUnhide(env);
		expect(result.verification?.ok).toBe(false);
		expect(result.verification?.missing).toEqual(["customActions:ca:cbs.Go.CustomAction"]);
		expect(result.verification?.message).toMatch(/doesn't match.*missing: customActions:ca:cbs\.Go\.CustomAction/);
	});
});

describe("a change made elsewhere while publishing (#102)", () => {
	const OTHER = "ca:other.Added.CustomAction";
	const otherXml = `<CustomAction Id="other.Added.CustomAction" Location="Mscrm.HomepageGrid.${T}.MainTab.Management.Controls._children" Sequence="950"><CommandUIDefinition><Button Id="other.Added" Command="cbs.Go.Command" Sequence="950" LabelText="Other" TemplateAlias="o1" /></CommandUIDefinition></CustomAction>`;
	const addOther = (server: RibbonDiffParts) => server.customActions.set(OTHER, otherXml);

	it("imports nothing when the layer changed after it was read for the merge", async () => {
		// Read 1 is the merge; another session adds a button before read 2, the check before the import.
		const env = fakeEnvironment({ onLayerRead: (n, server) => n === 2 && addOther(server) });
		await expect(publishUnhide(env)).rejects.toThrow(
			/changed in Dataverse since you started publishing \(added: customActions:ca:other\.Added\.CustomAction\).*nothing was imported/,
		);
		expect(env.calls).not.toContain("import");
		expect(env.calls).not.toContain("publish");
		expect(env.server.customActions.has(OTHER)).toBe(true);
	});

	it("reads the layer again after waiting for a busy environment, before retrying the import", async () => {
		// Read 2 is the check before the first (busy) attempt; the change lands during the wait.
		const env = fakeEnvironment({ busyImports: 1, onLayerRead: (n, server) => n === 3 && addOther(server) });
		const { RibbonLayerChangedError } = await import("@/services/dataverse/publishService");
		const err = await publishUnhide(env).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).name).toBe(RibbonLayerChangedError.name);
		// Only the busy attempt, which wrote nothing.
		expect(env.calls.filter((c) => c === "import")).toHaveLength(1);
		expect(env.server.customActions.has(OTHER)).toBe(true);
	});

	it("notices a changed element, not only an added or removed one", async () => {
		const env = fakeEnvironment({
			onLayerRead: (n, server) =>
				n === 2 &&
				server.commandDefinitions.set(
					"cbs.Go.Command",
					server.commandDefinitions.get("cbs.Go.Command")!.replace('FunctionName="go"', 'FunctionName="goElsewhere"'),
				),
		});
		await expect(publishUnhide(env)).rejects.toThrow(/changed: commandDefinitions:cbs\.Go\.Command/);
		expect(env.calls).not.toContain("import");
	});

	it("doesn't import a second time when the layer changed after the first publish", async () => {
		// Read 3 is the check before the second import.
		const env = fakeEnvironment({ onLayerRead: (n, server) => n === 3 && addOther(server) });
		await expect(publishUnhide(env)).rejects.toThrow(
			/imported and published, but .*changed in Dataverse after that \(added: customActions:ca:other\.Added\.CustomAction\), so they weren't imported a second time/,
		);
		expect(env.calls.filter((c) => c === "import")).toHaveLength(1);
		expect(env.server.customActions.has(OTHER)).toBe(true);
	});

	it("imports twice when nothing else changed the layer", async () => {
		const env = fakeEnvironment();
		const { result } = await publishUnhide(env);
		expect(env.calls.filter((c) => c === "import")).toHaveLength(2);
		expect(result.verification?.ok).toBe(true);
	});
});

describe("loading the workspace (#52, #50, #47)", () => {
	beforeEach(() => vi.resetModules());

	it("fills in commands RetrieveEntityRibbon is missing from the unmanaged layer and snapshots the layer", async () => {
		fakeEnvironment({ languageCode: 1031 });
		const { fetchRibbonWorkspace } = await import("@/services/dataverse/ribbonService");
		const ws = await fetchRibbonWorkspace(T);
		const go = ws.commands.find((c) => c.id === "cbs.Go.Command");
		expect(go?.actions[0]).toMatchObject({ kind: "javascript", functionName: "go" });
		expect(ws.enableRules.map((r) => r.id)).toContain("cbs.Go.Rule");
		expect(ws.layers?.entity?.hides).toEqual([{ hideActionId: "cbs.HideEdit", location: `Mscrm.HomepageGrid.${T}.Edit` }]);
		expect(ws.layers?.entity?.controlIds).toContain("cbs.Go");
		// German organisation: the canvas shows the German title.
		expect(ws.baseLanguageCode).toBe(1031);
		const button = ws.ribbons.HomepageGrid.tabs[0].groups[0].buttons[0];
		expect(button.label).toBe("Los");
		expect(button.origin).toBe("unmanaged");
	});

	it("replaces an out-of-date command or rule with the layer's copy, and adds missing rules (live: stale after publish)", async () => {
		const { reconcileWithLayer } = await import("@/services/dataverse/ribbonService");
		const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
		const data = {
			// An older copy of the command (no rule yet) and an older rule (Minimum 0).
			commands: [{ id: "cbs.Go.Command", enableRules: [], displayRules: [], actions: [] }],
			enableRules: [{ id: "cbs.Go.Rule", steps: [{ kind: "SelectionCountRule" as const, minimum: 0 }] }],
			displayRules: [],
		} as unknown as Parameters<typeof reconcileWithLayer>[1];
		const r = reconcileWithLayer([parsed.ribbon], data, parseRibbonDiffParts(LAYER_XML));
		expect(r.replaced.sort()).toEqual(["cbs.Go.Command", "cbs.Go.Rule"]);
		expect(r.added).toEqual([]);
		expect(data.commands[0].actions[0]).toMatchObject({ kind: "javascript", functionName: "go" });
		expect(data.commands[0].enableRules).toEqual(["cbs.Go.Rule"]);
		expect(JSON.stringify(data.enableRules[0])).toContain('"minimum":1');
	});

	it("doesn't count formatting or attribute order of raw (unmodelled) rules and actions as a difference", async () => {
		const { reconcileWithLayer } = await import("@/services/dataverse/ribbonService");
		const rule = (xml: string) => `<RibbonDiffXml><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules>${xml}</EnableRules></RuleDefinitions></RibbonDiffXml>`;
		const merged = parseRibbonXml(
			`<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs/></Ribbon></UI><CommandDefinitions>
			<CommandDefinition Id="cbs.Raw.Command">
				<EnableRules>
					<EnableRule Id="cbs.Raw.Rule" />
				</EnableRules>
				<DisplayRules />
				<Actions>
					<OpenUrl   Address="https://example.com"    WinMode="1" />
				</Actions>
			</CommandDefinition></CommandDefinitions><RuleDefinitions><TabDisplayRules/><DisplayRules/><EnableRules>
			<EnableRule Id="cbs.Raw.Rule">
				<ContextTypeRule  Context="Form"   Default="true" />
			</EnableRule></EnableRules></RuleDefinitions></RibbonDefinition></RibbonDefinitions>`,
			"HomepageGrid",
			T,
		);
		const layer = parseRibbonDiffParts(
			`<RibbonDiffXml><CommandDefinitions><CommandDefinition Id="cbs.Raw.Command"><EnableRules><EnableRule Id="cbs.Raw.Rule"/></EnableRules><DisplayRules/><Actions><OpenUrl WinMode="1" Address="https://example.com"/></Actions></CommandDefinition></CommandDefinitions>` +
				rule(`<EnableRule Id="cbs.Raw.Rule"><ContextTypeRule Default="true" Context="Form"/></EnableRule>`).replace("<RibbonDiffXml>", "").replace("</RibbonDiffXml>", "") +
				`</RibbonDiffXml>`,
		);
		expect(reconcileWithLayer([merged.ribbon], merged, layer)).toEqual({ added: [], replaced: [] });
	});

	it("makes the application layer's copy win in the table's data for ids the table's layer doesn't define", async () => {
		const { reconcileWithLayer, applicationOnlyParts } = await import("@/services/dataverse/ribbonService");
		const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
		const appLayer = parseRibbonDiffParts(LAYER_XML.replace(/<CustomActions>[\s\S]*<\/CustomActions>/, "<CustomActions/>"));
		// The table's merged ribbon returned an older copy of the application-ribbon command.
		const data = {
			commands: [{ id: "cbs.Go.Command", enableRules: [], displayRules: [], actions: [] }],
			enableRules: [],
			displayRules: [],
		} as unknown as Parameters<typeof reconcileWithLayer>[1];
		const r = reconcileWithLayer([parsed.ribbon], data, applicationOnlyParts(appLayer, null));
		expect(r.replaced).toEqual(["cbs.Go.Command"]);
		expect(data.commands[0].actions[0]).toMatchObject({ functionName: "go" });
		// A command the table's layer defines itself is left to the table's layer.
		const own = parseRibbonDiffParts(LAYER_XML);
		const filtered = applicationOnlyParts(appLayer, own);
		expect(filtered.commandDefinitions.size).toBe(0);
		expect(filtered.enableRules.size).toBe(0);
	});

	it("leaves definitions that match the layer, and the ones the layer doesn't define, untouched", async () => {
		const { reconcileWithLayer } = await import("@/services/dataverse/ribbonService");
		const parsed = parseRibbonXml(MERGED, "HomepageGrid", T);
		const layer = parseRibbonDiffParts(LAYER_XML);
		const { definitionsFromParts } = await import("@/services/dataverse/ribbonLayerService");
		const own = definitionsFromParts(layer);
		const oob = { id: "Mscrm.Other", enableRules: [], displayRules: [], actions: [] };
		const data = { commands: [...own.commands, oob], enableRules: [...own.enableRules], displayRules: [] };
		const before = JSON.stringify(data);
		expect(reconcileWithLayer([parsed.ribbon], data, layer)).toEqual({ added: [], replaced: [] });
		expect(JSON.stringify(data)).toBe(before);
	});
});
