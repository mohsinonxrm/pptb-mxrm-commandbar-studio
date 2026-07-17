import { zipSync, strToU8 } from "fflate";
import { generateRibbonDiffXml, wrapInCustomizationsXml, escapeXml } from "@/services/xmlGenerator";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type {
	RibbonDefinition,
	CommandDefinition,
	EnableRule,
	DisplayRule,
	LocLabel,
} from "@/types/ribbon";

const dataverseAPI = (window as Window & typeof globalThis).dataverseAPI!;

type ImportStatus = {
	// PPTB's getImportJobStatus return shape is loosely documented — over
	// time we've observed both `{ data: { progress: { completed } } }` and
	// shapes more like the raw Dataverse `importjob` record. Treat all
	// fields as optional and check multiple signals.
	data?: {
		progress?:
			| {
					completed?: boolean;
			  }
			| number;
		completedon?: string | null;
	};
	progress?: number;
	completedon?: string | null;
	statuscode?: number;
};

function isImportComplete(status: ImportStatus): boolean {
	// Wrapped shape — `{ data: { progress: { completed: true } } }`
	const p = status.data?.progress;
	if (typeof p === "object" && p !== null && (p as { completed?: boolean }).completed === true) {
		return true;
	}
	// Numeric progress at 100 either at root or nested
	if (typeof status.progress === "number" && status.progress >= 100) return true;
	if (typeof p === "number" && p >= 100) return true;
	// `completedon` set anywhere indicates the job finished
	if (status.completedon) return true;
	if (status.data?.completedon) return true;
	// Dataverse importjob statuscode 30 == Succeeded
	if (status.statuscode === 30) return true;
	return false;
}

interface PublishInput {
	current: RibbonDefinition;
	baseline: RibbonDefinition;
	commands: CommandDefinition[];
	enableRules: EnableRule[];
	displayRules: DisplayRule[];
	locLabels: LocLabel[];
	entityLogicalName: string;
	solutionUniqueName: string;
	/** Publisher's `uniquename` (e.g. `mohsinonxrm`). Used for solution.xml's
	 * `<Publisher><UniqueName>` so the import lands under the right publisher,
	 * not the default "new" one. */
	publisherUniqueName: string;
	/** Publisher's display name (e.g. `MohsinOnXrm`). */
	publisherName: string;
	/** Publisher's `customizationprefix` (e.g. `mxrm`). */
	publisherPrefix: string;
	solutionVersion: string;
	/**
	 * GUIDs of `ribboncustomization` records that the solution declares as
	 * components (`componenttype = 50`). Required when publishing
	 * application-ribbon changes — each ID becomes a
	 * `<RootComponent type="50" id="{guid}" behavior="0" />` entry in the
	 * generated solution.xml so Dataverse accepts the import. Empty / omitted
	 * for entity-scope publishes.
	 */
	ribbonCustomizationIds?: string[];
	publishCustomizations?: boolean;
}

interface PublishXmlInput {
	entityLogicalNames: string[];
	includeApplicationRibbon: boolean;
	publishDependencies: boolean;
}

interface PublishAllAsyncResult {
	asyncOperationId: string;
	statusCode?: number;
}

/**
 * Generates RibbonDiffXml, packages it into a solution ZIP, imports it,
 * polls for completion, then publishes customizations.
 */
