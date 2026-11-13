import { useEffect, useState } from "react";
import { ENTITY_LOCATIONS, usePublishPlan } from "@/hooks/usePublishPlan";
import { buildMergedRibbonDiffXml } from "@/services/dataverse/publishService";
import { serializeRibbonDiffParts } from "@/services/ribbonDiffMerge";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";

/** What Compare with published shows (#216). */
export interface PublishCompare {
	/**
	 * "loading" while the layer is read; "ready" when `before` / `after` are the layer as
	 * published and the RibbonDiffXml Publish would import; "fallback" when Compare shows the
	 * generated XML instead, `note` saying why.
	 */
	status: "loading" | "ready" | "fallback";
	before: string;
	after: string;
	note?: string;
}

const FALLBACK: PublishCompare = { status: "fallback", before: "", after: "" };

/**
 * Compare with published, built the way Publish builds its import (#216): the table's (and,
 * when it's published too, the application ribbon's) unmanaged layer as read, against that
 * layer with this session's changes merged in — tab order and the other merge-only output
 * included. The generated XML alone missed those, so a moved tab showed +0 / −0.
 */
export function usePublishCompare(enabled: boolean): PublishCompare {
	const { entityPlan, appPlan, includeApplicationRibbon, unsupported } = usePublishPlan();
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const commands = useRibbonStore((s) => s.commands);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const languageCode = useRibbonStore((s) => s.baseLanguageCode);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const [result, setResult] = useState<PublishCompare>({ ...FALLBACK, status: "loading" });

	const blocked = unsupported.join("\n");
	useEffect(() => {
		if (!enabled) return;
		if (blocked) {
			setResult({
				...FALLBACK,
				note: "Publish can't write some of these changes yet (the publish dialog says which), so this compares the XML generated from your changes.",
			});
			return;
		}
		const common = { commands, enableRules, displayRules, locLabels, languageCode };
		const scopes = [
			...(activeEntity && entityPlan?.hasChanges
				? [
						{
							name: activeEntity.logicalName,
							run: () =>
								buildMergedRibbonDiffXml({
									...common,
									entity: {
										logicalName: activeEntity.logicalName,
										schemaName: activeEntity.schemaName,
									},
									locations: ENTITY_LOCATIONS.map((l) => ({
										current: ribbons[l],
										baseline: baseline[l],
									})),
									plan: entityPlan,
								}),
						},
					]
				: []),
			...(includeApplicationRibbon
				? [
						{
							name: "Application ribbon",
							run: () =>
								buildMergedRibbonDiffXml({
									...common,
									entity: null,
									locations: [
										{
											current: ribbons.Application,
											baseline: baseline.Application,
										},
									],
									plan: appPlan,
								}),
						},
					]
				: []),
		];
		// Nothing Publish would write (e.g. only label lookups changed): the generated XML.
		if (scopes.length === 0) {
			setResult(FALLBACK);
			return;
		}
		let cancelled = false;
		setResult((r) => ({ ...r, status: "loading" }));
		Promise.all(scopes.map(async (s) => ({ name: s.name, merged: await s.run() })))
			.then((built) => {
				if (cancelled) return;
				const many = built.length > 1;
				const join = (side: (m: (typeof built)[number]["merged"]) => string) =>
					built
						.map((b) => (many ? `<!-- ${b.name} -->\n` : "") + side(b.merged))
						.join("\n\n");
				setResult({
					status: "ready",
					before: join((m) => serializeRibbonDiffParts(m.layer)),
					after: join((m) => m.xml),
				});
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setResult({
					...FALLBACK,
					note: `Couldn't build what Publish writes (${err instanceof Error ? err.message : String(err)}), so this compares the XML generated from your changes.`,
				});
			});
		return () => {
			cancelled = true;
		};
	}, [
		enabled,
		blocked,
		activeEntity,
		entityPlan,
		appPlan,
		includeApplicationRibbon,
		ribbons,
		baseline,
		commands,
		enableRules,
		displayRules,
		locLabels,
		languageCode,
	]);

	return result;
}
