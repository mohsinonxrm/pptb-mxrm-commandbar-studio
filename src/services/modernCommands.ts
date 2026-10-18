/**
 * Pure mapping / filtering for modern commands (`appaction`, #32).
 *
 * Nothing here touches the ribbon store: modern commands are display-only and
 * must never reach the baseline, the publish planner or the RibbonDiffXml merge.
 *
 * Column names and option values follow the Dataverse table reference:
 * https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/appaction
 * https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/appactionrule
 */
import type { RibbonLocation } from "@/types/ribbon";
import {
	APP_ACTION_LOCATION,
	APP_ACTION_LOCATION_LABELS,
	type ClassicModernOverride,
	type ModernActionKind,
	type ModernAppModule,
	type ModernAppFilter,
	type ModernClassicRule,
	type ModernCommand,
	type ModernCommandNode,
	type ModernCommandOrigin,
	type ModernCommandType,
	type ModernFormulaRef,
	type ModernVisibilityKind,
} from "@/types/modernCommand";

/** Classic-rules many-to-many navigation property (appaction ↔ appactionrule). */
export const CLASSIC_RULES_NAV = "appaction_appactionrule_classicrules";

/** Every `appaction` column CBS reads (all confirmed against the table reference). */
export const APP_ACTION_SELECT = [
	"appactionid",
	"name",
	"uniquename",
	"buttonlabeltext",
	"buttontooltiptitle",
	"buttontooltipdescription",
	"buttonaccessibilitytext",
	"_appmoduleid_value",
	"context",
	"_contextentity_value",
	"contextvalue",
	"location",
	"type",
	"sequence",
	"buttonsequencepriority",
	"hidden",
	"isdisabled",
	"origin",
	"ismanaged",
	"fonticon",
	"_iconwebresourceid_value",
	"_parentappactionid_value",
	"grouptitle",
	"isgrouptitlehidden",
	"onclickeventtype",
	"onclickeventjavascriptfunctionname",
	"onclickeventjavascriptparameters",
	"_onclickeventjavascriptwebresourceid_value",
	"onclickeventformulacomponentlibrary",
	"onclickeventformulacomponentname",
	"onclickeventformulafunctionname",
	"visibilitytype",
	"visibilityformulacomponentlibrary",
	"visibilityformulacomponentname",
	"visibilityformulafunctionname",
] as const;

const FORMATTED = "@OData.Community.Display.V1.FormattedValue";

type Row = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
	typeof v === "string" && v.trim() !== "" ? v : typeof v === "number" ? String(v) : undefined;
const num = (v: unknown): number | undefined => {
	if (v === null || v === undefined || v === "") return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
};
const bool = (v: unknown): boolean => v === true || v === 1 || v === "true" || v === "1";
const guid = (v: unknown): string | null => {
	const s = str(v);
	return s ? s.toLowerCase() : null;
};

function mapType(v: unknown): ModernCommandType {
	switch (num(v)) {
		case 1:
			return "dropdown";
		case 2:
			return "split";
		case 3:
			return "group";
		default:
			return "button";
	}
}

function mapAction(v: unknown): ModernActionKind {
	const n = num(v);
	return n === 1 ? "formula" : n === 2 ? "javascript" : "none";
}

function mapVisibility(v: unknown): ModernVisibilityKind {
	const n = num(v);
	return n === 1 ? "formula" : n === 2 ? "classicRules" : "none";
}

function mapOrigin(v: unknown): ModernCommandOrigin {
	const n = num(v);
	return n === 1 ? "migrated" : n === 2 ? "enhancedMigrated" : "default";
}

function formulaRef(row: Row, prefix: string): ModernFormulaRef | undefined {
	const ref: ModernFormulaRef = {
		componentLibrary: str(row[`${prefix}componentlibrary`]),
		componentName: str(row[`${prefix}componentname`]),
		functionName: str(row[`${prefix}functionname`]),
	};
	return ref.componentLibrary || ref.componentName || ref.functionName ? ref : undefined;
}

