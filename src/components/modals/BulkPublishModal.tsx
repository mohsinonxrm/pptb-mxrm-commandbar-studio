import React, { useState } from "react";
import {
	Badge,
	Button,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	Dropdown,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Option,
	ProgressBar,
	Switch,
	Textarea,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import {
	publishAllAsync,
	publishRibbon,
	type PublishVerification,
} from "@/services/dataverse/publishService";
import { fetchLayerSnapshot } from "@/services/dataverse/ribbonLayerService";
import { planScope, type ScopePlan } from "@/services/publishPlan";
import type { RibbonDiffParts } from "@/services/ribbonDiffMerge";
import type { RibbonLocation } from "@/types/ribbon";
import { groupControls } from "@/utils/ribbonMenu";

const useStyles = makeStyles({
	content: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	progressList: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	progressRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
});

type PublishStatus = "pending" | "publishing" | "success" | "error";

const ENTITY_LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form"];

/**
 * Publishes the table being edited (all of its ribbon locations in one
 * import) and, when it changed and the solution allows it, the application
 * ribbon. Only the table loaded in CBS can be published: CBS holds no edits
 * for other tables, and publishing them would only publish whatever someone
 * else left unpublished.
 */
export const BulkPublishModal: React.FC = () => {
	const styles = useStyles();
	const bulkPublishOpen = useUIStore((s) => s.bulkPublishOpen);
	const closeBulkPublish = useUIStore((s) => s.closeBulkPublish);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
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
	const setLayerSnapshot = useRibbonStore((s) => s.setLayerSnapshot);
	const markPublished = useRibbonStore((s) => s.markPublished);
	const mutationsSincePublish = useRibbonStore((s) => s.mutationsSincePublish);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const solutionRibbonComponentIds = useSessionStore((s) => s.solutionRibbonComponentIds);

	// Application-ribbon publish needs the solution to contain Application
	// Ribbons (componenttype 50); otherwise Dataverse rejects the import.
	const solutionSupportsAppRibbon =
		Array.isArray(solutionRibbonComponentIds) && solutionRibbonComponentIds.length > 0;

	const [publishing, setPublishing] = useState(false);
	const [statusMap, setStatusMap] = useState<Record<string, PublishStatus>>({});
	const [done, setDone] = useState(false);
	const [incrementSolutionVersion, setIncrementSolutionVersion] = useState(false);
	const [publishStrategy, setPublishStrategy] = useState<"targeted" | "allAsync">("targeted");
	const [progressMessage, setProgressMessage] = useState("");
	const [publishComment, setPublishComment] = useState("");
	const [solutionVersion, setSolutionVersion] = useState(activeSolution?.version ?? "1.0.0.0");
	const [errorMessages, setErrorMessages] = useState<{ scope: string; message: string }[]>([]);
	// Scopes being published in the current run (frozen when Publish is clicked).
	const [runScopes, setRunScopes] = useState<string[]>([]);
	const [verifications, setVerifications] = useState<{ scope: string; result: PublishVerification }[]>([]);

	const nextVersion = React.useMemo(() => {
		const base = solutionVersion || activeSolution?.version || "1.0.0.0";
		const parts = base.split(".").map((n) => Number.parseInt(n, 10) || 0);
		while (parts.length < 4) parts.push(0);
		parts[3] += 1;
		return parts.slice(0, 4).join(".");
	}, [activeSolution?.version, solutionVersion]);

	React.useEffect(() => {
		setSolutionVersion(activeSolution?.version ?? "1.0.0.0");
	}, [activeSolution?.version]);

	const planFor = React.useCallback(
		(locations: RibbonLocation[], scope: "entity" | "application", excludeCommandIds?: Set<string>): ScopePlan =>
			planScope({
				locations: locations.map((l) => ({ current: ribbons[l], baseline: baseline[l] })),
				excludeCommandIds,
				locLabels,
				baselineLocLabels,
				layer: layers[scope] ?? undefined,
				unhiddenLayerHideIds: pendingUnhides[scope],
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
		],
	);
	const entityPlan = React.useMemo(
		() => (activeEntity ? planFor(ENTITY_LOCATIONS, "entity") : null),
		[activeEntity, planFor],
	);
	// Commands used by the table's buttons are published with the table only:
	// most out-of-the-box commands are shared with the application ribbon, and
	// an edit made for this table must not reach every table.
	const appPlan = React.useMemo(() => {
		const tableCommands = new Set<string>();
		if (activeEntity) {
			for (const l of ENTITY_LOCATIONS)
				for (const tab of ribbons[l].tabs)
					for (const group of tab.groups)
						for (const button of groupControls(group)) if (button.commandId) tableCommands.add(button.commandId);
		}
		return planFor(["Application"], "application", tableCommands);
	}, [planFor, activeEntity, ribbons]);
	const includeApplicationRibbon = appPlan.hasChanges && solutionSupportsAppRibbon;
	const unsupported = [...(entityPlan?.unsupported ?? []), ...appPlan.unsupported];
	const warnings = [...(entityPlan?.warnings ?? []), ...appPlan.warnings];
	const scopes = [
		...(activeEntity && entityPlan?.hasChanges ? [activeEntity.logicalName] : []),
		...(includeApplicationRibbon ? ["Application ribbon"] : []),
	];

	const handlePublish = async () => {
		if (!activeSolution || unsupported.length > 0 || scopes.length === 0) return;
		setPublishing(true);
		setProgressMessage("");
		setErrorMessages([]);
		setVerifications([]);
		setRunScopes(scopes);
		setStatusMap(Object.fromEntries(scopes.map((s) => [s, "pending" as PublishStatus])));

		let hadError = false;
		const published: RibbonLocation[] = [];
		// The layers as imported: the store takes their scaling / labels (#66 review).
		const importedLayers: { entity?: RibbonDiffParts; application?: RibbonDiffParts } = {};
		const errors: { scope: string; message: string }[] = [];
		const verified: { scope: string; result: PublishVerification }[] = [];
		const logs = useRuntimeLogStore.getState();
		const fmt = (e: unknown) => (e instanceof Error ? e.message : String(e));
		const common = {
			commands,
			enableRules,
			displayRules,
			locLabels,
			publishCustomizations: true,
			solution: {
				uniqueName: activeSolution.uniqueName,
				friendlyName: activeSolution.friendlyName,
				version: incrementSolutionVersion ? nextVersion : solutionVersion,
				publisherUniqueName: activeSolution.publisherUniqueName,
				publisherName: activeSolution.publisherName,
				publisherPrefix: activeSolution.publisherPrefix || publisherPrefix,
				publisherOptionValuePrefix: activeSolution.publisherOptionValuePrefix,
			},
		};

		if (activeEntity && entityPlan?.hasChanges) {
			const scope = activeEntity.logicalName;
			setStatusMap((prev) => ({ ...prev, [scope]: "publishing" }));
			try {
				// One import for the whole table: each import REPLACES the table's
				// unmanaged ribbon, so all locations travel together, merged onto
				// the existing layer (#11).
				const result = await publishRibbon(
					{
						...common,
						entity: {
							logicalName: activeEntity.logicalName,
							schemaName: activeEntity.schemaName,
							displayName: activeEntity.displayName,
						},
						locations: ENTITY_LOCATIONS.map((l) => ({ current: ribbons[l], baseline: baseline[l] })),
						plan: entityPlan,
					},
					(msg) => setProgressMessage(msg),
				);
				published.push(...ENTITY_LOCATIONS);
				importedLayers.entity = result.parts;
				if (result.verification) verified.push({ scope, result: result.verification });
				setStatusMap((prev) => ({ ...prev, [scope]: "success" }));
			} catch (err) {
				hadError = true;
				errors.push({ scope, message: fmt(err) });
				logs.logError("publish", `Ribbon publish failed (${scope}): ${fmt(err)}`);
				setStatusMap((prev) => ({ ...prev, [scope]: "error" }));
			}
		} else if (activeEntity) {
			published.push(...ENTITY_LOCATIONS); // nothing changed there
		}

		if (includeApplicationRibbon) {
			const scope = "Application ribbon";
			setStatusMap((prev) => ({ ...prev, [scope]: "publishing" }));
			try {
				const result = await publishRibbon(
					{
						...common,
						entity: null,
						locations: [{ current: ribbons.Application, baseline: baseline.Application }],
						ribbonCustomizationIds: solutionRibbonComponentIds ?? [],
						plan: appPlan,
					},
					(msg) => setProgressMessage(msg),
				);
				published.push("Application");
				importedLayers.application = result.parts;
				if (result.verification) verified.push({ scope, result: result.verification });
				setStatusMap((prev) => ({ ...prev, [scope]: "success" }));
			} catch (err) {
				hadError = true;
				errors.push({ scope, message: fmt(err) });
				logs.logError("publish", `Application ribbon publish failed: ${fmt(err)}`);
				setStatusMap((prev) => ({ ...prev, [scope]: "error" }));
			}
		} else if (!appPlan.hasChanges) {
			published.push("Application"); // nothing changed there
		}

		if (!hadError && publishStrategy === "allAsync") {
			try {
				await publishAllAsync((msg) => setProgressMessage(msg));
			} catch (err) {
				hadError = true;
				errors.push({ scope: "Publish all customizations", message: fmt(err) });
			}
		}

		// Only scopes that were actually imported (or had nothing to import) are
		// marked as published; anything else keeps its pending changes.
		markPublished(published, importedLayers);
		// Re-read the layers that were published so ownership, labels and the
		// "Hidden by customizations" list match the server (#47, #48).
		if (activeEntity && published.includes("HomepageGrid") && entityPlan?.hasChanges) {
			setLayerSnapshot("entity", await fetchLayerSnapshot(activeEntity.logicalName));
		}
		if (published.includes("Application") && includeApplicationRibbon) {
			setLayerSnapshot("application", await fetchLayerSnapshot(null));
		}
		if (!hadError) setProgressMessage("Done.");
		setVerifications(verified);
		setErrorMessages(errors);
		setDone(!hadError);
		setPublishing(false);
		void publishComment;
	};

	const handleClose = () => {
		setPublishing(false);
		setStatusMap({});
		setRunScopes([]);
		setDone(false);
		setProgressMessage("");
		setErrorMessages([]);
		setVerifications([]);
		closeBulkPublish();
	};

	return (
		<Dialog open={bulkPublishOpen} onOpenChange={() => !publishing && handleClose()}>
			<DialogSurface
				style={{ maxWidth: "640px", maxHeight: "92vh", display: "flex", flexDirection: "column" }}
			>
				<DialogTitle>Publish to Dataverse</DialogTitle>
				<DialogBody style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
					<DialogContent style={{ overflowY: "auto", maxHeight: "100%" }}>
						<div className={styles.content}>
							{!activeSolution && (
								<MessageBar intent="warning">
									<MessageBarBody>No solution selected. Please select a solution first.</MessageBarBody>
								</MessageBar>
							)}

							{unsupported.length > 0 && !done && (
								<MessageBar intent="error" layout="multiline">
									<MessageBarBody>
										<strong>These changes can&apos;t be published yet. Undo them to publish:</strong>
										<ul style={{ margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: 20 }}>
											{unsupported.map((u) => (
												<li key={u}>{u}</li>
											))}
										</ul>
									</MessageBarBody>
								</MessageBar>
							)}

							{warnings.length > 0 && !done && (
								<MessageBar intent="info" layout="multiline">
									<MessageBarBody>
										<strong>Good to know:</strong>
										<ul style={{ margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: 20 }}>
											{warnings.map((w) => (
												<li key={w}>{w}</li>
											))}
										</ul>
									</MessageBarBody>
								</MessageBar>
							)}

							{appPlan.hasChanges && !solutionSupportsAppRibbon && !done && (
								<MessageBar intent="warning" layout="multiline">
									<MessageBarBody>
										You changed the Application ribbon, but this solution doesn&apos;t include the
										Application Ribbons component, so those changes stay pending. In make.powerapps.com
										open the solution, choose <strong>Add existing → Application Ribbons</strong>, then
										reload here.
									</MessageBarBody>
								</MessageBar>
							)}

							<MessageBar intent="info" layout="multiline">
								<MessageBarBody>
									Publishing writes this table&apos;s complete ribbon customization: what is already
									published, plus your changes. Ribbon changes on this table that were imported
									elsewhere but <strong>not published</strong> are replaced. Publishing takes about 1–4
									minutes (the ribbon is imported twice so Unified Interface picks up the change). Users may need to refresh the page, or navigate away and back, to see the
									update. You have <strong>{mutationsSincePublish}</strong> change(s) since the last
									publish.
								</MessageBarBody>
							</MessageBar>

							{errorMessages.length > 0 && (
								<MessageBar intent="error" layout="multiline">
									<MessageBarBody>
										<strong>
											Publish failed ({errorMessages.length} error
											{errorMessages.length !== 1 ? "s" : ""})
										</strong>
										<ul style={{ margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: 20 }}>
											{errorMessages.map((e, i) => (
												<li key={i} style={{ fontFamily: tokens.fontFamilyMonospace }}>
													<strong>{e.scope}:</strong> {e.message}
												</li>
											))}
										</ul>
										<div style={{ marginTop: tokens.spacingVerticalS }}>
											Full details are in the <strong>Console</strong> tab of the bottom panel.
										</div>
									</MessageBarBody>
								</MessageBar>
							)}

							{!publishing && !done && (
								<>
									<Text>
										<strong>Will publish:</strong>{" "}
										{scopes.length > 0 ? scopes.join(", ") : "nothing (there are no changes to publish)"}
									</Text>
									<Field label="Afterwards">
										<Dropdown
											value={
												publishStrategy === "targeted"
													? "Publish only these ribbons"
													: "Also publish all customizations (PublishAllXmlAsync)"
											}
											selectedOptions={[publishStrategy]}
											onOptionSelect={(_, data) => {
												if (data.optionValue === "targeted" || data.optionValue === "allAsync") {
													setPublishStrategy(data.optionValue);
												}
											}}
										>
											<Option value="targeted">Publish only these ribbons</Option>
											<Option value="allAsync">
												Also publish all customizations (PublishAllXmlAsync)
											</Option>
										</Dropdown>
									</Field>
									<Field label="Solution version">
										<Input
											size="small"
											value={incrementSolutionVersion ? nextVersion : solutionVersion}
											onChange={(_, d) => setSolutionVersion(d.value)}
											disabled={incrementSolutionVersion}
										/>
									</Field>
									<Switch
										label="Increment solution version"
										checked={incrementSolutionVersion}
										onChange={(_, d) => setIncrementSolutionVersion(d.checked === true)}
									/>
									<Field label="Publish comment">
										<Textarea
											resize="vertical"
											value={publishComment}
											onChange={(_, d) => setPublishComment(d.value)}
										/>
									</Field>
									<Button
										appearance="subtle"
										onClick={() => {
											openXmlDrawer();
											closeBulkPublish();
										}}
									>
										View RibbonDiffXml
									</Button>
								</>
							)}

							{done && (
								<MessageBar intent="info" layout="multiline">
									<MessageBarBody>
										Unified Interface caches command bars by metadata version, and publishing a ribbon
										doesn&apos;t always change that version. If the app still shows the old command bar,
										hard-refresh the page (Ctrl+F5) or sign out and back in; it can take several minutes
										to appear for users who already had the table open.
									</MessageBarBody>
								</MessageBar>
							)}

							{verifications.map((v) => (
								<MessageBar key={v.scope} intent={v.result.ok ? "success" : "warning"} layout="multiline">
									<MessageBarBody>
										<strong>{v.scope}:</strong> {v.result.message}
									</MessageBarBody>
								</MessageBar>
							))}

							{(publishing || done) && (
								<div className={styles.progressList}>
									{runScopes.map((target) => {
										const status = statusMap[target] ?? "pending";
										return (
											<div key={target} className={styles.progressRow}>
												<Badge
													appearance="filled"
													color={
														status === "success"
															? "success"
															: status === "error"
																? "danger"
																: status === "publishing"
																	? "informative"
																	: "subtle"
													}
													size="small"
												>
													{status}
												</Badge>
												<Text>{target}</Text>
												{status === "publishing" && (
													<ProgressBar thickness="large" style={{ flex: 1 }} />
												)}
											</div>
										);
									})}
									{progressMessage && (
										<MessageBar intent="info">
											<MessageBarBody>{progressMessage}</MessageBarBody>
										</MessageBar>
									)}
								</div>
							)}
						</div>
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={handleClose} disabled={publishing}>
							{done ? "Close" : "Cancel"}
						</Button>
						{!done && (
							<Button
								appearance="primary"
								onClick={() => void handlePublish()}
								disabled={
									publishing || !activeSolution || scopes.length === 0 || unsupported.length > 0
								}
							>
								{publishing ? "Publishing..." : "Publish"}
							</Button>
						)}
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default BulkPublishModal;
