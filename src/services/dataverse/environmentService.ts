/**
 * Environment-level helpers for publishing: the organisation's base language,
 * and coping with a busy environment (#46).
 *
 * Dataverse runs one solution operation at a time. While another import,
 * publish or "RibbonMetadataGeneration" (Command Checker → Regenerate ribbon
 * metadata) runs, ImportSolution and PublishXml fail with 0x80071151, e.g.
 *   "Cannot start the requested operation [Import] because there is another
 *    [RibbonMetadataGeneration] running at this moment."
 *   "Cannot start another [Import] because there is a previous [Import] running
 *    at this moment."
 * (both seen in msdyn_solutionhistories on the test environment). CBS waits for
 * running operations before it starts, and retries with backoff when it hits
 * one anyway.
 */

function api() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

/** The organisation's base language (`organizations.languagecode`), 1033 when it can't be read. */
export async function fetchOrganizationLanguageCode(): Promise<number> {
	// It decides the manifest's language and the language labels are written in:
	// never assumed to be 1033 (#106). Read twice, then the failure is thrown.
	let failure = "the organization record has no languagecode";
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = (await api().queryData("organizations?$select=languagecode")) as {
				value?: Array<{ languagecode?: number }>;
			};
			const code = res.value?.[0]?.languagecode;
			if (typeof code === "number") return code;
		} catch (err) {
			failure = err instanceof Error ? err.message : String(err);
		}
	}
	throw new Error(`Couldn't read the organization's base language (${failure}).`);
}

const BUSY_PATTERNS = [
	/0x80071151/i,
	/\b80071151\b/i,
	/Cannot start (?:the requested operation \[\w+\]|another \[\w+\]) because there is (?:another|a previous) \[\w+\] running/i,
	/installation or removal of another solution at the same time/i,
];

/** True for the "another solution operation is running" error (0x80071151). */
export function isEnvironmentBusyError(err: unknown): boolean {
	const text =
		err instanceof Error
			? `${err.message} ${String((err as Error & { code?: unknown }).code ?? "")}`
			: typeof err === "string"
				? err
				: JSON.stringify(err ?? "");
	return BUSY_PATTERNS.some((re) => re.test(text));
}

/** msdyn_solutionhistory.msdyn_operation labels (option set read live). */
const OPERATION_NAMES: Record<number, string> = {
	0: "Import",
	1: "Uninstall",
	2: "Export",
	3: "Publish",
	4: "PublishAll",
	5: "LanguageProvision",
	6: "ImportTranslation",
	7: "RibbonMetadataGeneration",
	8: "WorkflowSetState",
	10: "ExportLite",
	11: "UpdatingMissingPackages",
};

/** Started / Queued solution-history rows older than this are treated as stuck. */
export const STALE_OPERATION_MINUTES = 30;

export interface RunningOperation {
	operation: string;
	name: string;
	startedOn: string;
}

/**
 * Solution operations that are running or queued right now (msdyn_status 0
 * Started / 2 Queued). Rows that started more than `maxAgeMinutes` ago are
 * ignored — a crashed operation can stay "Started" forever, and the history
 * has no progress field to tell a stuck row from a slow one. The window is
 * short on purpose: this check is only an early, advisory wait. An operation
 * that really is still running past it makes ImportSolution / PublishXml fail
 * with 0x80071151, which withBusyRetry waits out — so a stuck row delays a
 * publish by at most this window, not hours. Exports don't block imports and
 * are ignored too. Returns [] when the history can't be read.
 */
export async function findRunningSolutionOperations(
	maxAgeMinutes = STALE_OPERATION_MINUTES,
	now = Date.now(),
): Promise<RunningOperation[]> {
	const since = now - maxAgeMinutes * 60_000;
	try {
		// msdyn_solutionhistory is a virtual table: verified live, a $filter on
		// msdyn_status or msdyn_starttime returns nothing / unrelated old rows,
		// while the newest rows by $orderby are reliable. So read the latest rows
		// and filter here.
		const res = (await api().queryData(
			`msdyn_solutionhistories?$select=msdyn_name,msdyn_operation,msdyn_status,msdyn_starttime` +
				`&$orderby=msdyn_starttime desc&$top=25`,
		)) as {
			value?: Array<{
				msdyn_name?: string;
				msdyn_operation?: number;
				msdyn_status?: number;
				msdyn_starttime?: string;
			}>;
		};
		return (res.value ?? [])
			.filter(
				(r) =>
					typeof r.msdyn_operation === "number" &&
					(r.msdyn_status === 0 || r.msdyn_status === 2) &&
					r.msdyn_operation !== 2 &&
					r.msdyn_operation !== 10 &&
					(!r.msdyn_starttime || Date.parse(r.msdyn_starttime) >= since),
			)
			.map((r) => ({
				operation:
					OPERATION_NAMES[r.msdyn_operation ?? -1] ?? `operation ${r.msdyn_operation}`,
				name: r.msdyn_name ?? "",
				startedOn: r.msdyn_starttime ?? "",
			}));
	} catch {
		return [];
	}
}

export interface BusyWaitOptions {
	onProgress?: (msg: string) => void;
	/** Total time to keep waiting / retrying before giving up (default 10 minutes). */
	timeoutMs?: number;
	/** Injected for tests. */
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const describe = (ops: RunningOperation[]) =>
	ops
		.map((o) => (o.name && o.name !== o.operation ? `${o.operation} (${o.name})` : o.operation))
		.join(", ");

/** Waits until no other solution operation runs (polls every 15 s), up to `timeoutMs`. */
export async function waitForEnvironmentIdle(options: BusyWaitOptions = {}): Promise<void> {
	const sleep = options.sleep ?? defaultSleep;
	const now = options.now ?? Date.now;
	const deadline = now() + (options.timeoutMs ?? 10 * 60_000);
	for (;;) {
		const running = await findRunningSolutionOperations(STALE_OPERATION_MINUTES, now());
		if (running.length === 0) return;
		if (now() >= deadline) {
			throw new Error(
				`The environment is still busy (${describe(running)} running). Try again when it has finished — ` +
					`Solutions › History shows its progress.`,
			);
		}
		options.onProgress?.(`Waiting for another operation to finish: ${describe(running)}…`);
		await sleep(15_000);
	}
}

/**
 * Runs `fn`, retrying with backoff (15 s, 30 s, 60 s, 60 s, …) while it fails
 * because another solution operation is running, up to `timeoutMs`. Any other
 * error is rethrown at once.
 */
export async function withBusyRetry<T>(
	what: string,
	fn: () => Promise<T>,
	options: BusyWaitOptions = {},
): Promise<T> {
	const sleep = options.sleep ?? defaultSleep;
	const now = options.now ?? Date.now;
	const deadline = now() + (options.timeoutMs ?? 10 * 60_000);
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (!isEnvironmentBusyError(err)) throw err;
			const delay = Math.min(60_000, 15_000 * 2 ** attempt);
			if (now() + delay > deadline) {
				throw new Error(
					`${what} kept failing because another solution operation is running in the environment ` +
						`(${err instanceof Error ? err.message : String(err)}). Try again when it has finished.`,
				);
			}
			options.onProgress?.(
				`${what}: another solution operation is running in the environment — retrying in ${Math.round(delay / 1000)} s…`,
			);
			await sleep(delay);
		}
	}
}
