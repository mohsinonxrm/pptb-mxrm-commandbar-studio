/**
 * Whether two values have the same JSON (#111), without writing it: what
 * `JSON.stringify(a) === JSON.stringify(b)` answers, except that the order of an object's keys
 * doesn't count. A property whose value is undefined (or a function) is the same as no property,
 * an undefined array item is null, and NaN and ±Infinity are null, all as in JSON.
 *
 * Objects compare by reference first, at every level: the store updates immutably, so a part of
 * the workspace nobody edited is the same object as the baseline's, and isn't walked at all.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
	return same(asJson(a), asJson(b));
}

/** What JSON leaves out of an object (and writes as null in an array). */
const OMITTED = Symbol("omitted");

function asJson(v: unknown): unknown {
	switch (typeof v) {
		case "number":
			return Number.isFinite(v) ? v : null;
		case "undefined":
		case "function":
		case "symbol":
			return OMITTED;
		case "object":
			if (v === null) return v;
			// A Date (toJSON), or a boxed primitive: not in the workspace, but answered as JSON would.
			if (typeof (v as { toJSON?: unknown }).toJSON === "function")
				return asJson((v as { toJSON(): unknown }).toJSON());
			if (v instanceof Number || v instanceof String || v instanceof Boolean)
				return asJson(v.valueOf());
			return v;
		default:
			return v;
	}
}

const enumerable = (o: object, k: string) => Object.prototype.propertyIsEnumerable.call(o, k);

function same(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	const aArray = Array.isArray(a);
	if (aArray !== Array.isArray(b)) return false;
	if (aArray) {
		const x = a as unknown[];
		const y = b as unknown[];
		if (x.length !== y.length) return false;
		for (let i = 0; i < x.length; i++) {
			const u = asJson(x[i]);
			const v = asJson(y[i]);
			if (!same(u === OMITTED ? null : u, v === OMITTED ? null : v)) return false;
		}
		return true;
	}
	// Like JSON, an object's own enumerable keys (a Map or a Set is {}).
	const x = a as Record<string, unknown>;
	const y = b as Record<string, unknown>;
	let count = 0;
	for (const k of Object.keys(x)) {
		const u = asJson(x[k]);
		if (u === OMITTED) continue;
		count++;
		if (!enumerable(y, k)) return false;
		const v = asJson(y[k]);
		if (v === OMITTED || !same(u, v)) return false;
	}
	for (const k of Object.keys(y)) if (asJson(y[k]) !== OMITTED) count--;
	return count === 0;
}
