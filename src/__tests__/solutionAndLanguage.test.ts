/**
 * #105 — the system Default solution isn't offered as a publish target.
 * #106 — the organization's base language is read twice, never assumed to be 1033.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

const setApi = (queryData: (q: string) => Promise<unknown>) => {
	(window as unknown as { dataverseAPI: unknown }).dataverseAPI = { queryData: vi.fn(queryData) };
};

afterEach(() => {
	delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
	vi.resetModules();
});

describe("the solution picker (#105)", () => {
	it("leaves out the system Default solution, and the Active layer", async () => {
		const queries: string[] = [];
		setApi(async (q) => {
			queries.push(q);
			return { value: [] };
		});
		const { fetchSolutions } = await import("@/services/dataverse/solutionService");
		await fetchSolutions();
		expect(queries[0]).toContain("uniquename ne 'Default'");
		expect(queries[0]).toContain("uniquename ne 'Active'");
	});
});

describe("fetchOrganizationLanguageCode (#106)", () => {
	it("returns the organization's base language", async () => {
		setApi(async () => ({ value: [{ languagecode: 1031 }] }));
		const { fetchOrganizationLanguageCode } =
			await import("@/services/dataverse/environmentService");
		await expect(fetchOrganizationLanguageCode()).resolves.toBe(1031);
	});

	it("reads it again once when the first read fails", async () => {
		let calls = 0;
		setApi(async () => {
			if (calls++ === 0) throw new Error("throttled");
			return { value: [{ languagecode: 1036 }] };
		});
		const { fetchOrganizationLanguageCode } =
			await import("@/services/dataverse/environmentService");
		await expect(fetchOrganizationLanguageCode()).resolves.toBe(1036);
		expect(calls).toBe(2);
	});

	it("throws, never 1033, when it can't be read or isn't there", async () => {
		setApi(async () => {
			throw new Error("403 Forbidden");
		});
		const env = await import("@/services/dataverse/environmentService");
		await expect(env.fetchOrganizationLanguageCode()).rejects.toThrow(
			"Couldn't read the organization's base language (403 Forbidden).",
		);
		setApi(async () => ({ value: [{}] }));
		await expect(env.fetchOrganizationLanguageCode()).rejects.toThrow(/has no languagecode/);
	});
});
