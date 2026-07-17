import type { WebResource, WebResourceType } from "@/types/webResource";

function getHostDataverseApi(): DataverseAPI.API {
	const api = (window as Window & typeof globalThis).dataverseAPI;
	if (!api) {
		throw new Error("dataverseAPI is not available in the current runtime");
	}
	return api;
}

/** Numeric webresourcetype codes returned by Dataverse */
const TYPE_CODE_MAP: Record<number, WebResourceType> = {
	1: "html",
	2: "css",
	3: "js",
	4: "xml",
	5: "png",
	6: "jpg",
	7: "gif",
	8: "xap",
	9: "xsl",
	10: "ico",
	11: "svg",
	12: "resx",
};

function mapTypeCode(code: number): WebResourceType {
	return TYPE_CODE_MAP[code] ?? "xml";
}

/**
 * Retrieve all web resources from the current Dataverse environment.
 * Optionally filter by type (e.g. "js", "svg").
 */
export async function getWebResources(
	api: DataverseAPI.API,
	typeFilter?: WebResourceType,
): Promise<WebResource[]> {
	let query =
		"webresourceset?$select=webresourceid,name,displayname,description,webresourcetype,modifiedon,ismanaged&$orderby=name asc";

	if (typeFilter !== undefined) {
		const code = Object.entries(TYPE_CODE_MAP).find(([, v]) => v === typeFilter)?.[0];
		if (code) query += `&$filter=webresourcetype eq ${code}`;
	}

	const result = await api.queryData(query);

	return result.value.map((raw) => {
		const r = raw as Record<string, unknown>;
		return {
			id: String(r["webresourceid"] ?? ""),
			name: String(r["name"] ?? ""),
			displayName: r["displayname"] ? String(r["displayname"]) : undefined,
			description: r["description"] ? String(r["description"]) : undefined,
			webResourceType: mapTypeCode(Number(r["webresourcetype"] ?? 3)),
			modifiedOn: r["modifiedon"] ? String(r["modifiedon"]) : undefined,
			isCustom: r["ismanaged"] === false,
		};
	});
}

/**
 * Retrieve the base64-encoded content of a single web resource.
 * Returns an empty string if the resource has no content.
 *
 * Uses `api.retrieve` (single-record fetch) rather than `queryData`
 * (collection query) — PPTB's queryData is not designed for key-predicate
 * URLs such as `webresourceset(guid)` and may return an unexpected shape.
 */
export async function getWebResourceContent(api: DataverseAPI.API, id: string): Promise<string> {
	const result = (await api.retrieve("webresource", id, ["content"])) as Record<string, unknown>;
	return result["content"] ? String(result["content"]) : "";
}

/**
 * Upload (create) a new web resource, or update an existing one.
 * @param api       - DataverseAPI instance
 * @param name      - Unique name, e.g. "contoso_/scripts/myfile.js"
 * @param content   - Base64-encoded file content
 * @param typeCode  - Numeric webresourcetype code (3 = JS, 11 = SVG …)
 * @param displayName - Optional friendly name shown in UI
 */
export async function upsertWebResource(
	api: DataverseAPI.API,
	name: string,
	content: string,
	typeCode: number,
	displayName?: string,
): Promise<{ id: string }> {
	// Check whether it already exists
	const existing = await api.queryData(
		`webresourceset?$select=webresourceid&$filter=name eq '${name.replace(/'/g, "''")}'&$top=1`,
	);

	const payload: Record<string, unknown> = {
		name,
		content,
		webresourcetype: typeCode,
		...(displayName ? { displayname: displayName } : {}),
	};

	if (existing.value.length > 0) {
		const rec = existing.value[0] as Record<string, unknown>;
		const existingId = String(rec["webresourceid"] ?? "");
		await api.update("webresource", existingId, payload);
		return { id: existingId };
	}

	const created = await api.create("webresource", payload);
	return { id: String(created.id ?? "") };
}

export async function loadWebResources(typeFilter?: WebResourceType): Promise<WebResource[]> {
	return getWebResources(getHostDataverseApi(), typeFilter);
}

/**
 * Retrieve the base64-encoded content of a web resource by its GUID using
 * the PPTB host API. Preferred over calling getWebResourceContent directly.
 */
export async function loadWebResourceContent(id: string): Promise<string> {
	return getWebResourceContent(getHostDataverseApi(), id);
}

/**
 * Retrieve a single web resource metadata record by its unique `name`.
 * Returns null when no resource with that name exists.
 * Much faster than loading all resources when only one is needed.
 */
export async function loadWebResourceByName(name: string): Promise<WebResource | null> {
	const api = getHostDataverseApi();
	const safeN = name.replace(/'/g, "''");
	const result = await api.queryData(
		`webresourceset?$select=webresourceid,name,displayname,webresourcetype,ismanaged` +
			`&$filter=name eq '${safeN}'&$top=1`,
	);
	if (!result.value?.length) return null;
	const r = result.value[0] as Record<string, unknown>;
	return {
		id: String(r["webresourceid"] ?? ""),
		name: String(r["name"] ?? ""),
		displayName: r["displayname"] ? String(r["displayname"]) : undefined,
		webResourceType: mapTypeCode(Number(r["webresourcetype"] ?? 3)),
		isCustom: r["ismanaged"] === false,
	};
}

export async function saveWebResource(
	name: string,
	content: string,
	typeCode: number,
	displayName?: string,
): Promise<{ id: string }> {
	return upsertWebResource(getHostDataverseApi(), name, content, typeCode, displayName);
}

/**
 * Publishes a single web resource via the PublishXml action so a freshly
 * created/updated icon is immediately live (and resolvable by a ribbon that
 * references it). Best-effort — callers should treat failure as non-fatal.
 */
export async function publishWebResource(id: string): Promise<void> {
	const api = getHostDataverseApi();
	const parameterXml = `<importexportxml><webresources><webresource>${id}</webresource></webresources></importexportxml>`;
	await (api as unknown as { execute: (req: unknown) => Promise<unknown> }).execute({
		operationName: "PublishXml",
		operationType: "action",
		parameters: { ParameterXml: parameterXml },
	});
}
