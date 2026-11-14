import { PLATFORM_ENABLE_RULES } from "@/constants/ruleKinds";
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

/** A rule tag's tooltip: the id, or why a rule that isn't loaded has nothing to open (#162). */
export function ruleTagTip(ruleId: string, kind: "enable" | "display", loaded: boolean): string {
	if (loaded) return ruleId;
	const platform =
		kind === "enable" ? PLATFORM_ENABLE_RULES.find((r) => r.id === ruleId) : undefined;
	return platform
		? `${ruleId}: Microsoft's rule, "${platform.label}". It's in the application ribbon, so there's nothing to open here.`
		: `${ruleId} isn't in the loaded ribbon, so there's nothing to open here.`;
}