function mapClassicRules(v: unknown): ModernClassicRule[] {
	if (!Array.isArray(v)) return [];
	return (v as Row[])
		.map((r): ModernClassicRule | null => {
			const id = guid(r["appactionruleid"]);
			if (!id) return null;
			return {
				id,
				name: str(r["name"]) ?? str(r["uniquename"]) ?? id,
				uniqueName: str(r["uniquename"]),
				kind: num(r["type"]) === 0 ? "enable" : "display",
			};
		})
		.filter((r): r is ModernClassicRule => r !== null);
}

/** Maps one `appaction` row (Web API JSON, formatted-value annotations optional) to the view model. */
export function mapAppActionRow(row: Row): ModernCommand | null {
	const id = guid(row["appactionid"]);
	if (!id) return null;
	const location = num(row["location"]);
	if (location === undefined) return null;
	const name = str(row["name"]) ?? "";
	const uniqueName = str(row["uniquename"]) ?? name;
	return {
		id,
		name,
		uniqueName,
		label: str(row["buttonlabeltext"]) ?? (name || uniqueName || id),
		tooltipTitle: str(row["buttontooltiptitle"]),
		tooltipDescription: str(row["buttontooltipdescription"]),
		accessibilityText: str(row["buttonaccessibilitytext"]),
		appModuleId: guid(row["_appmoduleid_value"]),
		appName: str(row[`_appmoduleid_value${FORMATTED}`]),
		scope: num(row["context"]) === 0 ? "all" : "entity",
		contextValue: str(row["contextvalue"]),
		contextEntityId: guid(row["_contextentity_value"]) ?? undefined,
		location,
		type: mapType(row["type"]),
		sequence: num(row["sequence"]) ?? num(row["buttonsequencepriority"]) ?? 0,
		hidden: bool(row["hidden"]),
		disabled: bool(row["isdisabled"]),
		origin: mapOrigin(row["origin"]),
		managed: bool(row["ismanaged"]),
		fontIcon: str(row["fonticon"]),
		iconWebResourceId: guid(row["_iconwebresourceid_value"]) ?? undefined,
		iconWebResourceName: str(row[`_iconwebresourceid_value${FORMATTED}`]),
		parentId: guid(row["_parentappactionid_value"]),
		groupTitle: str(row["grouptitle"]),
		groupTitleHidden: bool(row["isgrouptitlehidden"]),
		action: mapAction(row["onclickeventtype"]),
		jsFunctionName: str(row["onclickeventjavascriptfunctionname"]),
		jsParameters: str(row["onclickeventjavascriptparameters"]),
		jsWebResourceId: guid(row["_onclickeventjavascriptwebresourceid_value"]) ?? undefined,
		jsWebResourceName: str(row[`_onclickeventjavascriptwebresourceid_value${FORMATTED}`]),
		onSelectFormula: formulaRef(row, "onclickeventformula"),
		visibility: mapVisibility(row["visibilitytype"]),
		visibilityFormula: formulaRef(row, "visibilityformula"),
		classicRules: mapClassicRules(row[CLASSIC_RULES_NAV]),
	};
}

/** Maps rows, dropping ones without an id / location and de-duplicating by id. */
export function mapAppActionRows(rows: Row[]): ModernCommand[] {
	const byId = new Map<string, ModernCommand>();
	for (const row of rows) {
		const cmd = mapAppActionRow(row);
		if (cmd && !byId.has(cmd.id)) byId.set(cmd.id, cmd);
	}
	return [...byId.values()];
}

/**
 * `appaction.location` values that render on a CBS canvas location. The
 * classic `Mscrm.SubGrid.<entity>` ribbon drives both the subgrid and the
 * associated grid, so both modern locations show there. Quick form and
 * dashboard have no CBS canvas.
 */
export function modernLocationsFor(location: RibbonLocation): number[] {
	switch (location) {
		case "HomepageGrid":
			return [APP_ACTION_LOCATION.MainGrid];
		case "SubGrid":
			return [APP_ACTION_LOCATION.SubGrid, APP_ACTION_LOCATION.AssociatedGrid];
		case "Form":
			return [APP_ACTION_LOCATION.Form];
		case "Application":
			return [APP_ACTION_LOCATION.GlobalHeader];
	}
}

