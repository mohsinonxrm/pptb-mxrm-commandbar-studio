/**
 * Browser-side stand-in for PPTB's `window.dataverseAPI`, used only by the
 * dev harness (`npm run dev:harness`). Never shipped.
 *
 * Request shaping mirrors the PPTB desktop host
 * (PowerPlatformToolBox/desktop-app v1.2.7, src/main/managers/dataverseManager.ts):
 *  - entity-set names come from the same naive pluralization (getEntitySetName)
 *  - execute() builds bound/unbound URLs and function parameter aliases the same way
 *    (formatFunctionParameter, including unquoted `Microsoft.Dynamics.CRM.X'Y'` enums)
 *  - deploySolution() → ImportSolution action; publishCustomizations() → PublishXml /
 *    PublishAllXml; getImportJobStatus() → retrieve("importjob", …)
 *  - every request sends `Prefer: return=representation`; queryData() also asks for
 *    `odata.include-annotations="*"`
 *  - non-2xx responses reject with `"<code>: <message>"` (or `"HTTP <status>: <body>"`)
 *
 * Requests go to the Vite dev-server proxy at `/__dv/*`, which forwards them to
 * `<org>/api/data/v9.2/*` and adds the bearer token server-side. The token never
 * reaches the browser.
 */

/** Header the proxy requires on every request (blocks cross-site form posts). */
export const HARNESS_HEADER = "x-cbs-harness";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ExecuteRequestLike {
	entityName?: string;
	entityId?: string;
	operationName: string;
	operationType: "action" | "function";
	parameters?: Record<string, unknown>;
}

export interface DeploySolutionOptions {
	importJobId?: string;
	publishWorkflows?: boolean;
	overwriteUnmanagedCustomizations?: boolean;
	skipProductUpdateDependencies?: boolean;
	convertToManaged?: boolean;
}

type HeaderMap = Record<string, string>;

const IRREGULAR_PLURALS: Record<string, string> = {
	opportunity: "opportunities",
	territory: "territories",
	currency: "currencies",
	businessunit: "businessunits",
	systemuser: "systemusers",
	usersettingscollection: "usersettingscollection",
	principalobjectaccess: "principalobjectaccessset",
	webresource: "webresourceset",
	relationshipdefinition: "RelationshipDefinitions",
};

/** Same pluralization rules as PPTB's DataverseManager.getEntitySetName. */
export function getEntitySetName(entityLogicalName: string): string {
	const lowerName = entityLogicalName.toLowerCase();
	const irregular = IRREGULAR_PLURALS[lowerName];
	if (irregular) return irregular;
	if (
		lowerName.endsWith("y") &&
		lowerName.length > 1 &&
		!"aeiou".includes(lowerName[lowerName.length - 2])
	) {
		return lowerName.slice(0, -1) + "ies";
	}
	if (
		lowerName.endsWith("s") ||
		lowerName.endsWith("x") ||
		lowerName.endsWith("z") ||
		lowerName.endsWith("ch") ||
		lowerName.endsWith("sh")
	) {
		return lowerName + "es";
	}
	return lowerName + "s";
}

/** Same encoding as PPTB's DataverseManager.formatFunctionParameter. */
export function formatFunctionParameter(value: unknown): string {
	if (value === null || value === undefined) return "null";

	if (typeof value === "object" && "entityLogicalName" in value && "id" in value) {
		const ref = value as { entityLogicalName: unknown; id: unknown };
		if (typeof ref.entityLogicalName !== "string" || typeof ref.id !== "string") {
			throw new Error("EntityReference must have string entityLogicalName and id properties");
		}
		const odataRef = { "@odata.id": `${getEntitySetName(ref.entityLogicalName)}(${ref.id})` };
		return encodeURIComponent(JSON.stringify(odataRef));
	}

	if (typeof value === "object" && "@odata.id" in value) {
		return encodeURIComponent(JSON.stringify(value));
	}

	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number") return value.toString();
	if (value instanceof Date) return value.toISOString();

	if (typeof value === "string") {
		// Enum literal, e.g. Microsoft.Dynamics.CRM.RibbonLocationFilters'All' — not quoted.
		if (/^Microsoft\.Dynamics\.CRM\.\w+'.+'$/.test(value)) return encodeURIComponent(value);
		if (value.startsWith("{'@odata.id':") || value.startsWith('{"@odata.id":')) {
			return encodeURIComponent(value);
		}
		return encodeURIComponent(`'${value.replace(/'/g, "''")}'`);
	}

	if (typeof value === "object") return encodeURIComponent(JSON.stringify(value));
	return encodeURIComponent(String(value));
}

/**
 * Builds the Web API path (relative to `/api/data/v9.2/`), HTTP method and body
 * for an execute() request — same rules as PPTB's DataverseManager.execute.
 */
