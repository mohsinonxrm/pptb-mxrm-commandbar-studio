import { useCallback } from "react";
import { useLabelTextStore } from "@/store/labelTextStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { displayText } from "@/utils/displayText";
import type { LocLabel } from "@/types/ribbon";

/**
 * displayText with the managed solutions' label texts, re-rendering when they
 * arrive (#6), in the org's base language unless one is given. Pass a
 * control's `source.labelToken` as `token`.
 */
export function useDisplayText(): (
	value: string | undefined | null,
	locLabels: LocLabel[],
	languageCode?: number,
	token?: string,
) => string {
	const managed = useLabelTextStore((s) => s.managed);
	const baseLanguageCode = useRibbonStore((s) => s.baseLanguageCode);
	return useCallback(
		(value, locLabels, languageCode, token) =>
			displayText(value, locLabels, languageCode ?? baseLanguageCode ?? 1033, managed, token),
		[managed, baseLanguageCode],
	);
}