export async function publishRibbon(
	input: PublishInput,
	onProgress?: (msg: string) => void,
): Promise<void> {
	const logs = useRuntimeLogStore.getState();
	onProgress?.("Generating RibbonDiffXml…");
	logs.logInfo("publish", `Generating RibbonDiffXml for ${input.entityLogicalName}.`);

	const ribbonDiffXml = generateRibbonDiffXml({
		current: input.current,
		baseline: input.baseline,
		commands: input.commands,
		enableRules: input.enableRules,
		displayRules: input.displayRules,
		locLabels: input.locLabels,
		entityLogicalName: input.entityLogicalName,
		location: input.current.location,
	});

	const formRibbonScope = useSessionStore.getState().formRibbonScope;
	const selectedFormId = useSessionStore.getState().selectedFormId;
	const scope =
		input.current.location === "Application"
			? "application"
			: input.current.location === "Form" && formRibbonScope === "form"
				? "form"
				: "entity";
	const customizationsXml = wrapInCustomizationsXml(
		ribbonDiffXml,
		input.entityLogicalName,
		scope,
		scope === "form" ? selectedFormId : undefined,
	);

	// Determine what root components to declare in solution.xml so Dataverse
	// accepts the customizations we're packaging. Without these, the import
	// fails with 0x8004803a "component is not declared in the solution file
	// as a root component".
	const rootComponents: RootComponentSpec[] = [];
	if (scope === "entity" && input.entityLogicalName) {
		// Entity-scope ribbon edit → declare the entity as a SHELL-ONLY root
		// component (behavior=2 = "Include As Shell Only").
		//
		// This was previously behavior=0 ("Include Subcomponents"), which made
		// the solution claim ownership of EVERY attribute / form / view /
		// relationship of the entity. On import that drags all of them into the
		// solution (and any later export carries them) — the reported
		// "importing the ribbon pulls in all of account's components" bug.
		//
		// MS docs (export-prepare-edit-import-ribbon): "For the purpose of
		// editing table ribbons, you do not have to include required
		// components." behavior=2 adds just the entity shell so the
		// RibbonDiffXml in customizations.xml has something to attach to,
		// without pulling subcomponents.
		rootComponents.push({
			type: 1,
			schemaName: input.entityLogicalName,
			behavior: 2,
		});
	} else if (scope === "form" && input.entityLogicalName && selectedFormId) {
		// Form-scope ribbon edit → declare the entity parent as a shell
		// (behavior=2, same reasoning as above) plus the systemform, which is
		// the actual ribbon carrier and so includes its own content (behavior=0).
		rootComponents.push({
			type: 1,
			schemaName: input.entityLogicalName,
			behavior: 2,
		});
		rootComponents.push({ type: 60, id: selectedFormId, behavior: 0 });
	}
	if (scope === "application" && input.ribbonCustomizationIds?.length) {
		// Application-ribbon publish path. Declare each `ribboncustomization`
		// component the user's solution owns so Dataverse accepts the import.
		// The user adds these to their solution via maker.powerapps.com →
		// Solutions → <solution> → Add existing → Application Ribbons.
		for (const id of input.ribbonCustomizationIds) {
			rootComponents.push({ type: 50, id, behavior: 0 });
		}
	}

	const solutionXml = generateSolutionXml({
		uniqueName: input.solutionUniqueName,
		publisherUniqueName: input.publisherUniqueName,
		publisherName: input.publisherName,
		publisherPrefix: input.publisherPrefix,
		version: input.solutionVersion,
		rootComponents,
	});

	onProgress?.("Packaging solution ZIP…");
	logs.logInfo("publish", "Packaging solution ZIP...");
	const zipBytes = zipSync({
		"customizations.xml": strToU8(customizationsXml),
		"solution.xml": strToU8(solutionXml),
		"[Content_Types].xml": strToU8(
			'<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
		),
	});

	// Convert to base64
	let binaryStr = "";
	for (let i = 0; i < zipBytes.length; i++) {
		binaryStr += String.fromCharCode(zipBytes[i]);
	}
	const base64Zip = btoa(binaryStr);

	onProgress?.("Importing solution…");
	logs.logInfo("publish", "Importing solution via deploySolution...");
	// The Dataverse `ImportSolution` action requires the caller to supply a
	// client-generated `ImportJobId` GUID — without it the request fails with
	// 0x80048d19 ("One or more parameters of the operation 'ImportSolution'
	// are missing from the request payload. The missing parameters are:
	// ImportJobId."). PPTB's `deploySolution` types mark the option as
	// optional, but Dataverse rejects the call when it's omitted.
	const importJobId =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: // Fallback for runtimes without crypto.randomUUID (very old).
				`${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
					.toString(16)
					.slice(2)}`;
	logs.logInfo("publish", `Import job id: ${importJobId}`);
	await dataverseAPI.deploySolution(base64Zip, {
		importJobId,
		overwriteUnmanagedCustomizations: true,
		publishWorkflows: false,
	});

	onProgress?.("Waiting for import to complete…");
	logs.logInfo("publish", `Polling import job ${importJobId}...`);
	// Solution imports — especially ones that touch ribbon metadata — can
	// legitimately take 2–5 minutes on busy environments. Previously we
	// capped at 60 × 2s = 120s and reported a timeout even when the maker
	// portal showed the import had succeeded. Bumped to 150 × 2s = 300s
	// (5 minutes) and the completion check now accepts multiple signal shapes.
	const MAX_ATTEMPTS = 150;
	const POLL_INTERVAL_MS = 2000;
	let status = (await dataverseAPI.getImportJobStatus(importJobId)) as ImportStatus;
	let attempts = 0;
	while (!isImportComplete(status) && attempts < MAX_ATTEMPTS) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
		status = (await dataverseAPI.getImportJobStatus(importJobId)) as ImportStatus;
		attempts++;
		if (attempts % 15 === 0) {
			// Surface a progress beat every 30s so the user can see we're
			// still waiting and not stuck.
			onProgress?.(`Still importing… (${attempts * 2}s elapsed)`);
		}
	}

	if (!isImportComplete(status)) {
		const elapsed = Math.round((MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000);
		logs.logError(
			"publish",
			`Solution import did not complete within ${elapsed}s. Check Solutions › History in maker.powerapps.com for job ${importJobId} — the import may still succeed there.`,
		);
		throw new Error(
			`Solution import did not signal completion within ${elapsed} seconds. Check Solutions › History for job ${importJobId}.`,
		);
	}

	if (input.publishCustomizations !== false) {
		onProgress?.("Publishing customizations…");
		logs.logInfo("publish", "Publishing customizations...");
		const publishStart = new Date();
		if (input.entityLogicalName && input.entityLogicalName !== "{!EntityLogicalName}") {
			await dataverseAPI.publishCustomizations(input.entityLogicalName);
		} else {
			await dataverseAPI.publishCustomizations();
		}
		// Verify that the ribbon-metadata compile pipeline actually succeeded.
		// publishCustomizations() returns when the customisation record is
		// updated, but Dataverse processes the actual ribbon-metadata compilation
		// asynchronously via the `ribbonmetadatasettoprocess` job queue. A
		// schema-validation failure there is silent unless we poll for it.
		await pollRibbonMetadataProcessing(input.entityLogicalName, publishStart, logs, onProgress);
	}

	onProgress?.("Published successfully!");
	logs.logInfo("publish", "Publish completed successfully.");
}

