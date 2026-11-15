import { zipSync, strToU8 } from "fflate";
import { invalidateApplicationRibbonCache } from "@/services/dataverse/ribbonService";
import {
	generateRibbonDiffXml,
	buildCustomizationsXml,
	escapeXml,
	generateCommandDefinition,
	generateEnableRule,
	generateDisplayRule,
	generateLocLabel,
	generateTabDisplayRulesForTab,
	newTabCommandId,
} from "@/services/xmlGenerator";
import {
	emptyRibbonDiffParts,
	mergeRibbonDiffParts,
	parseRibbonDiffParts,
	serializeRibbonDiffParts,
	countRibbonDiffParts,
	mergeScopeChanges,
	ownControlIds,
	ownContainerIds,
	layerCommandRefs,
	canUncustomiseCommand,
	compareRibbonDiffParts,
	layerScalingSteps,
	normalizeLayerScaling,
	setContainerTitle,
	changedRibbonDiffKeys,
	type RibbonDiffComparison,
	type RibbonDiffParts,
} from "@/services/ribbonDiffMerge";
import { fetchUnmanagedRibbonParts } from "@/services/dataverse/ribbonLayerService";
import { ConnectionChangedError, writeGuard, type WriteGuard } from "@/services/hostConnection";
import {
	fetchOrganizationLanguageCode,
	isEnvironmentBusyError,
	waitForEnvironmentIdle,
	withBusyRetry,
	type BusyWaitOptions,
} from "@/services/dataverse/environmentService";
import type { ScopePlan } from "@/services/publishPlan";
import { describeScalingChange, type ScalingChange } from "@/services/scalingSequence";
import { ribbonPlaces } from "@/services/layerOrphans";
import { groupControls } from "@/utils/ribbonMenu";
import { controlCommandIds } from "@/utils/controlKinds";
import { importJobFailure, verifyRibbonImport } from "@/services/importJobVerification";
import {
	validatePublishRibbonDiff,
	webResourceReferences,
	type PublishFinding,
	type PublishValidationContext,
	type WebResourceStatus,
} from "@/services/xmlValidator";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { withCloseGuard } from "@/utils/pptbRuntime";
import type {
	RibbonDefinition,
	CommandDefinition,
	EnableRule,
	DisplayRule,
	LocLabel,
	ScalingDefinition,
} from "@/types/ribbon";

const dataverseAPI = (window as Window & typeof globalThis).dataverseAPI!;

// Import and publish through the Dataverse actions themselves, not PPTB's
// deploySolution() / publishCustomizations() helpers: those differ between
// hosts. The VS Code extension (1.1.0) drops ImportJobId — CBS polls and
// verifies that job — and sends a table publish to PublishAllXml (#89).
//
// The import runs as a system job (ImportSolutionAsync, #107): the request
// returns at once, so a long import can't hit a host or HTTP timeout, and CBS
// can stop waiting for it (Cancel, or its own timeout).
async function startImport(
	customizationFile: string,
	importJobId: string,
	guard: WriteGuard,
): Promise<{ asyncOperationId: string; importJobId: string }> {
	// Never into another environment than the one the publish started on (#120).
	await guard("The import");
	const response = (await dataverseAPI.execute({
		operationName: "ImportSolutionAsync",
		operationType: "action",
		parameters: {
			CustomizationFile: customizationFile,
			ImportJobId: importJobId,
			OverwriteUnmanagedCustomizations: true,
			PublishWorkflows: false,
			// No ComponentParameters: verified live, an empty list fails the request with
			// 0x80040216 ("Custom state is not set for entity type crmbaseentity").
		},
	})) as { AsyncOperationId?: string; ImportJobKey?: string } | null | undefined;
	const asyncOperationId = response?.AsyncOperationId;
	if (!asyncOperationId) throw new Error("ImportSolutionAsync did not return AsyncOperationId.");
	// The key names the import job Dataverse created: the id CBS sent, normally.
	const key = response?.ImportJobKey;
	const jobId = key && GUID.test(key) ? key.replace(/[{}]/g, "").toLowerCase() : importJobId;
	if (jobId !== importJobId.toLowerCase())
		useRuntimeLogStore
			.getState()
			.logWarn(
				"publish",
				`Dataverse created import job ${jobId}, not ${importJobId} as asked: verifying ${jobId}.`,
			);
	return { asyncOperationId, importJobId: jobId };
}

const GUID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

/** A cancel's message without its "You cancelled the publish." lead, as a sentence to append ("" when nothing is left). */
function afterCancel(message: string): string {
	const rest = message.replace(/^You cancelled the publish\.\s*/, "").trim();
	return rest ? ` ${rest}` : "";
}

/** System job (asyncoperation) states: statecode 3 is Completed, with statuscode 30 / 31 / 32. */
const ASYNC_COMPLETED = 3;
const ASYNC_SUCCEEDED = 30;
const ASYNC_CANCELED = 32;

interface AsyncOperationState {
	statecode?: number;
	statuscode?: number;
	message?: string | null;
	friendlymessage?: string | null;
}

/**
 * The user cancelled the publish (#107). An import that was running may still finish in
 * Dataverse: the message says what is known.
 */
export class PublishCancelledError extends Error {
	constructor(
		message: string,
		readonly importJobId?: string,
		/** An import was running and Dataverse didn't say it ended: it may still finish. */
		readonly mayStillFinish = false,
	) {
		super(message);
		this.name = "PublishCancelledError";
	}
}

/** The publish was cancelled: the error or one of its causes is a PublishCancelledError. */
export function isPublishCancelled(err: unknown): boolean {
	return cancelledError(err) !== null;
}

/** A cancel that left an import running, whose outcome isn't known (#107). */
export function cancelMayStillFinish(err: unknown): boolean {
	return cancelledError(err)?.mayStillFinish === true;
}

function cancelledError(err: unknown): (Error & { mayStillFinish?: boolean }) | null {
	for (let e = err, i = 0; e instanceof Error && i < 5; e = e.cause, i++)
		if (e.name === "PublishCancelledError") return e;
	return null;
}

/** The import job a publish error is about, for View import log (#107): on the error or a cause. */
export function importJobIdOf(err: unknown): string | undefined {
	for (let e = err, i = 0; e instanceof Error && i < 5; e = e.cause, i++) {
		const id = (e as Error & { importJobId?: unknown }).importJobId;
		if (typeof id === "string" && id) return id;
	}
	return undefined;
}

/** `err` with the import job it is about, unless it names one already. */
function withImportJob(err: unknown, importJobId: string): unknown {
	if (err instanceof Error && !importJobIdOf(err)) Object.assign(err, { importJobId });
	return err;
}

/** A read that failed because the record doesn't exist (0x80040217). */
function isNotFound(err: unknown): boolean {
	const text = err instanceof Error ? err.message : String(err);
	return /0x80040217|does not exist|not found/i.test(text);
}

/**
 * The import job's `data` XML: what View import log shows (#107). `null` when there is none:
 * the job has no data yet, or doesn't exist (verified live: a solution file Dataverse rejects
 * outright, an invalid zip say, creates no import job).
 */
export async function fetchImportJobLog(importJobId: string): Promise<string | null> {
	try {
		const job = (await withCheckTimeout(
			dataverseAPI.retrieve("importjob", importJobId, ["data"]) as Promise<unknown>,
			30_000,
		)) as { data?: string | null } | null;
		return job?.data || null;
	} catch (err) {
		if (isNotFound(err)) return null;
		throw err;
	}
}

/** Waits `ms`, or rejects with `cancelled()` as soon as `signal` aborts. Leaves no timer behind. */
function sleepUnlessCancelled(
	ms: number,
	signal: AbortSignal | undefined,
	cancelled: () => Error,
	sleep?: (ms: number) => Promise<void>,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) return reject(cancelled());
		let timer: ReturnType<typeof setTimeout> | undefined;
		const onAbort = () => {
			clearTimeout(timer);
			reject(cancelled());
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		const done = () => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		};
		if (sleep) void sleep(ms).then(done, done);
		else timer = setTimeout(done, ms);
	});
}

