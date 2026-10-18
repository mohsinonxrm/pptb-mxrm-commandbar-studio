import type { RibbonButtonSource } from "@/types/ribbon";

/**
 * The `source` of a copied button (#60). A copy is a new control, so it must
 * not reuse the original's LocLabel tokens or other loaded attributes (#11
 * review N5) — but it keeps the loaded ModernImage (an out-of-the-box name
 * like "Info" or a web resource), or the copy publishes without an icon.
 */
export function sourceForCopy(source: RibbonButtonSource | undefined): RibbonButtonSource | undefined {
	if (!source?.modernImage) return undefined;
	return { modernImage: source.modernImage, attributes: { ModernImage: source.modernImage } };
}
