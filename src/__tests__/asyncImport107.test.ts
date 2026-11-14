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
const BUSY =
	"0x80071151: Cannot start the requested operation [Import] because there is another [RibbonMetadataGeneration] running at this moment.";
// As read live from a failed import of an invalid zip (shortened).
const INVALID_ZIP_MESSAGE =
	"Exception type: System.ServiceModel.FaultException`1[Microsoft.Xrm.Sdk.OrganizationServiceFault]\r\n" +
	"Message: The solution file is invalid. The compressed file must contain the following files at its root: solution.xml, customizations.xml, and [Content_Types].xml.\r\n" +
	"   at Microsoft.Crm.Tools.ImportExportPublish.ImportSolutionPackage.Validate()\r\n" +
	"   at Microsoft.Crm.Tools.ImportExportPublish.ImportHandler.Run()";

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
 * (the last one repeats); `job` is the import job's data XML, `null` when there is no import job.
 */
function fakeEnvironment(opts: {
	ops: AsyncOp[] | (() => AsyncOp);
	job?: string | null;
	cancel?: () => Promise<void>;
	/** Starting the n-th import (1-based) fails like this. */
	startFails?: (n: number) => Error | null;
}) {
	const imports: Record<string, unknown>[] = [];
	const reads: string[] = [];
	let n = 0;
	let starts = 0;
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
					const failure = opts.startFails?.(++starts);
					if (failure) throw failure;
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
			if (opts.job === null)
				throw new Error(`0x80040217: importjob With Id = ${id} Does Not Exist`);
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
		busy?: { sleep: (ms: number) => Promise<void> };
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
		// Verified live: an empty ComponentParameters fails the request (0x80040216).
		expect(env.imports[0]).toEqual({
			CustomizationFile: expect.any(String),
			ImportJobId: jobId,
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

	it("a failed job shows its friendly message and the import job's failure, with the job to view", async () => {
		const env = fakeEnvironment({
			ops: [
				RUNNING,
				{
					statecode: 3,
					statuscode: 31,
					friendlymessage: "Solution import failed.",
					message: INVALID_ZIP_MESSAGE,
				},
			],
			job: FAILED_JOB,
		});
		const { run, service } = await publish();
		const err = (await run.catch((e: unknown) => e)) as Error;
		// Not both: the friendly message only.
		expect(err.message).toBe(
			"The import failed: Solution import failed. — " +
				`Dataverse couldn't import the solution (0x80048033): Publisher "new" is reserved`,
		);
		expect(service.isPublishCancelled(err)).toBe(false);
		expect(service.importJobIdOf(err)).toBe(env.imports[0].ImportJobId);
	});

	it("without a friendly message, shows the message without the exception type and the stack", async () => {
		fakeEnvironment({
			ops: [
				{ statecode: 3, statuscode: 31, friendlymessage: "", message: INVALID_ZIP_MESSAGE },
			],
			// An invalid zip creates no import job (verified live).
			job: null,
		});
		const { run } = await publish();
		await expect(run).rejects.toThrow(
			/^The import failed: The solution file is invalid\. The compressed file must contain the following files at its root: solution\.xml, customizations\.xml, and \[Content_Types\]\.xml\.$/,
		);
	});

	it("a solution file with no import job: the failure stands, and the log reads as none", async () => {
		fakeEnvironment({
			ops: [
				{
					statecode: 3,
					statuscode: 31,
					friendlymessage: "The solution file is invalid.",
					message: INVALID_ZIP_MESSAGE,
				},
			],
			job: null,
		});
		const { run, service } = await publish();
		const err = (await run.catch((e: unknown) => e)) as Error;
		expect(err.message).toBe("The import failed: The solution file is invalid.");
		expect(await service.fetchImportJobLog(service.importJobIdOf(err)!)).toBeNull();
	});

	it("fetchImportJobLog reads the import job's data, and still fails on other errors", async () => {
		const env = fakeEnvironment({ ops: [SUCCEEDED], job: FAILED_JOB });
		vi.resetModules();
		const { fetchImportJobLog } = await import("@/services/dataverse/publishService");
		expect(await fetchImportJobLog("job-1")).toBe(FAILED_JOB);
		expect(env.reads).toEqual(["importjob job-1"]);
		env.retrieve.mockRejectedValueOnce(new Error("0x80040220: no privilege"));
		await expect(fetchImportJobLog("job-1")).rejects.toThrow("no privilege");
	});

	it("a job that failed because another operation ran is retried with a new import job", async () => {
		const env = fakeEnvironment({
			ops: [{ statecode: 3, statuscode: 31, message: BUSY }, SUCCEEDED],
		});
		const { run } = await publish();
		await run;
		expect(env.imports).toHaveLength(2);
		expect(env.imports[0].ImportJobId).not.toBe(env.imports[1].ImportJobId);
	});

	it("Cancel during the wait for a busy environment stops the retry", async () => {
		const env = fakeEnvironment({
			ops: [SUCCEEDED],
			startFails: () => new Error(BUSY),
		});
		const controller = new AbortController();
		let sleeps = 0;
		const { run, service } = await publish({
			signal: controller.signal,
			// The retry's wait never ends by itself.
			busy: {
				sleep: () => {
					sleeps++;
					return new Promise<void>(() => undefined);
				},
			},
		});
		await vi.waitFor(() => expect(sleeps).toBe(1));
		controller.abort();
		const err = await run.catch((e: unknown) => e);
		expect(service.isPublishCancelled(err)).toBe(true);
		expect((err as Error).message).toBe(
			"You cancelled the publish before anything was imported.",
		);
		expect(service.cancelMayStillFinish(err)).toBe(false);
		// One attempt, refused as busy; no other.
		expect(
			env.execute.mock.calls.filter(([r]) => r.operationName === "ImportSolutionAsync"),
		).toHaveLength(1);
		expect(sleeps).toBe(1);
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
		expect(service.cancelMayStillFinish(err)).toBe(false);
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
		const { run, service } = await publish({ signal: controller.signal });
		await vi.waitFor(() => expect(env.reads.length).toBeGreaterThan(1));
		controller.abort();
		const err = await run.catch((e: unknown) => e);
		expect((err as Error).message).toMatch(
			/^You cancelled the publish\. Command Bar Studio stopped waiting, but Dataverse may still finish the import: check Solutions › History for import job [0-9a-f-]{36} before you publish again\.$/,
		);
		expect(service.cancelMayStillFinish(err)).toBe(true);
	});

	it("doesn't try to cancel a job that already completed: a cancel that lost the race says so", async () => {
		const controller = new AbortController();
		const env = fakeEnvironment({
			// The import finished just as Cancel was clicked.
			ops: () => (controller.signal.aborted ? SUCCEEDED : RUNNING),
		});
		const { run, service } = await publish({ signal: controller.signal });
		await vi.waitFor(() => expect(env.reads.length).toBeGreaterThan(1));
		controller.abort();
		const err = await run.catch((e: unknown) => e);
		expect((err as Error).message).toBe(
			"You cancelled the publish. The import had already finished, so your changes are imported but not published.",
		);
		expect(env.update).not.toHaveBeenCalled();
		expect(service.cancelMayStillFinish(err)).toBe(false);
	});

	it("a job that completes between the cancel and the read after it is reported as completed", async () => {
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
		expect(env.update).toHaveBeenCalledTimes(1);
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

	it("a cancel during the second import: published, with a warning about the command bar", async () => {
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
		const { run } = await publish({
			signal: controller.signal,
			publishCustomizations: true,
		});
		await vi.waitFor(() => expect(imports).toBe(2));
		controller.abort();
		const result = await run;
		expect(result.importJobId).toBe(env.imports[0].ImportJobId);
		expect(result.verification).toMatchObject({
			ok: false,
			importJobId: env.imports[1].ImportJobId,
		});
		expect(result.verification!.message).toBe(
			"Your changes were imported and published, but you cancelled the second import, which " +
				"refreshes Unified Interface's command-bar metadata. Dataverse " +
				"cancelled the import. New or changed buttons may not appear in the app until the entity's " +
				"ribbon is published again, or for up to about 25 minutes.",
		);
	});

	it("a failed second import: published, with a warning about the command bar", async () => {
		let imports = 0;
		const env = fakeEnvironment({
			ops: () =>
				imports < 2
					? SUCCEEDED
					: { statecode: 3, statuscode: 31, friendlymessage: "Something broke." },
		});
		const execute = env.execute.getMockImplementation()!;
		env.execute.mockImplementation(async (req) => {
			if (req.operationName === "ImportSolutionAsync") imports++;
			return execute(req);
		});
		const { run } = await publish({ publishCustomizations: true });
		const result = await run;
		expect(result.verification?.ok).toBe(false);
		expect(result.verification?.message).toMatch(
			/^Your changes were imported and published, but refreshing Unified Interface's command-bar metadata failed \(The import failed: Something broke\.\)\. New or changed buttons/,
		);
	});
});
