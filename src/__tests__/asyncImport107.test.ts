/**
 * #107: ribbon imports run as a system job (ImportSolutionAsync). Publish polls the job, shows
 * its message with the import job's own failure, and stops waiting on Cancel or after a timeout,
 * asking Dataverse to cancel the job and saying what is known about it.
 */
import { describe, it, expect, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

vi.setConfig({ testTimeout: 30_000 });

const T = "cbstest_ribbontest";
const OP = "0b8f2f6e-0000-4000-8000-000000000001";
const SUCCESS_JOB = `<importexportxml><entityRibbon id="${T}" processed="true"><result result="success" /></entityRibbon></importexportxml>`;
const FAILED_JOB =
	'<importexportxml><solutionManifests><solutionManifest processed="true">' +
	'<result result="failure" errorcode="0x80048033" errortext="Publisher &quot;new&quot; is reserved" />' +
	"</solutionManifest></solutionManifests></importexportxml>";

type AsyncOp = {
	statecode: number;
	statuscode: number;
	message?: string;
	friendlymessage?: string;
};
const RUNNING: AsyncOp = { statecode: 2, statuscode: 20 };
const SUCCEEDED: AsyncOp = { statecode: 3, statuscode: 30 };
const CANCELED: AsyncOp = { statecode: 3, statuscode: 32 };

const emptyRibbonZip = () => {
	let b = "";
	for (const c of zipSync({
		"RibbonXml.xml": strToU8(
			"<RibbonDefinitions><RibbonDefinition><UI><Ribbon><Tabs/></Ribbon></UI></RibbonDefinition></RibbonDefinitions>",
		),
	}))
		b += String.fromCharCode(c);
	return btoa(b);
};

/**
 * A fake environment whose imports run as system jobs. `ops` gives the job's state per read
 * (the last one repeats); `job` is the import job's data XML.
 */
function fakeEnvironment(opts: {
	ops: AsyncOp[] | (() => AsyncOp);
	job?: string;
	cancel?: () => Promise<void>;
}) {
	const imports: Record<string, unknown>[] = [];
	const reads: string[] = [];
	let n = 0;
	const nextOp = () => {
		if (typeof opts.ops === "function") return opts.ops();
		const ops = opts.ops;
		return ops[Math.min(n++, ops.length - 1)];
	};
	const api = {
		imports,
		reads,
		queryData: vi.fn(async (q: string) => {
			if (q.startsWith("organizations")) return { value: [{ languagecode: 1033 }] };
			if (q.startsWith("solutions"))
				return {
					value: [
						{
							description: "",
							publisherid: { customizationoptionvalueprefix: 31337 },
						},
					],
				};
			if (q.startsWith("RetrieveEntityRibbon("))
				return { CompressedEntityXml: emptyRibbonZip() };
			return { value: [] };
		}),
		execute: vi.fn(
			async (req: { operationName: string; parameters?: Record<string, unknown> }) => {
				if (req.operationName === "ImportSolutionAsync") {
					imports.push(req.parameters!);
					return { AsyncOperationId: OP, ImportJobKey: req.parameters!.ImportJobId };
				}
				if (req.operationName === "RetrieveApplicationRibbon")
					return { CompressedApplicationRibbonXml: emptyRibbonZip() };
				if (req.operationName === "PublishXml") return undefined;
				throw new Error(`unexpected ${req.operationName}`);
			},
		),
		retrieve: vi.fn(async (entity: string, id: string) => {
			reads.push(`${entity} ${id}`);
			if (entity === "asyncoperation") return nextOp();
			return { data: opts.job ?? SUCCESS_JOB };
		}),
		update: vi.fn(async () => opts.cancel?.()),
	};
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
	return api;
}

const ribbon = (location: RibbonLocation): RibbonDefinition => ({
	location,
	entityLogicalName: T,
	tabs: [],
});

async function publish(
	extra: {
		signal?: AbortSignal;
		importTimeoutMs?: number;
		publishCustomizations?: boolean;
	} = {},
) {
	vi.resetModules();
	const service = await import("@/services/dataverse/publishService");
	const progress: string[] = [];
	const run = service.publishRibbon(
		{
			entity: { logicalName: T, schemaName: T },
			locations: [{ current: ribbon("HomepageGrid"), baseline: ribbon("HomepageGrid") }],
			commands: [],
			enableRules: [],
			displayRules: [],
			locLabels: [],
			plan: {
				editedCommandIds: [],
				editedEnableRuleIds: [],
				editedDisplayRuleIds: [],
				deletedButtonIds: [],
				unhiddenButtonIds: [],
			},
			languageCode: 1033,
			solution: {
				uniqueName: "CBSLiveTest",
				friendlyName: "CBS Live Test",
				version: "1.0.0.0",
				publisherUniqueName: "cbstest",
				publisherName: "CBS Test",
				publisherPrefix: "cbstest",
			},
			busy: { sleep: async () => undefined },
			verifyDelayMs: 0,
			importPollMs: 1,
			publishCustomizations: false,
			...extra,
		},
		(m) => progress.push(m),
	);
	return { run, service, progress };
}

describe("#107 imports run as a system job", () => {
	it("sends ImportSolutionAsync with its own import job, polls the job, then verifies the import", async () => {
		const env = fakeEnvironment({ ops: [RUNNING, RUNNING, SUCCEEDED] });
		const { run } = await publish();
		const result = await run;
		expect(env.execute.mock.calls.map(([r]) => r.operationName)).not.toContain(
			"ImportSolution",
		);
		expect(env.imports).toHaveLength(1);
		const jobId = env.imports[0].ImportJobId as string;
		expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
		expect(env.imports[0]).toMatchObject({
			OverwriteUnmanagedCustomizations: true,
			PublishWorkflows: false,
		});
		expect(result.importJobId).toBe(jobId);
		// Three reads of the system job, then the import job's data.
		expect(env.reads).toEqual([
			`asyncoperation ${OP}`,
			`asyncoperation ${OP}`,
			`asyncoperation ${OP}`,
			`importjob ${jobId}`,
		]);
		expect(env.update).not.toHaveBeenCalled();
	});

	it("a failed job shows its message and the import job's failure, with the job to view", async () => {
		const env = fakeEnvironment({
			ops: [
				RUNNING,
				{
					statecode: 3,
					statuscode: 31,
					friendlymessage: "Solution import failed.",
					message: "ImportSolutionAsync failed with 0x80048033",
				},
			],
			job: FAILED_JOB,
		});
		const { run, service } = await publish();
		const err = (await run.catch((e: unknown) => e)) as Error;
		expect(err.message).toBe(
			"The import failed: Solution import failed. (ImportSolutionAsync failed with 0x80048033) — " +
				`Dataverse couldn't import the solution (0x80048033): Publisher "new" is reserved`,
		);
		expect(service.isPublishCancelled(err)).toBe(false);
		expect(service.importJobIdOf(err)).toBe(env.imports[0].ImportJobId);
	});

	it("a job that failed because another operation ran is retried with a new import job", async () => {
		const busy: AsyncOp = {
			statecode: 3,
			statuscode: 31,
			message:
				"0x80071151: Cannot start the requested operation [Import] because there is another [RibbonMetadataGeneration] running at this moment.",
		};
		const env = fakeEnvironment({ ops: [busy, SUCCEEDED] });
		const { run } = await publish();
		await run;
		expect(env.imports).toHaveLength(2);
		expect(env.imports[0].ImportJobId).not.toBe(env.imports[1].ImportJobId);
	});

	it("Cancel stops waiting, asks Dataverse to cancel the job, and says it did", async () => {
		let cancelled = false;
		const env = fakeEnvironment({
			ops: () => (cancelled ? CANCELED : RUNNING),
			cancel: async () => {
				cancelled = true;
			},
		});
		const controller = new AbortController();
		const { run, service } = await publish({ signal: controller.signal });
		await vi.waitFor(() => expect(env.reads.length).toBeGreaterThan(2));
		controller.abort();
		const err = (await run.catch((e: unknown) => e)) as Error;
		expect(service.isPublishCancelled(err)).toBe(true);
		expect(err.message).toBe("You cancelled the publish. Dataverse cancelled the import.");
		expect(env.update).toHaveBeenCalledWith("asyncoperation", OP, {
			statecode: 3,
			statuscode: 32,
		});
		expect(service.importJobIdOf(err)).toBe(env.imports[0].ImportJobId);
		// Nothing after the cancel: no verification read of the import job.
		expect(env.reads.some((r) => r.startsWith("importjob"))).toBe(false);
	});

	it("says honestly that Dataverse may still finish an import it didn't cancel", async () => {
		const env = fakeEnvironment({
			ops: [RUNNING],
			cancel: async () => {
				throw new Error("You can't cancel a system job generated by the platform.");
			},
		});
		const controller = new AbortController();
		const { run } = await publish({ signal: controller.signal });
		await vi.waitFor(() => expect(env.reads.length).toBeGreaterThan(1));
		controller.abort();
		await expect(run).rejects.toThrow(
			/^You cancelled the publish\. Command Bar Studio stopped waiting, but Dataverse may still finish the import: check Solutions › History for import job [0-9a-f-]{36} before you publish again\.$/,
		);
	});

	it("a cancel that loses the race to the import says the import finished", async () => {
		let cancelled = false;
		const env = fakeEnvironment({
			ops: () => (cancelled ? SUCCEEDED : RUNNING),
			cancel: async () => {
				cancelled = true;
			},
		});
		const controller = new AbortController();
		const { run } = await publish({ signal: controller.signal });
		await vi.waitFor(() => expect(env.reads.length).toBeGreaterThan(1));
		controller.abort();
		await expect(run).rejects.toThrow(
			"You cancelled the publish. The import had already finished, so your changes are imported but not published.",
		);
	});

	it("a cancel before the import starts imports nothing", async () => {
		const env = fakeEnvironment({ ops: [SUCCEEDED] });
		const controller = new AbortController();
		controller.abort();
		const { run, service } = await publish({ signal: controller.signal });
		const err = await run.catch((e: unknown) => e);
		expect(service.isPublishCancelled(err)).toBe(true);
		expect((err as Error).message).toBe(
			"You cancelled the publish before anything was imported.",
		);
		expect(env.imports).toHaveLength(0);
		expect(service.importJobIdOf(err)).toBeUndefined();
	});

	it("stops waiting after the timeout, tries to cancel, and says Dataverse may still finish", async () => {
		const env = fakeEnvironment({
			ops: [RUNNING],
			cancel: async () => {
				throw new Error("Not allowed.");
			},
		});
		const { run, service } = await publish({ importTimeoutMs: 20 });
		const err = (await run.catch((e: unknown) => e)) as Error;
		expect(err.message).toMatch(
			/^The import didn't finish within 0 seconds, so Command Bar Studio stopped waiting for it\. Dataverse may still finish it: check Solutions › History for import job [0-9a-f-]{36} before you publish again\.$/,
		);
		expect(env.update).toHaveBeenCalledWith("asyncoperation", OP, {
			statecode: 3,
			statuscode: 32,
		});
		expect(service.isPublishCancelled(err)).toBe(false);
		expect(service.importJobIdOf(err)).toBe(env.imports[0].ImportJobId);
	});

	it("an import that succeeds just as it times out counts as succeeded", async () => {
		let cancelled = false;
		fakeEnvironment({
			ops: () => (cancelled ? SUCCEEDED : RUNNING),
			cancel: async () => {
				cancelled = true;
			},
		});
		const { run } = await publish({ importTimeoutMs: 20 });
		await expect(run).resolves.toMatchObject({ importJobId: expect.any(String) });
	});

	it("a cancel during the second import says the changes are published", async () => {
		const controller = new AbortController();
		let imports = 0;
		const env = fakeEnvironment({
			// The first import succeeds; the second keeps running until cancelled.
			ops: () => (imports < 2 ? SUCCEEDED : controller.signal.aborted ? CANCELED : RUNNING),
		});
		const execute = env.execute.getMockImplementation()!;
		env.execute.mockImplementation(async (req) => {
			if (req.operationName === "ImportSolutionAsync") imports++;
			return execute(req);
		});
		const { run, service } = await publish({
			signal: controller.signal,
			publishCustomizations: true,
		});
		await vi.waitFor(() => expect(imports).toBe(2));
		controller.abort();
		const err = (await run.catch((e: unknown) => e)) as Error;
		expect(service.isPublishCancelled(err)).toBe(true);
		expect(err.message).toMatch(
			/^Your changes were imported and published, but you cancelled the second import, which refreshes Unified Interface's command-bar metadata \(You cancelled the publish\. Dataverse cancelled the import\.\)\./,
		);
		expect(service.importJobIdOf(err)).toBe(env.imports[1].ImportJobId);
	});

	it("fetchImportJobLog reads the import job's data", async () => {
		const env = fakeEnvironment({ ops: [SUCCEEDED], job: FAILED_JOB });
		vi.resetModules();
		const { fetchImportJobLog } = await import("@/services/dataverse/publishService");
		expect(await fetchImportJobLog("job-1")).toBe(FAILED_JOB);
		expect(env.reads).toEqual(["importjob job-1"]);
	});
});