export function buildExecuteRequest(request: ExecuteRequestLike): {
	path: string;
	method: "GET" | "POST";
	body?: Record<string, unknown>;
} {
	let path = "";
	if (request.entityName) {
		const entitySetName = getEntitySetName(request.entityName);
		path += request.entityId
			? `${entitySetName}(${request.entityId})/Microsoft.Dynamics.CRM.${request.operationName}`
			: `${entitySetName}/Microsoft.Dynamics.CRM.${request.operationName}`;
	} else {
		path += request.operationName;
	}

	const isFunction = request.operationType === "function";
	if (isFunction && request.parameters) {
		const names = Object.keys(request.parameters);
		if (names.length > 0) {
			path += `(${names.map((name, i) => `${name}=@p${i}`).join(",")})`;
			path += `?${names
				.map((name, i) => `@p${i}=${formatFunctionParameter(request.parameters![name])}`)
				.join("&")}`;
		} else {
			path += "()";
		}
	}

	return {
		path,
		method: isFunction ? "GET" : "POST",
		body: request.operationType === "action" ? request.parameters : undefined,
	};
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** Same payload as PPTB's DataverseManager.buildEntityPublishXml. */
export function buildEntityPublishXml(entityLogicalName: string): string {
	const safeName = entityLogicalName.trim();
	if (!safeName) throw new Error("tableName parameter cannot be empty");
	return `<importexportxml><entities><entity>${escapeXml(safeName)}</entity></entities></importexportxml>`;
}

/** Same as PPTB's normalizeSolutionContent, using browser primitives. */
export function normalizeSolutionContent(content: string | ArrayBuffer | ArrayBufferView): string {
	const toBase64 = (bytes: Uint8Array) => {
		if (bytes.byteLength === 0)
			throw new Error("base64SolutionContent parameter cannot be empty");
		let binary = "";
		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}
		return btoa(binary);
	};
	if (typeof content === "string") {
		const trimmed = content.trim();
		if (!trimmed) throw new Error("base64SolutionContent parameter cannot be empty");
		return trimmed;
	}
	if (ArrayBuffer.isView(content)) {
		return toBase64(new Uint8Array(content.buffer, content.byteOffset, content.byteLength));
	}
	if (content instanceof ArrayBuffer) return toBase64(new Uint8Array(content));
	throw new Error(
		"base64SolutionContent must be a base64 string, ArrayBuffer, or ArrayBufferView",
	);
}

function extractIdFromUrl(url: string): string {
	const match = url.match(/\(([a-f0-9-]+)\)/i);
	return match ? match[1] : url;
}

interface HttpResult {
	status: number;
	data: Record<string, unknown>;
	headers: Headers;
}

/**
 * Creates the dataverseAPI stand-in. `fetchImpl` and `basePath` are injectable
 * for tests; at runtime they default to `window.fetch` and the `/__dv` proxy.
 */
