import type { RibbonButtonSource } from "@/types/ribbon";

/**
 * The `source` of a copied button (#60). A copy is a new control, so it must
 * not reuse the original's LocLabel tokens or other loaded attributes (#11
 * review N5) — but it keeps the loaded ModernImage and image references (an
 * out-of-the-box name like "Info" or a web resource), or the copy publishes
 * without its icon.
 */
export function sourceForCopy(source: RibbonButtonSource | undefined): RibbonButtonSource | undefined {
	if (!source?.modernImage) return undefined;
	// The loaded image references come too: the generator treats a web-resource
	// image that differs from the loaded one as newly picked, and would let it
	// win over the loaded ModernImage on the copy.
	const attributes: Record<string, string> = { ModernImage: source.modernImage };
	for (const name of ["Image16by16", "Image32by32"]) {
		const v = source.attributes[name];
		if (v) attributes[name] = v;
	}
	return { modernImage: source.modernImage, attributes };
}
