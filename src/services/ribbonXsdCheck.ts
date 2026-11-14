/**
 * Checks the RibbonDiffXml a publish would import against Microsoft's ribbon
 * schemas (RibbonCore / RibbonTypes / RibbonWSS 9.0.0.2090, #126), with
 * xmllint compiled to WebAssembly. The publish dialog imports this module
 * only when it runs the check, so neither the validator nor the schemas are
 * in the main bundle.
 *
 * Every finding is a warning. The schemas are from 2017, and Dataverse
 * accepts ribbon XML they don't describe: what Dataverse accepts decides, and
 * if it rejects an import, its own error is shown. Patterns proven on a live
 * org that the schemas reject are listed in KNOWN_SCHEMA_EXCEPTIONS and get
 * no warning. The checks that block a publish stay in xmlValidator.ts.
 */
import { parseRibbonDiffParts, type RibbonDiffParts } from "@/services/ribbonDiffMerge";
import type { PublishFinding } from "@/services/xmlValidator";
import entityXsd from "@/schemas/ribbon/CbsEntityRibbon.xsd?raw";
import coreXsd from "@/schemas/ribbon/RibbonCore.xsd?raw";
import typesXsd from "@/schemas/ribbon/RibbonTypes.xsd?raw";
import wssXsd from "@/schemas/ribbon/RibbonWSS.xsd?raw";

/** The version of Microsoft's schemas in src/schemas/ribbon (see its README). */
export const RIBBON_SCHEMA_VERSION = "9.0.0.2090";

/** One error as xmllint reports it. */
export interface XsdError {
	/** The message without the file name and line, e.g. "element Button: Schemas validity error : …". */
	message: string;
	lineNumber: number | null;
}

/** Runs xmllint: `xml` against `schema` (the root schema's file name), with `files` available to it. */
export type XsdValidator = (input: {
	xml: string;
	schema: string;
	files: Record<string, string>;
}) => Promise<{ valid: boolean; errors: XsdError[] }>;

/**
 * A pattern Dataverse accepts although the 2017 schema rejects it, proven on a
 * live org. It gets no warning.
 */
export interface KnownSchemaException {
	/** What Dataverse accepts, in a sentence. */
	what: string;
	/** The live check that proved it (org, date, how). */
	provedBy: string;
	matches(error: { detail: string; tag: string }): boolean;
}

/** Empty until a live check proves a pattern the schema rejects is accepted. */
export const KNOWN_SCHEMA_EXCEPTIONS: readonly KnownSchemaException[] = [];

const SCHEMA_FILES: Record<string, string> = {
	"CbsEntityRibbon.xsd": entityXsd,
	"RibbonCore.xsd": coreXsd,
	"RibbonTypes.xsd": typesXsd,
	"RibbonWSS.xsd": wssXsd,
};

/** xmllint-wasm, loaded on first use. It runs in a module Web Worker. */
export const xmllintValidator: XsdValidator = async ({ xml, schema, files }) => {
	const { validateXML } = await import("xmllint-wasm");
	const result = await validateXML({
		xml: [{ fileName: "ribbon.xml", contents: xml }],
		schema: [{ fileName: schema, contents: files[schema] ?? "" }],
		preload: Object.entries(files)
			.filter(([name]) => name !== schema)
			.map(([fileName, contents]) => ({ fileName, contents })),
	});
	return {
		valid: result.valid,
		// Only what xmllint says about the ribbon. Its stderr has other lines too:
		// PPTB serves the .wasm without the application/wasm type, so the
		// runtime notes "wasm streaming compile failed … falling back", and
		// xmllint-wasm would list those as errors.
		errors: result.errors
			.filter((e) => e.loc?.fileName === "ribbon.xml")
			.map((e) => ({ message: e.message, lineNumber: e.loc?.lineNumber ?? null })),
	};
};

/** What each line of the document given to xmllint belongs to. */
interface LineOwner {
	/** `part:id`, as changedRibbonDiffKeys. */
	key: string;
	tag: string;
	/** The nearest Id (or HideActionId / TabCommand) at or above the line's element. */
	elementId?: string;
}

const escapeAttribute = (v: string) =>
	v
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/\t/g, "&#9;")
		.replace(/\n/g, "&#10;")
		.replace(/\r/g, "&#13;");

const escapeText = (v: string) =>
	v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const identityOf = (el: Element) =>
	el.getAttribute("Id") ?? el.getAttribute("HideActionId") ?? el.getAttribute("TabCommand");

/**
 * Writes `el` with every start tag on its own line, recording which part
 * element (and which Id) each line belongs to, so xmllint's line numbers name
 * the element.
 */
function writeElement(
	el: Element,
	depth: number,
	key: string,
	parentId: string | undefined,
	lines: string[],
	owners: (LineOwner | null)[],
): void {
	const indent = "\t".repeat(depth);
	const elementId = identityOf(el) ?? parentId;
	const owner: LineOwner = { key, tag: el.tagName, elementId };
	const attrs = Array.from(el.attributes)
		.map((a) => ` ${a.name}="${escapeAttribute(a.value)}"`)
		.join("");
	const children = Array.from(el.childNodes).filter(
		(n) =>
			n.nodeType === n.ELEMENT_NODE ||
			((n.nodeType === n.TEXT_NODE || n.nodeType === n.CDATA_SECTION_NODE) &&
				(n.nodeValue ?? "").trim() !== ""),
	);
	const push = (line: string) => {
		lines.push(line);
		owners.push(owner);
	};
	if (children.length === 0) return push(`${indent}<${el.tagName}${attrs} />`);
	if (children.every((n) => n.nodeType !== n.ELEMENT_NODE))
		return push(
			`${indent}<${el.tagName}${attrs}>${escapeText(children.map((n) => n.nodeValue).join(""))}</${el.tagName}>`,
		);
	push(`${indent}<${el.tagName}${attrs}>`);
	for (const child of children) {
		if (child.nodeType === child.ELEMENT_NODE)
			writeElement(child as Element, depth + 1, key, elementId, lines, owners);
		else push(`${indent}\t${escapeText(child.nodeValue ?? "")}`);
	}
	push(`${indent}</${el.tagName}>`);
}