export function createDataverseStub(fetchImpl: FetchLike, basePath = "/__dv") {
	async function request(
		path: string,
		method: string,
		body?: unknown,
		preferOptions?: string[],
		additionalHeaders?: HeaderMap,
	): Promise<HttpResult> {
		const custom: HeaderMap = { ...(additionalHeaders ?? {}) };
		const prefer = ["return=representation"];
		const customPreferKey = Object.keys(custom).find((k) => k.toLowerCase() === "prefer");
		if (customPreferKey && custom[customPreferKey]) {
			prefer.push(custom[customPreferKey]);
			delete custom[customPreferKey];
		} else if (preferOptions?.length) {
			prefer.push(...preferOptions);
		}

		const response = await fetchImpl(`${basePath}/${path.replace(/^\//, "")}`, {
			method,
			headers: {
				Accept: "application/json",
				"OData-MaxVersion": "4.0",
				"OData-Version": "4.0",
				"Content-Type": "application/json; charset=utf-8",
				Prefer: prefer.join(","),
				[HARNESS_HEADER]: "1",
				...custom,
			},
			body:
				body === undefined
					? undefined
					: typeof body === "string"
						? body
						: JSON.stringify(body),
		});

		const text = await response.text();
		if (response.ok) {
			let data: Record<string, unknown> = {};
			if (text.trim()) {
				try {
					data = JSON.parse(text) as Record<string, unknown>;
				} catch {
					data = {};
				}
			}
			return { status: response.status, data, headers: response.headers };
		}

		let message = `HTTP ${response.status}`;
		try {
			const err = JSON.parse(text) as { error?: { code?: string; message?: string } };
			if (err.error) message = `${err.error.code}: ${err.error.message}`;
		} catch {
			if (text.trim()) message += `: ${text.trim()}`;
		}
		throw new Error(message);
	}

	const retrieve = async (
		entityLogicalName: string,
		id: string,
		columns?: string[],
		_connectionTarget?: unknown,
		additionalHeaders?: HeaderMap,
	): Promise<Record<string, unknown>> => {
		let path = `${getEntitySetName(entityLogicalName)}(${id})`;
		if (columns && columns.length > 0) path += `?$select=${columns.join(",")}`;
		return (await request(path, "GET", undefined, undefined, additionalHeaders)).data;
	};

	const execute = async (
		req: ExecuteRequestLike,
		_connectionTarget?: unknown,
		additionalHeaders?: HeaderMap,
	): Promise<Record<string, unknown>> => {
		const { path, method, body } = buildExecuteRequest(req);
		return (await request(path, method, body, undefined, additionalHeaders)).data;
	};

	return {
		queryData: async (
			odataQuery: string,
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<{ value: Record<string, unknown>[] }> => {
			if (!odataQuery || !odataQuery.trim()) {
				throw new Error("odataQuery parameter cannot be empty");
			}
			const query = odataQuery.trim();
			const clean = query.startsWith("?") ? query.substring(1) : query;
			const result = await request(
				clean,
				"GET",
				undefined,
				['odata.include-annotations="*"'],
				additionalHeaders,
			);
			return result.data as { value: Record<string, unknown>[] };
		},

		getSolutions: async (
			selectColumns: string[],
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<{ value: Record<string, unknown>[] }> => {
			if (!selectColumns || selectColumns.length === 0) {
				throw new Error(
					"selectColumns parameter is required and must contain at least one column",
				);
			}
			const cols = selectColumns.map((c) => encodeURIComponent(c)).join(",");
			const result = await request(
				`solutions?$select=${cols}`,
				"GET",
				undefined,
				undefined,
				additionalHeaders,
			);
			return result.data as { value: Record<string, unknown>[] };
		},

		retrieve,

		create: async (
			entityLogicalName: string,
			record: Record<string, unknown>,
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<{ id: string; [key: string]: unknown }> => {
			const result = await request(
				getEntitySetName(entityLogicalName),
				"POST",
				record,
				undefined,
				additionalHeaders,
			);
			const entityId =
				result.headers.get("odata-entityid") ??
				(result.data[`${entityLogicalName}id`] as string | undefined);
			return { id: entityId ? extractIdFromUrl(entityId) : "", ...result.data };
		},

		update: async (
			entityLogicalName: string,
			id: string,
			record: Record<string, unknown>,
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<void> => {
			await request(
				`${getEntitySetName(entityLogicalName)}(${id})`,
				"PATCH",
				record,
				undefined,
				additionalHeaders,
			);
		},

		execute,

		publishCustomizations: async (
			tableLogicalName?: string,
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<void> => {
			const trimmed = tableLogicalName?.trim();
			const body = trimmed ? { ParameterXml: buildEntityPublishXml(trimmed) } : undefined;
			await request(
				trimmed ? "PublishXml" : "PublishAllXml",
				"POST",
				body,
				undefined,
				additionalHeaders,
			);
		},

		deploySolution: async (
			base64SolutionContent: string | ArrayBuffer | ArrayBufferView,
			options?: DeploySolutionOptions,
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<{ ImportJobId: string }> => {
			const parameters: Record<string, unknown> = {
				CustomizationFile: normalizeSolutionContent(base64SolutionContent),
				PublishWorkflows: options?.publishWorkflows ?? false,
				OverwriteUnmanagedCustomizations:
					options?.overwriteUnmanagedCustomizations ?? false,
			};
			const jobId = options?.importJobId?.trim();
			if (jobId) parameters.ImportJobId = jobId;
			if (options?.skipProductUpdateDependencies !== undefined) {
				parameters.SkipProductUpdateDependencies = options.skipProductUpdateDependencies;
			}
			if (options?.convertToManaged !== undefined) {
				parameters.ConvertToManaged = options.convertToManaged;
			}
			const result = await execute(
				{ operationName: "ImportSolution", operationType: "action", parameters },
				undefined,
				additionalHeaders,
			);
			return result as { ImportJobId: string };
		},

		getImportJobStatus: async (
			importJobId: string,
			_connectionTarget?: unknown,
			additionalHeaders?: HeaderMap,
		): Promise<Record<string, unknown>> => {
			if (!importJobId || !importJobId.trim()) {
				throw new Error("importJobId parameter cannot be empty");
			}
			return retrieve(
				"importjob",
				importJobId.trim(),
				[
					"importjobid",
					"progress",
					"completedon",
					"startedon",
					"data",
					"solutionname",
					"createdon",
					"modifiedon",
				],
				undefined,
				additionalHeaders,
			);
		},

		getEntitySetName: async (entityLogicalName: string): Promise<string> =>
			getEntitySetName(entityLogicalName),
	};
}

export type DataverseStub = ReturnType<typeof createDataverseStub>;