export interface ModernTable {
	logicalName: string;
	metadataId?: string;
}

/** True when the command applies to the table: scoped to every table, or bound to this one. */
export function appliesToTable(cmd: ModernCommand, table: ModernTable): boolean {
	if (cmd.scope === "all") return true;
	const metadataId = table.metadataId?.toLowerCase();
	if (metadataId && cmd.contextEntityId === metadataId) return true;
	return !!cmd.contextValue && cmd.contextValue.toLowerCase() === table.logicalName.toLowerCase();
}

/** True when the command shows in the selected app: app-less commands show in every app. */
export function appliesToApp(cmd: ModernCommand, appFilter: ModernAppFilter): boolean {
	return (
		appFilter === "all" ||
		cmd.appModuleId === null ||
		cmd.appModuleId === appFilter.toLowerCase()
	);
}

/** The commands for one canvas location / app, unordered (see buildModernTree for ordering). */
export function filterModernCommands(
	commands: ModernCommand[],
	opts: { location: RibbonLocation; appFilter: ModernAppFilter; table: ModernTable },
): ModernCommand[] {
	const locations = new Set(modernLocationsFor(opts.location));
	return commands.filter(
		(c) =>
			locations.has(c.location) &&
			appliesToApp(c, opts.appFilter) &&
			appliesToTable(c, opts.table),
	);
}

const bySequence = (a: ModernCommand, b: ModernCommand) =>
	a.sequence - b.sequence || a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

/**
 * Nests children under their parent (dropdown / split / group) and orders every
 * level by `sequence`. A child whose parent isn't in the set (e.g. filtered
 * out) is shown at the top level so it isn't silently lost.
 */
export function buildModernTree(commands: ModernCommand[]): ModernCommandNode[] {
	const ids = new Set(commands.map((c) => c.id));
	const childrenOf = new Map<string, ModernCommand[]>();
	const roots: ModernCommand[] = [];
	for (const c of commands) {
		if (c.parentId && c.parentId !== c.id && ids.has(c.parentId)) {
			const list = childrenOf.get(c.parentId) ?? [];
			list.push(c);
			childrenOf.set(c.parentId, list);
		} else {
			roots.push(c);
		}
	}
	const seen = new Set<string>();
	const build = (c: ModernCommand): ModernCommandNode => {
		seen.add(c.id);
		const kids = (childrenOf.get(c.id) ?? []).filter((k) => !seen.has(k.id)).sort(bySequence);
		return { command: c, children: kids.map(build) };
	};
	return roots.sort(bySequence).map(build);
}

/** Flattens a tree depth-first (parents before children). */
export function flattenModernTree(nodes: ModernCommandNode[]): ModernCommand[] {
	return nodes.flatMap((n) => [n.command, ...flattenModernTree(n.children)]);
}

const TEMPLATE_ENTITY = /\{!EntityLogicalName\}/gi;
/**
 * Instance suffix of a migrated unique name: `!1`, or `!contact!1` for a
 * table-specific copy. `{!EntityLogicalName}` also contains `!`, so only a
 * trailing run of `!word` segments ending in `!<digits>` is stripped (and the
 * template is resolved before that).
 */
const INSTANCE_SUFFIX = /(?:![A-Za-z0-9_]+)*!\d+$/;

/**
 * Classic control ids a migrated command may have been generated from (most
 * likely first; empty for commands made in the command designer).
 *
 * Migrated commands keep the classic control id in their unique name with a
 * publisher prefix and an instance suffix. Seen live (#32, #74):
 * `msdyn_Mscrm.HomepageGrid.{!EntityLogicalName}.RefreshModernButton!1`
 * (scoped to every table) and
 * `msdyn_Mscrm.HomepageGrid.contact.MergeRecords!contact!1` (table-specific).
 * `{!EntityLogicalName}` is resolved to the table first, then the `!…!n`
 * suffix is dropped and the prefix is stripped up to the first `_` before the
 * dotted id; the unstripped name is tried too. Only commands with `origin`
 * Migrated / Enhanced Migrated are considered. The naming convention isn't
 * documented, so this is a best-effort match.
 */