/** Reads the system job; rejects with `cancelled()` as soon as `signal` aborts. */
function readAsyncOperation(
	asyncOperationId: string,
	signal: AbortSignal | undefined,
	cancelled: () => Error,
	timeoutMs = 30_000,
): Promise<AsyncOperationState> {
	const read = withCheckTimeout(
		dataverseAPI.retrieve("asyncoperation", asyncOperationId, [
			"statecode",
			"statuscode",
			"message",
			"friendlymessage",
		]) as Promise<AsyncOperationState>,
		timeoutMs,
	);
	if (!signal) return read;
	return new Promise<AsyncOperationState>((resolve, reject) => {
		if (signal.aborted) return reject(cancelled());
		const onAbort = () => reject(cancelled());
		signal.addEventListener("abort", onAbort, { once: true });
		read.then(
			(v) => {
				signal.removeEventListener("abort", onAbort);
				resolve(v);
			},
			(err: unknown) => {
				signal.removeEventListener("abort", onAbort);
				reject(err);
			},
		);
	});
}

/**
 * The system job's own words for why it failed (#107). Verified live: `friendlymessage` is the
 * clean text ("The solution file is invalid. …"), while `message` repeats it as
 * "Exception type: …\r\nMessage: …" followed by a stack trace. So the friendly message, or else
 * the message's own text without the exception type and the stack.
 */
function asyncOperationReason(op: AsyncOperationState): string {
	const friendly = op.friendlymessage?.trim();
	if (friendly) return friendly;
	const lines = (op.message ?? "")
		.replace(/^\s*Exception type:[^\r\n]*\r?\n/i, "")
		.replace(/^\s*Message:\s*/i, "")
		.split(/\r?\n/);
	const end = lines.findIndex(
		(l, i) =>
			i > 0 &&
			/^\s*(at\s|Stack ?Trace|Server stack trace|Inner ?Exception|Detail:|-{2,})/i.test(l),
	);
	let text = (end === -1 ? lines : lines.slice(0, end)).join(" ").replace(/\s+/g, " ").trim();
	if (text.length > 500) text = `${text.slice(0, 500)}…`;
	return text || `status ${op.statuscode ?? "unknown"}`;
}

/**
 * Best-effort cancel of the import's system job (#107), then its state as read afterwards
 * (`null` when it can't be read). A job that already completed isn't touched. Dataverse may
 * refuse to cancel a platform job, or finish the import first: the caller says what the state
 * shows, never more.
 */
async function cancelAsyncImport(
	asyncOperationId: string,
	guard: WriteGuard,
): Promise<AsyncOperationState | null> {
	const logs = useRuntimeLogStore.getState();
	const read = async () => {
		try {
			return await readAsyncOperation(asyncOperationId, undefined, () => new Error(), 10_000);
		} catch {
			return null;
		}
	};
	const before = await read();
	if (before?.statecode === ASYNC_COMPLETED) return before;
	try {
		await guard("Cancelling the import");
		await withCheckTimeout(
			dataverseAPI.update("asyncoperation", asyncOperationId, {
				statecode: ASYNC_COMPLETED,
				statuscode: ASYNC_CANCELED,
			}),
			15_000,
		);
		logs.logInfo(
			"publish",
			`Asked Dataverse to cancel the import (system job ${asyncOperationId}).`,
		);
	} catch (err) {
		logs.logWarn(
			"publish",
			`Dataverse didn't cancel the import (system job ${asyncOperationId}): ${err instanceof Error ? err.message : String(err)}`,
		);
	}
	return read();
}

interface AsyncImportWait {
	asyncOperationId: string;
	importJobId: string;
	guard: WriteGuard;
	signal?: AbortSignal;
	pollMs: number;
	timeoutMs: number;
	onProgress?: (msg: string) => void;
	/** Injected for tests. */
	now?: () => number;
}

/**
 * Polls the import's system job until it completes (#107). Succeeded resolves; Failed or
 * Canceled throws with the job's message and the import job's own failure. On Cancel or the
 * timeout it stops waiting, asks Dataverse to cancel the job, and says what is known: an import
 * that finished meanwhile is finished (and a timed-out one that succeeded counts as succeeded).
 */
async function waitForAsyncImport(wait: AsyncImportWait): Promise<void> {
	const { asyncOperationId, importJobId, signal } = wait;
	const now = wait.now ?? Date.now;
	const logs = useRuntimeLogStore.getState();
	const userCancel = () => new PublishCancelledError("cancelled", importJobId);
	const failed = async (op: AsyncOperationState, prefix: string) => {
		const reason = asyncOperationReason(op);
		// Another solution operation was running: withBusyRetry waits for it and tries again.
		if (isEnvironmentBusyError(reason)) return new Error(reason);
		if (isEnvironmentBusyError(op.message ?? "")) return new Error(op.message ?? "");
		return withImportJob(
			await withImportJobReason(new Error(`${prefix}: ${reason}`), importJobId),
			importJobId,
		);
	};
	const started = now();
	let polls = 0;
	let failedReads = 0;
	for (;;) {
		let op: AsyncOperationState | null = null;
		try {
			op = await readAsyncOperation(asyncOperationId, signal, userCancel);
			failedReads = 0;
		} catch (err) {
			if (isPublishCancelled(err)) break;
			// A failed read isn't a failed import: try again, a few times.
			if (++failedReads >= 3)
				throw withImportJob(
					new Error(
						`Couldn't read the import's progress (${err instanceof Error ? err.message : String(err)}). ` +
							`Dataverse may still finish it: check Solutions › History for import job ${importJobId} ` +
							`before you publish again.`,
						{ cause: err },
					),
					importJobId,
				);
		}
		if (op?.statecode === ASYNC_COMPLETED) {
			if (op.statuscode === ASYNC_SUCCEEDED) return;
			throw await failed(
				op,
				op.statuscode === ASYNC_CANCELED
					? "The import was cancelled in Dataverse"
					: "The import failed",
			);
		}
		if (now() - started >= wait.timeoutMs) {
			const within =
				wait.timeoutMs >= 60_000
					? `${Math.round(wait.timeoutMs / 60_000)} minutes`
					: `${Math.round(wait.timeoutMs / 1000)} seconds`;
			logs.logWarn(
				"publish",
				`The import didn't finish within ${within}: asking Dataverse to cancel it.`,
			);
			const after = await cancelAsyncImport(asyncOperationId, wait.guard);
			if (after?.statecode === ASYNC_COMPLETED && after.statuscode === ASYNC_SUCCEEDED)
				return;
			if (after?.statecode === ASYNC_COMPLETED && after.statuscode !== ASYNC_CANCELED)
				throw await failed(after, "The import failed");
			throw withImportJob(
				new Error(
					`The import didn't finish within ${within}, so Command Bar Studio stopped waiting for it` +
						(after?.statuscode === ASYNC_CANCELED
							? " and Dataverse cancelled it."
							: `. Dataverse may still finish it: check Solutions › History for import job ` +
								`${importJobId} before you publish again.`),
				),
				importJobId,
			);
		}
		polls++;
		if (polls % 10 === 0)
			wait.onProgress?.(`Still importing… (${Math.round((now() - started) / 1000)} s)`);
		try {
			await sleepUnlessCancelled(wait.pollMs, signal, userCancel);
		} catch {
			break;
		}
	}
	// Cancelled by the user: stop waiting, and try to stop Dataverse too.
	logs.logWarn("publish", "Publish cancelled: asking Dataverse to cancel the import.");
	const after = await cancelAsyncImport(asyncOperationId, wait.guard);
	const mayStillFinish = after?.statecode !== ASYNC_COMPLETED;
	const state =
		mayStillFinish || !after
			? "Command Bar Studio stopped waiting, but Dataverse may still finish the import: check " +
				`Solutions › History for import job ${importJobId} before you publish again.`
			: after.statuscode === ASYNC_CANCELED
				? "Dataverse cancelled the import."
				: after.statuscode === ASYNC_SUCCEEDED
					? "The import had already finished, so your changes are imported but not published."
					: `The import had already failed: ${asyncOperationReason(after)}`;
	throw new PublishCancelledError(
		`You cancelled the publish. ${state}`,
		importJobId,
		mayStillFinish,
	);
}

/**
 * A failed import's error with the import job's first failure added (#107), when the job
 * exists, says why, and the error doesn't already. Never fails itself: the original error is
 * what's thrown when the job can't be read.
 */
