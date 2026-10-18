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
		],
	);
}