export function classicIdCandidates(cmd: ModernCommand, entityLogicalName: string): string[] {
	if (cmd.origin === "default") return [];
	const out: string[] = [];
	const add = (id: string) => {
		if (id.includes(".") && !out.includes(id)) out.push(id);
	};
	for (const candidate of [cmd.uniqueName, cmd.name]) {
		if (!candidate) continue;
		const id = candidate
			.trim()
			.replace(TEMPLATE_ENTITY, entityLogicalName)
			.replace(INSTANCE_SUFFIX, "");
		const underscore = id.indexOf("_");
		const dot = id.indexOf(".");
		if (underscore > 0 && (dot === -1 || underscore < dot)) add(id.slice(underscore + 1));
		add(id);
	}
	return out;
}

/** The most likely classic button id a migrated command was generated from (see classicIdCandidates). */
export function classicIdForMigratedCommand(
	cmd: ModernCommand,
	entityLogicalName: string,
): string | null {
	return classicIdCandidates(cmd, entityLogicalName)[0] ?? null;
}

/** Lower-cased control id with `{!EntityLogicalName}` resolved, for exact matching. */
function exactKey(id: string, entityLogicalName: string): string {
	return id.replace(TEMPLATE_ENTITY, entityLogicalName).toLowerCase();
}

/**
 * Looser key: `Mscrm.<Location>.<table>.<rest>` with the table segment
 * wildcarded, for a control whose id carries the table differently (e.g. an
 * unresolved template). Null for ids without that shape.
 */
function tableAgnosticKey(id: string, entityLogicalName: string): string | null {
	const parts = exactKey(id, entityLogicalName).split(".");
	if (parts.length < 4 || parts[0] !== "mscrm") return null;
	return [parts[0], parts[1], "*", ...parts.slice(3)].join(".");
}

/**
 * Classic buttons on the canvas that a migrated modern command stands in for,
 * matched by control id — exactly, then with the table segment wildcarded.
 * A command that is `isdisabled` lets the classic button render, so it isn't
 * reported unless `includeDisabled` is set (used to avoid drawing it twice).
 * Matching is case-insensitive; one button can be overridden in several apps.
 */
export function findClassicOverrides(
	commands: ModernCommand[],
	classicButtonIds: Iterable<string>,
	entityLogicalName: string,
	opts: { includeDisabled?: boolean } = {},
): Map<string, ClassicModernOverride[]> {
	const exact = new Map<string, string>();
	const loose = new Map<string, string>();
	for (const id of classicButtonIds) {
		const key = exactKey(id, entityLogicalName);
		if (!exact.has(key)) exact.set(key, id);
		const looseKey = tableAgnosticKey(id, entityLogicalName);
		if (looseKey && !loose.has(looseKey)) loose.set(looseKey, id);
	}
	const out = new Map<string, ClassicModernOverride[]>();
	for (const command of commands) {
		if (command.disabled && !opts.includeDisabled) continue;
		const candidates = classicIdCandidates(command, entityLogicalName);
		const buttonId =
			candidates.map((id) => exact.get(exactKey(id, entityLogicalName))).find(Boolean) ??
			candidates
				.map((id) => tableAgnosticKey(id, entityLogicalName))
				.map((key) => (key ? loose.get(key) : undefined))
				.find(Boolean);
		if (!buttonId) continue;
		const list = out.get(buttonId) ?? [];
		list.push({ buttonId, command, effect: command.hidden ? "hidden" : "replaced" });
		out.set(buttonId, list);
	}
	return out;
}

/**
 * The tab Unified Interface renders as the location's flat command bar, where
 * modern commands appear: the table's `Mscrm.<Location>.<table>.MainTab`, else
 * another `…MainTab` that isn't a shared `AllEntities` tab, else the global
 * tab (Application), else the first tab. Never e.g. the Charts
 * (`AllEntities.VisualizationTab`) tab.
 */
