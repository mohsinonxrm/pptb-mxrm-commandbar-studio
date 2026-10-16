import { zipSync, strToU8 } from "fflate";
import {
	generateRibbonDiffXml,
	buildCustomizationsXml,
	escapeXml,
	generateCommandDefinition,
	generateEnableRule,
	generateDisplayRule,
} from "@/services/xmlGenerator";
import {
	emptyRibbonDiffParts,
	mergeRibbonDiffParts,
	parseRibbonDiffParts,
	serializeRibbonDiffParts,
	countRibbonDiffParts,
	mergeScopeChanges,
	ownControlIds,
} from "@/services/ribbonDiffMerge";
import { fetchUnmanagedRibbonParts } from "@/services/dataverse/ribbonLayerService";
import type { ScopePlan } from "@/services/publishPlan";
import { verifyRibbonImport } from "@/services/importJobVerification";
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

interface PublishXmlInput {
	entityLogicalNames: string[];
	includeApplicationRibbon: boolean;
	publishDependencies: boolean;
}

interface PublishAllAsyncResult {
	asyncOperationId: string;
	statusCode?: number;
}

export interface PublishLocationDelta {
	current: RibbonDefinition;
	baseline: RibbonDefinition;
}

export interface PublishSolutionInfo {
	uniqueName: string;
	/** Written as the solution's LocalizedName — must be the existing friendly
	 * name, otherwise the import renames the solution (#15). */
	friendlyName: string;
	version: string;
	/** Publisher's `uniquename` (e.g. `mohsinonxrm`). */
	publisherUniqueName: string;
	/** Publisher's display name (e.g. `MohsinOnXrm`). */
	publisherName: string;
	/** Publisher's `customizationprefix` (e.g. `mxrm`). */
	publisherPrefix: string;
	/** Publisher's `customizationoptionvalueprefix`. */
	publisherOptionValuePrefix?: number;
}

export interface PublishRibbonInput {
	/** The table whose ribbon is published, or `null` for the application ribbon. */
	entity: { logicalName: string; schemaName?: string; displayName?: string } | null;
	/** Every location of this ribbon scope that has changes. For a table that is
	 * HomepageGrid / SubGrid / Form — they are published together in ONE import,
	 * because each import replaces the table's whole unmanaged ribbon (#11). */
	locations: PublishLocationDelta[];
	commands: CommandDefinition[];
	enableRules: EnableRule[];
	displayRules: DisplayRule[];
	locLabels: LocLabel[];
	/** What changed in this scope (see publishPlan.planScope). */
	plan: Pick<ScopePlan, "editedCommandIds" | "editedEnableRuleIds" | "editedDisplayRuleIds" | "deletedButtonIds" | "unhiddenButtonIds">;
	solution: PublishSolutionInfo;
	/**
	 * GUIDs of `ribboncustomization` components (`componenttype = 50`) in the
	 * solution. The application ribbon can only be imported when the solution
	 * contains Application Ribbons.
	 */
	ribbonCustomizationIds?: string[];
	/** Run PublishXml for the table right after the import (default true). */
	publishCustomizations?: boolean;
}

export interface PublishRibbonResult {
	/** Number of elements in the RibbonDiffXml that was imported (existing + changed). */
	elementCount: number;
	/** Number of elements that came from the existing unmanaged layer. */
	preservedCount: number;
	importJobId: string;
}

/**
 * Builds the COMPLETE RibbonDiffXml for one ribbon scope: the existing
 * unmanaged layer (read from the ribbon component tables) with CBS's changes
 * for every location merged in (see ribbonDiffMerge.mergeScopeChanges).
 */
