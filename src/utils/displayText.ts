import type { LocLabel } from "@/types/ribbon";
import { resolveDisplayLabel } from "@/utils/displayLabel";

/** Key segments that name what the text is for, not what it says. */
const GENERIC_SEGMENTS = new Set([
	"label",
	"labeltext",
	"tabname",
	"tabheading",
	"title",
	"tooltip",
	"tooltiptitle",
	"tooltipdescription",
	"alt",
	"button",
	"tab",
	"group",
	"flyout",
	"menu",
	"name",
	"text",
]);

/**
 * A dotted resource / label key such as `Ribbon.HomepageGrid.MainTab.New`, not
 * a caption: three segments or more, or two starting with a capital
 * (`RefreshCommandBar.Flows`) — not `cbs.Button`, a lower-case prefix and id.
 */
const KEY = /^([A-Za-z_$][\w$]*(\.[\w$!{}-]+){2,}|[A-Z][\w$]*\.[\w$!{}-]+)$/;

/**
 * A readable caption from a key Dataverse resolves at runtime and CBS can't
 * (#6): its last meaningful segment, words split. `Ribbon.HomepageGrid.MainTab.New`
 * → "New", `Ribbon.HomepageGrid.Data.Export.ExportToExcel` → "Export To Excel",
 * `Ribbon.VisualizationTab.Save.Save.Label` → "Save". Undefined when `value`
 * isn't a key.
 */
export function captionFromKey(value: string): string | undefined {
	if (!KEY.test(value)) return undefined;
	const segments = value.split(".").filter((s) => s && !GENERIC_SEGMENTS.has(s.toLowerCase()));
	const last = segments.at(-1);
	if (!last || /^(Mscrm|Ribbon|\{!EntityLogicalName\})$/i.test(last)) return undefined;
	return last
		.replace(/_/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.trim();
}

function titleIn(label: LocLabel, languageCode: number): string | undefined {
	return (
		label.titles.find((t) => t.languageCode === languageCode)?.description ??
		label.titles.find((t) => t.languageCode === 1033)?.description ??
		label.titles[0]?.description
	);
}

/** A `$Resources:` (parameterised too) or `$LocLabels:` reference. */
const REFERENCE = /^\$(Resources(\([^)]*\))?|LocLabels):/;

/**
 * What the canvas shows for a label (#6): the workspace's own resolution
 * (literal text, your layer's LocLabels); else, for a reference CBS couldn't
 * resolve, a managed solution's LocLabel text or a caption made from the key.
 * `token` is a control's label as loaded (`source.labelToken`): the parser
 * resolves `value`, so only a label still equal to its token's resolution is
 * a reference — like the generator's "unchanged" rule. A literal label, or a
 * control with no label (shown by its id), is left as it is. For display
 * only — editing and publishing use the label as loaded.
 */
export function displayText(
	value: string | undefined | null,
	locLabels: LocLabel[],
	languageCode: number,
	managed: Record<string, LocLabel>,
	token?: string,
): string {
	const resolved = resolveDisplayLabel(value, locLabels, languageCode);
	if (!resolved) return resolved;
	const unchanged = token !== undefined && resolveDisplayLabel(token, locLabels, languageCode) === (value ?? "");
	if (!REFERENCE.test(unchanged ? token : (value ?? ""))) return resolved;
	const fromManaged = managed[resolved];
	if (fromManaged) return titleIn(fromManaged, languageCode) ?? resolved;
	return captionFromKey(resolved) ?? resolved;
}