export function commandBarTabId(
	tabs: { id: string }[],
	location: RibbonLocation,
	entityLogicalName: string,
): string | undefined {
	const lower = (s: string) => s.toLowerCase();
	const own = `mscrm.${lower(location)}.${lower(entityLogicalName)}.maintab`;
	return (
		tabs.find((t) => lower(t.id) === own)?.id ??
		tabs.find((t) => /maintab$/i.test(t.id) && !/\.allentities\./i.test(t.id))?.id ??
		tabs.find((t) => t.id === "Mscrm.GlobalTab")?.id ??
		tabs[0]?.id
	);
}

export interface ModernLocationModel {
	/** The tab modern chips are drawn on (see commandBarTabId). */
	commandBarTabId: string | undefined;
	/** Top-level commands to draw as chips there: designer-made, or migrated with no classic control in the location. */
	nodes: ModernCommandNode[];
	/** Classic controls on any tab of the location that a migrated command hides or stands in for. */
	overrides: Map<string, ClassicModernOverride[]>;
	/** Migrated commands with no classic control anywhere in the location (diagnostics). */
	unmatchedMigrated: ModernCommand[];
}

/**
 * Modern commands for one canvas location. Migrated commands are matched
 * against the classic controls of EVERY tab of the location (their classic
 * counterpart may live on the Charts or View tab), so they're drawn as a chip
 * only when the location has no counterpart at all.
 */
export function buildModernLocationModel(input: {
	commands: ModernCommand[];
	tabs: { id: string; groups: { buttons: { id: string }[] }[] }[];
	location: RibbonLocation;
	entityLogicalName: string;
}): ModernLocationModel {
	const { commands, tabs, location, entityLogicalName } = input;
	const controlIds = tabs.flatMap((t) => t.groups.flatMap((g) => g.buttons.map((b) => b.id)));
	const overrides = findClassicOverrides(commands, controlIds, entityLogicalName);
	const matched = findClassicOverrides(commands, controlIds, entityLogicalName, {
		includeDisabled: true,
	});
	const matchedIds = new Set([...matched.values()].flat().map((o) => o.command.id));
	const unmatched = commands.filter((c) => !matchedIds.has(c.id));
	return {
		commandBarTabId: commandBarTabId(tabs, location, entityLogicalName),
		nodes: buildModernTree(unmatched),
		overrides,
		unmatchedMigrated: unmatched.filter((c) => c.origin !== "default"),
	};
}

export interface ModernPlacement {
	/** Modern commands to render immediately before the classic button with this id. */
	before: Map<string, ModernCommandNode[]>;
	/** Modern commands after the last classic button. */
	trailing: ModernCommandNode[];
}

/**
 * Interleaves top-level modern commands with the classic buttons of the bar
 * (in their rendered order): each modern command goes before the first
 * classic button with a higher sequence. Classic sequences restart per group,
 * so this is an approximation of Unified Interface's order, not a guarantee.
 */
export function placeModernCommands(
	classic: { id: string; sequence: number }[],
	modern: ModernCommandNode[],
): ModernPlacement {
	const before = new Map<string, ModernCommandNode[]>();
	const trailing: ModernCommandNode[] = [];
	for (const node of modern) {
		const target = classic.find((b) => b.sequence > node.command.sequence);
		if (!target) {
			trailing.push(node);
			continue;
		}
		const list = before.get(target.id) ?? [];
		list.push(node);
		before.set(target.id, list);
	}
	return { before, trailing };
}

/** Human-readable reference to a Power Fx function stored in the command component library. */
export function describeFormula(ref: ModernFormulaRef | undefined): string | undefined {
	if (!ref) return undefined;
	const fn = [ref.componentName, ref.functionName].filter(Boolean).join(".");
	const lib = ref.componentLibrary ? ` (component library ${ref.componentLibrary})` : "";
	return `${fn || "Power Fx formula"}${lib}`;
}

/**
 * Apps for the App filter: the apps that contain the table, plus any app that
 * has a command for it (a command can outlive the table's removal from an
 * app). Names come from `appmodule`, else the command's formatted lookup
 * value, else the id. When `containingAppIds` is unknown (null), only apps
 * with commands are listed. Sorted by name.
 */
