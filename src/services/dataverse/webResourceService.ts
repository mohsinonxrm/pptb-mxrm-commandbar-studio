import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { useSessionStore } from "@/store/sessionStore";
import type { WebResource, WebResourceType } from "@/types/webResource";
import type { WebResourceStatus } from "@/services/xmlValidator";

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

/** Solution component type of a web resource (`componenttype` 61). */
export const WEB_RESOURCE_COMPONENT_TYPE = 61;

export interface UpsertWebResourceOptions {
	/** Friendly name shown in the maker portal. */
	displayName?: string;
	/**
	 * Unique name of the unmanaged solution the web resource is added to
	 * (AddSolutionComponent). Without it the web resource only lands in the
	 * Default solution, and a ribbon that references it fails to import
	 * elsewhere on a missing dependency (#19).
	 */
	solutionUniqueName?: string;
	/**
	 * Reuse a web resource that already has this name instead of overwriting
	 * its content (it is still added to the solution).
	 */
	keepExisting?: boolean;
}

export interface UpsertWebResourceResult {
	id: string;
	/** True when a new web resource was created (false = an existing one was updated or reused). */
	created: boolean;
	/** True when the existing content was overwritten. */
	updated: boolean;
	/** The solution the web resource was added to, if any. */
	solutionUniqueName?: string;
	/** Set by saveWebResource when no unmanaged solution could be targeted. */
	solutionWarning?: string;
}

/**
 * Adds a web resource to an unmanaged solution. Idempotent: adding a component
 * that is already in the solution succeeds. Uses AddSolutionComponent rather
 * than the `MSCRM.SolutionUniqueName` header because PPTB 1.2.7 asks the user
 * to consent to custom request headers.
 */
export async function addWebResourceToSolution(
	api: DataverseAPI.API,
	webResourceId: string,
	solutionUniqueName: string,
): Promise<void> {
	await api.execute({
		operationName: "AddSolutionComponent",
		operationType: "action",
		parameters: {
			ComponentId: webResourceId,
			ComponentType: WEB_RESOURCE_COMPONENT_TYPE,
			SolutionUniqueName: solutionUniqueName,
			AddRequiredComponents: false,
		},
	});
}

/**
 * Upload (create) a new web resource, or update an existing one, and add it
 * to the given unmanaged solution.
 * @param api       - DataverseAPI instance
 * @param name      - Unique name, e.g. "contoso_/scripts/myfile.js"
 * @param content   - Base64-encoded file content
 * @param typeCode  - Numeric webresourcetype code (3 = JS, 11 = SVG …)
 * @param options   - Display name, target solution, reuse behaviour
 */
