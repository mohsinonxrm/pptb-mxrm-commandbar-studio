import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { ButtonProvenance } from "@/utils/ribbonProvenance";
import type { LocLabel } from "@/types/ribbon";
import { queryAll } from "@/services/dataverse/ribbonLayerService";

/** The platform's own layer: its controls are out-of-the-box, not a managed solution's. */
const SYSTEM_SOLUTION = "System";

const ENTITY_TOKEN = "{!EntityLogicalName}";

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
	if (!entityLogicalName || entityLogicalName === ENTITY_TOKEN) return result;

	try {
		const safeEntity = entityLogicalName.replace(/'/g, "''");
		// difftype 0 (Standard) and 1 (Tab) rows hold CustomActions; ordered so the
		// same solution names a shared control on every load.
		const rows = await queryAll(
			`ribbondiffs?$select=rdx,solutionid` +
				`&$filter=(entity eq '${safeEntity}' or entity eq null) and ismanaged eq true and difftype le 1` +
				`&$orderby=solutionid`,
		);
		// Every managed solution that adds each control. Application-ribbon
		// CustomActions write `{!EntityLogicalName}` in their ids, which the table's
		// ribbon resolves (AIBuilder.{!EntityLogicalName}.Flyout → AIBuilder.account.Flyout),
		// so both spellings are listed.
		const solutionsOf = new Map<string, Set<string>>();
		for (const row of rows) {
			const solutionId = String(row["solutionid"] ?? "");
			if (!solutionId) continue;
			for (const id of customActionControlIds(String(row["rdx"] ?? ""))) {
				const resolved = id.split(ENTITY_TOKEN).join(entityLogicalName);
				for (const key of resolved === id ? [id] : [id, resolved]) {
					if (!solutionsOf.has(key)) solutionsOf.set(key, new Set());
					solutionsOf.get(key)!.add(solutionId);
				}
			}
		}
		await solutionsById([...new Set([...solutionsOf.values()].flatMap((ids) => [...ids]))]);
		// The first solution other than System names it: a control System adds and
		// another managed solution redefines is that solution's.
		for (const [id, solutionIds] of solutionsOf) {
			const solution = [...solutionIds]
				.map((solutionId) => solutionCache.get(solutionId))
				.find((s) => s && s.uniqueName !== SYSTEM_SOLUTION);
			if (!solution) continue;
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

/**
 * The texts of the LocLabels managed solutions define for a table's ribbon and
 * the application ribbon (#6): the merged ribbon names them (`$LocLabels:…`)
 * but carries no texts, so the canvas showed their ids. One query of the
 * managed `ribbondiffs` LocLabel rows (difftype 3), every language included.
 * For display only: your own layer's labels stay the ones that publish (#137).
 * A failed read returns none; the ids are shown as before.
 */
export async function fetchManagedLocLabels(entityLogicalName: string): Promise<LocLabel[]> {
	if (!entityLogicalName || entityLogicalName === ENTITY_TOKEN) return [];
	try {
		const safeEntity = entityLogicalName.replace(/'/g, "''");
		const rows = await queryAll(
			`ribbondiffs?$select=rdx` +
				`&$filter=(entity eq '${safeEntity}' or entity eq null) and ismanaged eq true and difftype eq 3` +
				`&$orderby=solutionid`,
		);
		// Ordered, so the same solution's text wins on every load when two define one id.
		const labels: LocLabel[] = [];
		const parser = new DOMParser();
		for (const row of rows) {
			const doc = parser.parseFromString(String(row["rdx"] ?? ""), "application/xml");
			if (doc.querySelector("parsererror")) continue;
			for (const el of Array.from(doc.getElementsByTagName("LocLabel"))) {
				const id = el.getAttribute("Id");
				if (!id) continue;
				const titles = Array.from(el.getElementsByTagName("Title"))
					.map((t) => ({
						languageCode: Number(t.getAttribute("languagecode")),
						description: t.getAttribute("description") ?? "",
					}))
					.filter((t) => Number.isFinite(t.languageCode) && t.description);
				if (titles.length === 0) continue;
				// Application-ribbon ids keep the token; the table's ribbon resolves it.
				labels.push({ id, titles });
				const resolved = id.split(ENTITY_TOKEN).join(entityLogicalName);
				if (resolved !== id) labels.push({ id: resolved, titles });
			}
		}
		useRuntimeLogStore
			.getState()
			.logInfo("provenance", `${labels.length} label text(s) from managed solutions for ${entityLogicalName}.`);
		return labels;
	} catch (e) {
		useRuntimeLogStore
			.getState()
			.logWarn(
				"provenance",
				`Couldn't read the managed solutions' label texts for ${entityLogicalName} (${
					e instanceof Error ? e.message : String(e)
				}); their ids are shown. This is non-fatal.`,
			);
		return [];
	}
}
