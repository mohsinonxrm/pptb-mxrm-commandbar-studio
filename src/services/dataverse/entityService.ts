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
 * The requests run in parallel; for ribbon solutions with hundreds of entities
 * this should still complete in under a second over a normal connection. If
 * very large solutions become a concern we can batch with `$filter=MetadataId eq @a or ...`.
 */
export async function fetchEntitiesByMetadataIds(
	metadataIds: string[],
): Promise<EntityMetadata[]> {
	if (metadataIds.length === 0) return [];

	const dataverseAPI = getDataverseAPI();
	const logs = useRuntimeLogStore.getState();
	logs.logInfo(
		"dataverse",
		`Loading metadata for ${metadataIds.length} solution entit${metadataIds.length === 1 ? "y" : "ies"}...`,
	);

	const select = "MetadataId,LogicalName,SchemaName,DisplayName,IsCustomEntity,IsIntersect";

	const results: Array<EntityMetadata | null> = await Promise.all(
		metadataIds.map(async (id): Promise<EntityMetadata | null> => {
			try {
				const r = (await dataverseAPI.queryData(
					`EntityDefinitions(${id})?$select=${select}`,
				)) as Record<string, unknown>;
				const entity: EntityMetadata = {
					metadataId: String(r["MetadataId"] ?? ""),
					logicalName: String(r["LogicalName"] ?? ""),
					schemaName: r["SchemaName"] ? String(r["SchemaName"]) : undefined,
					displayName:
						(r["DisplayName"] as { UserLocalizedLabel?: { Label?: string } })?.UserLocalizedLabel
							?.Label ?? String(r["LogicalName"] ?? ""),
					isCustomEntity: Boolean(r["IsCustomEntity"]),
					isManaged: false,
					isIntersect: Boolean(r["IsIntersect"]),
				};
				return entity;
			} catch (err) {
				logs.logWarn(
					"dataverse",
					`Could not resolve entity for component ${id}: ${
						err instanceof Error ? err.message : String(err)
					}`,
				);
				return null;
			}
		}),
	);

	const mapped: EntityMetadata[] = results
		.filter((e): e is EntityMetadata => e !== null && !e.isIntersect)
		.sort((a, b) => a.displayName.localeCompare(b.displayName));

	logs.logInfo("dataverse", `Loaded metadata for ${mapped.length} table(s).`);
	return mapped;
}

