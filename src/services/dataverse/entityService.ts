import type { EntityMetadata } from "@/types/entity";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";

function getDataverseAPI() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

/**
 * Fetches entity metadata for an explicit set of MetadataIds — typically the
 * objectids returned by `fetchSolutionEntityIds()` for a chosen solution.
 *
 * Why this exists instead of bulk-loading all entities and filtering client-side:
 * PPTB's `getAllEntitiesMetadata` returned only 1883 of the ~1900+ entities in
 * a test tenant and silently omitted `account` (probably an OData paging /
 * server-side row limit issue — PPTB doesn't follow `@odata.nextLink`). Doing
 * per-component lookups by MetadataId is more reliable, much smaller wire
 * payload, and matches Ribbon Workbench's behavior (it only ever loads the
 * entities that are components of the user's selected solution).
 *
 * Batched, 40 tables per `$filter=MetadataId eq … or …` request (#4).
 */
export async function fetchEntitiesByMetadataIds(metadataIds: string[]): Promise<EntityMetadata[]> {
	if (metadataIds.length === 0) return [];

	const dataverseAPI = getDataverseAPI();
	const logs = useRuntimeLogStore.getState();
	logs.logInfo(
		"dataverse",
		`Loading metadata for ${metadataIds.length} solution entit${metadataIds.length === 1 ? "y" : "ies"}...`,
	);

	const select = "MetadataId,LogicalName,SchemaName,DisplayName,IsCustomEntity,IsIntersect";

	const toEntity = (r: Record<string, unknown>): EntityMetadata => ({
		metadataId: String(r["MetadataId"] ?? ""),
		logicalName: String(r["LogicalName"] ?? ""),
		schemaName: r["SchemaName"] ? String(r["SchemaName"]) : undefined,
		displayName:
			(r["DisplayName"] as { UserLocalizedLabel?: { Label?: string } })?.UserLocalizedLabel
				?.Label ?? String(r["LogicalName"] ?? ""),
		isCustomEntity: Boolean(r["IsCustomEntity"]),
		isManaged: false,
		isIntersect: Boolean(r["IsIntersect"]),
	});
	const one = async (id: string): Promise<EntityMetadata | null> => {
		try {
			return toEntity(
				(await dataverseAPI.queryData(
					`EntityDefinitions(${id})?$select=${select}`,
				)) as Record<string, unknown>,
			);
		} catch (err) {
			logs.logWarn(
				"dataverse",
				`Could not resolve entity for component ${id}: ${err instanceof Error ? err.message : String(err)}`,
			);
			return null;
		}
	};

	// 40 tables per request rather than one request each (#4): a solution with
	// hundreds of tables sent hundreds of parallel requests through the host,
	// slower and open to throttling. A chunk that fails is read table by table.
	const chunks: string[][] = [];
	for (let i = 0; i < metadataIds.length; i += 40) chunks.push(metadataIds.slice(i, i + 40));
	const results: Array<EntityMetadata | null> = (
		await Promise.all(
			chunks.map(async (chunk): Promise<Array<EntityMetadata | null>> => {
				try {
					const r = (await dataverseAPI.queryData(
						`EntityDefinitions?$select=${select}&$filter=${chunk.map((id) => `MetadataId eq ${id}`).join(" or ")}`,
					)) as { value?: Array<Record<string, unknown>> };
					const found = (r.value ?? []).map(toEntity);
					const foundIds = new Set(found.map((e) => e.metadataId.toLowerCase()));
					for (const id of chunk)
						if (!foundIds.has(id.toLowerCase()))
							logs.logWarn(
								"dataverse",
								`Could not resolve entity for component ${id}: not found.`,
							);
					return found;
				} catch (e) {
					// One at a time: if the chunk was throttled, 40 parallel reads would be too.
					logs.logWarn(
						"dataverse",
						`Couldn't read ${chunk.length} tables in one request (${
							e instanceof Error ? e.message : String(e)
						}); reading them one at a time.`,
					);
					const each: Array<EntityMetadata | null> = [];
					for (const id of chunk) each.push(await one(id));
					return each;
				}
			}),
		)
	).flat();

	const mapped: EntityMetadata[] = results
		.filter((e): e is EntityMetadata => e !== null && !e.isIntersect)
		.sort((a, b) => a.displayName.localeCompare(b.displayName));

	logs.logInfo("dataverse", `Loaded metadata for ${mapped.length} table(s).`);
	return mapped;
}
