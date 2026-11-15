import type { ActionParameter } from "@/types/ribbon";

/**
 * Several values in a web resource's `data` parameter (#275). An HTML web resource reads only a
 * few query string names (`data`, `typename`, `id`, …), so values of your own are packed into
 * `data`, as in Microsoft's sample "Pass multiple values to a web resource through the data
 * parameter".
 *
 * Format: each name and value is URL-encoded and joined as `a=1&b=2`, and that whole string is
 * URL-encoded once more, so the ribbon's `data` StringParameter holds no `=` or `&` of its own.
 * The page reads it with {@link DATA_PAGE_SNIPPET}, which works whether or not the ribbon
 * encodes the value again when it builds the address.
 */

export interface DataValue {
	name: string;
	value: string;
}

/** Text `encodeURIComponent` can encode: a lone surrogate (half an emoji, pasted) becomes U+FFFD. */
function wellFormed(text: string): string {
	return text.replace(
		/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
		"\uFFFD",
	);
}

/** The `data` StringParameter's value for these rows; rows without a name are left out. */
export function encodeDataValues(rows: readonly DataValue[]): string {
	const pairs = rows
		.filter((r) => r.name.trim())
		.map(
			(r) =>
				`${encodeURIComponent(wellFormed(r.name.trim()))}=${encodeURIComponent(wellFormed(r.value))}`,
		);
	return pairs.length ? encodeURIComponent(pairs.join("&")) : "";
}

/**
 * The rows a `data` value holds, or null when it isn't one the helper wrote: a plain value, text
 * that doesn't decode, or a value encoded some other way (a URL, Microsoft's sample format) that
 * the helper would rewrite differently. An empty value is no rows.
 */
export function decodeDataValues(value: string): DataValue[] | null {
	if (!value) return [];
	// Written by the helper: no `=` until it's decoded once.
	if (value.includes("=") || value.includes("&")) return null;
	let inner: string;
	try {
		inner = decodeURIComponent(value);
	} catch {
		return null;
	}
	if (!inner.includes("=")) return null;
	const rows: DataValue[] = [];
	for (const part of inner.split("&")) {
		const at = part.indexOf("=");
		if (at <= 0) return null;
		try {
			rows.push({
				name: decodeURIComponent(part.slice(0, at)),
				value: decodeURIComponent(part.slice(at + 1)),
			});
		} catch {
			return null;
		}
	}
	// Only a value the helper writes exactly the same way is its own.
	return encodeDataValues(rows) === value ? rows : null;
}

/**
 * The action's `data` parameter, if it has one. The name must be exactly `data`, as the
 * parameter list's check (#160) requires: another spelling is flagged there, not claimed here.
 */
export function findDataParameter(params: readonly ActionParameter[]): {
	index: number;
	param: ActionParameter;
} | null {
	const index = params.findIndex((p) => p.name === "data");
	return index < 0 ? null : { index, param: params[index] };
}

/**
 * The parameters with the `data` StringParameter set to `rows`: added at the end when there was
 * none and a row has a name, updated in place (empty while every row is still unnamed, so it
 * keeps its place), or removed when the helper has no rows.
 */
export function withDataValues(
	params: readonly ActionParameter[],
	rows: readonly DataValue[],
): ActionParameter[] {
	const value = encodeDataValues(rows);
	const found = findDataParameter(params);
	if (!found)
		return value ? [...params, { kind: "StringParameter", name: "data", value }] : [...params];
	if (rows.length === 0) return params.filter((_, i) => i !== found.index);
	return params.map((p, i) =>
		i === found.index ? { kind: "StringParameter", name: "data", value } : p,
	);
}

/** Page code that reads the values back, for the web resource's script. */
export function dataPageSnippet(name = "first"): string {
	return `// Values Command Bar Studio packed into the web resource's data parameter.
const raw = new URLSearchParams(location.search).get("data") ?? "";
// No "=" yet: the ribbon encoded the address once more, so decode once more.
const values = new URLSearchParams(raw.includes("=") ? raw : decodeURIComponent(raw));
const value = values.get(${JSON.stringify(name)}); // one value by name`;
}

export const DATA_PAGE_SNIPPET = dataPageSnippet();