/**
 * Polls the `ribbonmetadatasettoprocess` job-queue table for up to 30 s after
 * `publishCustomizations` returns.  The actual ribbon-metadata compilation runs
 * asynchronously in Dataverse; this is the only way to detect silent compile
 * failures (bad LocLabel refs, schema violations, etc.) that would otherwise
 * let CBS report "Success!" while the user's buttons never appear.
 *
 * The poll is best-effort: if the table is unavailable or no job row appears
 * within the window, we log a note and continue — the prior publish APIs
 * already confirmed the import completed.
 */
async function pollRibbonMetadataProcessing(
	entityLogicalName: string,
	publishStart: Date,
	logs: ReturnType<typeof useRuntimeLogStore.getState>,
	onProgress?: (msg: string) => void,
): Promise<void> {
	const MAX_POLLS = 15;
	const POLL_MS = 2000;
	const entityFilter =
		entityLogicalName && entityLogicalName !== "{!EntityLogicalName}"
			? `entityname eq '${entityLogicalName}'`
			: null;
	// ISO timestamp (URL-safe, no fractional seconds)
	const since = publishStart.toISOString().replace(/\.\d+Z$/, "Z");

	// Base query — select only the fields we actually use.
	const baseQuery =
		`ribbonmetadatasettoprocess?$select=entityname,processedon,completedon,` +
		`exceptionmessage,retrycount,status&$orderby=createdon desc&$top=10` +
		`&$filter=createdon gt ${since}` +
		(entityFilter ? ` and (${entityFilter})` : "");

	for (let poll = 0; poll < MAX_POLLS; poll++) {
		await new Promise((r) => setTimeout(r, POLL_MS));
		try {
			type MetaJob = {
				entityname?: string;
				status?: number;
				completedon?: string | null;
				processedon?: string | null;
				exceptionmessage?: string | null;
				retrycount?: number;
			};
			const resp = await dataverseAPI.queryData(baseQuery);
			const jobs: MetaJob[] = Array.isArray(resp)
				? resp
				: Array.isArray(resp?.value)
					? resp.value
					: [];

			if (jobs.length === 0) {
				// No job created yet — Dataverse may still be queueing it.
				continue;
			}

			// Check for failures first (exceptionmessage set).
			const failedJob = jobs.find((j) => j.exceptionmessage);
			if (failedJob) {
				const entity = failedJob.entityname || entityLogicalName;
				const msg = `Ribbon-metadata compile failed for ${entity}: ` + failedJob.exceptionmessage;
				logs.logError("publish", msg);
				onProgress?.(`⚠ ${msg}`);
				// Throw so BulkPublishModal can surface this as an error rather
				// than a silent success.
				throw new Error(msg);
			}

			// Check for a successfully completed job.
			const doneJob = jobs.find(
				(j) => j.completedon || j.processedon || j.status === 4 /* Succeeded */,
			);
			if (doneJob) {
				const entity = doneJob.entityname || entityLogicalName;
				logs.logInfo("publish", `Ribbon metadata compiled successfully for ${entity}.`);
				return;
			}

			if (poll === Math.floor(MAX_POLLS / 2)) {
				onProgress?.("Waiting for ribbon-metadata compilation…");
				logs.logInfo("publish", "Ribbon metadata job found; waiting for completion…");
			}
		} catch (err) {
			if (err instanceof Error && err.message.includes("Ribbon-metadata compile failed")) {
				throw err; // re-throw our own compile-error
			}
			// Any other error (permission denied, table not available in org,
			// network blip) → log and give up gracefully without failing publish.
			logs.logWarn(
				"publish",
				`Could not read ribbonmetadatasettoprocess (${err instanceof Error ? err.message : String(err)}). ` +
					`Ribbon metadata verification skipped.`,
			);
			return;
		}
	}

	// Timed out without seeing a completed job — not necessarily an error;
	// the compile may still succeed. The publish API calls already confirmed
	// the import completed.
	logs.logInfo(
		"publish",
		"Ribbon metadata job not observed within 30 s. The publish appears complete — " +
			"open the entity to confirm your changes are live.",
	);
}

