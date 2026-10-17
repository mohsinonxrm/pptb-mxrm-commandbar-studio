/**
 * Canonical form of ribbon XML, used to decide whether two pieces of XML mean
 * the same thing: the parser's lossless self-check (xmlParser.ts) and the
 * round-trip tests.
 *
 * Differences that carry no meaning are removed:
 *  - attribute order (attributes are sorted by name);
 *  - whitespace-only text, comments and processing instructions;
 *  - the lexical form of xs:boolean attributes (`1`/`0` vs `true`/`false`,
 *    XML Schema Part 2 §3.2.2) — the generator always writes `true`/`false`;
 *  - (only with `normalizeCommands`) a `CommandDefinition` missing one of its
 *    `EnableRules` / `DisplayRules` / `Actions` containers, or listing them out
 *    of order. RibbonTypes.xsd `CommandDefinitionType` requires all three, in
 *    that order; RetrieveEntityRibbon output sometimes omits one, and the
 *    generator writes the schema-valid equivalent (an empty container).
 *
 * Everything else — element names, attribute values, child order — is kept.
 */

/** Attributes typed xs:boolean in RibbonTypes.xsd. */
const BOOLEAN_ATTRIBUTES = new Set([
	"Default",
	"InvertResult",
	"PropertyValue",
	"ExpectedValue",
	"TrackedInCrm",
	"PassParams",
	"AllowCustomRelationship",
	"AllowSystemRelationship",
]);

const COMMAND_CHILD_ORDER = ["EnableRules", "DisplayRules", "Actions"];

export interface CanonicalOptions {
	normalizeCommands?: boolean;
}

function isBooleanAttribute(el: Element, name: string): boolean {
	return BOOLEAN_ATTRIBUTES.has(name) || (el.tagName === "BoolParameter" && name === "Value");
}

function normalizeBoolean(value: string): string {
	const v = value.trim();
	if (v === "1") return "true";
	if (v === "0") return "false";
	return v;
}

function escapeAttr(v: string): string {
	return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function canonicalElement(el: Element, opts: CanonicalOptions, indent: string): string {
	const attrs = Array.from(el.attributes)
		.map((a) => [a.name, isBooleanAttribute(el, a.name) ? normalizeBoolean(a.value) : a.value] as const)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
		.join("");

	const parts: string[] = [];
	let children: Element[] = [];
	for (const node of Array.from(el.childNodes)) {
		if (node.nodeType === 1) children.push(node as Element);
		else if (node.nodeType === 3 || node.nodeType === 4) {
			const text = (node.textContent ?? "").trim();
			if (text) parts.push(`${indent}  #text ${text}`);
		}
	}

	if (opts.normalizeCommands && el.tagName === "CommandDefinition") {
		const byTag = new Map(children.map((c) => [c.tagName, c] as const));
		const extra = children.filter((c) => !COMMAND_CHILD_ORDER.includes(c.tagName));
		const ordered: string[] = COMMAND_CHILD_ORDER.map((tag) => {
			const c = byTag.get(tag);
			return c ? canonicalElement(c, opts, `${indent}  `) : `${indent}  <${tag}/>`;
		});
		children = [];
		parts.push(...ordered, ...extra.map((c) => canonicalElement(c, opts, `${indent}  `)));
	}

	for (const c of children) parts.push(canonicalElement(c, opts, `${indent}  `));
	if (parts.length === 0) return `${indent}<${el.tagName}${attrs}/>`;
	return `${indent}<${el.tagName}${attrs}>\n${parts.join("\n")}\n${indent}</${el.tagName}>`;
}

/** Parses an XML string, throwing on malformed input. */
export function parseXmlElement(xml: string): Element {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	const err = doc.querySelector("parsererror");
	if (err) throw new Error(`XML parse error: ${err.textContent ?? "unknown"}`);
	return doc.documentElement;
}

/** Canonical, indented text of an element (or an XML string). */
export function canonicalXml(input: string | Element, opts: CanonicalOptions = {}): string {
	const el = typeof input === "string" ? parseXmlElement(input) : input;
	return canonicalElement(el, opts, "");
}

/** True when two pieces of XML are equal in canonical form. */
export function sameXml(a: string | Element, b: string | Element, opts: CanonicalOptions = {}): boolean {
	try {
		return canonicalXml(a, opts) === canonicalXml(b, opts);
	} catch {
		return false;
	}
}
