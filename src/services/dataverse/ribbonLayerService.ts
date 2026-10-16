import { partsFromRibbonTables, type RibbonDiffParts, type RibbonTableRows } from "@/services/ribbonDiffMerge";
import type { LocLabel } from "@/types/ribbon";

function getDataverseAPI() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

/** queryData that follows `@odata.nextLink` so large unmanaged layers are read completely. */
async function queryAll(query: string): Promise<Array<Record<string, unknown>>> {
	const rows: Array<Record<string, unknown>> = [];
	let next: string | undefined = query;
	while (next) {
		const page = (await getDataverseAPI().queryData(next)) as {
			value?: Array<Record<string, unknown>>;
			"@odata.nextLink"?: string;
		};
		rows.push(...(page.value ?? []));
		const link = page["@odata.nextLink"];
		// PPTB's queryData takes a path relative to the Web API root.
		next = link ? link.replace(/^.*\/api\/data\/v[\d.]+\//, "") : undefined;
	}
	return rows;
}

/**
 * Reads the unmanaged ribbon layer for a table (or the application ribbon when
 * `entityLogicalName` is null) from `ribbondiffs` / `ribboncommands` /
 * `ribbonrules`. Each row holds the element's XML exactly as Dataverse stored
 * it. These tables reflect PUBLISHED state only.
 */
export async function fetchUnmanagedRibbonParts(entityLogicalName: string | null): Promise<RibbonDiffParts> {
	const filter =
		entityLogicalName === null
			? "entity eq null and ismanaged eq false"
			: `entity eq '${entityLogicalName.replace(/'/g, "''")}' and ismanaged eq false`;
	const [diffs, commands, rules] = await Promise.all([
		// Ordered so element order (which decides between an original and an
		// override CustomAction) is deterministic. Dataverse rejects $orderby on
		// the difftype picklist (0x80040250); parts are bucketed by type anyway.
		queryAll(`ribbondiffs?$select=diffid,difftype,rdx,sequence&$filter=${filter}&$orderby=sequence asc,diffid asc`),
		queryAll(`ribboncommands?$select=command,commanddefinition&$filter=${filter}&$orderby=command asc`),
		queryAll(`ribbonrules?$select=ruleid,ruletype,ruledefinition&$filter=${filter}&$orderby=ruleid asc`),
	]);
	return partsFromRibbonTables({
		diffs: diffs as RibbonTableRows["diffs"],
		commands: commands as RibbonTableRows["commands"],
		rules: rules as RibbonTableRows["rules"],
	});
}

/** Converts the layer's `<LocLabel>` elements into the CBS LocLabel model. */
export function locLabelsFromParts(parts: RibbonDiffParts): LocLabel[] {
	const out: LocLabel[] = [];
	for (const [id, xml] of parts.locLabels) {
		const doc = new DOMParser().parseFromString(xml, "application/xml");
		const titles = Array.from(doc.querySelectorAll("Title")).map((t) => ({
			languageCode: Number(t.getAttribute("languagecode") ?? 1033),
			description: t.getAttribute("description") ?? "",
		}));
		out.push({ id, titles });
	}
	return out;
}
