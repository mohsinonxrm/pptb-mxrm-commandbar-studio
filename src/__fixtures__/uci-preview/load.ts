/**
 * Readers for the #191/#192 Unified Interface fixtures (tests only). Ribbons recorded after
 * contact and account are stored gzipped (`<entity>.All.xml.gz`, about 40 KB instead of 550 KB);
 * Command Checker captures are one file per recording day, read together.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const dir = __dirname;

/** An entity's merged ribbon (RetrieveEntityRibbon, All) as recorded on CRM279420. */
export function ribbonXml(entity: string): string {
	const plain = resolve(dir, `ribbon/${entity}.All.xml`);
	if (existsSync(plain)) return readFileSync(plain, "utf-8");
	return gunzipSync(readFileSync(`${plain}.gz`)).toString("utf-8");
}

/** The entities a ribbon was recorded for. */
export function ribbonEntities(): string[] {
	return readdirSync(resolve(dir, "ribbon"))
		.map((f) => f.match(/^(\w+)\.All\.xml(\.gz)?$/)?.[1])
		.filter((e): e is string => !!e)
		.sort();
}

/**
 * Command Checker, item by item: flags V shown, H hidden by its rules, S hidden by selection; each
 * rule True, False, or null where Command Checker lists it as Skipped (not evaluated: an earlier
 * rule was already False).
 */
export interface CommandCheckerItem {
	label: string;
	command?: string;
	flags: string;
	rules: Record<string, boolean | null>;
}

export interface CommandCheckerCapture {
	source: Record<string, string>;
	contexts: Record<string, Record<string, CommandCheckerItem>>;
}

/** Every Command Checker capture, as one: contexts from all of them, recording days joined. */
export function commandCheckerCapture(): CommandCheckerCapture {
	const files = readdirSync(resolve(dir, "commandChecker"))
		.filter((f) => f.endsWith(".json"))
		.sort();
	const captures = files.map(
		(f) =>
			JSON.parse(
				readFileSync(resolve(dir, "commandChecker", f), "utf-8"),
			) as CommandCheckerCapture,
	);
	const contexts: CommandCheckerCapture["contexts"] = {};
	for (const c of captures)
		for (const [key, items] of Object.entries(c.contexts)) {
			if (contexts[key]) throw new Error(`${key} is in two Command Checker captures`);
			contexts[key] = items;
		}
	return {
		source: {
			...captures[0].source,
			recorded: captures.map((c) => c.source.recorded).join(" and "),
		},
		contexts,
	};
}

/** A generated table as the repository formats it (Prettier, its own config). */
export async function formatJson(json: string): Promise<string> {
	const prettier = await import("prettier");
	const config = (await prettier.resolveConfig(resolve(dir, "../../../package.json"))) ?? {};
	return prettier.format(json, { ...config, parser: "json" });
}
