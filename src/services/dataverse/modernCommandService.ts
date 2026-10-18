/**
 * Read-only loading of modern commands (`appaction`) and the apps they belong
 * to (#32). CBS never writes these tables.
 *
 * Everything here is best-effort: orgs or PPTB versions where `appaction` /
 * `appmodule` can't be read simply yield no modern commands, and the failure
 * is logged — it must never block or fail the ribbon load.
 */
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import type { ModernAppModule, ModernCommand } from "@/types/modernCommand";
import {
	APP_ACTION_SELECT,
	CLASSIC_RULES_NAV,
	buildAppList,
	mapAppActionRows,
	scopeToContainingApps,
	type ModernTable,
} from "@/services/modernCommands";

function getDataverseAPI() {
	return (window as Window & typeof globalThis).dataverseAPI!;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** queryData that follows `@odata.nextLink` (PPTB doesn't page for us). */
async function queryAll(query: string): Promise<Array<Record<string, unknown>>> {
	const rows: Array<Record<string, unknown>> = [];
	const seen = new Set<string>();
	let next: string | undefined = query;
	// A repeated nextLink would loop forever; stop instead.
	while (next && !seen.has(next)) {
		seen.add(next);
		const page = (await getDataverseAPI().queryData(next)) as {
			value?: Array<Record<string, unknown>>;
			"@odata.nextLink"?: string;
		};
		rows.push(...(page.value ?? []));
		const link = page["@odata.nextLink"];
		next = link ? link.replace(/^.*\/api\/data\/v[\d.]+\//, "") : undefined;
	}
	return rows;
}

/** 401 / 403 / missing read privilege — retrying (e.g. without the expand) won't help. */
export function isPermissionError(err: unknown): boolean {
	return /\b40[13]\b|0x80040220|prvRead|privilege|unauthori[sz]ed|forbidden|not have permission/i.test(
		errorText(err),
	);
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The `appactions` query for a table: active commands bound to the table (by
 * `contextentity` or `contextvalue`) or scoped to every table (`context` = All),
 * on the locations CBS shows (form, main grid, subgrid, associated grid,
 * global header). `$orderby` is left out — Dataverse rejects it on some
 * picklists and the view model sorts anyway.
 */
export function buildAppActionQuery(table: ModernTable, withClassicRules: boolean): string {
	const tableClauses = [`contextvalue eq '${table.logicalName.replace(/'/g, "''")}'`];
	if (table.metadataId && GUID.test(table.metadataId)) {
		tableClauses.push(`_contextentity_value eq ${table.metadataId}`);
	}
	const filter =
		`statecode eq 0` +
		` and (context eq 0 or ${tableClauses.join(" or ")})` +
		` and (location eq 0 or location eq 1 or location eq 2 or location eq 3 or location eq 5)`;
	const expand = withClassicRules
		? `&$expand=${CLASSIC_RULES_NAV}($select=appactionruleid,name,uniquename,type)`
		: "";
	return `appactions?$select=${APP_ACTION_SELECT.join(",")}&$filter=${filter}${expand}`;
}

/**
 * Reads the table's modern commands. The classic rules of migrated commands
 * are expanded when the org allows it; if the expand is rejected the query is
 * retried without it — unless the failure is a permission error. Throws only
 * when `appaction` itself can't be read.
 */
export async function fetchModernCommands(table: ModernTable): Promise<ModernCommand[]> {
	const logs = useRuntimeLogStore.getState();
	let rows: Array<Record<string, unknown>>;
	try {
		rows = await queryAll(buildAppActionQuery(table, true));
	} catch (err) {
		if (isPermissionError(err)) throw err;
		logs.logInfo(
			"dataverse",
			`Modern commands: classic rules couldn't be expanded (${errorText(err)}); retrying without them.`,
		);
		rows = await queryAll(buildAppActionQuery(table, false));
	}
	return mapAppActionRows(rows);
}

interface AppModuleRow {
	appmoduleid?: string;
	appmoduleidunique?: string;
	name?: string;
	uniquename?: string;
}

/**
 * Model-driven apps, and which of them contain the table (an `appmodulecomponent`
 * of type 1 = Entities whose `objectid` is the table's MetadataId; it points at
 * the app by `appmoduleidunique`). `containingAppIds` is null when that
 * couldn't be determined.
 */
export async function fetchAppModules(table: ModernTable): Promise<{
	apps: ModernAppModule[];
	containingAppIds: Set<string> | null;
}> {
	const logs = useRuntimeLogStore.getState();
	const appsQuery = "appmodules?$select=appmoduleid,appmoduleidunique,name,uniquename";
	const componentsQuery =
		table.metadataId && GUID.test(table.metadataId)
			? `appmodulecomponents?$select=_appmoduleidunique_value&$filter=componenttype eq 1 and objectid eq ${table.metadataId}`
			: null;

	const [appRows, componentRows] = await Promise.all([
		queryAll(appsQuery),
		componentsQuery
			? queryAll(componentsQuery).catch((err: unknown) => {
					logs.logInfo(
						"dataverse",
						`Modern commands: couldn't resolve which apps contain ${table.logicalName} (${errorText(err)}).`,
					);
					return null;
				})
			: Promise.resolve(null),
	]);

	const rows = appRows as AppModuleRow[];
	const apps: ModernAppModule[] = rows
		.filter((r) => !!r.appmoduleid)
		.map((r) => ({
			id: String(r.appmoduleid).toLowerCase(),
			name: r.name?.trim() || r.uniquename || String(r.appmoduleid),
			uniqueName: r.uniquename,
		}));

	let containingAppIds: Set<string> | null = null;
	if (componentRows) {
		const uniqueIds = new Set(
			componentRows
				.map((r) => r["_appmoduleidunique_value"])
				.filter((v): v is string => typeof v === "string")
				.map((v) => v.toLowerCase()),
		);
		containingAppIds = new Set(
			rows
				.filter(
					(r) =>
						r.appmoduleid &&
						r.appmoduleidunique &&
						uniqueIds.has(r.appmoduleidunique.toLowerCase()),
				)
				.map((r) => String(r.appmoduleid).toLowerCase()),
		);
	}
	return { apps, containingAppIds };
}

export interface ModernCommandData {
	commands: ModernCommand[];
	/** Apps to offer in the App filter (containing the table; or, if unknown, having commands for it). */
	apps: ModernAppModule[];
	/** Set when the commands themselves couldn't be read. */
	error?: string;
}

/**
 * Loads commands and apps in parallel. Never throws: a failure is logged and
 * yields an empty result (an org without `appaction` access just shows no
 * modern commands).
 */
export async function loadModernCommandData(table: ModernTable): Promise<ModernCommandData> {
	const logs = useRuntimeLogStore.getState();
	const [commandsResult, appsResult] = await Promise.allSettled([
		fetchModernCommands(table),
		fetchAppModules(table),
	]);

	if (commandsResult.status === "rejected") {
		const message = errorText(commandsResult.reason);
		logs.logWarn(
			"dataverse",
			isPermissionError(commandsResult.reason)
				? `No permission to read modern commands (appaction) for ${table.logicalName}; the canvas shows classic commands only. (${message})`
				: `Modern commands unavailable for ${table.logicalName}: ${message}`,
		);
		return { commands: [], apps: [], error: message };
	}
	if (appsResult.status === "rejected") {
		logs.logInfo(
			"dataverse",
			`Modern commands: app list unavailable (${errorText(appsResult.reason)}); showing app ids from the commands.`,
		);
	}
	const { apps, containingAppIds } =
		appsResult.status === "fulfilled" ? appsResult.value : { apps: [], containingAppIds: null };
	// App-specific commands of apps without this table never show for it.
	const commands = scopeToContainingApps(commandsResult.value, containingAppIds);
	logs.logInfo(
		"dataverse",
		`Loaded ${commands.length} modern command${commands.length === 1 ? "" : "s"} for ${table.logicalName}.`,
	);
	return { commands, apps: buildAppList(commands, apps, containingAppIds) };
}
