import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { ButtonProvenance } from "@/utils/ribbonProvenance";
import { queryAll } from "@/services/dataverse/ribbonLayerService";

/** The platform's own layer: its controls are out-of-the-box, not a managed solution's. */
const SYSTEM_SOLUTION = "System";

/** Solutions looked up this session, by id (names and publishers don't change). */
const solutionCache = new Map<string, { uniqueName: string; publisherName?: string } | null>();

/**
 * Every control id a CustomAction defines, its own and any written inside it
 * (a tab's groups, a group's controls, a flyout's menu items).
 */
function customActionControlIds(rdx: string): string[] {
	if (!rdx || !rdx.includes("<")) return [];
	try {
		const doc = new DOMParser().parseFromString(rdx, "application/xml");
		if (doc.querySelector("parsererror")) return [];
		const def = doc.getElementsByTagName("CommandUIDefinition")[0];
		if (!def) return [];
		const ids: string[] = [];
		for (const el of Array.from(def.getElementsByTagName("*"))) {
			const id = el.getAttribute("Id");
			if (id) ids.push(id);
		}
		return ids;
	} catch {
		return [];
	}
}

async function solutionsById(ids: string[]): Promise<void> {
	const missing = ids.filter((id) => !solutionCache.has(id));
	for (let i = 0; i < missing.length; i += 40) {
		const chunk = missing.slice(i, i + 40);
		const rows = await queryAll(
			`solutions?$select=solutionid,uniquename&$expand=publisherid($select=friendlyname)` +
				`&$filter=${chunk.map((id) => `solutionid eq ${id}`).join(" or ")}`,
		);
		for (const id of chunk) solutionCache.set(id, null);
		for (const row of rows) {
			const publisher = row["publisherid"] as { friendlyname?: string } | undefined;
			solutionCache.set(String(row["solutionid"]), {
				uniqueName: String(row["uniquename"] ?? ""),
				publisherName: publisher?.friendlyname,
			});
		}
	}
}

/**
 * Which managed solution adds each control of a table's ribbon (and of the
 * application ribbon, whose controls appear on every table): read from the
 * managed `ribbondiffs` rows, which hold each solution's CustomActions with its
 * `solutionid` (#151). One query for the CustomActions, one for the solution
 * names, instead of an `msdyn_componentlayers` query per component; those
 * returned no rows, and their component JSON holds no ribbon XML anyway.
 *
 * Only managed solutions other than System are listed. The caller decides
 * which controls the result may relabel. An empty map (no managed
 * customizations, or the read failed) leaves the parser's classification.
 */
export async function fetchRibbonProvenance(
	entityLogicalName: string,
): Promise<Map<string, ButtonProvenance>> {
	const logs = useRuntimeLogStore.getState();
	const result = new Map<string, ButtonProvenance>();
	if (!entityLogicalName || entityLogicalName === "{!EntityLogicalName}") return result;

	try {
		const safeEntity = entityLogicalName.replace(/'/g, "''");
		const rows = await queryAll(
			`ribbondiffs?$select=rdx,solutionid` +
				`&$filter=(entity eq '${safeEntity}' or entity eq null) and ismanaged eq true and difftype eq 0`,
		);
		// The first managed solution that adds a control names it.
		const solutionOf = new Map<string, string>();
		for (const row of rows) {
			const solutionId = String(row["solutionid"] ?? "");
			if (!solutionId) continue;
			for (const id of customActionControlIds(String(row["rdx"] ?? ""))) {
				if (!solutionOf.has(id)) solutionOf.set(id, solutionId);
			}
		}
		await solutionsById([...new Set(solutionOf.values())]);
		for (const [id, solutionId] of solutionOf) {
			const solution = solutionCache.get(solutionId);
			if (!solution || solution.uniqueName === SYSTEM_SOLUTION) continue;
			result.set(id, { origin: "managed", solutionName: solution.uniqueName, publisherName: solution.publisherName });
		}
		logs.logInfo(
			"provenance",
			`${rows.length} managed CustomAction(s) for ${entityLogicalName}: ${result.size} control(s) from managed solutions.`,
		);
	} catch (e) {
		logs.logWarn(
			"provenance",
			`Couldn't read which managed solutions add ${entityLogicalName}'s controls (${
				e instanceof Error ? e.message : String(e)
			}); their owners aren't shown. This is non-fatal.`,
		);
	}

	return result;
}
