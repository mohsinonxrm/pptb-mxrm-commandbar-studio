import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { ButtonProvenance } from "@/utils/ribbonProvenance";

const dataverseAPI = (window as Window & typeof globalThis).dataverseAPI!;

/**
 * The unmanaged "Active" layer — where all unmanaged customizations live. Any
 * other named layer in the stack is a managed solution (first-party app or ISV).
 */
const ACTIVE_LAYER = "Active";

interface ComponentLayerRow {
	msdyn_componentjson?: string;
	msdyn_changes?: string;
	msdyn_solutionname?: string;
	msdyn_publishername?: string;
	msdyn_order?: number;
}

/**
 * Extracts the control ids declared by `<CustomAction>` elements in a layer's
 * RibbonDiffXml (the `<Button>`/`<FlyoutAnchor>`/… inside `<CommandUIDefinition>`).
 */
function extractCustomActionButtonIds(xml: string): string[] {
	if (!xml || !xml.includes("<")) return [];
	try {
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		if (doc.querySelector("parsererror")) return [];
		const ids = new Set<string>();
		doc.querySelectorAll("CustomAction").forEach((ca) => {
			const def = ca.querySelector("CommandUIDefinition");
			const id = def?.firstElementChild?.getAttribute("Id");
			if (id) ids.add(id);
		});
		return [...ids];
	} catch {
		return [];
	}
}

/**
 * Resolves, per ribbon button id, whether it comes from the OOB platform, a
 * managed solution (with solution + publisher), or your unmanaged Active layer —
 * using the `msdyn_componentlayer` virtual table (the same source the maker
 * "Solution layers" panel uses). Prefix-free and works for any first-party app
 * or ISV.
 *
 * Returns an empty map (→ caller falls back to the parser heuristic) when the
 * entity has no ribbon customization component, or if the layer API is
 * unavailable. All steps log to the Console tab so the exact shape can be
 * validated against a live org.
 *
 * VERIFY-ON-ORG: the two queries below (RibbonCustomization component id, and
 * the componentlayer filter/`msdyn_componentjson` payload format) are the parts
 * to confirm against a real environment — see docs note.
 */
export async function fetchRibbonProvenance(
	entityLogicalName: string,
): Promise<Map<string, ButtonProvenance>> {
	const logs = useRuntimeLogStore.getState();
	const result = new Map<string, ButtonProvenance>();
	if (!entityLogicalName || entityLogicalName === "{!EntityLogicalName}") return result;

	try {
		// 1. Find the entity's RibbonCustomization component id(s). The
		//    solution-layer stack is keyed on this component.
		const safeEntity = entityLogicalName.replace(/'/g, "''");
		const rcRes = await dataverseAPI.queryData(
			`ribboncustomizations?$select=ribboncustomizationid&$filter=entity eq '${safeEntity}'`,
		);
		const componentIds = ((rcRes.value as Array<{ ribboncustomizationid?: string }>) ?? [])
			.map((r) => r.ribboncustomizationid)
			.filter((id): id is string => !!id);

		if (componentIds.length === 0) {
			logs.logInfo(
				"provenance",
				`No RibbonCustomization for ${entityLogicalName} — buttons resolve via heuristic (OOB vs custom).`,
			);
			return result;
		}

		// 2. Read each component's solution layers and bucket button ids by the
		//    owning layer. Active layer = unmanaged (yours); any other = managed.
		const managed = new Map<string, ButtonProvenance>();
		const unmanaged = new Set<string>();

		for (const componentId of componentIds) {
			const layerRes = await dataverseAPI.queryData(
				`msdyn_componentlayers` +
					`?$select=msdyn_componentjson,msdyn_changes,msdyn_solutionname,msdyn_publishername,msdyn_order` +
					`&$filter=msdyn_componentid eq '${componentId}'` +
					`&$orderby=msdyn_order asc`,
			);
			const rows = (layerRes.value as ComponentLayerRow[]) ?? [];
			logs.logInfo(
				"provenance",
				`RibbonCustomization ${componentId}: ${rows.length} solution layer(s).`,
			);

			for (const row of rows) {
				const xml = row.msdyn_componentjson || row.msdyn_changes || "";
				const ids = extractCustomActionButtonIds(xml);
				const isUnmanaged = (row.msdyn_solutionname ?? "") === ACTIVE_LAYER;
				for (const id of ids) {
					if (isUnmanaged) {
						unmanaged.add(id);
					} else if (!managed.has(id)) {
						managed.set(id, {
							origin: "managed",
							solutionName: row.msdyn_solutionname,
							publisherName: row.msdyn_publishername,
						});
					}
				}
			}
		}

		// Active (unmanaged) layer wins over managed layers below it.
		for (const [id, p] of managed) {
			if (!unmanaged.has(id)) result.set(id, p);
		}
		for (const id of unmanaged) {
			result.set(id, { origin: "unmanaged", solutionName: ACTIVE_LAYER });
		}

		logs.logInfo(
			"provenance",
			`Resolved solution-layer provenance for ${result.size} button(s) of ${entityLogicalName}.`,
		);
	} catch (e) {
		logs.logWarn(
			"provenance",
			`Solution-layer provenance unavailable for ${entityLogicalName} (${
				e instanceof Error ? e.message : String(e)
			}); using heuristic. This is non-fatal.`,
		);
	}

	return result;
}