export async function upsertWebResource(
	api: DataverseAPI.API,
	name: string,
	content: string,
	typeCode: number,
	options: UpsertWebResourceOptions = {},
): Promise<UpsertWebResourceResult> {
	const { displayName, solutionUniqueName, keepExisting = false } = options;
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

	let result: UpsertWebResourceResult;
	if (existing.value.length > 0) {
		const rec = existing.value[0] as Record<string, unknown>;
		const existingId = String(rec["webresourceid"] ?? "");
		if (!keepExisting) await api.update("webresource", existingId, payload);
		result = { id: existingId, created: false, updated: !keepExisting };
	} else {
		const created = await api.create("webresource", payload);
		result = { id: String(created.id ?? ""), created: true, updated: false };
	}

	if (solutionUniqueName && result.id) {
		try {
			await addWebResourceToSolution(api, result.id, solutionUniqueName);
		} catch (err) {
			throw new Error(
				`Web resource ${name} was saved but could not be added to solution ` +
					`${solutionUniqueName}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
		result.solutionUniqueName = solutionUniqueName;
	}
	return result;
}

/** Names (or ids) per OData `or` filter: keeps a lookup URL well under the request-length limit. */
const LOOKUP_CHUNK = 40;

const chunks = <T>(items: T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
		items.slice(i * size, (i + 1) * size),
	);

const odataString = (v: string) => `'${v.replace(/'/g, "''")}'`;

/**
 * Whether the web resources a ribbon references exist and are in a solution
 * (#35): one query for the names, one for their solution components (more only
 * past LOOKUP_CHUNK names). Keyed by lower-case name — Dataverse compares
 * names case-insensitively. Takes the API so tests can pass a fake.
 */
export async function lookupWebResources(
	api: Pick<DataverseAPI.API, "queryData">,
	names: string[],
	solutionId?: string,
): Promise<Record<string, WebResourceStatus>> {
	const unique = names.filter(
		(n, i) => names.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i,
	);
	const out: Record<string, WebResourceStatus> = {};
	for (const n of unique) out[n.toLowerCase()] = { exists: false, inSolution: false };
	if (unique.length === 0) return out;

	const byId = new Map<string, string>();
	for (const part of chunks(unique, LOOKUP_CHUNK)) {
		const filter = part.map((n) => `name eq ${odataString(n)}`).join(" or ");
		const result = await api.queryData(
			`webresourceset?$select=webresourceid,name,ismanaged&$filter=${filter}`,
		);
		for (const raw of result.value ?? []) {
			const r = raw as Record<string, unknown>;
			const lower = String(r["name"] ?? "").toLowerCase();
			if (!(lower in out)) continue;
			out[lower] = { exists: true, inSolution: false, managed: r["ismanaged"] === true };
			byId.set(String(r["webresourceid"] ?? "").toLowerCase(), lower);
		}
	}

	const solution = solutionId?.replace(/[{}]/g, "");
	if (solution && byId.size > 0) {
		for (const part of chunks([...byId.keys()], LOOKUP_CHUNK)) {
			const ids = part.map((id) => `objectid eq ${id}`).join(" or ");
			const result = await api.queryData(
				`solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${solution} and componenttype eq ${WEB_RESOURCE_COMPONENT_TYPE} and (${ids})`,
			);
			for (const raw of result.value ?? []) {
				const lower = byId.get(
					String((raw as Record<string, unknown>)["objectid"] ?? "").toLowerCase(),
				);
				if (lower) out[lower].inSolution = true;
			}
		}
	}
	return out;
}

/** lookupWebResources through the PPTB host. */
export async function loadWebResourceStatus(
	names: string[],
	solutionId?: string,
): Promise<Record<string, WebResourceStatus>> {
	return lookupWebResources(getHostDataverseApi(), names, solutionId);
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

/**
 * Creates or updates a web resource through the PPTB host and adds it to the
 * active unmanaged solution (#19). Pass `solutionUniqueName` to target another
 * solution. With a managed or missing active solution the web resource is
 * saved to the Default solution only; that is reported as `solutionWarning`
 * and logged as a warning (a ribbon referencing it would not import elsewhere).
 */
export async function saveWebResource(
	name: string,
	content: string,
	typeCode: number,
	options: UpsertWebResourceOptions = {},
): Promise<UpsertWebResourceResult> {
	const active = useSessionStore.getState().activeSolution;
	const solutionUniqueName =
		options.solutionUniqueName ?? (active && !active.isManaged ? active.uniqueName : undefined);
	const result = await upsertWebResource(getHostDataverseApi(), name, content, typeCode, {
		...options,
		solutionUniqueName,
	});
	if (!solutionUniqueName) {
		const why = active
			? `the active solution ${active.uniqueName} is managed`
			: "no solution is selected";
		result.solutionWarning =
			`Web resource ${name} was saved but not added to any solution because ${why}. ` +
			`It is only in the Default solution — select an unmanaged solution and save it again ` +
			`so it travels with your customizations.`;
		useRuntimeLogStore.getState().logWarn("webresource", result.solutionWarning);
	}
	return result;
}

/**
 * Publishes a single web resource via the PublishXml action so a freshly
 * created/updated icon is immediately live (and resolvable by a ribbon that
 * references it). Best-effort — callers should treat failure as non-fatal.
 */
export async function publishWebResource(id: string): Promise<void> {
	const api = getHostDataverseApi();
	const parameterXml = `<importexportxml><webresources><webresource>${id}</webresource></webresources></importexportxml>`;
	await api.execute({
		operationName: "PublishXml",
		operationType: "action",
		parameters: { ParameterXml: parameterXml },
	});
}
