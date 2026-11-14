/**
 * A short, readable name for a rule id (#190, #185): the segment that tells
 * rules apart. Generated ids end in generic words (`….ExactlyOneSelected.EnableRule`),
 * so taking the last segment made every custom rule read "EnableRule".
 */

const GENERIC = new Set([
	"enablerule",
	"displayrule",
	"rule",
	"enable",
	"display",
	"tabdisplayrule",
	"mscrm",
]);

export function ruleShortName(id: string): string {
	const segments = id.split(".").filter(Boolean);
	for (let i = segments.length - 1; i >= 0; i--) {
		if (!GENERIC.has(segments[i].toLowerCase())) return segments[i];
	}
	return id;
}
