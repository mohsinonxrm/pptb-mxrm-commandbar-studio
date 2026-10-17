import { describe, expect, it, vi } from "vitest";
import {
	buildEntityPublishXml,
	buildExecuteRequest,
	createDataverseStub,
	formatFunctionParameter,
	getEntitySetName,
	HARNESS_HEADER,
	normalizeSolutionContent,
	type FetchLike,
} from "../dataverseStub";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(body === undefined ? "" : JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

function mockFetch(response: () => Response) {
	const fn = vi.fn<FetchLike>(async () => response());
	return fn;
}

describe("getEntitySetName (mirrors PPTB host pluralization)", () => {
	it.each([
		["account", "accounts"],
		["solution", "solutions"],
		["systemuser", "systemusers"],
		["asyncoperation", "asyncoperations"],
		["importjob", "importjobs"],
		["webresource", "webresourceset"],
		["opportunity", "opportunities"],
		["territory", "territories"],
		["activityparty", "activityparties"],
		["survey", "surveys"],
		["mailbox", "mailboxes"],
		["status", "statuses"],
		["branch", "branches"],
		["principalobjectaccess", "principalobjectaccessset"],
		["usersettingscollection", "usersettingscollection"],
		["Account", "accounts"],
	])("%s → %s", (logicalName, expected) => {
		expect(getEntitySetName(logicalName)).toBe(expected);
	});
});

describe("formatFunctionParameter", () => {
	it("quotes and encodes plain strings, doubling single quotes", () => {
		expect(formatFunctionParameter("account")).toBe("'account'");
		expect(formatFunctionParameter("O'Neil x")).toBe(encodeURIComponent("'O''Neil x'"));
	});

	it("passes enum literals unquoted", () => {
		const value = "Microsoft.Dynamics.CRM.RibbonLocationFilters'All'";
		expect(formatFunctionParameter(value)).toBe(encodeURIComponent(value));
		const multi = "Microsoft.Dynamics.CRM.EntityFilters'Entity,Attributes'";
		expect(decodeURIComponent(formatFunctionParameter(multi))).toBe(multi);
	});

	it("formats primitives, null and dates", () => {
		expect(formatFunctionParameter(1033)).toBe("1033");
		expect(formatFunctionParameter(true)).toBe("true");
		expect(formatFunctionParameter(false)).toBe("false");
		expect(formatFunctionParameter(null)).toBe("null");
		expect(formatFunctionParameter(undefined)).toBe("null");
		expect(formatFunctionParameter(new Date("2026-01-02T03:04:05Z"))).toBe(
			"2026-01-02T03:04:05.000Z",
		);
	});

	it("converts entity references to @odata.id", () => {
		const id = "00000000-0000-0000-0000-000000000001";
		expect(
			decodeURIComponent(formatFunctionParameter({ entityLogicalName: "account", id })),
		).toBe(JSON.stringify({ "@odata.id": `accounts(${id})` }));
		expect(
			decodeURIComponent(formatFunctionParameter({ "@odata.id": `contacts(${id})` })),
		).toBe(JSON.stringify({ "@odata.id": `contacts(${id})` }));
	});

	it("rejects malformed entity references", () => {
		expect(() => formatFunctionParameter({ entityLogicalName: 1, id: "x" })).toThrow(
			/EntityReference/,
		);
	});

	it("JSON-encodes complex objects", () => {
		expect(decodeURIComponent(formatFunctionParameter({ PageNumber: 1 }))).toBe(
			'{"PageNumber":1}',
		);
	});
});

describe("buildExecuteRequest", () => {
	it("builds unbound functions with parameter aliases (RetrieveEntityRibbon)", () => {
		const req = buildExecuteRequest({
			operationName: "RetrieveEntityRibbon",
			operationType: "function",
			parameters: {
				EntityName: "account",
				RibbonLocationFilter: "Microsoft.Dynamics.CRM.RibbonLocationFilters'All'",
			},
		});
		expect(req.method).toBe("GET");
		expect(req.body).toBeUndefined();
		expect(req.path).toBe(
			"RetrieveEntityRibbon(EntityName=@p0,RibbonLocationFilter=@p1)?@p0=" +
				encodeURIComponent("'account'") +
				"&@p1=" +
				encodeURIComponent("Microsoft.Dynamics.CRM.RibbonLocationFilters'All'"),
		);
	});

	it("leaves functions without parameters bare and adds () for empty parameters", () => {
		expect(
			buildExecuteRequest({ operationName: "WhoAmI", operationType: "function" }).path,
		).toBe("WhoAmI");
		expect(
			buildExecuteRequest({
				operationName: "RetrieveApplicationRibbon",
				operationType: "function",
				parameters: {},
			}).path,
		).toBe("RetrieveApplicationRibbon()");
	});

	it("sends action parameters as the POST body", () => {
		const req = buildExecuteRequest({
			operationName: "PublishXml",
			operationType: "action",
			parameters: { ParameterXml: "<importexportxml />" },
		});
		expect(req).toEqual({
			path: "PublishXml",
			method: "POST",
			body: { ParameterXml: "<importexportxml />" },
		});
	});

	it("builds bound operations on entity sets and records", () => {
		expect(
			buildExecuteRequest({
				entityName: "account",
				operationName: "Foo",
				operationType: "action",
			}).path,
		).toBe("accounts/Microsoft.Dynamics.CRM.Foo");
		expect(
			buildExecuteRequest({
				entityName: "opportunity",
				entityId: "abc",
				operationName: "Bar",
				operationType: "action",
			}).path,
		).toBe("opportunities(abc)/Microsoft.Dynamics.CRM.Bar");
	});
});

describe("helpers", () => {
	it("escapes PublishXml entity names", () => {
		expect(buildEntityPublishXml(" account ")).toBe(
			"<importexportxml><entities><entity>account</entity></entities></importexportxml>",
		);
		expect(buildEntityPublishXml("a<b")).toContain("a&lt;b");
		expect(() => buildEntityPublishXml("  ")).toThrow();
	});

	it("normalizes solution content to base64", () => {
		expect(normalizeSolutionContent("  UEsDBA==  ")).toBe("UEsDBA==");
		expect(normalizeSolutionContent(new Uint8Array([80, 75, 3, 4]))).toBe("UEsDBA==");
		expect(normalizeSolutionContent(new Uint8Array([80, 75, 3, 4]).buffer)).toBe("UEsDBA==");
		expect(() => normalizeSolutionContent("")).toThrow();
		expect(() => normalizeSolutionContent(new ArrayBuffer(0))).toThrow();
	});
});

describe("createDataverseStub", () => {
	it("queryData hits the proxy with PPTB's default headers", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({ value: [{ name: "x" }] }));
		const api = createDataverseStub(fetchImpl);
		const result = await api.queryData("?solutions?$select=uniquename");
		expect(result.value).toHaveLength(1);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("/__dv/solutions?$select=uniquename");
		expect(init?.method).toBe("GET");
		const headers = init?.headers as Record<string, string>;
		expect(headers.Prefer).toBe('return=representation,odata.include-annotations="*"');
		expect(headers[HARNESS_HEADER]).toBe("1");
		expect(headers["OData-Version"]).toBe("4.0");
	});

	it("lets an additional Prefer header replace the default extras", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({ value: [] }));
		const api = createDataverseStub(fetchImpl);
		await api.queryData("accounts", undefined, {
			Prefer: "odata.maxpagesize=10",
			"MSCRM.SolutionUniqueName": "cbs",
		});
		const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
		expect(headers.Prefer).toBe("return=representation,odata.maxpagesize=10");
		expect(headers["MSCRM.SolutionUniqueName"]).toBe("cbs");
	});

	it("retrieve uses the entity set name and $select", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({ fullname: "Jane" }));
		const api = createDataverseStub(fetchImpl);
		expect(await api.retrieve("systemuser", "id-1", ["fullname"])).toEqual({
			fullname: "Jane",
		});
		expect(fetchImpl.mock.calls[0][0]).toBe("/__dv/systemusers(id-1)?$select=fullname");
	});

	it("create returns the id from OData-EntityId", async () => {
		const id = "11111111-2222-3333-4444-555555555555";
		const fetchImpl = mockFetch(() =>
			jsonResponse({ name: "new_icon.svg" }, 201, {
				"OData-EntityId": `https://org.crm.dynamics.com/api/data/v9.2/webresourceset(${id})`,
			}),
		);
		const api = createDataverseStub(fetchImpl);
		const created = await api.create("webresource", { name: "new_icon.svg" });
		expect(created.id).toBe(id);
		expect(created.name).toBe("new_icon.svg");
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("/__dv/webresourceset");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(init?.body as string)).toEqual({ name: "new_icon.svg" });
	});

	it("update PATCHes the record", async () => {
		const fetchImpl = mockFetch(() => new Response(null, { status: 204 }));
		const api = createDataverseStub(fetchImpl);
		await api.update("webresource", "abc", { content: "x" });
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("/__dv/webresourceset(abc)");
		expect(init?.method).toBe("PATCH");
	});

	it("publishCustomizations uses PublishXml for one table and PublishAllXml otherwise", async () => {
		const fetchImpl = mockFetch(() => new Response(null, { status: 204 }));
		const api = createDataverseStub(fetchImpl);
		await api.publishCustomizations("account");
		await api.publishCustomizations();
		expect(fetchImpl.mock.calls[0][0]).toBe("/__dv/PublishXml");
		expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({
			ParameterXml: buildEntityPublishXml("account"),
		});
		expect(fetchImpl.mock.calls[1][0]).toBe("/__dv/PublishAllXml");
		expect(fetchImpl.mock.calls[1][1]?.body).toBeUndefined();
	});

	it("deploySolution calls ImportSolution with PPTB's defaults", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({}));
		const api = createDataverseStub(fetchImpl);
		await api.deploySolution("UEsDBA==", {
			importJobId: " job-1 ",
			overwriteUnmanagedCustomizations: true,
		});
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("/__dv/ImportSolution");
		expect(JSON.parse(init?.body as string)).toEqual({
			CustomizationFile: "UEsDBA==",
			PublishWorkflows: false,
			OverwriteUnmanagedCustomizations: true,
			ImportJobId: "job-1",
		});
	});

	it("getImportJobStatus retrieves the importjob record", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({ progress: 100 }));
		const api = createDataverseStub(fetchImpl);
		expect(await api.getImportJobStatus("job-1")).toEqual({ progress: 100 });
		expect(fetchImpl.mock.calls[0][0]).toMatch(
			/^\/__dv\/importjobs\(job-1\)\?\$select=importjobid,progress,/,
		);
		await expect(api.getImportJobStatus(" ")).rejects.toThrow(/importJobId/);
	});

	it("getSolutions selects the requested columns", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({ value: [] }));
		const api = createDataverseStub(fetchImpl);
		await api.getSolutions(["uniquename", "friendlyname"]);
		expect(fetchImpl.mock.calls[0][0]).toBe("/__dv/solutions?$select=uniquename,friendlyname");
		await expect(api.getSolutions([])).rejects.toThrow(/selectColumns/);
	});

	it("execute WhoAmI issues a GET", async () => {
		const fetchImpl = mockFetch(() => jsonResponse({ UserId: "u" }));
		const api = createDataverseStub(fetchImpl);
		expect(await api.execute({ operationName: "WhoAmI", operationType: "function" })).toEqual({
			UserId: "u",
		});
		expect(fetchImpl.mock.calls[0][0]).toBe("/__dv/WhoAmI");
		expect(fetchImpl.mock.calls[0][1]?.method).toBe("GET");
	});

	it("rejects with '<code>: <message>' for Dataverse errors", async () => {
		const api = createDataverseStub(
			mockFetch(() =>
				jsonResponse({ error: { code: "0x80040217", message: "Not found" } }, 404),
			),
		);
		await expect(api.retrieve("account", "x")).rejects.toThrow("0x80040217: Not found");
	});

	it("rejects with 'HTTP <status>: <body>' for non-JSON errors", async () => {
		const api = createDataverseStub(
			mockFetch(() => new Response("Bad gateway", { status: 502 })),
		);
		await expect(api.queryData("accounts")).rejects.toThrow("HTTP 502: Bad gateway");
		await expect(api.queryData(" ")).rejects.toThrow(/cannot be empty/);
	});

	it("resolves the entity set name like the host", async () => {
		const api = createDataverseStub(mockFetch(() => jsonResponse({})));
		expect(await api.getEntitySetName("webresource")).toBe("webresourceset");
	});
});
