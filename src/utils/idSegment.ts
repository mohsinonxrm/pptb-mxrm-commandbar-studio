/**
 * Parts of ribbon ids that say what kind of element it is, not which one
 * (`Mscrm.EnableRule.ExactlyOneSelected` is told apart by its last part).
 */
const GENERIC = new Set([
	"mscrm",
	"command",
	"commands",
	"enablerule",
	"enablerules",
	"displayrule",
	"displayrules",
	"rule",
	"button",
	"customaction",
	"template",
	"templates",
]);

/**
 * The part of a ribbon id that tells it apart (#194): its last dot-separated
 * part that isn't a generic word like "Command" or "EnableRule". The whole id
 * when nothing else is left.
 */
export function distinguishingSegment(id: string): string {
	const parts = id.split(".").filter(Boolean);
	for (let i = parts.length - 1; i >= 0; i--)
		if (!GENERIC.has(parts[i].toLowerCase())) return parts[i];
	return id;
}
