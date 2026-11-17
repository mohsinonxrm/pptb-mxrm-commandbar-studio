import { useMemo } from "react";
import { useRibbonStore } from "@/store/ribbonStore";
import { DEFAULT_SIMULATION, useUIStore, type Simulation } from "@/store/uiStore";
import { useModernLocation } from "@/hooks/useModernCommands";
import { useEntityProperties } from "@/hooks/useEntityProperties";
import {
	ribbonRules,
	simulateBar,
	type BarInput,
	type RibbonRules,
	type SimulatedEntry,
} from "@/services/uciPreview/bar";
import type { SimulationContext, UciLocation } from "@/services/uciPreview/rules";
import { simulationContext, uciLocation } from "@/utils/simulation";
import type { RibbonLocation } from "@/types/ribbon";
import type { ClassicModernOverride } from "@/types/modernCommand";

export interface SimulatedPage {
	/** The simulation strip's settings, defaults filled in. */
	simulation: Simulation;
	/** The page the location's bar is on, or null where Simulate doesn't draw one. */
	page: UciLocation | null;
	/** The context the bar was simulated in (null without a page or ribbon). */
	context: SimulationContext | null;
	rules: RibbonRules;
	/** The bar, in order, each entry with its verdict. */
	entries: SimulatedEntry[];
	/** Classic buttons a migrated modern command hides or replaces, by button id (#32). */
	overrides: ReadonlyMap<string, readonly ClassicModernOverride[]>;
	/** What the bar is drawn from: the ribbon's tabs, the modern commands and their overrides. */
	input: BarInput;
}

/**
 * A location's command bar as Simulate shows it (#191): the shared simulation settings applied
 * to the ribbon, with your unpublished changes, and the modern commands. Simulate's page and
 * Properties' "Why it shows here" both read it, so they agree.
 */
export function useSimulatedPage(location: RibbonLocation): SimulatedPage {
	const stored = useUIStore((s) => s.simulation);
	// A simulation remembered before a setting existed gets its default.
	const simulation = useMemo(
		() => ({
			...DEFAULT_SIMULATION,
			...Object.fromEntries(Object.entries(stored ?? {}).filter(([, v]) => v !== undefined)),
		}),
		[stored],
	);
	const ribbon = useRibbonStore((s) => s.ribbons[location]);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const modern = useModernLocation(location);
	const properties = useEntityProperties(ribbon?.entityLogicalName || undefined);
	const page = uciLocation(location, simulation);

	const rules = useMemo(
		() => ribbonRules({ commands, displayRules, enableRules }),
		[commands, displayRules, enableRules],
	);
	const context = useMemo(
		() =>
			page && ribbon
				? simulationContext(page, ribbon.entityLogicalName, simulation, properties)
				: null,
		[page, ribbon, simulation, properties],
	);
	const input = useMemo<BarInput>(
		() => ({
			tabs: ribbon?.tabs ?? [],
			modern: modern.nodes.map((n) => n.command),
			overrides: modern.overrides,
		}),
		[ribbon, modern],
	);
	const entries = useMemo(() => {
		if (!context || !ribbon) return [];
		return simulateBar(input, rules, context, {
			focusedView: simulation.viewSwitch === "focusedView",
			showAs: simulation.viewSwitch === "showAs",
		});
	}, [context, ribbon, input, rules, simulation.viewSwitch]);

	return { simulation, page, context, rules, entries, overrides: modern.overrides, input };
}