function buildPublishXml(input: PublishXmlInput): string {
	const entityNodes = input.entityLogicalNames
		.map((name) => `<entity>${escapeXml(name)}</entity>`)
		.join("");

	const dependencyNodes = input.publishDependencies
		? `<nodes/><securityroles/><settings/><workflows/><templates/><plugins/><sdkmessageprocessingsteps/><serviceendpoints/><webresources/>`
		: `<nodes/>`;

	// PublishXml supports selecting components using ImportExportXml payload.
	// Application ribbon publication isn't directly targetable by a dedicated node
	// in this payload, so we rely on global publish fallback when requested.
	void input.includeApplicationRibbon;

	return `<importexportxml><entities>${entityNodes}</entities>${dependencyNodes}</importexportxml>`;
}

export async function publishUsingPublishXml(
	input: PublishXmlInput,
	onProgress?: (msg: string) => void,
): Promise<void> {
	const logs = useRuntimeLogStore.getState();
	const entities = input.entityLogicalNames.filter(Boolean);
	if (entities.length === 0) {
		if (input.includeApplicationRibbon) {
			onProgress?.("Publishing all customizations...");
			await dataverseAPI.publishCustomizations();
		}
		return;
	}

	const parameterXml = buildPublishXml({
		entityLogicalNames: entities,
		includeApplicationRibbon: input.includeApplicationRibbon,
		publishDependencies: input.publishDependencies,
	});

	onProgress?.("Publishing selected components with PublishXml...");
	logs.logInfo("publish", `PublishXml request for ${entities.length} table(s).`);

	try {
		await (dataverseAPI as any).execute({
			operationName: "PublishXml",
			operationType: "action",
			parameters: {
				ParameterXml: parameterXml,
			},
		});

		if (input.includeApplicationRibbon) {
			onProgress?.("Publishing application ribbon...");
			await dataverseAPI.publishCustomizations();
		}

		logs.logInfo("publish", "PublishXml completed successfully.");
	} catch (error) {
		logs.logWarn(
			"publish",
			`PublishXml failed, falling back to publishCustomizations(): ${error instanceof Error ? error.message : String(error)}`,
		);
		for (const entityName of entities) {
			onProgress?.(`Fallback publish for ${entityName}...`);
			await dataverseAPI.publishCustomizations(entityName);
		}
		if (input.includeApplicationRibbon) {
			onProgress?.("Fallback publish for application ribbon...");
			await dataverseAPI.publishCustomizations();
		}
	}
}

