/**
 * #107: a failed import says why. When ImportSolution itself fails, the import job's own
 * failure is added unless the fault already says it; the job not being readable never hides
 * the original error.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const JOB = "job-1";
const failedJob =
	'<importexportxml><solutionManifests><solutionManifest processed="true">' +
	'<result result="failure" errorcode="0x80048033" errortext="Publisher &quot;new&quot; can&apos;t be used &#38;amp; is reserved" />' +
	"</solutionManifest></solutionManifests></importexportxml>";

let retrieve: ReturnType<typeof vi.fn>;
async function load() {
	vi.resetModules();
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = {
		retrieve: (...args: unknown[]) => retrieve(...args),
	};
	return import("@/services/dataverse/publishService");
}

beforeEach(() => {
	retrieve = vi.fn();
});

describe("#107 a failed import's reason", () => {
	it("adds the import job's failure to a fault that doesn't say it", async () => {
		retrieve.mockResolvedValue({ data: failedJob });
		const { withImportJobReason } = await load();
		const err = (await withImportJobReason(
			new Error("Request failed with status 500"),
			JOB,
		)) as Error;
		expect(retrieve).toHaveBeenCalledWith("importjob", JOB, ["data"]);
		expect(err.message).toBe(
			`Request failed with status 500 — Dataverse couldn't import the solution (0x80048033): Publisher "new" can't be used &amp; is reserved`,
		);
	});

	it("keeps the fault when it already says it, or the job can't be read", async () => {
		const { withImportJobReason } = await load();
		const said = new Error(`Publisher "new" can't be used &amp; is reserved`);
		retrieve.mockResolvedValue({ data: failedJob });
		expect(await withImportJobReason(said, JOB)).toBe(said);

		const original = new Error("Request failed with status 500");
		retrieve.mockRejectedValue(new Error("Not found"));
		expect(await withImportJobReason(original, JOB)).toBe(original);
		retrieve.mockResolvedValue({ data: "<importexportxml />" });
		expect(await withImportJobReason(original, JOB)).toBe(original);
	});
});
