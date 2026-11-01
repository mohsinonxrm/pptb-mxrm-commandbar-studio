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
 * File name of a Fluent icon's web resource: `<snake_name>.svg`, or
 * `<snake_name>.filled.svg` for the filled variant. A snake-cased icon name
 * never contains a period, so the variant can't collide with another icon:
 * the filled `Star` is `star.filled.svg` while an icon named `StarFilled` is
 * `star_filled.svg`. Regular names are unchanged from the first release; only
 * the filled suffix moved from `_filled` to `.filled`.
 */
export function fluentIconFileName(
	pascalName: string,
	variant: FluentIconVariant = "regular",
): string {
	return `${toSnakeCase(pascalName)}${variant === "filled" ? ".filled" : ""}.svg`;
}

/**
 * Web resource name for a Fluent icon picked in CBS:
 * `<prefix>_/icons/cbs/<file name>` (see fluentIconFileName).
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
	return `${prefix}_/icons/cbs/${fluentIconFileName(pascalName, variant)}`;
}
