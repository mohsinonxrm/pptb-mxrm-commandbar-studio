export type FluentIconVariant = "regular" | "filled";

/** Convert PascalCase icon name to snake_case Fluent icon name, e.g. "CreditCard" → "credit_card" */
export function toSnakeCase(name: string): string {
	return name.replace(/([A-Z])/g, (c, _m, i) => (i > 0 ? "_" : "") + c.toLowerCase());
}

/** UTF-8-safe base64 encode (web-resource `content` must be base64). */
export function toBase64Utf8(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

/**
 * Web resource name for a Fluent icon picked in CBS:
 * `<prefix>_/icons/cbs/<snake_name>.svg` (filled icons get a `_filled` suffix).
 * The same icon always maps to the same name, so it is uploaded once and
 * reused by every button that picks it.
 */
export function fluentIconWebResourceName(
	publisherPrefix: string,
	pascalName: string,
	variant: FluentIconVariant = "regular",
): string {
	const prefix = publisherPrefix.trim().replace(/_+$/, "");
	if (!prefix) throw new Error("A publisher prefix is required to name the icon web resource");
	const suffix = variant === "filled" ? "_filled" : "";
	return `${prefix}_/icons/cbs/${toSnakeCase(pascalName)}${suffix}.svg`;
}