export async function withImportJobReason(err: unknown, importJobId: string): Promise<unknown> {
	try {
		const job = (await withCheckTimeout(
			dataverseAPI.retrieve("importjob", importJobId, ["data"]) as Promise<unknown>,
			10_000,
		)) as { data?: string } | null;
		const reason = importJobFailure(job?.data);
		const message = err instanceof Error ? err.message : String(err);
		const text = reason?.replace(/^[^:]*: /, "");
		if (!reason || (text && message.includes(text))) return err;
		return new Error(`${message} — ${reason}`, { cause: err });
	} catch {
		return err;
	}
}

/** PublishXml for the given tables. */
async function publishTables(entityLogicalNames: string[], guard: WriteGuard): Promise<unknown> {
	await guard("Publishing");
	const entities = entityLogicalNames
		.map((name) => `<entity>${escapeXml(name)}</entity>`)
		.join("");
	return dataverseAPI.execute({
		operationName: "PublishXml",
		operationType: "action",
		parameters: {
			ParameterXml: `<importexportxml><entities>${entities}</entities></importexportxml>`,
		},
	});
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
	/**
	 * The guard of the whole publish run (#120): one run publishes several
	 * scopes, and none may start on another connection than the run did.
	 * Default: a guard bound when this publish starts.
	 */
	guard?: WriteGuard;
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
	/**
	 * Commands and rules as loaded (what exists outside this session's edits).
	 * With them, the pre-publish check also reports commands and rules that are
	 * referenced but not defined (#35).
	 */
	baselineCommands?: CommandDefinition[];
	baselineEnableRules?: EnableRule[];
	baselineDisplayRules?: DisplayRule[];
	/** What changed in this scope (see publishPlan.planScope). */
	plan: Pick<
		ScopePlan,
		| "editedCommandIds"
		| "editedEnableRuleIds"
		| "editedDisplayRuleIds"
		| "deletedButtonIds"
		| "unhiddenButtonIds"
	> &
		Partial<
			Pick<
				ScopePlan,
				| "deletedContainerIds"
				| "movedButtons"
				| "editedLocLabelIds"
				| "editedTabIds"
				| "resequencedTabs"
				| "resequencedGroups"
				| "renamedLabels"
				| "uncustomisedCommandIds"
			>
		>;
	/** Organisation base language for edited labels (#50). Read from the organisation when omitted. */
	languageCode?: number;
	solution: PublishSolutionInfo;
	/**
	 * GUIDs of `ribboncustomization` components (`componenttype = 50`) in the
	 * solution. The application ribbon can only be imported when the solution
	 * contains Application Ribbons.
	 */
	ribbonCustomizationIds?: string[];
	/** Run PublishXml for the table right after the import (default true). */
	publishCustomizations?: boolean;
	/** Busy-environment waiting / retry options (tests inject a fake clock). */
	busy?: BusyWaitOptions;
	/** Delay between post-publish verification attempts (default 5 s). */
	verifyDelayMs?: number;
	/**
	 * Cancels the publish (#107): an import being waited for is stopped and Dataverse is asked to
	 * cancel it; otherwise the publish stops before its next step. Throws PublishCancelledError.
	 */
	signal?: AbortSignal;
	/** How often an import's system job is read (default 2 s). */
	importPollMs?: number;
	/** How long one import may take before CBS stops waiting for it (default 10 minutes). */
	importTimeoutMs?: number;
}

/** Server-side check of what a publish left in the unmanaged layer (#46). */
export interface PublishVerification {
	ok: boolean;
	/** Elements CBS imported that the published layer doesn't have (`part:id`). */
	missing: string[];
	/** Elements in the published layer that CBS didn't import. */
	unexpected: string[];
	/** Elements this publish changed whose published content differs from what was imported. */
	differing: string[];
	message: string;
	/** The import job of a refresh import that didn't complete, for View import log (#107). */
	importJobId?: string;
}

export interface PublishRibbonResult {
	/** Number of elements in the RibbonDiffXml that was imported (existing + changed). */
	elementCount: number;
	/** Number of elements that came from the existing unmanaged layer. */
	preservedCount: number;
	importJobId: string;
	/** Present when the scope was published (the layer tables only show published state). */
	verification?: PublishVerification;
	/**
	 * The layer as imported. The store takes the scaling Sequences and label
	 * tokens it wrote from it, so a second publish in the same session sees
	 * them (#66 review B1, m4).
	 */
	parts: RibbonDiffParts;
	/**
	 * `part:id` of the elements this publish added or changed. The table's are
	 * remembered for a while (utils/recentPublish): RetrieveEntityRibbon can
	 * return the ribbon from before the publish, and those CustomActions must
	 * not be offered for deletion as orphans then (#84 review). Required, so a
	 * caller that drops it doesn't compile.
	 */
	changedKeys: string[];
}

/**
 * Builds the COMPLETE RibbonDiffXml for one ribbon scope: the existing
 * unmanaged layer (read from the ribbon component tables) with CBS's changes
 * for every location merged in (see ribbonDiffMerge.mergeScopeChanges).
 */
