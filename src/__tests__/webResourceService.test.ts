/**
 * #19 — web resources CBS creates or updates are added to the active
 * unmanaged solution (AddSolutionComponent, component type 61).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	WEB_RESOURCE_COMPONENT_TYPE,
	saveWebResource,
	upsertWebResource,
} from "@/services/dataverse/webResourceService";
import { useSessionStore } from "@/store/sessionStore";
import type { Solution } from "@/types/solution";

function fakeApi(existingId?: string) {
	return {
		queryData: vi.fn(async (_q: string) => ({
			value: existingId ? [{ webresourceid: existingId }] : [],
		})),
		create: vi.fn(async () => ({ id: "new-id" })),
		update: vi.fn(async () => undefined),
		execute: vi.fn(async () => ({})),
	};
}
const asApi = (api: ReturnType<typeof fakeApi>) => api as unknown as DataverseAPI.API;

const addComponentCall = (id: string, solution: string) => [
	{
		operationName: "AddSolutionComponent",
		operationType: "action",
		parameters: {
			ComponentId: id,
			ComponentType: 61,
			SolutionUniqueName: solution,
			AddRequiredComponents: false,
		},
	},
];

describe("upsertWebResource", () => {
	it("creates a new web resource and adds it to the solution", async () => {
		const api = fakeApi();
		const res = await upsertWebResource(
			asApi(api),
			"cbstest_/icons/cbs/add.svg",
			"PHN2Zy8+",
			11,
			{
				displayName: "add.svg",
				solutionUniqueName: "CBSLiveTest",
			},
		);
		expect(WEB_RESOURCE_COMPONENT_TYPE).toBe(61);
		expect(api.create).toHaveBeenCalledWith("webresource", {
			name: "cbstest_/icons/cbs/add.svg",
			content: "PHN2Zy8+",
			webresourcetype: 11,
			displayname: "add.svg",
		});
		expect(api.execute.mock.calls[0]).toEqual(addComponentCall("new-id", "CBSLiveTest"));
		expect(res).toEqual({
			id: "new-id",
			created: true,
			updated: false,
			solutionUniqueName: "CBSLiveTest",
		});
	});

	it("updates an existing web resource and still adds it to the solution", async () => {
		const api = fakeApi("old-id");
		const res = await upsertWebResource(asApi(api), "cbstest_/x.js", "Ow==", 3, {
			solutionUniqueName: "CBSLiveTest",
		});
		expect(api.update).toHaveBeenCalledWith(
			"webresource",
			"old-id",
			expect.objectContaining({ content: "Ow==" }),
		);
		expect(api.create).not.toHaveBeenCalled();
		expect(api.execute.mock.calls[0]).toEqual(addComponentCall("old-id", "CBSLiveTest"));
		expect(res).toMatchObject({ id: "old-id", created: false, updated: true });
	});

	it("reuses an existing web resource without overwriting it when keepExisting is set", async () => {
		const api = fakeApi("old-id");
		const res = await upsertWebResource(
			asApi(api),
			"cbstest_/icons/cbs/add.svg",
			"PHN2Zy8+",
			11,
			{
				solutionUniqueName: "CBSLiveTest",
				keepExisting: true,
			},
		);
		expect(api.update).not.toHaveBeenCalled();
		expect(api.execute.mock.calls[0]).toEqual(addComponentCall("old-id", "CBSLiveTest"));
		expect(res).toMatchObject({ id: "old-id", created: false, updated: false });
	});

	it("escapes quotes in the name lookup", async () => {
		const api = fakeApi();
		await upsertWebResource(asApi(api), "cbstest_/o'brien.js", "Ow==", 3);
		expect(api.queryData.mock.calls[0][0]).toContain("name eq 'cbstest_/o''brien.js'");
	});

	it("does not touch any solution when none is given", async () => {
		const api = fakeApi();
		const res = await upsertWebResource(asApi(api), "cbstest_/x.js", "Ow==", 3);
		expect(api.execute).not.toHaveBeenCalled();
		expect(res.solutionUniqueName).toBeUndefined();
	});

	it("reports a web resource that was saved but not added to the solution", async () => {
		const api = fakeApi();
		api.execute.mockRejectedValueOnce(new Error("0x80040216: no privilege"));
		await expect(
			upsertWebResource(asApi(api), "cbstest_/x.js", "Ow==", 3, {
				solutionUniqueName: "CBSLiveTest",
			}),
		).rejects.toThrow(
			/cbstest_\/x\.js was saved but could not be added to solution CBSLiveTest: 0x80040216/,
		);
	});
});

describe("saveWebResource", () => {
	const solution = (isManaged: boolean): Solution => ({
		id: "sol",
		uniqueName: "CBSLiveTest",
		friendlyName: "CBS Live Test",
		version: "1.0.0.0",
		isManaged,
		publisherId: "pub",
		publisherUniqueName: "cbstest",
		publisherName: "CBS Test",
		publisherPrefix: "cbstest",
	});
	afterEach(() => {
		useSessionStore.setState({ activeSolution: null });
		delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
	});

	it("targets the active unmanaged solution", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(false) });
		await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(api.execute.mock.calls[0]).toEqual(addComponentCall("new-id", "CBSLiveTest"));
	});

	it("never adds components to a managed solution", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(true) });
		await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(api.execute).not.toHaveBeenCalled();
	});
});