export async function buildMergedRibbonDiffXml(
	input: Pick<
		PublishRibbonInput,
		"entity" | "locations" | "commands" | "enableRules" | "displayRules" | "locLabels" | "plan"
	>,
): Promise<{
	xml: string;
	elementCount: number;
	preservedCount: number;
	changedCount: number;
}> {
	const entityLogicalName = input.entity?.logicalName ?? "{!EntityLogicalName}";

	let delta = emptyRibbonDiffParts();
	for (const loc of input.locations) {
		const xml = generateRibbonDiffXml({
			current: loc.current,
			baseline: loc.baseline,
			commands: input.commands,
			enableRules: input.enableRules,
			displayRules: input.displayRules,
			locLabels: input.locLabels,
			entityLogicalName,
			location: loc.current.location,
		});
		delta = mergeRibbonDiffParts(delta, parseRibbonDiffParts(xml));
	}

	// Commands / rules the user edited, even when no button changed (#25).
	const extra = [
		...input.commands.filter((c) => input.plan.editedCommandIds.includes(c.id)).map(generateCommandDefinition),
	];
	const extraRules = {
		enable: input.enableRules.filter((r) => input.plan.editedEnableRuleIds.includes(r.id)).map(generateEnableRule),
		display: input.displayRules.filter((r) => input.plan.editedDisplayRuleIds.includes(r.id)).map(generateDisplayRule),
	};
	if (extra.length || extraRules.enable.length || extraRules.display.length) {
		delta = mergeRibbonDiffParts(
			delta,
			parseRibbonDiffParts(
				`<RibbonDiffXml><CommandDefinitions>${extra.join("")}</CommandDefinitions><RuleDefinitions><DisplayRules>${extraRules.display.join("")}</DisplayRules><EnableRules>${extraRules.enable.join("")}</EnableRules></RuleDefinitions></RibbonDiffXml>`,
			),
		);
	}

	// The generator also emits the commands / rules of every button it writes
	// (including managed and out-of-the-box ones, re-built from the parser's
	// lossy model). Only definitions the user created or edited may enter the
	// layer; everything else is already defined where it lives (#11 review N2, #13).
	const keepOnly = (map: Map<string, string>, ids: string[]) => {
		for (const id of Array.from(map.keys())) if (!ids.includes(id)) map.delete(id);
	};
	keepOnly(delta.commandDefinitions, input.plan.editedCommandIds);
	keepOnly(delta.enableRules, input.plan.editedEnableRuleIds);
	keepOnly(delta.displayRules, input.plan.editedDisplayRuleIds);

	const existing = await fetchUnmanagedRibbonParts(input.entity?.logicalName ?? null);

	// Only controls this table's unmanaged layer defines can be removed; anything
	// else comes from a managed solution or the platform (#11 review N4).
	const own = ownControlIds(existing);
	const notOwn = input.plan.deletedButtonIds.filter((id) => !own.has(id));
	if (notOwn.length > 0) {
		throw new Error(
			`Can't delete ${notOwn.join(", ")}: not defined in this table's unmanaged customizations ` +
				`(it comes from a managed solution or the platform). Undo the delete and hide the button instead.`,
		);
	}

	const retainedCommandIds = new Set<string>();
	for (const loc of input.locations)
		for (const tab of loc.current.tabs)
			for (const group of tab.groups)
				for (const button of group.buttons) if (button.commandId) retainedCommandIds.add(button.commandId);

	const merged = mergeScopeChanges(existing, delta, {
		retainedCommandIds,
		editedCommandIds: input.plan.editedCommandIds,
		editedEnableRuleIds: input.plan.editedEnableRuleIds,
		editedDisplayRuleIds: input.plan.editedDisplayRuleIds,
		deletedControlIds: input.plan.deletedButtonIds,
		unhiddenControlIds: input.plan.unhiddenButtonIds,
	});
	return {
		xml: serializeRibbonDiffParts(merged),
		elementCount: countRibbonDiffParts(merged),
		preservedCount: countRibbonDiffParts(existing),
		changedCount: countRibbonDiffParts(delta),
	};
}

async function fetchOrganizationLanguageCode(): Promise<number> {
	try {
		const res = (await dataverseAPI.queryData("organizations?$select=languagecode")) as {
			value?: Array<{ languagecode?: number }>;
		};
		return res.value?.[0]?.languagecode ?? 1033;
	} catch {
		return 1033;
	}
}

/**
 * Publishes one ribbon scope (a table, or the application ribbon):
 * read the existing unmanaged layer → merge CBS's edits from every location →
 * import ONE complete RibbonDiffXml → verify Dataverse actually applied it →
 * (optionally) PublishXml.
 */