export async function buildMergedRibbonDiffXml(
	input: Pick<
		PublishRibbonInput,
		| "entity"
		| "locations"
		| "commands"
		| "enableRules"
		| "displayRules"
		| "locLabels"
		| "plan"
		| "languageCode"
	>,
): Promise<{
	xml: string;
	parts: RibbonDiffParts;
	elementCount: number;
	preservedCount: number;
	changedCount: number;
	/** `part:id` of the elements this publish adds or changes in the layer (checked by content after publishing). */
	changedKeys: string[];
	/** Scaling steps of the layer moved to a free Sequence (#66 review). */
	scalingChanges: ScalingChange[];
	/** `part:id` of the elements the layer doesn't have yet. */
	newKeys: string[];
	/** Commands and rules the existing unmanaged layer defines (replaced by what is imported). */
	layerDefinitionIds: { commandIds: string[]; enableRuleIds: string[]; displayRuleIds: string[] };
	/** The unmanaged layer as read for the merge: the import must not replace anything else (#102). */
	layer: RibbonDiffParts;
}> {
	const entityLogicalName = input.entity?.logicalName ?? "{!EntityLogicalName}";
	const plan = {
		deletedContainerIds: input.plan.deletedContainerIds ?? [],
		movedButtons: input.plan.movedButtons ?? [],
		editedLocLabelIds: input.plan.editedLocLabelIds ?? [],
		editedTabIds: input.plan.editedTabIds ?? [],
		resequencedTabs: input.plan.resequencedTabs ?? [],
		resequencedGroups: input.plan.resequencedGroups ?? [],
	};

	// Translation-only edits (#49): labels the layer defines whose titles
	// changed. Labels the generator writes (new / edited buttons) win below —
	// they carry the edited text.
	const labels = input.locLabels.filter((l) => plan.editedLocLabelIds.includes(l.id));
	// Renamed tabs / groups the layer adds (#58): the base-language title of
	// their Title label changes, other languages are kept.
	const lang = input.languageCode ?? 1033;
	for (const r of input.plan.renamedLabels ?? []) {
		const prev =
			labels.find((l) => l.id === r.id) ?? input.locLabels.find((l) => l.id === r.id);
		const titles = [
			{ languageCode: lang, description: r.text },
			...(prev?.titles ?? []).filter((t) => t.languageCode !== lang),
		];
		const i = labels.findIndex((l) => l.id === r.id);
		if (i >= 0) labels[i] = { id: r.id, titles };
		else labels.push({ id: r.id, titles });
	}
	let delta = labels.length
		? parseRibbonDiffParts(
				`<RibbonDiffXml><LocLabels>${labels.map(generateLocLabel).join("")}</LocLabels></RibbonDiffXml>`,
			)
		: emptyRibbonDiffParts();

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
			languageCode: input.languageCode,
		});
		delta = mergeRibbonDiffParts(delta, parseRibbonDiffParts(xml));
	}

	// Display rules of existing tabs the layer adds (#49): the generator only
	// writes them for tabs created this session (#40).
	const removedTabCommands: string[] = [];
	const tabRules: string[] = [];
	for (const loc of input.locations) {
		for (const tab of loc.current.tabs) {
			if (!plan.editedTabIds.includes(tab.id)) continue;
			if (tab.tabDisplayRules.length > 0) {
				const xml = generateTabDisplayRulesForTab(tab, input.entity === null);
				if (xml) tabRules.push(xml);
			}
			const now = new Set(tab.tabDisplayRules.map((r) => r.tabCommand));
			for (const r of loc.baseline.tabs.find((t) => t.id === tab.id)?.tabDisplayRules ?? []) {
				if (!now.has(r.tabCommand)) removedTabCommands.push(r.tabCommand);
			}
		}
	}
	if (tabRules.length > 0) {
		delta = mergeRibbonDiffParts(
			delta,
			parseRibbonDiffParts(
				`<RibbonDiffXml><RuleDefinitions><TabDisplayRules>${tabRules.join("")}</TabDisplayRules></RuleDefinitions></RibbonDiffXml>`,
			),
		);
	}

	// Commands / rules the user edited, even when no button changed (#25).
	const extra = [
		...input.commands
			.filter((c) => input.plan.editedCommandIds.includes(c.id))
			.map(generateCommandDefinition),
	];
	const extraRules = {
		enable: input.enableRules
			.filter((r) => input.plan.editedEnableRuleIds.includes(r.id))
			.map(generateEnableRule),
		display: input.displayRules
			.filter((r) => input.plan.editedDisplayRuleIds.includes(r.id))
			.map(generateDisplayRule),
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
	// …plus the Command of each tab created this session (#58): the generator
	// defines it with the tab, and its TabDisplayRule refers to it.
	const newTabCommands = input.locations.flatMap((loc) =>
		loc.current.tabs
			.filter((t) => !loc.baseline.tabs.some((b) => b.id === t.id))
			.map(newTabCommandId),
	);
	keepOnly(delta.commandDefinitions, [...input.plan.editedCommandIds, ...newTabCommands]);
	keepOnly(delta.enableRules, input.plan.editedEnableRuleIds);
	keepOnly(delta.displayRules, input.plan.editedDisplayRuleIds);

	const existing = await fetchUnmanagedRibbonParts(input.entity?.logicalName ?? null);

	// Only controls this table's unmanaged layer defines can be removed; anything
	// else comes from a managed solution or the platform (#11 review N4).
	const own = ownControlIds(existing);
	const notOwn = input.plan.deletedButtonIds.filter((id) => !own.has(id));
	if (notOwn.length > 0) {
		throw new Error(
			`Can't delete ${notOwn.join(", ")}: not defined in this entity's unmanaged customizations ` +
				`(it comes from a managed solution or the platform). Undo the delete and hide the button instead.`,
		);
	}
	const ownContainers = ownContainerIds(existing);
	const notOwnContainers = plan.deletedContainerIds.filter((id) => !ownContainers.has(id));
	if (notOwnContainers.length > 0) {
		throw new Error(
			`Can't delete ${notOwnContainers.join(", ")}: not added by this entity's unmanaged customizations ` +
				`(it comes from a managed solution or the platform). Undo the delete.`,
		);
	}
	const notOwnMoves = plan.movedButtons.filter((m) => !own.has(m.id)).map((m) => m.id);
	if (notOwnMoves.length > 0) {
		throw new Error(
			`Can't move ${notOwnMoves.join(", ")}: not defined in this entity's unmanaged customizations. Undo the move.`,
		);
	}

	// Uncustomise (#31) removes a copy of a command defined elsewhere — never
	// your own command, which nothing would define once removed.
	const layerRefs = layerCommandRefs(existing);
	const ownCommands = (input.plan.uncustomisedCommandIds ?? []).filter(
		(id) => existing.commandDefinitions.has(id) && !canUncustomiseCommand(id, layerRefs),
	);
	if (ownCommands.length > 0) {
		throw new Error(
			`Can't uncustomise ${ownCommands.join(", ")}: it is your own command (your customizations' buttons use it ` +
				`and no other solution defines it), so removing it would leave those buttons without a command. Undo the uncustomise.`,
		);
	}

	const retainedCommandIds = new Set<string>();
	for (const loc of input.locations)
		for (const tab of loc.current.tabs)
			for (const group of tab.groups)
				for (const button of groupControls(group))
					for (const id of controlCommandIds(button)) retainedCommandIds.add(id);

	// Rules other commands of the scope still use stay in the layer when an
	// uncustomised command (#31) leaves it.
	const uncustomisedCommandIds = input.plan.uncustomisedCommandIds ?? [];
	const retainedEnableRuleIds = new Set<string>();
	const retainedDisplayRuleIds = new Set<string>();
	for (const c of input.commands) {
		if (!retainedCommandIds.has(c.id) || uncustomisedCommandIds.includes(c.id)) continue;
		c.enableRules.forEach((r) => retainedEnableRuleIds.add(r));
		c.displayRules.forEach((r) => retainedDisplayRuleIds.add(r));
		for (const raw of c.rawRuleRefs ?? []) {
			const m = /^\s*<(EnableRule|DisplayRule)\b[^>]*?\sId="([^"]+)"/.exec(raw.xml);
			if (m)
				(m[1] === "EnableRule" ? retainedEnableRuleIds : retainedDisplayRuleIds).add(m[2]);
		}
	}

	let merged = mergeScopeChanges(existing, delta, {
		retainedCommandIds,
		editedCommandIds: input.plan.editedCommandIds,
		editedEnableRuleIds: input.plan.editedEnableRuleIds,
		editedDisplayRuleIds: input.plan.editedDisplayRuleIds,
		deletedControlIds: input.plan.deletedButtonIds,
		unhiddenControlIds: input.plan.unhiddenButtonIds,
		deletedContainerIds: plan.deletedContainerIds,
		movedControls: plan.movedButtons,
		resequencedContainers: [...plan.resequencedTabs, ...plan.resequencedGroups],
		removedTabCommands,
		uncustomisedCommandIds,
		retainedEnableRuleIds,
		retainedDisplayRuleIds,
	});

	// A renamed tab / group whose title label other controls share gets a label
	// of its own (#66 review t3).
	for (const r of input.plan.renamedLabels ?? []) {
		if (r.newLabel) merged = setContainerTitle(merged, r.containerId, `$LocLabels:${r.id}`);
	}

	// No two scaling steps of a tab may share a Sequence (#66 review): the
	// layer's steps — including ones earlier CBS versions wrote at their
	// group's Sequence — are moved to free Sequences; what can't be placed
	// blocks the import.
	const layerStepIds = new Set(
		[...layerScalingSteps(existing), ...layerScalingSteps(merged)].map((st) => st.id),
	);
	const platform: Record<string, { maxSizes: number[]; scales: number[] }> = {};
	for (const loc of input.locations) {
		for (const [tabId, scaling] of Object.entries(loc.baseline.scalingByTab ?? {})) {
			platform[tabId] = {
				maxSizes: scaling.maxSizes
					.filter((st) => !layerStepIds.has(st.id))
					.map((st) => st.sequence),
				scales: scaling.scales
					.filter((st) => !layerStepIds.has(st.id))
					.map((st) => st.sequence),
			};
		}
	}
	const scaling = normalizeLayerScaling(merged, platform);
	if (scaling.problems.length > 0) {
		throw new Error(`Not published: ${scaling.problems.join("; ")}.`);
	}
	merged = scaling.parts;
	return {
		scalingChanges: scaling.changes,
		xml: serializeRibbonDiffParts(merged),
		parts: merged,
		elementCount: countRibbonDiffParts(merged),
		preservedCount: countRibbonDiffParts(existing),
		changedCount: countRibbonDiffParts(delta),
		changedKeys: changedRibbonDiffKeys(existing, merged),
		newKeys: (Object.keys(merged) as (keyof RibbonDiffParts)[]).flatMap((part) =>
			Array.from(merged[part].keys())
				.filter((id) => !existing[part].has(id))
				.map((id) => `${part}:${id}`),
		),
		layerDefinitionIds: {
			commandIds: Array.from(existing.commandDefinitions.keys()),
			enableRuleIds: Array.from(existing.enableRules.keys()),
			displayRuleIds: Array.from(existing.displayRules.keys()),
		},
		layer: existing,
	};
}

/**
 * What the pre-publish check needs besides the merged RibbonDiffXml (#35):
 * which elements this publish adds or changes, and the loaded ribbon (ids,
 * scaling, group templates) the layer is applied to.
 */
