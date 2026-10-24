import { useCallback } from "react";
import { useLabelTextStore } from "@/store/labelTextStore";
import { displayText } from "@/utils/displayText";
import type { LocLabel } from "@/types/ribbon";

/** displayText with the managed solutions' label texts, re-rendering when they arrive (#6). */
export function useDisplayText(): (
	value: string | undefined | null,
	locLabels: LocLabel[],
	languageCode?: number,
) => string {
	const managed = useLabelTextStore((s) => s.managed);
	return useCallback(
		(value, locLabels, languageCode = 1033) =>
			displayText(value, locLabels, languageCode, managed),
		[managed],
	);
}