/**
 * The document xmllint checks: the same structure as
 * ribbonDiffMerge.serializeRibbonDiffParts (what the import gets), with one
 * start tag per line. An entity's layer is wrapped in <CbsEntityRibbon>, on
 * the first line, so it is checked as RibbonEntityDiffXmlType.
 */
export function schemaDocument(
	parts: RibbonDiffParts,
	entity: boolean,
): { xml: string; owners: (LineOwner | null)[] } {
	const lines: string[] = [];
	const owners: (LineOwner | null)[] = [];
	const open = (tag: string) => {
		lines.push(tag);
		owners.push(null);
	};
	const parser = new DOMParser();
	const writePart = (part: keyof RibbonDiffParts, depth: number) => {
		for (const [id, xml] of parts[part]) {
			const doc = parser.parseFromString(xml, "application/xml");
			// Not well-formed: xmlValidator already reports it as an error.
			if (doc.querySelector("parsererror")) continue;
			writeElement(doc.documentElement, depth, `${part}:${id}`, undefined, lines, owners);
		}
	};
	open(entity ? "<CbsEntityRibbon><RibbonDiffXml>" : "<RibbonDiffXml>");
	open("\t<CustomActions>");
	writePart("customActions", 2);
	open("\t</CustomActions>");
	open("\t<Templates>");
	open('\t\t<RibbonTemplates Id="Mscrm.Templates">');
	writePart("templates", 3);
	open("\t\t</RibbonTemplates>");
	open("\t</Templates>");
	open("\t<CommandDefinitions>");
	writePart("commandDefinitions", 2);
	open("\t</CommandDefinitions>");
	open("\t<RuleDefinitions>");
	open("\t\t<TabDisplayRules>");
	writePart("tabDisplayRules", 3);
	open("\t\t</TabDisplayRules>");
	open("\t\t<DisplayRules>");
	writePart("displayRules", 3);
	open("\t\t</DisplayRules>");
	open("\t\t<EnableRules>");
	writePart("enableRules", 3);
	open("\t\t</EnableRules>");
	open("\t</RuleDefinitions>");
	open("\t<LocLabels>");
	writePart("locLabels", 2);
	open("\t</LocLabels>");
	open(entity ? "</RibbonDiffXml></CbsEntityRibbon>" : "</RibbonDiffXml>");
	return { xml: lines.join("\n"), owners };
}

const VALIDITY_ERROR = /^(?:element ([^:]+): )?Schemas validity error : (.*)$/s;
/** xmllint lists every element a sequence would accept; past this, the list is cut. */
const MAX_DETAIL = 300;

/** "element Button: Schemas validity error : Element 'Button', …" → the tag and the rule. */
function readError(message: string): { tag?: string; detail: string } {
	const m = VALIDITY_ERROR.exec(message.trim());
	const detail = (m ? m[2] : message).trim();
	return {
		tag: m?.[1],
		detail: detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL)}…` : detail,
	};
}

export interface RibbonSchemaCheckInput {
	/** The RibbonDiffXml the publish would import (checkBeforePublish's `xml`). */
	xml: string;
	/** An entity's ribbon; false for the application ribbon. */
	entity: boolean;
	/** `part:id` of what this publish adds or changes; omitted = all of it. */
	changedKeys?: Iterable<string>;
}

/**
 * Microsoft's 2017 schemas against the RibbonDiffXml a publish would import.
 * Only warnings (code `xsd`); a finding in an element this publish doesn't
 * change is marked as already published. Rejects only when the validator
 * couldn't run (for example, where the host doesn't allow Web Workers).
 */
export async function checkRibbonSchema(
	input: RibbonSchemaCheckInput,
	validate: XsdValidator = xmllintValidator,
	exceptions: readonly KnownSchemaException[] = KNOWN_SCHEMA_EXCEPTIONS,
): Promise<PublishFinding[]> {
	const parts = parseRibbonDiffParts(input.xml);
	const { xml, owners } = schemaDocument(parts, input.entity);
	const result = await validate({
		xml,
		schema: input.entity ? "CbsEntityRibbon.xsd" : "RibbonCore.xsd",
		files: SCHEMA_FILES,
	});
	if (result.valid) return [];
	const changed = input.changedKeys ? new Set(input.changedKeys) : null;
	const seen = new Set<string>();
	const findings: PublishFinding[] = [];
	for (const error of result.errors) {
		const owner = error.lineNumber ? owners[error.lineNumber - 1] : null;
		const { tag, detail } = readError(error.message);
		if (exceptions.some((x) => x.matches({ detail, tag: owner?.tag ?? tag ?? "" }))) continue;
		const where = owner?.elementId ?? owner?.tag ?? tag ?? "RibbonDiffXml";
		const introduced = !owner || !changed || changed.has(owner.key);
		const message = `${where}: ${detail}${introduced ? "" : " (already in the published customizations)"}`;
		if (seen.has(message)) continue;
		seen.add(message);
		findings.push({ severity: "warning", code: "xsd", message, elementId: owner?.elementId });
	}
	return findings;
}