export function publishValidationContext(
	input: Pick<
		PublishRibbonInput,
		| "locations"
		| "commands"
		| "baselineCommands"
		| "baselineEnableRules"
		| "baselineDisplayRules"
	> &
		Partial<Pick<PublishRibbonInput, "entity">> & { publisherPrefix?: string },
	merged: {
		changedKeys: string[];
		newKeys: string[];
		layerDefinitionIds?: {
			commandIds: string[];
			enableRuleIds: string[];
			displayRuleIds: string[];
		};
	},
): PublishValidationContext {
	const elementIds: string[] = [];
	const tabScaling: Record<string, ScalingDefinition> = {};
	const groupTemplates: Record<string, string> = {};
	const templateLayouts: Record<string, string[]> = {};
	const templateAliases: Record<string, string[]> = {};
	const loadedAttributes: Record<string, Record<string, string>> = {};
	const baselineGroups = new Set<string>();
	const currentGroups = new Set<string>();
	const menuControlsIds = new Set<string>();
	for (const { current, baseline } of input.locations)
		for (const def of [baseline, current])
			for (const tab of def.tabs)
				for (const group of tab.groups)
					for (const b of groupControls(group))
						for (const section of b.menu?.sections ?? [])
							menuControlsIds.add(section.controlsId);
	for (const { current, baseline } of input.locations) {
		Object.assign(templateLayouts, baseline.templateLayouts);
		Object.assign(templateAliases, baseline.templateAliases);
		for (const tab of baseline.tabs) {
			elementIds.push(tab.id);
			if (tab.label) loadedAttributes[tab.id] = { Title: tab.label };
			for (const group of tab.groups) {
				baselineGroups.add(group.id);
				elementIds.push(group.id);
				if (group.label)
					loadedAttributes[group.id] = { Title: group.label, Label: group.label };
				// Menu items too (#27).
				for (const b of groupControls(group)) {
					elementIds.push(b.id);
					if (b.source) loadedAttributes[b.id] = b.source.attributes;
				}
			}
		}
		for (const tab of current.tabs) for (const group of tab.groups) currentGroups.add(group.id);
		for (const def of [baseline, current])
			for (const tab of def.tabs)
				for (const group of tab.groups)
					if (group.template) groupTemplates[group.id] = group.template;
	}
	// Loaded scaling, without the steps of groups this session removes (their
	// steps leave the layer with them and can't collide any more).
	const removedGroup = (s: { groupId: string }) =>
		baselineGroups.has(s.groupId) && !currentGroups.has(s.groupId);
	for (const { baseline } of input.locations) {
		for (const [tabId, scaling] of Object.entries(baseline.scalingByTab ?? {})) {
			tabScaling[tabId] = {
				...scaling,
				maxSizes: scaling.maxSizes.filter((s) => !removedGroup(s)),
				scales: scaling.scales.filter((s) => !removedGroup(s)),
			};
		}
	}
	// What stays defined after the import: the merged XML (checked by the
	// validator) plus everything defined outside the layer. The loaded ribbon
	// also has the layer's own definitions, which the import replaces.
	const outsideLayer = <T extends { id: string }>(
		loaded: T[] | undefined,
		layer: string[] | undefined,
	) => {
		if (!loaded) return undefined;
		const own = new Set(layer ?? []);
		return loaded.map((d) => d.id).filter((id) => !own.has(id));
	};
	return {
		changedKeys: merged.changedKeys,
		newKeys: merged.newKeys,
		commands: input.commands,
		known: {
			commandIds: outsideLayer(input.baselineCommands, merged.layerDefinitionIds?.commandIds),
			enableRuleIds: outsideLayer(
				input.baselineEnableRules,
				merged.layerDefinitionIds?.enableRuleIds,
			),
			displayRuleIds: outsideLayer(
				input.baselineDisplayRules,
				merged.layerDefinitionIds?.displayRuleIds,
			),
			elementIds,
		},
		loadedAttributes,
		publisherPrefix: input.publisherPrefix,
		tabScaling,
		groupTemplates,
		templateLayouts,
		templateAliases,
		menuControlsIds,
		// Where the table's CustomActions can place what they add (#64).
		...(input.entity
			? {
					places: {
						entityLogicalName: input.entity.logicalName,
						tabByCollection: Object.fromEntries(
							ribbonPlaces(
								input.locations.map((l) => l.baseline),
								input.entity.logicalName,
							),
						),
					},
				}
			: {}),
	};
}

/**
 * Rejects when `promise` hasn't settled within `ms`, so a slow environment
 * can't hold the publish dialog's check (and Publish) back indefinitely.
 */
export function withCheckTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`it didn't finish within ${Math.round(ms / 1000)} s`)),
			ms,
		);
		promise.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(err: unknown) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/**
 * The pre-publish check the publish dialog shows (#35): builds the RibbonDiffXml
 * the publish would import (existing layer + this session's changes) and
 * validates it. `lookupWebResources` resolves the `$webresource:` references
 * (one batched Dataverse query); without it they aren't checked.
 */
export async function checkBeforePublish(
	input: Pick<
		PublishRibbonInput,
		| "entity"
		| "locations"
		| "commands"
		| "enableRules"
		| "displayRules"
		| "locLabels"
		| "plan"
		| "languageCode"
		| "baselineCommands"
		| "baselineEnableRules"
		| "baselineDisplayRules"
	> & { publisherPrefix?: string },
	options: {
		lookupWebResources?: (names: string[]) => Promise<Record<string, WebResourceStatus>>;
	} = {},
): Promise<{ findings: PublishFinding[]; xml: string }> {
	const merged = await buildMergedRibbonDiffXml(input);
	const context = publishValidationContext(input, merged);
	const lookupFindings: PublishFinding[] = [];
	const names = webResourceReferences(merged.parts);
	if (options.lookupWebResources && names.length > 0) {
		try {
			context.webResources = await options.lookupWebResources(names);
		} catch (err) {
			lookupFindings.push({
				severity: "warning",
				code: "webresource-lookup",
				message: `Couldn't check the ${names.length} referenced web resource(s): ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	}
	return {
		findings: [...validatePublishRibbonDiff(merged.parts, context), ...lookupFindings],
		xml: merged.xml,
	};
}

/**
 * Compares the layer as published with what CBS imported (#46). The ribbon
 * tables only show published state, so this runs after PublishXml; a short
 * lag is tolerated by re-reading a few times.
 *
 * Every element is checked for presence; the elements this publish changed
 * (`contentKeys`) are also checked by content, in the form that survives an
 * import (ribbonDiffMerge.stableElementXml: Dataverse rewrites actions that
 * call platform libraries, so those are only checked for presence).
 */
export async function verifyPublishedLayer(
	entityLogicalName: string | null,
	expected: RibbonDiffParts,
	options: { attempts?: number; delayMs?: number; contentKeys?: string[] } = {},
): Promise<PublishVerification> {
	const attempts = options.attempts ?? 3;
	const contentKeys = options.contentKeys ?? [];
	let last: RibbonDiffComparison = { missing: [], unexpected: [], differing: [] };
	for (let i = 0; i < attempts; i++) {
		if (i > 0) await new Promise((r) => setTimeout(r, options.delayMs ?? 5000));
		try {
			last = compareRibbonDiffParts(
				expected,
				await fetchUnmanagedRibbonParts(entityLogicalName),
				{ contentKeys },
			);
		} catch (err) {
			return {
				ok: false,
				missing: [],
				unexpected: [],
				differing: [],
				message: `Couldn't read the published ribbon layer to verify it (${err instanceof Error ? err.message : String(err)}).`,
			};
		}
		if (
			last.missing.length === 0 &&
			last.unexpected.length === 0 &&
			last.differing.length === 0
		) {
			const changed = contentKeys.length;
			return {
				ok: true,
				...last,
				message:
					"Verified: the published ribbon layer has every element that was imported" +
					(changed > 0
						? `, and the ${changed} element(s) this publish changed have the imported content.`
						: "."),
			};
		}
	}
	const sample = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ", …" : "");
	return {
		ok: false,
		...last,
		message:
			"The published ribbon layer doesn't match what was imported" +
			(last.missing.length ? `; missing: ${sample(last.missing)}` : "") +
			(last.unexpected.length ? `; unexpected: ${sample(last.unexpected)}` : "") +
			(last.differing.length ? `; different content: ${sample(last.differing)}` : "") +
			". Reload the entity and check before publishing again.",
	};
}

/**
 * The table's ribbon changed in Dataverse while it was being published (#102):
 * other changes to it were published meanwhile (another session, tool or
 * solution import). Nothing more is imported, since the import would replace
 * that change. The layer tables show published state only, so a change
 * imported elsewhere but not published can't be seen.
 */
export class RibbonLayerChangedError extends Error {
	/** What changed, e.g. "added: customActions:X; changed: commandDefinitions:Y". */
	readonly summary: string;