export async function publishAllAsync(
	onProgress?: (msg: string) => void,
	options?: { pollIntervalMs?: number; timeoutMs?: number },
): Promise<PublishAllAsyncResult> {
	const logs = useRuntimeLogStore.getState();
	const pollIntervalMs = options?.pollIntervalMs ?? 2000;
	const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;

	onProgress?.("Starting asynchronous publish (PublishAllXmlAsync)...");
	logs.logInfo("publish", "Calling PublishAllXmlAsync action.");

	const response = (await (dataverseAPI as any).execute({
		operationName: "PublishAllXmlAsync",
		operationType: "action",
	})) as { AsyncOperationId?: string };

	const asyncOperationId = response?.AsyncOperationId;
	if (!asyncOperationId) {
		throw new Error("PublishAllXmlAsync did not return AsyncOperationId.");
	}

	logs.logInfo("publish", `PublishAllXmlAsync job id: ${asyncOperationId}`);
	onProgress?.("Async publish job started. Waiting for completion...");

	const startedAt = Date.now();
	let attempt = 0;
	let lastStatusCode: number | undefined;

	while (Date.now() - startedAt < timeoutMs) {
		attempt += 1;
		// Use the singular logical name — PPTB pluralizes internally.
		const job = (await dataverseAPI.retrieve("asyncoperation", asyncOperationId, [
			"asyncoperationid",
			"statecode",
			"statuscode",
			"name",
			"message",
			"friendlymessage",
			"completedon",
		])) as {
			statecode?: number;
			statuscode?: number;
			completedon?: string;
			message?: string;
			friendlymessage?: string;
		};

		lastStatusCode = job.statuscode;
		const isCompleted = job.statecode === 3 || Boolean(job.completedon);
		if (isCompleted) {
			if (typeof job.statuscode === "number" && job.statuscode !== 30) {
				const details = job.friendlymessage || job.message || `statuscode=${job.statuscode}`;
				throw new Error(`Asynchronous publish failed: ${details}`);
			}
			onProgress?.("Asynchronous publish completed successfully.");
			logs.logInfo("publish", `PublishAllXmlAsync completed in ${attempt} poll(s).`);
			return { asyncOperationId, statusCode: job.statuscode };
		}

		onProgress?.(`Waiting for async publish job... (poll ${attempt})`);
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	throw new Error(
		`Asynchronous publish timed out after ${Math.round(timeoutMs / 1000)} seconds (last status: ${lastStatusCode ?? "unknown"}).`,
	);
}

interface RootComponentSpec {
	/** SolutionComponent type code — 1=Entity, 50=Ribbon Customization,
	 * 60=SystemForm, 61=WebResource, etc. */
	type: number;
	/** Entity-type components use `schemaName` (logical name). */
	schemaName?: string;
	/** Form / web resource / ribbon-customization components use the GUID `id`. */
	id?: string;
	/** 0 = include subcomponents, 1 = don't, 2 = shell only. */
	behavior: 0 | 1 | 2;
}

interface SolutionXmlInput {
	uniqueName: string;
	publisherUniqueName: string;
	publisherName: string;
	publisherPrefix: string;
	version: string;
	rootComponents: RootComponentSpec[];
}

function generateSolutionXml(input: SolutionXmlInput): string {
	// Fall back to safe placeholders if the publisher fields are missing —
	// Dataverse will reject the import outright rather than silently routing
	// to a "new" publisher we don't intend.
	const pubUnique = input.publisherUniqueName?.trim() || "DefaultPublisher";
	const pubName = input.publisherName?.trim() || pubUnique;
	const pubPrefix = input.publisherPrefix?.trim() || "new";

	const rootComponentsXml =
		input.rootComponents.length === 0
			? "<RootComponents/>"
			: `<RootComponents>
      ${input.rootComponents
				.map((c) => {
					const attrs: string[] = [`type="${c.type}"`];
					if (c.schemaName) attrs.push(`schemaName="${escapeXml(c.schemaName)}"`);
					if (c.id) attrs.push(`id="{${escapeXml(c.id)}}"`);
					attrs.push(`behavior="${c.behavior}"`);
					return `<RootComponent ${attrs.join(" ")} />`;
				})
				.join("\n      ")}
    </RootComponents>`;

	return `<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.1.0.0" SolutionPackageVersion="9.1" languagecode="1033" generatedBy="CommandBarStudio">
  <SolutionManifest>
    <UniqueName>${escapeXml(input.uniqueName)}</UniqueName>
    <LocalizedNames>
      <LocalizedName description="${escapeXml(input.uniqueName)}" languagecode="1033"/>
    </LocalizedNames>
    <Descriptions/>
    <Version>${escapeXml(input.version)}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>${escapeXml(pubUnique)}</UniqueName>
      <LocalizedNames>
        <LocalizedName description="${escapeXml(pubName)}" languagecode="1033"/>
      </LocalizedNames>
      <Descriptions/>
      <EMailAddress/>
      <SupportingWebsiteUrl/>
      <CustomizationPrefix>${escapeXml(pubPrefix)}</CustomizationPrefix>
      <CustomizationOptionValuePrefix>10000</CustomizationOptionValuePrefix>
      <Addresses/>
    </Publisher>
    ${rootComponentsXml}
    <MissingDependencies/>
  </SolutionManifest>
</ImportExportXml>`;
}