export async function publishRibbon(
	input: PublishRibbonInput,
	onProgress?: (msg: string) => void,
): Promise<PublishRibbonResult> {
	const logs = useRuntimeLogStore.getState();
	const scopeLabel = input.entity ? input.entity.logicalName : "Application ribbon";

	onProgress?.(`Reading existing ribbon customizations for ${scopeLabel}…`);
	logs.logInfo("publish", `Reading unmanaged ribbon layer for ${scopeLabel}.`);
	const merged = await buildMergedRibbonDiffXml(input);
	logs.logInfo(
		"publish",
		`RibbonDiffXml for ${scopeLabel}: ${merged.preservedCount} existing element(s) preserved, ` +
			`${merged.changedCount} element(s) from this session, ${merged.elementCount} total.`,
	);

	const isApplication = input.entity === null;
	if (isApplication && !input.ribbonCustomizationIds?.length) {
		throw new Error(
			"The selected solution does not contain Application Ribbons. Add it in make.powerapps.com " +
				"(Solutions → your solution → Add existing → Application Ribbons) and reload the solution.",
		);
	}

	const entityName = input.entity?.schemaName || input.entity?.logicalName || "";
	const customizationsXml = isApplication
		? buildCustomizationsXml({ applicationRibbonDiffXml: merged.xml })
		: buildCustomizationsXml({
				entities: [
					{
						schemaName: entityName,
						localizedName: input.entity?.displayName || entityName,
						ribbonDiffXml: merged.xml,
					},
				],
			});

	const rootComponents: RootComponentSpec[] = isApplication
		? // Verified live: the application ribbon component is declared by this
			// fixed schema name, exactly as maker exports write it.
			[{ type: 50, schemaName: ":RibbonDiffXml", behavior: 0 }]
		: // Shell only (behavior 2): the RibbonDiffXml needs the table as an
			// anchor, but must not drag the table's columns/forms/views into the
			// solution.
			[{ type: 1, schemaName: input.entity!.logicalName, behavior: 2 }];

	const languageCode = await fetchOrganizationLanguageCode();
	const solutionXml = generateSolutionXml({
		...input.solution,
		languageCode,
		rootComponents,
	});

	onProgress?.("Packaging solution ZIP…");
	const zipBytes = zipSync({
		"customizations.xml": strToU8(customizationsXml),
		"solution.xml": strToU8(solutionXml),
		"[Content_Types].xml": strToU8(
			'<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
		),
	});
	let binaryStr = "";
	for (let i = 0; i < zipBytes.length; i++) {
		binaryStr += String.fromCharCode(zipBytes[i]);
	}
	const base64Zip = btoa(binaryStr);

	const importAndVerify = async (pass: string): Promise<string> => {
		onProgress?.(`Importing ${scopeLabel} ribbon${pass}…`);
		// ImportSolution requires a client-generated ImportJobId (0x80048d19 otherwise).
		const importJobId = crypto.randomUUID();
		logs.logInfo("publish", `Importing solution${pass} (import job ${importJobId})…`);
		await dataverseAPI.deploySolution(base64Zip, {
			importJobId,
			overwriteUnmanagedCustomizations: true,
			publishWorkflows: false,
		});

		// Ribbon imports take 20–50 s on a typical environment (measured live);
		// allow up to 5 minutes before giving up.
		const MAX_ATTEMPTS = 150;
		const POLL_INTERVAL_MS = 2000;
		let status = (await dataverseAPI.getImportJobStatus(importJobId)) as ImportStatus;
		let attempts = 0;
		while (!isImportComplete(status) && attempts < MAX_ATTEMPTS) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			status = (await dataverseAPI.getImportJobStatus(importJobId)) as ImportStatus;
			attempts++;
			if (attempts % 10 === 0) onProgress?.(`Still importing… (${attempts * 2}s elapsed)`);
		}
		if (!isImportComplete(status)) {
			throw new Error(
				`Solution import did not complete within ${(MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000} seconds. ` +
					`Check Solutions › History for import job ${importJobId}.`,
			);
		}

		onProgress?.("Verifying the import…");
		const job = (await dataverseAPI.retrieve("importjob", importJobId, ["data"])) as { data?: string };
		const verification = verifyRibbonImport(
			job.data,
			isApplication
				? { kind: "application" }
				: { kind: "entity", names: [entityName, input.entity!.logicalName] },
		);
		if (!verification.ok) {
			logs.logError("publish", verification.message);
			throw new Error(verification.message);
		}
		logs.logInfo("publish", verification.message);
		return importJobId;
	};

	const publishScope = async () => {
		onProgress?.("Publishing customizations…");
		if (isApplication) {
			// Targeted publish of the application ribbon only — publishCustomizations()
			// without a table runs PublishAllXml for the whole environment.
			await dataverseAPI.execute({
				operationName: "PublishXml",
				operationType: "action",
				parameters: { ParameterXml: "<importexportxml><ribbons><ribbon></ribbon></ribbons></importexportxml>" },
			});
		} else {
			await dataverseAPI.publishCustomizations(input.entity!.logicalName);
		}
	};

	const importJobId = await importAndVerify("");

	if (input.publishCustomizations !== false) {
		await publishScope();
		// Unified Interface renders command bars from "ribbon client metadata",
		// which an import rebuilds from the ribbon as PUBLISHED at that moment.
		// So buttons added by this import only reach Unified Interface after a
		// LATER import (verified live: import+publish left new buttons missing for
		// hours; re-importing the same package after publishing made them appear).
		// Re-import the identical package once and publish again so the change is
		// actually visible to users. This applies to command and rule edits too
		// (#11 review N1), so it always runs.
		{
			logs.logInfo(
				"publish",
				"Refreshing Unified Interface command-bar metadata (second import of the same package)…",
			);
			try {
				await importAndVerify(" (refreshing Unified Interface metadata)");
				await publishScope();
			} catch (err) {
				throw new Error(
					`Your changes were imported and published, but refreshing Unified Interface's command-bar ` +
						`metadata failed (${err instanceof Error ? err.message : String(err)}). New or changed buttons ` +
						`may not appear in the app until you publish again.`,
				);
			}
		}
	} else {
		logs.logWarn(
			"publish",
			"Imported without publishing. New or changed buttons appear in Unified Interface only after " +
				"you publish from Command Bar Studio (which re-imports once to refresh the command-bar metadata).",
		);
	}

	onProgress?.(
		input.publishCustomizations !== false
			? `${scopeLabel} ribbon published.`
			: `${scopeLabel} ribbon imported (not published).`,
	);
	return {
		elementCount: merged.elementCount,
		preservedCount: merged.preservedCount,
		importJobId,
	};
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
	/** Entity components use the logical name; the application ribbon uses `:RibbonDiffXml`. */
	schemaName?: string;
	/** Form / web resource / ribbon-customization components use the GUID `id`. */
	id?: string;
	/** 0 = include subcomponents, 1 = don't, 2 = shell only. */
	behavior: 0 | 1 | 2;
}

