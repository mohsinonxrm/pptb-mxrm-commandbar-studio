/**
 * #19 — web resources CBS creates or updates are added to the active
 * unmanaged solution (AddSolutionComponent, component type 61).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	addExistingWebResourceToActiveSolution,
	WEB_RESOURCE_COMPONENT_TYPE,
	saveWebResource,
	upsertWebResource,
} from "@/services/dataverse/webResourceService";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { useSessionStore } from "@/store/sessionStore";
import type { Solution } from "@/types/solution";

function fakeApi(existingId?: string) {
	return {
		queryData: vi.fn(async (_q: string) => ({
			value: existingId ? [{ webresourceid: existingId }] : [],
		})),
		create: vi.fn(async () => ({ id: "new-id" })),
		update: vi.fn(async () => undefined),
		execute: vi.fn(async (_req?: unknown) => ({})),
	};
}
const asApi = (api: ReturnType<typeof fakeApi>) => api as unknown as DataverseAPI.API;
const operations = (api: ReturnType<typeof fakeApi>) =>
	api.execute.mock.calls.map((c: unknown[]) => (c[0] as { operationName: string }).operationName);

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
		expect(operations(api)).not.toContain("AddSolutionComponent");
	});

	it("publishes what it created or updated (#156)", async () => {
		const api = fakeApi("wr-1");
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		const res = await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(res.updated).toBe(true);
		expect(res.published).toBe(true);
		expect(api.execute).toHaveBeenCalledWith({
			operationName: "PublishXml",
			operationType: "action",
			parameters: {
				ParameterXml: "<importexportxml><webresources><webresource>wr-1</webresource></webresources></importexportxml>",
			},
		});
	});

	it("doesn't publish what it kept, or when the caller publishes itself", async () => {
		const api = fakeApi("wr-1");
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		await saveWebResource("cbstest_/x.js", "Ow==", 3, { keepExisting: true });
		await saveWebResource("cbstest_/y.js", "Ow==", 3, { publish: false });
		expect(operations(api)).not.toContain("PublishXml");
	});

	it("a publish that fails leaves the save and says so", async () => {
		const api = fakeApi();
		api.execute = vi.fn(async (req: unknown) => {
			if ((req as { operationName: string }).operationName === "PublishXml") throw new Error("denied");
			return {};
		});
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useRuntimeLogStore.getState().clear();
		const res = await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(res.created).toBe(true);
		expect(res.published).toBeUndefined();
		expect(res.publishWarning).toMatch(/saved but not published \(denied\)/);
		expect(useRuntimeLogStore.getState().entries.some((e) => e.message === res.publishWarning)).toBe(true);
	});

	it("warns when a managed active solution means the web resource lands in no solution", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(true) });
		useRuntimeLogStore.getState().clear();
		const res = await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(res.solutionWarning).toMatch(/cbstest_\/x\.js .*not added to any solution.*CBSLiveTest is managed/);
		const warns = useRuntimeLogStore.getState().entries.filter((e) => e.level === "warn");
		expect(warns.map((e) => e.message)).toEqual([res.solutionWarning]);
	});

	it("warns when no solution is selected", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useRuntimeLogStore.getState().clear();
		const res = await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(res.solutionWarning).toMatch(/no solution is selected/);
		expect(useRuntimeLogStore.getState().entries.some((e) => e.level === "warn")).toBe(true);
	});

	it("does not warn when the web resource was added to the active unmanaged solution", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(false) });
		useRuntimeLogStore.getState().clear();
		const res = await saveWebResource("cbstest_/x.js", "Ow==", 3);
		expect(res.solutionWarning).toBeUndefined();
		expect(useRuntimeLogStore.getState().entries).toEqual([]);
	});
});

describe("addExistingWebResourceToActiveSolution (#61)", () => {
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
		useRuntimeLogStore.setState({ entries: [] });
		delete (window as unknown as { dataverseAPI?: unknown }).dataverseAPI;
	});

	it("adds a picked web resource to the active unmanaged solution", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(false) });
		const res = await addExistingWebResourceToActiveSolution("cbstest_/icons/x.svg", { id: "wr-1", isCustom: true });
		expect(res.solutionUniqueName).toBe("CBSLiveTest");
		expect(api.execute.mock.calls[0]).toEqual(addComponentCall("wr-1", "CBSLiveTest"));
	});

	it("looks a typed name up, and fails when it doesn't exist", async () => {
		const api = fakeApi("wr-2");
		api.queryData.mockResolvedValue({ value: [{ webresourceid: "wr-2", ismanaged: false }] } as never);
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(false) });
		await addExistingWebResourceToActiveSolution("cbstest_/icons/y.svg");
		expect(api.execute.mock.calls[0]).toEqual(addComponentCall("wr-2", "CBSLiveTest"));

		const missing = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = missing;
		await expect(addExistingWebResourceToActiveSolution("cbstest_/icons/none.svg")).rejects.toThrow(
			/No web resource named cbstest_\/icons\/none\.svg/,
		);
		expect(missing.execute).not.toHaveBeenCalled();
	});

	it("doesn't add a managed web resource to the user's solution", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(false) });
		const res = await addExistingWebResourceToActiveSolution("msdyn_/icons/x.svg", { id: "wr-9", isCustom: false });
		expect(res.solutionUniqueName).toBeUndefined();
		expect(res.solutionWarning).toMatch(/is managed, so it isn't added to your solution/);
		expect(api.execute).not.toHaveBeenCalled();
	});

	it("warns instead of adding when the active solution is managed", async () => {
		const api = fakeApi();
		(window as unknown as { dataverseAPI: unknown }).dataverseAPI = api;
		useSessionStore.setState({ activeSolution: solution(true) });
		const res = await addExistingWebResourceToActiveSolution("cbstest_/icons/x.svg", { id: "wr-1", isCustom: true });
		expect(res.solutionWarning).toMatch(/not added to any solution because the active solution CBSLiveTest is managed/);
		expect(api.execute).not.toHaveBeenCalled();
	});
});
