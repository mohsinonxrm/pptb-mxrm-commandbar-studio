import type { Solution } from "@/types/solution";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";

function getDataverseAPI() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

export async function fetchSolutions(): Promise<Solution[]> {
	const dataverseAPI = getDataverseAPI();
	useRuntimeLogStore.getState().logInfo("dataverse", "Loading solutions...");

	// Use raw queryData with $expand so we actually get the publisher record's
	// uniquename / customizationprefix / friendlyname back, not just the GUID.
	// PPTB's higher-level `getSolutions` wrapper doesn't expose $expand and
	// returns publisherid as an opaque string, which leaves us no way to know
	// the publisher's actual prefix — we'd fall back to "new" and Dataverse
	// would import everything under the default publisher.
	//
	// Filter:
	//   - `isvisible eq true` — matches maker.powerapps.com's behavior. Hides
	//     internal system solutions like the special "Active" layer that
	//     Dataverse uses to track unmanaged customizations org-wide. That
	//     solution has `isvisible=false`, doesn't appear in the maker portal,
	//     and isn't a user-editable target.
	//   - `uniquename ne 'Active'` — belt-and-suspenders in case some tenants
	//     leave the Active layer marked visible.
	const query =
		"solutions" +
		"?$select=solutionid,uniquename,friendlyname,version,ismanaged,versionnumber,isvisible" +
		"&$expand=publisherid($select=publisherid,uniquename,friendlyname,customizationprefix)" +
		"&$filter=isvisible eq true and uniquename ne 'Active'" +
		"&$orderby=friendlyname asc";

	const result = await dataverseAPI.queryData(query);
	const records = (result.value as Array<Record<string, unknown>>) ?? [];

	const mapped: Solution[] = records.map((r) => {
		const publisher = (r["publisherid"] ?? {}) as {
			publisherid?: string;
			uniquename?: string;
			friendlyname?: string;
			customizationprefix?: string;
		};
		return {
			id: String(r["solutionid"] ?? ""),
			uniqueName: String(r["uniquename"] ?? ""),
			friendlyName: String(r["friendlyname"] ?? ""),
			version: String(r["version"] ?? ""),
			isManaged: Boolean(r["ismanaged"]),
			publisherId: publisher.publisherid ?? "",
			publisherUniqueName: publisher.uniquename ?? "",
			publisherName: publisher.friendlyname ?? "",
			publisherPrefix: publisher.customizationprefix ?? "",
			versionNumber: r["versionnumber"] as number | undefined,
		};
	});

	useRuntimeLogStore.getState().logInfo("dataverse", `Loaded ${mapped.length} solution(s).`);
	// One-shot diagnostic — list the unmanaged solutions and their publisher
	// prefixes so the user can see exactly which prefix each solution will
	// import under before they pick one. Caps at 5 entries to avoid log spam
	// for tenants with many solutions.
	const unmanagedPreview = mapped.filter((s) => !s.isManaged).slice(0, 5);
	for (const sol of unmanagedPreview) {
		useRuntimeLogStore
			.getState()
			.logInfo(
				"dataverse",
				`  • "${sol.friendlyName || sol.uniqueName}" → prefix="${sol.publisherPrefix || "(empty)"}" ` +
					`(publisher: ${sol.publisherName || sol.publisherUniqueName || "(empty)"})`,
			);
	}
	return mapped;
}

export async function fetchPublisherPrefix(solutionId: string): Promise<string> {
	const dataverseAPI = getDataverseAPI();
	// Singular logical name — PPTB pluralizes internally.
	const result = await dataverseAPI.retrieve("solution", solutionId, ["publisherid"]);
	return (result.publisherid as { customizationprefix: string })?.customizationprefix ?? "new";
}

/**
 * Returns the set of entity MetadataIds that are components of the given solution.
 * Used to filter the table picker so the user only sees tables that belong to the
 * active solution — matching Ribbon Workbench's required workflow (entity must be
 * a solutioncomponent before its ribbon can be customized and published).
 *
 * Component type 1 = Entity.
 * See https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/solutioncomponent
 */
export async function fetchSolutionEntityIds(solutionId: string): Promise<string[]> {
	if (!solutionId) return [];
	const dataverseAPI = getDataverseAPI();
	useRuntimeLogStore
		.getState()
		.logInfo("dataverse", `Loading solution entity components for ${solutionId}...`);
	const query =
		`solutioncomponents?$select=objectid` +
		`&$filter=_solutionid_value eq ${solutionId} and componenttype eq 1`;
	const result = await dataverseAPI.queryData(query);
	const rows = (result.value as Array<{ objectid: string }>) ?? [];
	const ids = rows.map((r) => r.objectid).filter(Boolean);
	useRuntimeLogStore
		.getState()
		.logInfo("dataverse", `Solution contains ${ids.length} table component(s).`);
	return ids;
}

/**
 * Returns the GUIDs of any `ribboncustomization` records that are components
 * of the given solution (`componenttype = 50` per the MS docs solutioncomponent
 * enum). For typical user solutions this is empty until the user explicitly
 * does "Add Existing → Application Ribbons" in maker.powerapps.com.
 *
 * When this list is non-empty, the solution is *allowed* to publish
 * application-ribbon changes — and we must declare a `<RootComponent type=50 id=...>`
 * for each entry in the generated solution.xml or Dataverse rejects the import
 * with 0x8004803a "component of type 50 is not declared in the solution file
 * as a root component."
 */
export async function fetchSolutionRibbonComponentIds(solutionId: string): Promise<string[]> {
	if (!solutionId) return [];
	const dataverseAPI = getDataverseAPI();
	useRuntimeLogStore
		.getState()
		.logInfo("dataverse", `Loading solution ribbon components for ${solutionId}...`);
	const query =
		`solutioncomponents?$select=objectid` +
		`&$filter=_solutionid_value eq ${solutionId} and componenttype eq 50`;
	const result = await dataverseAPI.queryData(query);
	const rows = (result.value as Array<{ objectid: string }>) ?? [];
	const ids = rows.map((r) => r.objectid).filter(Boolean);
	useRuntimeLogStore
		.getState()
		.logInfo("dataverse", `Solution contains ${ids.length} ribbon-customization component(s).`);
	return ids;
}