interface SolutionXmlInput extends PublishSolutionInfo {
	/** Organization base language. The solution manifest must match it. */
	languageCode: number;
	rootComponents: RootComponentSpec[];
}

function generateSolutionXml(input: SolutionXmlInput): string {
	// Fall back to safe placeholders if the publisher fields are missing —
	// Dataverse will reject the import outright rather than silently routing
	// to a "new" publisher we don't intend.
	const pubUnique = input.publisherUniqueName?.trim() || "DefaultPublisher";
	const pubName = input.publisherName?.trim() || pubUnique;
	const pubPrefix = input.publisherPrefix?.trim() || "new";
	const lang = input.languageCode || 1033;
	// Keep the existing friendly name: the import overwrites the solution's
	// display name with whatever LocalizedName we send (#15, verified live).
	const friendly = input.friendlyName?.trim() || input.uniqueName;

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
<ImportExportXml version="9.1.0.0" SolutionPackageVersion="9.1" languagecode="${lang}" generatedBy="CommandBarStudio">
  <SolutionManifest>
    <UniqueName>${escapeXml(input.uniqueName)}</UniqueName>
    <LocalizedNames>
      <LocalizedName description="${escapeXml(friendly)}" languagecode="${lang}"/>
    </LocalizedNames>
    <Descriptions/>
    <Version>${escapeXml(input.version)}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>${escapeXml(pubUnique)}</UniqueName>
      <LocalizedNames>
        <LocalizedName description="${escapeXml(pubName)}" languagecode="${lang}"/>
      </LocalizedNames>
      <Descriptions/>
      <EMailAddress/>
      <SupportingWebsiteUrl/>
      <CustomizationPrefix>${escapeXml(pubPrefix)}</CustomizationPrefix>
      <CustomizationOptionValuePrefix>${input.publisherOptionValuePrefix ?? 10000}</CustomizationOptionValuePrefix>
      <Addresses/>
    </Publisher>
    ${rootComponentsXml}
    <MissingDependencies/>
  </SolutionManifest>
</ImportExportXml>`;
}
