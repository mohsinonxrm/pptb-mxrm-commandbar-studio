import React, { useState } from "react";
import {
	Badge,
	Button,
	Checkbox,
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
	publishUsingPublishXml,
} from "@/services/dataverse/publishService";
import { summarizeRibbonDiff } from "@/services/xmlGenerator";

const useStyles = makeStyles({
	content: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	entityList: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		maxHeight: "240px",
		overflowY: "auto",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		padding: tokens.spacingVerticalXS,
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
	const locLabels = useRibbonStore((s) => s.locLabels);
	const markPublished = useRibbonStore((s) => s.markPublished);
	const mutationsSincePublish = useRibbonStore((s) => s.mutationsSincePublish);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const entities = useSessionStore((s) => s.entities);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const solutionRibbonComponentIds = useSessionStore(
		(s) => s.solutionRibbonComponentIds,
	);

	// Application-ribbon publish is only meaningful when the user's solution
	// has the application ribbon registered as a component (componenttype=50).
	// Without that, Dataverse rejects the import with 0x8004803a regardless
	// of how the customizations.xml is constructed.
	const solutionSupportsAppRibbon =
		Array.isArray(solutionRibbonComponentIds) && solutionRibbonComponentIds.length > 0;

	const [selectedEntities, setSelectedEntities] = useState<string[]>(
		activeEntity ? [activeEntity.logicalName] : [],
	);
	// Default to OFF — opt-in. Was previously ON, which caused empty-diff
	// imports for every publish even when the user never touched the
	// application ribbon. Auto-off also avoids the 0x8004803a footgun when
	// the user's solution doesn't include Application Ribbons.
	const [includeApplicationRibbon, setIncludeApplicationRibbon] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [statusMap, setStatusMap] = useState<Record<string, PublishStatus>>({});
	const [done, setDone] = useState(false);
	const [incrementSolutionVersion, setIncrementSolutionVersion] = useState(false);
	const [publishDependencies, setPublishDependencies] = useState(true);
	const [publishStrategy, setPublishStrategy] = useState<"targeted" | "allAsync">("targeted");
	const [progressMessage, setProgressMessage] = useState("");
	const [publishComment, setPublishComment] = useState("");
	const [solutionVersion, setSolutionVersion] = useState(activeSolution?.version ?? "1.0.0.0");
	const [errorMessages, setErrorMessages] = useState<{ scope: string; message: string }[]>([]);

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

	const toggleEntity = (logicalName: string) => {
		setSelectedEntities((prev) =>
			prev.includes(logicalName)
				? prev.filter((entityName) => entityName !== logicalName)
				: [...prev, logicalName],
		);
	};

	const setTargetStatus = (status: PublishStatus) => {
		setStatusMap((prev) => {
			const next = { ...prev };
			for (const entityName of selectedEntities) next[entityName] = status;
			if (includeApplicationRibbon) next.Application = status;
			return next;
		});
	};

	const handlePublish = async (mode: "publish" | "save") => {
		if (!activeSolution) return;
		setPublishing(true);
		setProgressMessage("");
		setErrorMessages([]);

		const initial: Record<string, PublishStatus> = {};
		selectedEntities.forEach((entityName) => (initial[entityName] = "pending"));
		if (includeApplicationRibbon) initial.Application = "pending";
		setStatusMap(initial);

		let hadError = false;
		const errors: { scope: string; message: string }[] = [];
		const logs = useRuntimeLogStore.getState();
		const fmt = (e: unknown) => (e instanceof Error ? e.message : String(e));

		if (activeEntity && selectedEntities.includes(activeEntity.logicalName)) {
			setStatusMap((prev) => ({ ...prev, [activeEntity.logicalName]: "publishing" }));
			// Skip scopes that have no diff vs. baseline. Otherwise we round-trip
			// an empty RibbonDiffXml through the import pipeline and risk a
			// failure on a scope the user never touched.
			const entityScopesWithChanges = (["HomepageGrid", "SubGrid", "Form"] as const).filter(
				(loc) => summarizeRibbonDiff(ribbons[loc], baseline[loc]).hasAnyChange,
			);
			if (entityScopesWithChanges.length === 0) {
				logs.logInfo(
					"publish",
					`Entity ribbon publish skipped (${activeEntity.logicalName}) — no changes vs. baseline.`,
				);
				setStatusMap((prev) => ({ ...prev, [activeEntity.logicalName]: "success" }));
			} else {
				try {
					for (const location of entityScopesWithChanges) {
						logs.logInfo(
							"publish",
							`Publishing ${location} ribbon for ${activeEntity.logicalName}…`,
						);
						await publishRibbon(
							{
								current: ribbons[location],
								baseline: baseline[location],
								commands,
								displayRules,
								enableRules,
								locLabels,
								entityLogicalName: activeEntity.logicalName,
								solutionUniqueName: activeSolution.uniqueName,
								publisherUniqueName: activeSolution.publisherUniqueName,
								publisherName: activeSolution.publisherName,
								publisherPrefix: activeSolution.publisherPrefix || publisherPrefix,
								solutionVersion: incrementSolutionVersion ? nextVersion : solutionVersion,
								publishCustomizations: false,
							},
							(msg) => setProgressMessage(msg),
						);
					}
					setStatusMap((prev) => ({ ...prev, [activeEntity.logicalName]: "success" }));
				} catch (err) {
					hadError = true;
					const message = fmt(err);
					errors.push({ scope: activeEntity.logicalName, message });
					logs.logError(
						"publish",
						`Entity ribbon publish failed (${activeEntity.logicalName}): ${message}`,
					);
					setStatusMap((prev) => ({ ...prev, [activeEntity.logicalName]: "error" }));
				}
			}
		}

		if (includeApplicationRibbon) {
			// Skip Application-ribbon publish entirely if the user hasn't actually
			// touched it. The previous behavior published a synthetic empty diff
			// every time, which (a) was wasteful and (b) surfaced unrelated
			// errors like 0x8004803a (component-type-50 not declared) on the
			// Application path even when the user only edited an entity ribbon.
			const appSummary = summarizeRibbonDiff(ribbons.Application, baseline.Application);
			if (!appSummary.hasAnyChange) {
				logs.logInfo("publish", "Application ribbon publish skipped — no changes vs. baseline.");
				setStatusMap((prev) => ({ ...prev, Application: "success" }));
			} else {
				setStatusMap((prev) => ({ ...prev, Application: "publishing" }));
				try {
					await publishRibbon(
						{
							current: ribbons.Application,
							baseline: baseline.Application,
							commands,
							displayRules,
							enableRules,
							locLabels,
							entityLogicalName: "{!EntityLogicalName}",
							solutionUniqueName: activeSolution.uniqueName,
							publisherUniqueName: activeSolution.publisherUniqueName,
							publisherName: activeSolution.publisherName,
							publisherPrefix: activeSolution.publisherPrefix || publisherPrefix,
							solutionVersion: incrementSolutionVersion ? nextVersion : solutionVersion,
							ribbonCustomizationIds: solutionRibbonComponentIds ?? [],
							publishCustomizations: false,
						},
						(msg) => setProgressMessage(msg),
					);
					setStatusMap((prev) => ({ ...prev, Application: "success" }));
				} catch (err) {
					hadError = true;
					const message = fmt(err);
					errors.push({ scope: "Application ribbon", message });
					logs.logError("publish", `Application ribbon publish failed: ${message}`);
					setStatusMap((prev) => ({ ...prev, Application: "error" }));
				}
			}
		}

		if (mode === "publish" && !hadError) {
			try {
				setTargetStatus("publishing");
				if (publishStrategy === "targeted") {
					await publishUsingPublishXml(
						{
							entityLogicalNames: selectedEntities,
							includeApplicationRibbon,
							publishDependencies,
						},
						(msg) => setProgressMessage(msg),
					);
				} else {
					await publishAllAsync((msg) => setProgressMessage(msg));
				}
				setTargetStatus("success");
				markPublished();
			} catch (err) {
				hadError = true;
				const message = fmt(err);
				errors.push({ scope: "Publish customizations", message });
				logs.logError("publish", `Publish customizations failed: ${message}`);
				setTargetStatus("error");
			}
		}

		setErrorMessages(errors);
		setDone(!hadError);
		setPublishing(false);
		void publishComment;
	};

	const handleClose = () => {
		setPublishing(false);
		setStatusMap({});
		setDone(false);
		setProgressMessage("");
		setErrorMessages([]);
		closeBulkPublish();
	};

	return (
		<Dialog open={bulkPublishOpen} onOpenChange={() => !publishing && handleClose()}>
			<DialogSurface
				style={{
					maxWidth: "640px",
					// Cap the surface height to the viewport so the dialog never
					// overflows the screen (the entity checkbox list + strategy
					// dropdown + version field + publish comment can push past
					// the bottom on shorter PPTB layouts). The inner content
					// scrolls instead.
					maxHeight: "92vh",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<DialogTitle>Publish to Dataverse</DialogTitle>
				<DialogBody style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
					<DialogContent style={{ overflowY: "auto", maxHeight: "100%" }}>
						<div className={styles.content}>
							{!activeSolution && (
								<MessageBar intent="warning">
									<MessageBarBody>
										No solution selected. Please select a solution first.
									</MessageBarBody>
								</MessageBar>
							)}

							<MessageBar intent="info">
								<MessageBarBody>
									Publishing typically takes 5-30 seconds per table. Open users will see the updated
									ribbon on next page load. You have <strong>{mutationsSincePublish}</strong>{" "}
									change(s) since last publish.
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
									<Text weight="semibold">Select tables to publish:</Text>
									<div style={{ display: "flex", gap: tokens.spacingHorizontalS }}>
										<Button
											appearance="subtle"
											size="small"
											onClick={() =>
												setSelectedEntities(entities.map((entity) => entity.logicalName))
											}
										>
											Select all
										</Button>
										<Button
											appearance="subtle"
											size="small"
											onClick={() => setSelectedEntities([])}
										>
											Deselect all
										</Button>
									</div>
									<div className={styles.entityList}>
										{entities.map((entity) => (
											<Checkbox
												key={entity.logicalName}
												label={`${entity.displayName || entity.logicalName} (${entity.logicalName})`}
												checked={selectedEntities.includes(entity.logicalName)}
												onChange={() => toggleEntity(entity.logicalName)}
											/>
										))}
									</div>
									<div>
										<Checkbox
											label="Include Application Ribbon"
											checked={includeApplicationRibbon && solutionSupportsAppRibbon}
											disabled={!solutionSupportsAppRibbon}
											onChange={(_, d) => setIncludeApplicationRibbon(d.checked === true)}
										/>
										{!solutionSupportsAppRibbon && (
											<Text
												size={100}
												style={{
													color: tokens.colorNeutralForeground3,
													display: "block",
													marginLeft: 28,
													marginTop: 2,
												}}
											>
												This solution doesn't include the Application Ribbon component. In
												maker.powerapps.com, open the solution and choose{" "}
												<strong>Add existing → Application Ribbons</strong>, then reload here.
											</Text>
										)}
									</div>
									<Field label="Publish strategy">
										<Dropdown
											selectedOptions={[publishStrategy]}
											onOptionSelect={(_, data) => {
												if (data.optionValue === "targeted" || data.optionValue === "allAsync") {
													setPublishStrategy(data.optionValue);
												}
											}}
										>
											<Option value="targeted">Targeted publish (PublishXml)</Option>
											<Option value="allAsync">Async publish all (PublishAllXmlAsync)</Option>
										</Dropdown>
									</Field>
									<MessageBar intent="info">
										<MessageBarBody>
											{publishStrategy === "targeted"
												? "Targeted mode publishes selected tables/components using PublishXml."
												: "Async mode runs PublishAllXmlAsync and tracks the background system job."}
										</MessageBarBody>
									</MessageBar>
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
									<Checkbox
										label="Publish dependencies (commands, rules, web resources)"
										checked={publishDependencies}
										onChange={(_, d) => setPublishDependencies(d.checked === true)}
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

							{(publishing || done) && (
								<div className={styles.progressList}>
									{[...selectedEntities, ...(includeApplicationRibbon ? ["Application"] : [])].map(
										(target) => {
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
										},
									)}
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
							<>
								<Button
									appearance="secondary"
									onClick={() => void handlePublish("save")}
									disabled={
										publishing ||
										(selectedEntities.length === 0 && !includeApplicationRibbon) ||
										!activeSolution
									}
								>
									Save only
								</Button>
								<Button
									appearance="primary"
									onClick={() => void handlePublish("publish")}
									disabled={
										publishing ||
										(selectedEntities.length === 0 && !includeApplicationRibbon) ||
										!activeSolution
									}
								>
									{publishing
										? "Publishing..."
										: `Publish (${selectedEntities.length + (includeApplicationRibbon ? 1 : 0)})`}
								</Button>
							</>
						)}
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default BulkPublishModal;
