/**
 * #191: Unified Interface's text for `$Resources:` labels, generated from the recorded bars
 * (2026-10-29) and the Command Checker capture (2026-11-15).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRibbonXml } from "@/services/xmlParser";
import { groupControls } from "@/utils/ribbonMenu";
import { commandCheckerCapture, ribbonXml } from "@/__fixtures__/uci-preview/load";
import { uciLabel } from "@/services/uciPreview/labels";
import recorded from "@/services/uciPreview/resourceLabels.json";
import type { RibbonButton } from "@/types/ribbon";

// Generating the table parses every recorded ribbon.
vi.setConfig({ testTimeout: 60_000 });

const dir = resolve(__dirname, "../__fixtures__/uci-preview");
const read = (path: string) => readFileSync(resolve(dir, path), "utf-8");
/** The display names of the entities recorded (CRM279420, English). */
const DISPLAY_NAME: Record<string, string> = {
	contact: "Contact",
	account: "Account",
	lead: "Lead",
	opportunity: "Opportunity",
	quote: "Quote",
	salesorder: "Order",
	invoice: "Invoice",
	product: "Product",
	incident: "Case",
	email: "Email",
	task: "Task",
	phonecall: "Phone Call",
	appointment: "Appointment",
	activitypointer: "Activity",
};

/** Each control's label token, by id, in an entity's saved ribbon (menu items too). */
function tokensOf(entity: string): Map<string, string> {
	const p = parseRibbonXml(ribbonXml(entity), "HomepageGrid", entity);
	const out = new Map<string, string>();
	const walk = (b: RibbonButton) => {
		const token = b.source?.labelToken;
		if (token) out.set(b.id, token);
		for (const s of b.menu?.sections ?? []) for (const c of s.controls) walk(c);
	};
	for (const t of p.ribbon.tabs)
		for (const g of t.groups) for (const b of groupControls(g)) walk(b);
	return out;
}

function derive(): Record<string, string> {
	// The bars' own text first; Command Checker's names only fill what they didn't show
	// (it names Add New Contact "New Contact").
	const bars = new Map<string, Set<string>>();
	const checker = new Map<string, Set<string>>();
	let seen = bars;
	const note = (entity: string, tokens: Map<string, string>, id: string, text: string) => {
		const token = tokens.get(id);
		// A label with the entity's plural name is left out: the session has no plural to put in.
		if (
			!token?.startsWith("$Resources") ||
			token.startsWith("$Resources(EntityPluralDisplayName)") ||
			!text ||
			/[{}]/.test(text) ||
			text === "---"
		)
			return;
		const name = DISPLAY_NAME[entity];
		const value = /^\$Resources\(EntityDisplayName\):/.test(token)
			? text.split(name).join("{EntityDisplayName}")
			: text;
		(seen.get(token) ?? seen.set(token, new Set()).get(token)!).add(value);
	};
	const parsedTokens = new Map<string, Map<string, string>>();
	const tokens = {
		get: (e: string) => parsedTokens.get(e) ?? parsedTokens.set(e, tokensOf(e)).get(e)!,
	};
	for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
		const data = JSON.parse(read(f)) as { entity: string; labels: Record<string, string> };
		for (const [id, text] of Object.entries(data.labels))
			note(data.entity, tokens.get(data.entity)!, id, text);
	}
	seen = checker;
	const capture = commandCheckerCapture();
	for (const [key, items] of Object.entries(capture.contexts)) {
		const entity = key.split(".")[1];
		for (const [id, item] of Object.entries(items))
			note(
				entity,
				tokens.get(entity)!,
				id,
				item.label.replace(/( \(hidden\)| \(hidden by selection\))+$/, ""),
			);
	}
	// A token two texts were recorded for (it depends on the page) is left out.
	const all = [...bars, ...[...checker].filter(([token]) => !bars.has(token))];
	return Object.fromEntries(
		all
			.filter(([, texts]) => texts.size === 1)
			.map(([token, texts]) => [token, [...texts][0]] as const)
			.sort(([a], [b]) => a.localeCompare(b)),
	);
}

describe("#191 Unified Interface's labels", () => {
	it("the table is generated from the recordings", () => {
		// UPDATE_RECORDED_RULES=1 rewrites it (then run the test again).
		if (process.env.UPDATE_RECORDED_RULES)
			writeFileSync(
				resolve(__dirname, "../services/uciPreview/resourceLabels.json"),
				JSON.stringify(derive(), null, "\t") + "\n",
			);
		expect(recorded).toEqual(derive());
		expect(Object.keys(recorded).length).toBeGreaterThan(40);
	});

	it("gives the text users see, with the entity's name where the label takes it", () => {
		const tokens = tokensOf("contact");
		expect(uciLabel(tokens.get("Mscrm.HomepageGrid.contact.Send"), "Contact")).toBe(
			"Email a Link",
		);
		expect(
			uciLabel(
				tokens.get("Mscrm.HomepageGrid.contact.MainTab.QuickPowerBI.Button"),
				"Contact",
			),
		).toBe("Visualize this view");
		expect(uciLabel(tokens.get("Mscrm.SubGrid.contact.AddNewStandard"), "Lead")).toBe(
			"Add New Lead",
		);
		expect(uciLabel("$Resources:Not.Recorded", "Contact")).toBeUndefined();
		expect(uciLabel(undefined, "Contact")).toBeUndefined();
	});
});
