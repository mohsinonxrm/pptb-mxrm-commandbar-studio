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

/** The `data` StringParameter's value for these rows; rows without a name are left out. */
export function encodeDataValues(rows: readonly DataValue[]): string {
	const pairs = rows
		.filter((r) => r.name.trim())
		.map((r) => `${encodeURIComponent(r.name.trim())}=${encodeURIComponent(r.value)}`);
	return pairs.length ? encodeURIComponent(pairs.join("&")) : "";
}

/**
 * The rows a `data` value holds, or null when it isn't one the helper wrote (a plain value, or
 * text that doesn't decode). An empty value is no rows.
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
	return rows;
}

/** The action's `data` parameter, if it has one (names are matched case-insensitively). */
export function findDataParameter(params: readonly ActionParameter[]): {
	index: number;
	param: ActionParameter;
} | null {
	const index = params.findIndex((p) => p.name?.trim().toLowerCase() === "data");
	return index < 0 ? null : { index, param: params[index] };
}

/**
 * The parameters with the `data` StringParameter set to `rows`: added at the end when there was
 * none, updated in place, or removed when no row has a name.
 */
export function withDataValues(
	params: readonly ActionParameter[],
	rows: readonly DataValue[],
): ActionParameter[] {
	const value = encodeDataValues(rows);
	const found = findDataParameter(params);
	if (!found)
		return value ? [...params, { kind: "StringParameter", name: "data", value }] : [...params];
	if (!value) return params.filter((_, i) => i !== found.index);
	return params.map((p, i) =>
		i === found.index ? { kind: "StringParameter", name: p.name ?? "data", value } : p,
	);
}

/** Page code that reads the values back, for the web resource's script. */
export const DATA_PAGE_SNIPPET = `// Values Command Bar Studio packed into the web resource's data parameter.
const raw = new URLSearchParams(location.search).get("data") ?? "";
// Still encoded once (no "=" yet) when the address wasn't encoded again on the way.
const values = new URLSearchParams(raw.includes("=") ? raw : decodeURIComponent(raw));
const first = values.get("first"); // one value by name`;