	/**
	 * `importRan`: no change was seen, but another solution import ran while
	 * this one waited (#103). What it wrote may not be published yet, so the
	 * check can't see it, and importing could replace it.
	 */
	constructor(
		readonly scopeLabel: string,
		readonly changes: RibbonDiffComparison,
		readonly importRan = false,
	) {
		const summary = importRan
			? "another solution import ran in the environment meanwhile, and what it changed may not be published yet"
			: describeLayerChanges(changes);
		super(
			importRan
				? `${scopeLabel}'s ribbon customizations may have changed in Dataverse since you started publishing: ` +
						`${summary}. Importing could overwrite that change, so nothing was imported. Publish again: ` +
						`the entity is published first, so the change is kept.`
				: `${scopeLabel}'s ribbon customizations changed in Dataverse since you started publishing ` +
						`(${summary}): other ribbon changes for it were published meanwhile, from another session, tool or solution import. ` +
						`Importing would overwrite that change, so nothing was imported. ` +
						`Reload the entity to get the change, then publish again.`,
		);
		this.name = "RibbonLayerChangedError";
		this.summary = summary;
	}
}

/** "added: customActions:X; changed: commandDefinitions:Y", at most five of each. */
function describeLayerChanges(changes: RibbonDiffComparison): string {
	const sample = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ", …" : "");
	return [
		changes.unexpected.length ? `added: ${sample(changes.unexpected)}` : "",
		changes.missing.length ? `removed: ${sample(changes.missing)}` : "",
		changes.differing.length ? `changed: ${sample(changes.differing)}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

/** The operation a busy error says is running ("…because there is a previous [Import] running…"). */
function runningOperationOf(err: unknown): string | null {
	const text = err instanceof Error ? err.message : String(err);
	return /there is (?:another|a previous) \[(\w+)\] running/i.exec(text)?.[1] ?? null;
}

/** Every `part:id` of a layer: compared by content as well as presence. */
const allKeys = (parts: RibbonDiffParts): string[] =>
	(Object.keys(parts) as (keyof RibbonDiffParts)[]).flatMap((part) =>
		Array.from(parts[part].keys()).map((id) => `${part}:${id}`),
	);

/** Two reads of the layer, element by element, exactly as Dataverse stored them. */
function exactLayerChanges(
	expected: RibbonDiffParts,
	actual: RibbonDiffParts,
): RibbonDiffComparison {
	const missing: string[] = [];
	const unexpected: string[] = [];
	const differing: string[] = [];
	for (const part of Object.keys(expected) as (keyof RibbonDiffParts)[]) {
		for (const [id, xml] of expected[part]) {
			const got = actual[part].get(id);
			if (got === undefined) missing.push(`${part}:${id}`);
			else if (got !== xml) differing.push(`${part}:${id}`);
		}
		for (const id of actual[part].keys())
			if (!expected[part].has(id)) unexpected.push(`${part}:${id}`);
	}
	return { missing, unexpected, differing };
}

const hasChanges = (c: RibbonDiffComparison) =>
	c.missing.length + c.unexpected.length + c.differing.length > 0;

/** How the layer is compared before an import (#102). */
type ExpectedLayer =
	/** An earlier read of the layer: every element must be exactly as it was. */
	| { kind: "read" }
	/**
	 * What an import wrote: Dataverse rewrites some of it (platform actions,
	 * labels), so elements are compared in the form that survives an import,
	 * and the layer is read up to `attempts` times, `delayMs` apart, since it
	 * can lag behind the publish (as verifyPublishedLayer allows).
	 */
	| { kind: "imported"; attempts?: number; delayMs?: number };

/** Reads the layer again and throws RibbonLayerChangedError when it isn't `expected` (#102). */
async function assertLayerUnchanged(
	entityLogicalName: string | null,
	scopeLabel: string,
	expected: RibbonDiffParts,
	as: ExpectedLayer,
): Promise<void> {
	const attempts = as.kind === "imported" ? (as.attempts ?? 3) : 1;
	let changes: RibbonDiffComparison = { missing: [], unexpected: [], differing: [] };
	for (let i = 0; i < attempts; i++) {
		if (i > 0 && as.kind === "imported")
			await new Promise((r) => setTimeout(r, as.delayMs ?? 5000));
		const actual = await fetchUnmanagedRibbonParts(entityLogicalName);
		changes =
			as.kind === "read"
				? exactLayerChanges(expected, actual)
				: compareRibbonDiffParts(expected, actual, { contentKeys: allKeys(expected) });
		if (!hasChanges(changes)) return;
	}
	throw new RibbonLayerChangedError(scopeLabel, changes);
}

/**
 * Publishes one ribbon scope (a table, or the application ribbon):
 * read the existing unmanaged layer → merge CBS's edits from every location →
 * import ONE complete RibbonDiffXml → verify Dataverse actually applied it →
 * (optionally) PublishXml.
 */
export function publishRibbon(
	input: PublishRibbonInput,
	onProgress?: (msg: string) => void,
): Promise<PublishRibbonResult> {
	// What the publish imported changes the application ribbon too (#4).
	return withCloseGuard(() => publishRibbonUnguarded(input, onProgress)).finally(() =>
		invalidateApplicationRibbonCache({ afterPublish: true }),
	);
}

async function publishRibbonUnguarded(
	input: PublishRibbonInput,
	onProgress?: (msg: string) => void,
): Promise<PublishRibbonResult> {
	// Every write of this operation goes to the connection it started on (#120).
	const guard = input.guard ?? writeGuard();
	const logs = useRuntimeLogStore.getState();
	const scopeLabel = input.entity ? input.entity.logicalName : "Application ribbon";
	const signal = input.signal;
	// Where the publish is, for what a cancel says (#107).
	let stage: "before" | "imported" | "published" = "before";
	const cancelled = () =>
		new PublishCancelledError(
			stage === "before"
				? "You cancelled the publish before anything was imported."
				: stage === "imported"
					? "You cancelled the publish after the import: your changes are imported but not published."
					: "You cancelled the publish.",
		);
	const checkCancelled = () => {
		if (signal?.aborted) throw cancelled();
	};
	const busy: BusyWaitOptions = {
		onProgress,
		...input.busy,
		// Waiting for a busy environment stops at once on Cancel.
		sleep: (ms) => sleepUnlessCancelled(ms, signal, cancelled, input.busy?.sleep),
	};

	const isApplication = input.entity === null;
	if (isApplication && !input.ribbonCustomizationIds?.length) {
		throw new Error(
			"The selected solution does not contain Application Ribbons. Add it in make.powerapps.com " +
				"(Solutions → your solution → Add existing → Application Ribbons) and reload the solution.",
		);
	}

	const publishScope = async (progress = "Publishing customizations…") => {
		checkCancelled();
		onProgress?.(progress);
		await withBusyRetry(
			"Publish",
			async () => {
				if (isApplication) {
					// Targeted publish of the application ribbon only — PublishAllXml
					// would publish the whole environment.
					await guard("Publishing");
					await dataverseAPI.execute({
						operationName: "PublishXml",
						operationType: "action",
						parameters: {
							ParameterXml:
								"<importexportxml><ribbons><ribbon></ribbon></ribbons></importexportxml>",
						},
					});
				} else {
					await publishTables([input.entity!.logicalName], guard);
				}
			},
			busy,
		);
	};

	const languageCode = input.languageCode ?? (await fetchOrganizationLanguageCode());
	// Reads the layer, merges this session's changes into it and runs the
	// pre-publish check (#35): never import what the check rejects.
	const mergeAndCheck = async (log: boolean) => {
		onProgress?.(`Reading existing ribbon customizations for ${scopeLabel}…`);
		if (log) logs.logInfo("publish", `Reading unmanaged ribbon layer for ${scopeLabel}.`);
		const result = await buildMergedRibbonDiffXml({ ...input, languageCode });
		const findings = validatePublishRibbonDiff(
			result.parts,
			publishValidationContext(
				{ ...input, publisherPrefix: input.solution.publisherPrefix },
				result,
			),
		);
		const blocking = findings.filter((f) => f.severity === "error");
		if (log || blocking.length > 0) {
			logs.logInfo(
				"publish",
				`RibbonDiffXml for ${scopeLabel}: ${result.preservedCount} existing element(s) preserved, ` +
					`${result.changedCount} element(s) from this session, ${result.elementCount} total.`,
			);
			for (const c of result.scalingChanges)
				logs.logWarn("publish", describeScalingChange(c));
			for (const f of findings)
				if (f.severity === "warning") logs.logWarn("publish", f.message);
		}
		if (blocking.length > 0) {
			for (const f of blocking) logs.logError("publish", f.message);
			throw new Error(
				`The pre-publish check found ${blocking.length} error(s), so nothing was imported: ` +
					blocking.map((f) => f.message).join("; "),
			);
		}
		return result;
	};

	// The layer tables show PUBLISHED state only, and the import replaces the
	// whole unmanaged layer (#103): ribbon changes imported elsewhere but not yet
	// published would be lost. Publishing the scope first makes them part of the
	// layer that is read and merged. The publish at the end publishes them anyway
	// (with everything else pending for the table), so this adds no other effect.
	// A publish the check refuses as loaded writes nothing: the check runs before.
	const dryRun = input.publishCustomizations !== false ? await mergeAndCheck(false) : null;
	// Don't start while another solution operation runs (#46): an import still
	// running is finished, and published below, before the layer is read.
	onProgress?.("Checking that no other solution operation is running…");
	await waitForEnvironmentIdle(busy);
	// The solution's and publisher's own details go into the manifest as they are
	// (#104): read after the wait, just before anything is written.
	const manifestDetails = await fetchManifestDetails(input.solution);
	// After the publish first, a failure says so: other makers' pending changes
	// for the table were published, though nothing of yours was imported.
	let importedOnce = false;
	const publishedFirstNote = (err: unknown) => {
		if (dryRun && !importedOnce && err instanceof Error) {
			err.message +=
				` (${scopeLabel} was published first, so customizations imported elsewhere for it and not yet ` +
				`published are now published.)`;
		}
		return err;
	};
	if (dryRun) {
		logs.logInfo(
			"publish",
			`Publishing ${scopeLabel} first, so ribbon changes imported elsewhere but not yet published are kept.`,
		);
		try {
			await publishScope(
				`Publishing ${scopeLabel} first (keeps changes imported elsewhere but not published)…`,
			);
		} catch (err) {
			if (err instanceof Error && !isPublishCancelled(err))
				err.message = `Publishing ${scopeLabel} first failed, so nothing was imported: ${err.message}`;
			throw err;
		}
	}
	let merged: Awaited<ReturnType<typeof mergeAndCheck>>;
	if (signal?.aborted) throw publishedFirstNote(cancelled());
	try {
		merged = await mergeAndCheck(true);
	} catch (err) {
		// It merged before the publish first: what that published (imported elsewhere) is in the way.
		if (dryRun && err instanceof Error && !err.message.startsWith("The pre-publish check")) {
			err.message =
				`${scopeLabel}'s customizations changed when it was published first (changes imported elsewhere ` +
				`and not yet published): ${err.message} Reload the entity to get them, then publish again.`;
		}
		throw publishedFirstNote(err);
	}
	if (dryRun) {
		const published = exactLayerChanges(dryRun.layer, merged.layer);
		if (hasChanges(published)) {
			logs.logInfo(
				"publish",
				`Publishing ${scopeLabel} first published ribbon changes imported elsewhere (${describeLayerChanges(published)}); ` +
					`they are kept.`,
			);
		}
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

	const solutionXml = generateSolutionXml({
		...input.solution,
		languageCode,
		rootComponents,
		details: manifestDetails,
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

	// The import replaces the whole unmanaged layer (#102): `expected` is what it
	// must still be when the import starts, or someone else changed it.
	const importAndVerify = async (
		pass: string,
		expected: { layer: RibbonDiffParts; as: ExpectedLayer },
	): Promise<string> => {
		onProgress?.(`Importing ${scopeLabel} ribbon${pass}…`);
		// The import job CBS verifies: client-generated, a new one per attempt (an
		// attempt Dataverse refused may have created it).
		let importJobId = "";
		// The job of an import that started: what View import log shows (#107).
		let startedJobId: string | undefined;
		// Another import / publish / ribbon-metadata generation makes the import
		// fail with 0x80071151: wait for it and retry (#46). The layer is read again
		// before every attempt, after the wait.
		let importRan = false;
		const busyFailure = (err: unknown) => {
			if (runningOperationOf(err)?.toLowerCase() === "import") importRan = true;
			return err;
		};
		try {
			await withBusyRetry(
				"Import",
				async () => {
					checkCancelled();
					// Still the connection the publish started on (#120), before reading it.
					await guard("Importing");
					// Another import ran while this one waited (#103): what it wrote may not
					// be published, so the check below can't see it.
					if (importRan)
						throw new RibbonLayerChangedError(
							scopeLabel,
							{ missing: [], unexpected: [], differing: [] },
							true,
						);
					await assertLayerUnchanged(
						input.entity?.logicalName ?? null,
						scopeLabel,
						expected.layer,
						expected.as,
					);
					checkCancelled();
					importJobId = crypto.randomUUID();
					logs.logInfo(
						"publish",
						`Importing solution${pass} (import job ${importJobId})…`,
					);
					let started: { asyncOperationId: string; importJobId: string };
					try {
						started = await startImport(base64Zip, importJobId, guard);
					} catch (err) {
						if (isEnvironmentBusyError(err)) throw busyFailure(err);
						// The import itself failed (#107): add the import job's own reason when the
						// fault doesn't already say it (a generic 500, a timeout).
						throw err instanceof ConnectionChangedError
							? err
							: await withImportJobReason(err, importJobId);
					}
					importJobId = started.importJobId;
					startedJobId = importJobId;
					logs.logInfo(
						"publish",
						`Import running as system job ${started.asyncOperationId}; waiting for it to finish.`,
					);
					try {
						await waitForAsyncImport({
							asyncOperationId: started.asyncOperationId,
							importJobId,
							guard,
							signal,
							// Ribbon imports take 20–50 s on a typical environment (measured live).
							pollMs: input.importPollMs ?? 2000,
							timeoutMs: input.importTimeoutMs ?? 10 * 60_000,
							onProgress,
						});
					} catch (err) {
						// The system job failed because another operation was running: retried.
						if (isEnvironmentBusyError(err)) {
							startedJobId = undefined;
							throw busyFailure(err);
						}
						throw err;
					}
					importedOnce = true;
				},
				busy,
			);

			onProgress?.("Verifying the import…");
			const job = (await dataverseAPI.retrieve("importjob", importJobId, ["data"])) as {
				data?: string;
			};
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
		} catch (err) {
			throw startedJobId ? withImportJob(err, startedJobId) : err;
		}
	};

	let importJobId: string;
	try {
		importJobId = await importAndVerify("", { layer: merged.layer, as: { kind: "read" } });
	} catch (err) {
		throw publishedFirstNote(err);
	}
	stage = "imported";
	let verification: PublishVerification | undefined;

	if (input.publishCustomizations !== false) {
		try {
			await publishScope();
		} catch (err) {
			// A cancel or failure here leaves the import in place: View import log still applies.
			throw withImportJob(err, importJobId);
		}
		stage = "published";
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
				// The layer is now what the first import wrote.
				await importAndVerify(" (refreshing Unified Interface metadata)", {
					layer: merged.parts,
					as: { kind: "imported", delayMs: input.verifyDelayMs },
				});
				await publishScope();
			} catch (err) {
				if (err instanceof RibbonLayerChangedError) {
					// Your changes are published: the publish succeeded, with a warning.
					verification = {
						ok: false,
						...err.changes,
						message:
							`Your changes were imported and published, but ${scopeLabel}'s ribbon customizations changed ` +
							`in Dataverse after that (${err.summary}): other changes were published meanwhile. They weren't ` +
							`imported a second time to refresh Unified Interface's command-bar metadata, since that would ` +
							`overwrite the other change, so new or changed buttons may not appear in the app until the ` +
							`entity's ribbon is published again. Reload the entity to see the other change.`,
					};
					logs.logWarn("publish", verification.message);
				} else {
					// Your changes are imported and published either way (#107 review): a cancelled or
					// failed refresh is a warning, not a failed publish, so they aren't left pending.
					const why = err instanceof Error ? err.message : String(err);
					verification = {
						ok: false,
						missing: [],
						unexpected: [],
						differing: [],
						importJobId: importJobIdOf(err),
						message:
							(isPublishCancelled(err)
								? `Your changes were imported and published, but you cancelled the second import, ` +
									`which refreshes Unified Interface's command-bar metadata.` +
									// "You cancelled the publish." adds nothing here; what Dataverse did with the job does.
									afterCancel(why)
								: `Your changes were imported and published, but refreshing Unified Interface's ` +
									`command-bar metadata failed (${why}).`) +
							` New or changed buttons may not appear in the app until ` +
							`${isApplication ? "the application ribbon" : "the entity's ribbon"} is published ` +
							`again, or for up to about 25 minutes.`,
					};
					logs.logWarn("publish", verification.message);
				}
			}
		}
		if (!verification) {
			onProgress?.("Verifying the published ribbon…");
			verification = await verifyPublishedLayer(
				input.entity?.logicalName ?? null,
				merged.parts,
				{
					delayMs: input.verifyDelayMs,
					contentKeys: merged.changedKeys,
				},
			);
			if (verification.ok) logs.logInfo("publish", verification.message);
			else logs.logWarn("publish", verification.message);
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
		verification,
		parts: merged.parts,
		changedKeys: merged.changedKeys,
	};
}

export function publishAllAsync(
	onProgress?: (msg: string) => void,
	options?: { pollIntervalMs?: number; timeoutMs?: number; guard?: WriteGuard },
): Promise<PublishAllAsyncResult> {
	return withCloseGuard(() => publishAllAsyncUnguarded(onProgress, options)).finally(() =>
		invalidateApplicationRibbonCache({ afterPublish: true }),
	);
}

async function publishAllAsyncUnguarded(
	onProgress?: (msg: string) => void,
	options?: { pollIntervalMs?: number; timeoutMs?: number; guard?: WriteGuard },
): Promise<PublishAllAsyncResult> {
	// Every write of this operation goes to the connection it started on (#120).
	const guard = options?.guard ?? writeGuard();
	const logs = useRuntimeLogStore.getState();
	const pollIntervalMs = options?.pollIntervalMs ?? 2000;
	const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;

	onProgress?.("Starting asynchronous publish (PublishAllXmlAsync)...");
	logs.logInfo("publish", "Calling PublishAllXmlAsync action.");

	await guard("Publishing");
	const response = (await dataverseAPI.execute({
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
				const details =
					job.friendlymessage || job.message || `statuscode=${job.statuscode}`;
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
	/** The solution's and publisher's details as they are in Dataverse (#104). */
	details: ManifestDetails;
}

/**
 * What an import of the manifest would otherwise change on the solution and its
 * publisher (#104, verified live): an empty or missing `<EMailAddress>`,
 * `<SupportingWebsiteUrl>` or `<Addresses>` clears the publisher's e-mail,
 * website and addresses, so they are written as they are, as an export does.
 */
export interface ManifestDetails {
	solutionDescription: string;
	publisherDescription: string;
	publisherEmail: string;
	publisherWebsite: string;
	publisherOptionValuePrefix: number;
	/** The publisher's address 1 and 2, `address{n}_<field>` columns. */
	publisherAddresses: Record<string, unknown>[];
}

/** Address child elements of a solution manifest, with their `address{n}_` column. */
const ADDRESS_ELEMENTS: [string, string][] = [
	["AddressTypeCode", "addresstypecode"],
	["City", "city"],
	["County", "county"],
	["Country", "country"],
	["Fax", "fax"],
	["FreightTermsCode", "freighttermscode"],
	["Latitude", "latitude"],
	["Line1", "line1"],
	["Line2", "line2"],
	["Line3", "line3"],
	["Longitude", "longitude"],
	["Name", "name"],
	["PostalCode", "postalcode"],
	["PostOfficeBox", "postofficebox"],
	["PrimaryContactName", "primarycontactname"],
	["ShippingMethodCode", "shippingmethodcode"],
	["StateOrProvince", "stateorprovince"],
	["Telephone1", "telephone1"],
	["Telephone2", "telephone2"],
	["Telephone3", "telephone3"],
	["UPSZone", "upszone"],
	["UTCOffset", "utcoffset"],
	["UTCConversionTimeZoneCode", "utcconversiontimezonecode"],
];

/**
 * Reads the solution's description and its publisher (every column: an unknown
 * one in `$select` would fail the request) for the manifest (#104). Throws when
 * they can't be read: importing without them would clear the publisher's details.
 */
export async function fetchManifestDetails(
	solution: PublishSolutionInfo,
): Promise<ManifestDetails> {
	let record: Record<string, unknown> | undefined;
	try {
		const res = (await dataverseAPI.queryData(
			`solutions?$select=description&$expand=publisherid&$filter=uniquename eq '${solution.uniqueName.replace(/'/g, "''")}'`,
		)) as { value?: Record<string, unknown>[] };
		record = res.value?.[0];
	} catch (err) {
		throw new Error(
			`Couldn't read solution ${solution.uniqueName} and its publisher (${err instanceof Error ? err.message : String(err)}), so nothing was imported: an import without them would clear the publisher's details.`,
		);
	}
	const publisher = record?.["publisherid"] as Record<string, unknown> | undefined;
	if (!record || !publisher) {
		throw new Error(
			`Couldn't read solution ${solution.uniqueName} and its publisher, so nothing was imported: an import without them would clear the publisher's details.`,
		);
	}
	const prefix = publisher["customizationoptionvalueprefix"];
	if (typeof prefix !== "number") {
		throw new Error(
			`Couldn't read the option-value prefix of publisher ${solution.publisherUniqueName}, so nothing was imported: a wrong one would change the publisher.`,
		);
	}
	const text = (v: unknown) => (typeof v === "string" ? v : "");
	const addresses = [1, 2]
		.map((n) =>
			Object.fromEntries(
				ADDRESS_ELEMENTS.map(
					([, column]) => [column, publisher[`address${n}_${column}`]] as const,
				).filter(([, v]) => v !== null && v !== undefined && v !== ""),
			),
		)
		.map((fields, i) => ({ number: i + 1, ...fields }));
	return {
		solutionDescription: text(record["description"]),
		publisherDescription: text(publisher["description"]),
		publisherEmail: text(publisher["emailaddress"]),
		publisherWebsite: text(publisher["supportingwebsiteurl"]),
		publisherOptionValuePrefix: prefix,
		publisherAddresses: addresses.filter((a) => Object.keys(a).length > 1),
	};
}

/** An attribute value keeping line breaks and tabs, which attribute normalisation turns into spaces. */
const attributeXml = (value: string) =>
	escapeXml(value).replace(/\r/g, "&#xD;").replace(/\n/g, "&#xA;").replace(/\t/g, "&#x9;");

const descriptionsXml = (description: string, lang: number) =>
	description
		? `<Descriptions>\n        <Description description="${attributeXml(description)}" languagecode="${lang}"/>\n      </Descriptions>`
		: "<Descriptions/>";

const addressesXml = (addresses: Record<string, unknown>[]) =>
	addresses.length === 0
		? "<Addresses/>"
		: `<Addresses>${addresses
				.map(
					(a) =>
						`\n        <Address>\n          <AddressNumber>${a["number"]}</AddressNumber>${ADDRESS_ELEMENTS.filter(
							([, column]) => column in a,
						)
							.map(
								([element, column]) =>
									`\n          <${element}>${escapeXml(String(a[column]))}</${element}>`,
							)
							.join("")}\n        </Address>`,
				)
				.join("")}\n      </Addresses>`;

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
    ${descriptionsXml(input.details.solutionDescription, lang)}
    <Version>${escapeXml(input.version)}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>${escapeXml(pubUnique)}</UniqueName>
      <LocalizedNames>
        <LocalizedName description="${escapeXml(pubName)}" languagecode="${lang}"/>
      </LocalizedNames>
      ${descriptionsXml(input.details.publisherDescription, lang)}
      <EMailAddress>${escapeXml(input.details.publisherEmail)}</EMailAddress>
      <SupportingWebsiteUrl>${escapeXml(input.details.publisherWebsite)}</SupportingWebsiteUrl>
      <CustomizationPrefix>${escapeXml(pubPrefix)}</CustomizationPrefix>
      <CustomizationOptionValuePrefix>${input.details.publisherOptionValuePrefix}</CustomizationOptionValuePrefix>
      ${addressesXml(input.details.publisherAddresses)}
    </Publisher>
    ${rootComponentsXml}
    <MissingDependencies/>
  </SolutionManifest>
</ImportExportXml>`;
}
