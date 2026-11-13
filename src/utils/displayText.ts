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
	"caption",
]);

/**
 * A dotted resource / label key such as `Ribbon.HomepageGrid.MainTab.New`, not
 * a caption: three segments or more, or two starting with a capital
 * (`RefreshCommandBar.Flows`) — not `cbs.Button`, a lower-case prefix and id.
 */
const KEY = /^([A-Za-z_$][\w$]*(\.[\w$!{}-]+){2,}|[A-Z][\w$]*\.[\w$!{}-]+)$/;

/**
 * An underscore key of Microsoft's resources, such as a tooltip's
 * `Mscrm_Form_Other_MainTab_Save_SaveAndNew_ToolTipTitle` (#229): no dots,
 * `Mscrm_` or `Ribbon_` and three parts or more.
 */
const UNDERSCORE_KEY = /^(Mscrm|Ribbon)(_[A-Za-z0-9]+){2,}$/;

/**
 * Any underscore key, such as `WebResource_Tab_Caption`: only for a value that
 * came from a `$Resources:` / `$LocLabels:` token, where it can't be a caption
 * someone typed (#229).
 */
const LOOSE_UNDERSCORE_KEY = /^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)+$/;

/**
 * A single-segment key such as `OpenAllRecordsViewImageButtonText` (#201): three
 * words or more run together. Like the loose underscore key, only for a value that
 * came from a token: "SaveAndClose" typed as a label is left alone.
 */
const CAMEL_KEY = /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*){2,}$/;

/** What a single-segment key ends with to say what it's for, not what it says (#201). */
const KEY_SUFFIX =
	/(?:ImageButtonText|ButtonText|ButtonLabel|ToolTipTitle|ToolTip|Tooltip|LabelText|Label|Text|Title|Caption)$/;

/** Words run together, split: `ExportToExcel` → "Export To Excel", `AIBuilder` → "AI Builder". */
function splitWords(value: string): string {
	return value
		.replace(/_/g, " ")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.trim();
}

/**
 * A readable caption from a key Dataverse resolves at runtime and CBS can't
 * (#6): its last meaningful segment, words split. `Ribbon.HomepageGrid.MainTab.New`
 * → "New", `Ribbon.HomepageGrid.Data.Export.ExportToExcel` → "Export To Excel",
 * `Ribbon.VisualizationTab.Save.Save.Label` → "Save". Undefined when `value`
 * isn't a key.
 */
export function captionFromKey(value: string, fromToken = false): string | undefined {
	if (fromToken && CAMEL_KEY.test(value)) {
		const words = value.replace(KEY_SUFFIX, "");
		return splitWords(words || value);
	}
	const separator = KEY.test(value)
		? "."
		: UNDERSCORE_KEY.test(value) || (fromToken && LOOSE_UNDERSCORE_KEY.test(value))
			? "_"
			: undefined;
	if (!separator) return undefined;
	const segments = value
		.split(separator)
		.filter((s) => s && !GENERIC_SEGMENTS.has(s.toLowerCase()));
	const last = segments.at(-1);
	if (!last || /^(Mscrm|Ribbon|\{!EntityLogicalName\})$/i.test(last)) return undefined;
	return splitWords(last);
}

/**
 * What to show for a tab or group (#201): its `text` (its title as the canvas shows it),
 * or, without a title, a caption made from its id
 * (`Mscrm.HomepageGrid.account.MainTab.ModernClient` → "Modern Client"), else the id.
 * The parser uses the id as the label of a tab or group without a Title, so a text equal
 * to the id counts as none.
 */
export function idCaption(id: string, text?: string): string {
	const shown = text?.trim();
	return shown && shown !== id ? shown : (captionFromKey(id) ?? id);
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
 * The placeholders Dataverse fills in with the table a ribbon is shown for
 * (the application ribbon's tabs use them, #229), as words: shown raw they
 * read as code.
 */
const PLACEHOLDERS: [RegExp, string][] = [
	[/\{!EntityPluralDisplayName\}/g, "‹table name, plural›"],
	[/\{!EntityDisplayName\}/g, "‹table name›"],
];
export function readablePlaceholders(text: string): string {
	return PLACEHOLDERS.reduce((t, [re, words]) => t.replace(re, words), text);
}

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
	const text = displayTextRaw(value, locLabels, languageCode, managed, token);
	return text && readablePlaceholders(text);
}

function displayTextRaw(
	value: string | undefined | null,
	locLabels: LocLabel[],
	languageCode: number,
	managed: Record<string, LocLabel>,
	token?: string,
): string {
	const resolved = resolveDisplayLabel(value, locLabels, languageCode);
	if (!resolved) return resolved;
	const unchanged =
		token !== undefined &&
		resolveDisplayLabel(token, locLabels, languageCode) === (value ?? "");
	const reference = unchanged ? token : (value ?? "");
	if (!REFERENCE.test(reference)) return resolved;
	const fromManaged = managed[resolved];
	if (fromManaged) return titleIn(fromManaged, languageCode) ?? resolved;
	// Any underscore key reads as a caption only when nothing resolved the
	// reference: a label's own text (`Send_Email`) is left as it is (review).
	const unresolved = resolved === reference.replace(REFERENCE, "");
	return captionFromKey(resolved, unresolved) ?? resolved;
}
