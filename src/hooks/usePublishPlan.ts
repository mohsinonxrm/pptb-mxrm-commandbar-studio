import { useCallback, useMemo } from "react";
import { useDisplayText } from "@/hooks/useDisplayText";
import { planScope, type ScopePlan } from "@/services/publishPlan";
import { summarizePublish, type PublishChange } from "@/services/publishSummary";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import type { RibbonLocation } from "@/types/ribbon";
import { groupControls } from "@/utils/ribbonMenu";

export const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

export interface PublishPlan {
	/** The table's three locations; null without a table. */
	entityPlan: ScopePlan | null;
	appPlan: ScopePlan;
	/** Whether the solution has the Application Ribbons component the application ribbon's import needs. */
	solutionSupportsAppRibbon: boolean;
	includeApplicationRibbon: boolean;
	/** What is imported: the table's logical name and / or "Application ribbon". */
	scopes: string[];
	unsupported: string[];
	warnings: string[];
	/** What Publish writes, one row per change (#188); the top bar counts them. */
	changes: PublishChange[];
}

/**
 * The publish plan of the loaded table and the application ribbon (#188):
 * the publish dialog publishes it and the top bar counts its changes, so the
 * two never disagree.
 */
export function usePublishPlan(): PublishPlan {
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const baselineCommands = useRibbonStore((s) => s.baselineCommands);
	const baselineEnableRules = useRibbonStore((s) => s.baselineEnableRules);
	const baselineDisplayRules = useRibbonStore((s) => s.baselineDisplayRules);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const baselineLocLabels = useRibbonStore((s) => s.baselineLocLabels);
	const layers = useRibbonStore((s) => s.layers);
	const pendingUnhides = useRibbonStore((s) => s.pendingUnhides);
	const orphans = useRibbonStore((s) => s.orphans);
	const pendingOrphanDeletes = useRibbonStore((s) => s.pendingOrphanDeletes);
	const customisedCommandIds = useRibbonStore((s) => s.customisedCommandIds);
	const uncustomisedCommandIds = useRibbonStore((s) => s.uncustomisedCommandIds);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const solutionRibbonComponentIds = useSessionStore((s) => s.solutionRibbonComponentIds);
	const captionOf = useDisplayText();

	// Application-ribbon publish needs the solution to contain Application
	// Ribbons (componenttype 50); otherwise Dataverse rejects the import.
	const solutionSupportsAppRibbon =
		Array.isArray(solutionRibbonComponentIds) && solutionRibbonComponentIds.length > 0;

	const planFor = useCallback(
		(
			locations: RibbonLocation[],
			scope: "entity" | "application",
			excludeCommandIds?: Set<string>,
		): ScopePlan =>
			planScope({
				locations: locations.map((l) => ({ current: ribbons[l], baseline: baseline[l] })),
				excludeCommandIds,
				locLabels,
				baselineLocLabels,
				layer: layers[scope] ?? undefined,
				unhiddenLayerHideIds: pendingUnhides[scope],
				deletedOrphans: orphans[scope].filter((o) =>
					pendingOrphanDeletes[scope].includes(o.id),
				),
				customisedCommandIds,
				// Per scope: uncustomising for the table leaves the application ribbon's copy (#31).
				uncustomisedCommandIds: uncustomisedCommandIds[scope],
				commands,
				baselineCommands,
				enableRules,
				baselineEnableRules,
				displayRules,
				baselineDisplayRules,
			}),
		[
			ribbons,
			baseline,
			commands,
			baselineCommands,
			enableRules,
			baselineEnableRules,
			displayRules,
			baselineDisplayRules,
			locLabels,
			baselineLocLabels,
			layers,
			pendingUnhides,
			orphans,
			pendingOrphanDeletes,
			customisedCommandIds,
			uncustomisedCommandIds,
		],
	);
	const entityPlan = useMemo(
		() => (activeEntity ? planFor(ENTITY_LOCATIONS, "entity") : null),
		[activeEntity, planFor],
	);
	// Commands used by the table's buttons are published with the table only:
	// most out-of-the-box commands are shared with the application ribbon, and
	// an edit made for this table must not reach every table.
	const appPlan = useMemo(() => {
		const tableCommands = new Set<string>();
		if (activeEntity) {
			for (const l of ENTITY_LOCATIONS)
				for (const tab of ribbons[l].tabs)
					for (const group of tab.groups)
						for (const button of groupControls(group))
							if (button.commandId) tableCommands.add(button.commandId);
		}
		return planFor(["Application"], "application", tableCommands);
	}, [planFor, activeEntity, ribbons]);
	const includeApplicationRibbon = appPlan.hasChanges && solutionSupportsAppRibbon;

	const changes = useMemo(() => {
		const summarize = (locations: RibbonLocation[], plan: ScopePlan) =>
			summarizePublish({
				locations: locations.map((l) => ({ current: ribbons[l], baseline: baseline[l] })),
				plan,
				baselineCommands,
				baselineEnableRuleIds: baselineEnableRules.map((r) => r.id),
				baselineDisplayRuleIds: baselineDisplayRules.map((r) => r.id),
				buttonName: (b) =>
					captionOf(b.label, locLabels, undefined, b.source?.labelToken) || b.id,
				titleOf: (label) => captionOf(label, locLabels) || label,
			});
		return [
			...(entityPlan?.hasChanges ? summarize(ENTITY_LOCATIONS, entityPlan) : []),
			...(includeApplicationRibbon ? summarize(["Application"], appPlan) : []),
		];
	}, [
		entityPlan,
		appPlan,
		includeApplicationRibbon,
		ribbons,
		baseline,
		baselineCommands,
		baselineEnableRules,
		baselineDisplayRules,
		locLabels,
		captionOf,
	]);

	return {
		entityPlan,
		appPlan,
		solutionSupportsAppRibbon,
		includeApplicationRibbon,
		scopes: [
			...(activeEntity && entityPlan?.hasChanges ? [activeEntity.logicalName] : []),
			...(includeApplicationRibbon ? ["Application ribbon"] : []),
		],
		unsupported: [...(entityPlan?.unsupported ?? []), ...appPlan.unsupported],
		warnings: [...(entityPlan?.warnings ?? []), ...appPlan.warnings],
		changes,
	};
}
