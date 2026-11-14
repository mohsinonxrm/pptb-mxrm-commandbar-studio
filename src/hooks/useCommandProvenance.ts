import React from "react";
import { useRibbonStore } from "@/store/ribbonStore";
import { commandProvenance, type CommandProvenanceInfo } from "@/utils/commandProvenance";

/** Where the command comes from and what Customise / Uncustomise would do (#31). */
export function useCommandProvenance(commandId: string | undefined): CommandProvenanceInfo | null {
	const commands = useRibbonStore((s) => s.commands);
	const baselineCommands = useRibbonStore((s) => s.baselineCommands);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	const customisedCommandIds = useRibbonStore((s) => s.customisedCommandIds);
	const uncustomisedCommandIds = useRibbonStore((s) => s.uncustomisedCommandIds);
	const reloadRequiredCommandIds = useRibbonStore((s) => s.reloadRequiredCommandIds);
	return React.useMemo(
		() =>
			commandId && commands.some((c) => c.id === commandId)
				? commandProvenance(commandId, {
						commands,
						baselineCommands,
						ribbons,
						baseline,
						layers,
						customisedCommandIds,
						uncustomisedCommandIds,
						reloadRequiredCommandIds,
					})
				: null,
		[
			commandId,
			commands,
			baselineCommands,
			ribbons,
			baseline,
			layers,
			customisedCommandIds,
			uncustomisedCommandIds,
			reloadRequiredCommandIds,
		],
	);
}

/**
 * True when the command editor must not change the command (#31): one being
 * uncustomised or needing a reload, and one that isn't yours until you
 * customise it (#186).
 */
export function isCommandReadOnly(info: CommandProvenanceInfo | null): boolean {
	return (
		info?.provenance === "oob" ||
		info?.provenance === "uncustomising" ||
		info?.provenance === "reloadRequired"
	);
}