export function buildAppList(
	commands: ModernCommand[],
	apps: ModernAppModule[],
	containingAppIds: ReadonlySet<string> | null,
): ModernAppModule[] {
	const known = new Map(apps.map((a) => [a.id.toLowerCase(), a]));
	const out = new Map<string, ModernAppModule>();
	for (const id of containingAppIds ?? []) {
		const app = known.get(id.toLowerCase());
		if (app) out.set(app.id.toLowerCase(), app);
	}
	for (const c of commands) {
		if (!c.appModuleId || out.has(c.appModuleId)) continue;
		out.set(
			c.appModuleId,
			known.get(c.appModuleId) ?? { id: c.appModuleId, name: c.appName ?? c.appModuleId },
		);
	}
	return [...out.values()].sort(
		(a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
	);
}

/** The app a command belongs to, for badges and tooltips. */
export function appLabel(cmd: ModernCommand, appNames?: ReadonlyMap<string, string>): string {
	if (cmd.appModuleId === null) return "All apps";
	return appNames?.get(cmd.appModuleId) ?? cmd.appName ?? cmd.appModuleId;
}

/** One-line explanation of a classic button's modern override, e.g. "Hidden by modern command Refresh in Sales Hub". */
export function describeOverride(
	o: ClassicModernOverride,
	appNames?: ReadonlyMap<string, string>,
): string {
	const app = appLabel(o.command, appNames);
	const where = o.command.appModuleId === null ? "in all apps" : `in ${app}`;
	return o.effect === "hidden"
		? `Hidden by modern command ${o.command.label} ${where}`
		: `Rendered as modern command ${o.command.label} ${where} (migrated)`;
}

const TYPE_LABELS: Record<ModernCommand["type"], string> = {
	button: "Command",
	dropdown: "Dropdown",
	split: "Split button",
	group: "Group",
};

const ORIGIN_LABELS: Record<ModernCommand["origin"], string> = {
	default: "Command designer",
	migrated: "Migrated from classic",
	enhancedMigrated: "Enhanced migrated from classic",
};

/** Label / value pairs describing a command, for tooltips and the properties pane. */
export function describeModernCommand(
	cmd: ModernCommand,
	appNames?: ReadonlyMap<string, string>,
): { label: string; value: string }[] {
	const rows: { label: string; value: string }[] = [
		{ label: "App", value: appLabel(cmd, appNames) },
		{
			label: "Location",
			value: `${APP_ACTION_LOCATION_LABELS[cmd.location] ?? `Location ${cmd.location}`}${cmd.scope === "all" ? " (all tables)" : ""}`,
		},
		{ label: "Type", value: TYPE_LABELS[cmd.type] },
		{ label: "Order", value: String(cmd.sequence) },
		{ label: "Origin", value: ORIGIN_LABELS[cmd.origin] },
	];
	if (cmd.hidden) rows.push({ label: "Status", value: "Hidden" });
	else if (cmd.disabled)
		rows.push({
			label: "Status",
			value: "Disabled — the classic (ribbon) equivalent is shown",
		});

	if (cmd.visibility === "formula") {
		rows.push({
			label: "Visible (Power Fx)",
			value: describeFormula(cmd.visibilityFormula) ?? "Power Fx formula",
		});
	} else if (cmd.visibility === "classicRules") {
		const names = cmd.classicRules.filter((r) => r.kind === "display").map((r) => r.name);
		rows.push({
			label: "Visibility",
			value: names.length ? `Classic rules: ${names.join(", ")}` : "Classic rules",
		});
	}

	if (cmd.action === "formula") {
		rows.push({
			label: "OnSelect (Power Fx)",
			value: describeFormula(cmd.onSelectFormula) ?? "Power Fx formula",
		});
	} else if (cmd.action === "javascript") {
		const lib = cmd.jsWebResourceName ?? cmd.jsWebResourceId;
		const fn = cmd.jsFunctionName ?? "(no function)";
		rows.push({ label: "Action (JavaScript)", value: lib ? `${fn} in ${lib}` : fn });
		if (cmd.jsParameters) rows.push({ label: "Parameters", value: cmd.jsParameters });
	}
	return rows;
}
