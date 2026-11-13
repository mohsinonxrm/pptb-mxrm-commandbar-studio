import type { LocLabel, RibbonDefinition, RibbonGroup, RibbonTab } from "@/types/ribbon";
import { extractLocLabelId } from "@/utils/locLabelRef";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { groupControls } from "@/utils/ribbonMenu";

/**
 * Where a tab's or group's translations go (#136): the label its title is published with —
 * as the publish (xmlGenerator.containerTitle, publishPlan's renames) will write it — or why
 * they can't be edited here.
 */
export type TitleTranslationTarget =
	{ labelId: string } | { reason: "not-yours" | "shared" | "kept"; token?: string };

/** Whether anything but `exceptId` in the ribbons refers to `$LocLabels:{labelId}`. */
export function labelUsedElsewhere(
	labelId: string,
	ribbons: Record<string, RibbonDefinition>,
	exceptId: string,
): boolean {
	const ref = `$LocLabels:${labelId}`;
	const refers = (...values: (string | undefined)[]) => values.some((v) => v === ref);
	for (const def of Object.values(ribbons))
		for (const tab of def.tabs) {
			if (tab.id !== exceptId && refers(tab.label, tab.source?.titleToken)) return true;
			for (const group of tab.groups) {
				if (group.id !== exceptId && refers(group.label, group.source?.titleToken))
					return true;
				for (const b of groupControls(group))
					if (
						refers(
							b.label,
							b.tooltipTitle,
							b.tooltipBody,
							b.source?.labelToken,
							b.source?.tooltipTitleToken,
							b.source?.tooltipBodyToken,
						)
					)
						return true;
			}
		}
	return false;
}

export function titleTranslationTarget(input: {
	container: RibbonTab | RibbonGroup;
	/** The container as loaded; undefined when it's new this session. */
	loaded: RibbonTab | RibbonGroup | undefined;
	/** canRenameContainer: only your own tabs and groups. */
	yours: boolean;
	ribbons: Record<string, RibbonDefinition>;
	locLabels: readonly LocLabel[];
	baseLcid: number;
}): TitleTranslationTarget {
	const { container, loaded, yours, ribbons, locLabels, baseLcid } = input;
	if (!yours) return { reason: "not-yours" };
	if (loaded) {
		// A rename sets this label's base title; the other languages are its own.
		const id = extractLocLabelId(loaded.label ?? "");
		if (!id) return { reason: "not-yours" };
		// A rename then gives the tab or group a label of its own: translations of the shared one
		// would change the others' text.
		if (labelUsedElsewhere(id, ribbons, container.id)) return { reason: "shared" };
		return { labelId: id };
	}
	// New this session: a copy or an import keeps its source's title until it's changed.
	const token = container.source?.titleToken;
	if (token) {
		const sourceLabel = extractLocLabelId(token);
		if (sourceLabel && locLabels.some((l) => l.id === sourceLabel)) {
			if (labelUsedElsewhere(sourceLabel, ribbons, container.id)) return { reason: "shared" };
			return { labelId: sourceLabel };
		}
		const kept =
			container.label === token ||
			container.label === resolveDisplayLabel(token, [...locLabels], baseLcid);
		if (kept) return { reason: "kept", token };
	}
	return { labelId: `${container.id}.Title` };
}
