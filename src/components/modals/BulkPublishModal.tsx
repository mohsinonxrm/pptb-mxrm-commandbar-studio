import { getPrimaryConnection, writeGuard } from "@/services/hostConnection";
import { requiresTypedConfirmation } from "@/components/shared/targetScopeRules";
import React, { useState } from "react";
import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
	Badge,
	Button,
	Caption1,
	Checkbox,
	Dropdown,
	Field,
	Input,
	MessageBar,
	MessageBarActions,
	MessageBarBody,
	MessageBarTitle,
	Option,
	ProgressBar,
	Spinner,
	Switch,
	Textarea,
	Text,
	makeStyles,
	tokens,
	type BadgeProps,
} from "@fluentui/react-components";
import {
	AddRegular,
	ArrowLeftRegular,
	ArrowMoveRegular,
	CodeRegular,
	CopyRegular,
	DeleteRegular,
	EditRegular,
	EyeOffRegular,
	EyeRegular,
} from "@fluentui/react-icons";
import { AppDialog } from "@/components/shared/AppDialog";
import { MonacoEditor } from "@/components/shared/MonacoEditor";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { withCloseGuard } from "@/utils/pptbRuntime";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import {
	checkBeforePublish,
	publishAllAsync,
	publishRibbon,
	withCheckTimeout,
	type PublishVerification,
} from "@/services/dataverse/publishService";
import { fetchLayerSnapshot } from "@/services/dataverse/ribbonLayerService";
import { rememberPublish } from "@/utils/recentPublish";
import { loadWebResourceStatus } from "@/services/dataverse/webResourceService";
import type { RibbonDiffParts } from "@/services/ribbonDiffMerge";
import type { PublishChangeKind } from "@/services/publishSummary";
import type { PublishFinding } from "@/services/xmlValidator";
import type { RibbonLocation } from "@/types/ribbon";
import { ENTITY_LOCATIONS, usePublishPlan } from "@/hooks/usePublishPlan";
import { copyText } from "@/utils/hostIO";
import { TargetScope } from "@/components/shared/TargetScope";

const useStyles = makeStyles({
	content: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	changes: {
		listStyleType: "none",
		margin: 0,
		padding: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	change: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
	},
	changeIcon: {
		flexShrink: 0,
		fontSize: "16px",
		marginTop: "2px",
		color: tokens.colorNeutralForeground3,
	},
	changeText: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
	badge: { flexShrink: 0 },
	list: { margin: `${tokens.spacingVerticalXS} 0 0`, paddingLeft: "20px" },
	options: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
	timing: { color: tokens.colorNeutralForeground3 },
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
	xmlHeader: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: tokens.spacingHorizontalS,
	},
	xml: {
		height: "360px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		overflow: "hidden",
	},
});

type PublishStatus = "pending" | "publishing" | "success" | "error";

/** Status in words (#188): no raw enums in the progress list. */
const STATUS_TEXT: Record<PublishStatus, string> = {
	pending: "Waiting",
	publishing: "Publishing…",
	success: "Done",
	error: "Failed",
};
const STATUS_COLOR: Record<PublishStatus, BadgeProps["color"]> = {
	pending: "subtle",
	publishing: "informative",
	success: "success",
	error: "danger",
};

const CHANGE_BADGE: Record<
	PublishChangeKind,
	{ text: string; color: BadgeProps["color"]; icon: React.ReactElement }
> = {
	new: { text: "New", color: "success", icon: <AddRegular /> },
	change: { text: "Change", color: "brand", icon: <EditRegular /> },
	move: { text: "Move", color: "informative", icon: <ArrowMoveRegular /> },
	show: { text: "Show", color: "informative", icon: <EyeRegular /> },
	hide: { text: "Hide", color: "warning", icon: <EyeOffRegular /> },
	delete: { text: "Delete", color: "danger", icon: <DeleteRegular /> },
};

type ScopeFinding = PublishFinding & { scope: string };

const FindingList: React.FC<{ findings: ScopeFinding[]; showScope: boolean }> = ({
	findings,
	showScope,
}) => {
	const styles = useStyles();
	return (
		<ul className={styles.list}>
			{findings.map((f, i) => (
				<li key={i}>
					{showScope && <strong>{f.scope}: </strong>}
					{f.message}
				</li>
			))}
		</ul>
	);
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How long the pre-publish check may hold Publish back (#35). */
const PRECHECK_TIMEOUT_MS = 30_000;

/**
 * Publishes the table being edited (all of its ribbon locations in one
 * import) and, when it changed and the solution allows it, the application
 * ribbon. Only the table loaded in CBS can be published: CBS holds no edits
 * for other tables, and publishing them would only publish whatever someone
 * else left unpublished.
 *
 * The dialog (#188) says what will publish first, one row per change; when
 * publishing is blocked, why, above them. Everything else is folded away.
 */
export const BulkPublishModal: React.FC = () => {
	const styles = useStyles();
	const bulkPublishOpen = useUIStore((s) => s.bulkPublishOpen);
	const closeBulkPublish = useUIStore((s) => s.closeBulkPublish);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const baselineCommands = useRibbonStore((s) => s.baselineCommands);
	const baselineEnableRules = useRibbonStore((s) => s.baselineEnableRules);
	const baselineDisplayRules = useRibbonStore((s) => s.baselineDisplayRules);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const baseLanguageCode = useRibbonStore((s) => s.baseLanguageCode);
	const baseLanguageUnknown = useRibbonStore((s) => s.baseLanguageUnknown);
	const setLayerSnapshot = useRibbonStore((s) => s.setLayerSnapshot);
	const markPublished = useRibbonStore((s) => s.markPublished);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const solutionRibbonComponentIds = useSessionStore((s) => s.solutionRibbonComponentIds);
	const {
		entityPlan,
		appPlan,
		solutionSupportsAppRibbon,
		includeApplicationRibbon,
		scopes,
		unsupported,
		warnings,
		changes,
	} = usePublishPlan();

	const [publishing, setPublishing] = useState(false);
	const [statusMap, setStatusMap] = useState<Record<string, PublishStatus>>({});
	const [done, setDone] = useState(false);
	const [incrementSolutionVersion, setIncrementSolutionVersion] = useState(false);
	const [publishStrategy, setPublishStrategy] = useState<"targeted" | "allAsync">("targeted");
	// Publishing everything publishes other people's work in progress too (#109):
	// it needs its own confirmation, cleared whenever the choice changes.
	const [publishAllConfirmed, setPublishAllConfirmed] = useState(false);
	const publishAllBlocked = publishStrategy === "allAsync" && !publishAllConfirmed;
	const connectionName = useSessionStore(
		(s) => s.connectionName || s.connectionUrl || "this environment",
	);
	// The target block's verdict (#121): false while the connection is read, and on Production
	// until the confirmation word is typed; with the environment type it was given for.
	const [target, setTarget] = useState<{ confirmed: boolean; environment?: string }>({
		confirmed: false,
	});
	const onTargetChange = React.useCallback(
		(confirmed: boolean, environment: string | undefined) =>
			setTarget({ confirmed, environment }),
		[],
	);
	const targetConfirmed = target.confirmed;
	// Bumped to read the connection again (a new TargetScope).
	const [targetRead, setTargetRead] = useState(0);
	const [progressMessage, setProgressMessage] = useState("");
	const [publishComment, setPublishComment] = useState("");
	const [solutionVersion, setSolutionVersion] = useState(activeSolution?.version ?? "1.0.0.0");
	const [errorMessages, setErrorMessages] = useState<{ scope: string; message: string }[]>([]);
	// Scopes being published in the current run (frozen when Publish is clicked).
	const [runScopes, setRunScopes] = useState<string[]>([]);
	// The number of changes the run publishes, for "Published n changes" afterwards.
	const [runCount, setRunCount] = useState(0);
	const [verifications, setVerifications] = useState<
		{ scope: string; result: PublishVerification }[]
	>([]);
	// The XML view (#188): what each import writes, without leaving the dialog.
	const [view, setView] = useState<"summary" | "xml">("summary");
	const [openSections, setOpenSections] = useState<string[]>([]);

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

	// Typed on a Production connection (#121): the table's logical name, or "application ribbon".
	const confirmWord =
		activeEntity && entityPlan?.hasChanges ? activeEntity.logicalName : "application ribbon";

	// Pre-publish check (#35): validates the RibbonDiffXml each scope would
	// import (existing layer + changes). It runs once the plan has nothing
	// unsupported — the plan already explains those, and a merge of them means
	// nothing. Errors block Publish; warnings don't. The XML it builds is what
	// the XML view shows.
	const [checkState, setCheckState] = useState<"idle" | "running" | "done" | "failed">("idle");
	const [checkFindings, setCheckFindings] = useState<ScopeFinding[]>([]);
	const [checkXml, setCheckXml] = useState<{ scope: string; xml: string }[]>([]);
	const [checkError, setCheckError] = useState("");
	const canCheck =
		bulkPublishOpen && !!activeSolution && unsupported.length === 0 && scopes.length > 0;
	const solutionId = activeSolution?.id;
	const solutionPrefix = activeSolution?.publisherPrefix || publisherPrefix;
	const runChecks = React.useCallback(async (): Promise<{
		findings: ScopeFinding[];
		xml: { scope: string; xml: string }[];
	}> => {
		const common = {
			commands,
			enableRules,
			displayRules,
			locLabels,
			baselineCommands,
			baselineEnableRules,
			baselineDisplayRules,
			publisherPrefix: solutionPrefix,
			// Labels are generated in the organisation's base language, as publishRibbon does.
			languageCode: baseLanguageCode,
		};
		const options = {
			lookupWebResources: (names: string[]) => loadWebResourceStatus(names, solutionId),
		};
		const out: ScopeFinding[] = [];
		const xml: { scope: string; xml: string }[] = [];
		if (activeEntity && entityPlan?.hasChanges) {
			const result = await checkBeforePublish(
				{
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
				},
				options,
			);
			out.push(...result.findings.map((f) => ({ ...f, scope: activeEntity.logicalName })));
			xml.push({ scope: activeEntity.logicalName, xml: result.xml });
		}
		if (includeApplicationRibbon) {
			const result = await checkBeforePublish(
				{
					...common,
					entity: null,
					locations: [{ current: ribbons.Application, baseline: baseline.Application }],
					plan: appPlan,
				},
				options,
			);
			out.push(...result.findings.map((f) => ({ ...f, scope: "Application ribbon" })));
			xml.push({ scope: "Application ribbon", xml: result.xml });
		}
		return { findings: out, xml };
	}, [
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
		baselineCommands,
		baselineEnableRules,
		baselineDisplayRules,
		solutionPrefix,
		solutionId,
		baseLanguageCode,
	]);
	React.useEffect(() => {
		if (!canCheck || publishing || done) return;
		let cancelled = false;
		setCheckState("running");
		setCheckError("");
		// A slow environment must not hold Publish back: after the timeout the
		// check is reported as incomplete; publishRibbon still runs its own check.
		withCheckTimeout(runChecks(), PRECHECK_TIMEOUT_MS)
			.then(({ findings, xml }) => {
				if (cancelled) return;
				setCheckFindings(findings);
				setCheckXml(xml);
				setCheckState("done");
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setCheckFindings([]);
				setCheckXml([]);
				setCheckError(err instanceof Error ? err.message : String(err));
				setCheckState("failed");
			});
		return () => {
			cancelled = true;
		};
	}, [canCheck, publishing, done, runChecks]);
	const checkErrors = checkFindings.filter((f) => f.severity === "error");
	const checkWarnings = checkFindings.filter((f) => f.severity === "warning");
	const showFindingScope = new Set(checkFindings.map((f) => f.scope)).size > 1;
	const checkBlocks = canCheck && (checkState === "running" || checkErrors.length > 0);

	const handlePublish = () =>
		withCloseGuard(async () => {
			if (
				!activeSolution ||
				unsupported.length > 0 ||
				scopes.length === 0 ||
				checkBlocks ||
				!targetConfirmed ||
				baseLanguageUnknown ||
				publishAllBlocked
			)
				return;
			setPublishing(true);
			// One guard for the whole run (#120): every scope writes to the connection
			// the run started on. After a switch, nothing more is published or stored.
			const guard = writeGuard();
			const startVersion = useSessionStore.getState().connectionVersion;
			const switched = () => useSessionStore.getState().connectionVersion !== startVersion;
			// The confirmation holds for the environment type it was given for (#121): the connection
			// is read again, and if it is Production now and wasn't then, the word is asked for.
			const connection = await getPrimaryConnection().catch(() => null);
			if (switched()) {
				setPublishing(false);
				return;
			}
			if (
				requiresTypedConfirmation(connection?.environment) &&
				!requiresTypedConfirmation(target.environment)
			) {
				setTarget({ confirmed: false });
				setTargetRead((n) => n + 1);
				setPublishing(false);
				useRuntimeLogStore
					.getState()
					.logWarn(
						"publish",
						`${connection?.name ?? "The connection"} is a Production environment now: type the confirmation to publish.`,
					);
				return;
			}
			setProgressMessage("");
			setErrorMessages([]);
			setVerifications([]);
			setRunScopes(scopes);
			setRunCount(changes.length);
			setStatusMap(Object.fromEntries(scopes.map((s) => [s, "pending" as PublishStatus])));

			let hadError = false;
			const published: RibbonLocation[] = [];
			// The layers as imported: the store takes their scaling / labels (#66 review).
			const importedLayers: { entity?: RibbonDiffParts; application?: RibbonDiffParts } = {};
			const errors: { scope: string; message: string }[] = [];
			const verified: { scope: string; result: PublishVerification }[] = [];
			const logs = useRuntimeLogStore.getState();
			const fmt = (e: unknown) => (e instanceof Error ? e.message : String(e));
			// The comment goes to the Console log with this publish (#109): it was collected and dropped.
			if (publishComment.trim())
				logs.logInfo("publish", `Publish comment: ${publishComment.trim()}`);
			const common = {
				commands,
				enableRules,
				displayRules,
				locLabels,
				baselineCommands,
				baselineEnableRules,
				baselineDisplayRules,
				publishCustomizations: true,
				// The language the canvas resolved labels in (#106 review): a fresh read could
				// differ and turn unchanged labels into edits.
				languageCode: baseLanguageCode,
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
							guard,
							entity: {
								logicalName: activeEntity.logicalName,
								schemaName: activeEntity.schemaName,
								displayName: activeEntity.displayName,
							},
							locations: ENTITY_LOCATIONS.map((l) => ({
								current: ribbons[l],
								baseline: baseline[l],
							})),
							plan: entityPlan,
						},
						(msg) => setProgressMessage(msg),
					);
					published.push(...ENTITY_LOCATIONS);
					importedLayers.entity = result.parts;
					// A reload soon after may still get the ribbon from before this
					// publish: what it wrote isn't offered for deletion as an orphan (#64).
					rememberPublish(connectionUrl, activeEntity.logicalName, result.changedKeys);
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

			if (includeApplicationRibbon && !switched()) {
				const scope = "Application ribbon";
				setStatusMap((prev) => ({ ...prev, [scope]: "publishing" }));
				try {
					const result = await publishRibbon(
						{
							...common,
							guard,
							entity: null,
							locations: [
								{ current: ribbons.Application, baseline: baseline.Application },
							],
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
					await publishAllAsync((msg) => setProgressMessage(msg), { guard });
				} catch (err) {
					hadError = true;
					errors.push({ scope: "Publish all customizations", message: fmt(err) });
				}
			}

			if (switched()) {
				// The store holds the new connection's (empty) workspace now: nothing of
				// this run belongs in it.
				if (
					includeApplicationRibbon &&
					!errors.some((e) => e.scope === "Application ribbon")
				)
					errors.push({
						scope: "Application ribbon",
						message: "Not published: the tool's connection changed during the publish.",
					});
				setVerifications(verified);
				setErrorMessages(errors);
				setDone(false);
				setPublishing(false);
				return;
			}

			// Only scopes that were actually imported (or had nothing to import) are
			// marked as published; anything else keeps its pending changes.
			markPublished(published, importedLayers);
			// Re-read the layers that were published so ownership, labels and the
			// "Hidden by customizations" list match the server (#47, #48).
			// A failed read (null) keeps what markPublished recorded rather than
			// forgetting the layer (which would block Rename and Delete, #33 review).
			if (activeEntity && published.includes("HomepageGrid") && entityPlan?.hasChanges) {
				const snapshot = await fetchLayerSnapshot(activeEntity.logicalName);
				if (snapshot) setLayerSnapshot("entity", snapshot);
			}
			if (published.includes("Application") && includeApplicationRibbon) {
				const snapshot = await fetchLayerSnapshot(null);
				if (snapshot) setLayerSnapshot("application", snapshot);
			}
			if (!hadError) setProgressMessage("Done.");
			setVerifications(verified);
			setErrorMessages(errors);
			setDone(!hadError);
			setPublishing(false);
		});

	const handleClose = () => {
		setPublishing(false);
		setStatusMap({});
		setRunScopes([]);
		setDone(false);
		setProgressMessage("");
		setErrorMessages([]);
		setVerifications([]);
		setCheckState("idle");
		setCheckFindings([]);
		setCheckXml([]);
		setCheckError("");
		setView("summary");
		setOpenSections([]);
		setTarget({ confirmed: false });
		setPublishStrategy("targeted");
		setPublishAllConfirmed(false);
		// Logged with the publish it was written for, not again with the next one.
		setPublishComment("");
		// A new target block next time: the dialog's content can stay mounted after
		// it closes (a closing animation that never ends in a background window),
		// and the old block would neither report again nor forget a typed word.
		setTargetRead((n) => n + 1);
		closeBulkPublish();
	};

	const appRibbonPending = appPlan.hasChanges && !solutionSupportsAppRibbon;
	const problems = unsupported.length + (canCheck ? checkErrors.length : 0);
	const checkWarningCount = canCheck
		? checkWarnings.length + (checkState === "failed" ? 1 : 0)
		: 0;
	// Problems open by themselves when there are any (#188).
	React.useEffect(() => {
		if (problems > 0)
			setOpenSections((open) => (open.includes("problems") ? open : ["problems", ...open]));
	}, [problems]);

	// Why Publish can't run, said where the summary starts (#188). The Production
	// confirmation (#121) says so in its own block below.
	const blocked: {
		intent: "error" | "warning" | "info";
		title: string;
		text: React.ReactNode;
		action?: React.ReactNode;
	} | null = !activeSolution
		? {
				intent: "warning",
				title: "Choose a solution",
				text: "Publishing imports into a solution: choose one in the top bar first.",
			}
		: baseLanguageUnknown
			? {
					intent: "error",
					title: "Reload the table first",
					text: "The organization's base language couldn't be read when the table loaded, so labels are shown in English. Publishing now could write English texts as the base language's titles.",
				}
			: unsupported.length > 0
				? {
						intent: "error",
						title: `${plural(unsupported.length, "change")} can't be published yet`,
						text: `Undo ${unsupported.length === 1 ? "it" : "them"} to publish the rest. Problems below says what each one is.`,
					}
				: canCheck && checkErrors.length > 0
					? {
							intent: "error",
							title: `The check found ${plural(checkErrors.length, "problem")}`,
							text: `In what this publish would import. Fix ${checkErrors.length === 1 ? "it" : "them"}, then open Publish again; Problems below lists ${checkErrors.length === 1 ? "it" : "them"}.`,
						}
					: scopes.length === 0
						? appRibbonPending
							? {
									intent: "warning",
									title: "The application ribbon can't be published from this solution",
									text: (
										<>
											It doesn&apos;t include the Application Ribbons
											component. In make.powerapps.com open the solution,
											choose{" "}
											<strong>Add existing → Application Ribbons</strong>,
											then reload here.
										</>
									),
								}
							: {
									intent: "info",
									title: "Nothing to publish",
									text: "Every change on this table is already published.",
								}
						: publishAllBlocked
							? {
									intent: "warning",
									title: "Confirm publishing everything",
									text: `Tick the confirmation under Options to publish every unpublished customization in ${connectionName}.`,
									action: (
										<Button
											size="small"
											onClick={() => {
												setPublishStrategy("targeted");
												setPublishAllConfirmed(false);
											}}
										>
											Only these ribbons
										</Button>
									),
								}
							: null;

	const tableName = activeEntity?.displayName || activeEntity?.logicalName;
	const publishesTable = !!activeEntity && !!entityPlan?.hasChanges;
	const title =
		publishesTable && includeApplicationRibbon
			? `Publish ${tableName} and the application ribbon`
			: !publishesTable && includeApplicationRibbon
				? "Publish the application ribbon"
				: tableName
					? `Publish ${tableName}`
					: "Publish";
	const publishLabel = publishing
		? "Publishing…"
		: changes.length > 0
			? `Publish ${plural(changes.length, "change")}`
			: "Publish";
	const editing = !publishing && !done;

	return (
		<AppDialog
			open={bulkPublishOpen}
			onOpenChange={(open) => !open && !publishing && handleClose()}
			size="medium"
			title={view === "xml" ? "What Publish imports" : title}
			startActions={
				editing ? (
					view === "summary" ? (
						<Button
							appearance="subtle"
							icon={<CodeRegular />}
							onClick={() => setView("xml")}
						>
							View XML
						</Button>
					) : (
						<Button
							appearance="subtle"
							icon={<ArrowLeftRegular />}
							onClick={() => setView("summary")}
						>
							Back to summary
						</Button>
					)
				) : undefined
			}
			actions={
				<>
					<Button appearance="secondary" onClick={handleClose} disabled={publishing}>
						{done ? "Close" : "Cancel"}
					</Button>
					{!done && (
						<Button
							appearance="primary"
							onClick={() => void handlePublish()}
							disabled={
								publishing ||
								!activeSolution ||
								scopes.length === 0 ||
								unsupported.length > 0 ||
								checkBlocks ||
								!targetConfirmed ||
								baseLanguageUnknown ||
								publishAllBlocked
							}
						>
							{publishLabel}
						</Button>
					)}
				</>
			}
		>
			{view === "xml" && editing ? (
				<div className={styles.content}>
					<Text>
						The complete RibbonDiffXml each import writes: your solution&apos;s layer as
						it is now, with your changes merged in.
					</Text>
					{canCheck && checkState === "running" ? (
						<Spinner size="tiny" labelPosition="after" label="Building the XML…" />
					) : checkXml.length === 0 ? (
						<MessageBar intent="info" layout="multiline">
							<MessageBarBody>
								{canCheck && checkState === "failed"
									? `The XML couldn't be built: ${checkError}`
									: "The XML is built once there is something to publish and nothing blocks it."}
							</MessageBarBody>
						</MessageBar>
					) : (
						checkXml.map((x) => (
							<div key={x.scope} className={styles.options}>
								<div className={styles.xmlHeader}>
									<Text weight="semibold">{x.scope}</Text>
									<Button
										size="small"
										appearance="subtle"
										icon={<CopyRegular />}
										onClick={() => void copyText(x.xml)}
									>
										Copy
									</Button>
								</div>
								<div className={styles.xml}>
									<MonacoEditor language="xml" value={x.xml} readOnly />
								</div>
							</div>
						))
					)}
				</div>
			) : (
				<div className={styles.content}>
					{editing && blocked && (
						<MessageBar intent={blocked.intent} layout="multiline">
							<MessageBarBody>
								<MessageBarTitle>{blocked.title}</MessageBarTitle>
								{blocked.text}
							</MessageBarBody>
							{blocked.action && (
								<MessageBarActions>{blocked.action}</MessageBarActions>
							)}
						</MessageBar>
					)}

					{editing && changes.length > 0 && (
						<div className={styles.options}>
							<Text weight="semibold">
								{plural(changes.length, "change")} to publish
							</Text>
							<ul className={styles.changes} aria-label="Changes to publish">
								{changes.map((c, i) => {
									const badge = CHANGE_BADGE[c.kind];
									return (
										<li key={i} className={styles.change}>
											<span className={styles.changeIcon} aria-hidden="true">
												{badge.icon}
											</span>
											<Text className={styles.changeText}>
												{c.action} <strong>{c.name}</strong>
												{c.detail ? ` ${c.detail}` : ""}
											</Text>
											<Badge
												appearance="tint"
												color={badge.color}
												size="small"
												className={styles.badge}
											>
												{badge.text}
											</Badge>
										</li>
									);
								})}
							</ul>
						</div>
					)}

					{editing && canCheck && checkState === "running" && (
						<Spinner
							size="tiny"
							labelPosition="after"
							label="Checking what this publish would import…"
						/>
					)}

					{editing && (
						<TargetScope
							key={targetRead}
							rows={[
								{
									label: "Solution",
									value: activeSolution ? (
										<Text weight="semibold">
											{activeSolution.friendlyName ||
												activeSolution.uniqueName}
										</Text>
									) : (
										<Text>None selected</Text>
									),
								},
							]}
							confirmWord={confirmWord}
							onConfirmationChange={onTargetChange}
						/>
					)}

					{editing && (
						<Accordion
							multiple
							collapsible
							openItems={openSections}
							onToggle={(_, d) => setOpenSections(d.openItems as string[])}
						>
							{problems > 0 && (
								<AccordionItem value="problems">
									<AccordionHeader>Problems · {problems}</AccordionHeader>
									<AccordionPanel>
										{unsupported.length > 0 && (
											<>
												<Text block>
													These changes can&apos;t be published yet; undo
													them:
												</Text>
												<ul className={styles.list}>
													{unsupported.map((u) => (
														<li key={u}>{u}</li>
													))}
												</ul>
											</>
										)}
										{canCheck && checkErrors.length > 0 && (
											<FindingList
												findings={checkErrors}
												showScope={showFindingScope}
											/>
										)}
									</AccordionPanel>
								</AccordionItem>
							)}
							{checkWarningCount > 0 && (
								<AccordionItem value="warnings">
									<AccordionHeader>
										Warnings · {checkWarningCount}
									</AccordionHeader>
									<AccordionPanel>
										<Text block>You can still publish.</Text>
										{checkState === "failed" && (
											<Text block>
												The check before publishing couldn&apos;t complete (
												{checkError}). Publishing runs it again before
												anything is imported.
											</Text>
										)}
										<FindingList
											findings={checkWarnings}
											showScope={showFindingScope}
										/>
									</AccordionPanel>
								</AccordionItem>
							)}
							<AccordionItem value="info">
								<AccordionHeader>
									Good to know ·{" "}
									{warnings.length +
										1 +
										(appRibbonPending && scopes.length > 0 ? 1 : 0)}
								</AccordionHeader>
								<AccordionPanel>
									<ul className={styles.list}>
										<li>
											Publishing writes this table&apos;s complete ribbon
											customization: what is already published, plus your
											changes. Ribbon changes imported elsewhere but not
											published are published first, so they are kept. Each
											ribbon is imported twice so Unified Interface picks up
											the change.
										</li>
										{appRibbonPending && scopes.length > 0 && (
											<li>
												Your application ribbon changes stay pending: this
												solution doesn&apos;t include the Application
												Ribbons component. In make.powerapps.com open the
												solution, choose{" "}
												<strong>Add existing → Application Ribbons</strong>,
												then reload here.
											</li>
										)}
										{warnings.map((w) => (
											<li key={w}>{w}</li>
										))}
									</ul>
								</AccordionPanel>
							</AccordionItem>
							<AccordionItem value="options">
								<AccordionHeader>Options</AccordionHeader>
								<AccordionPanel className={styles.options}>
									<Field label="Also publish">
										<Dropdown
											value={
												publishStrategy === "targeted"
													? "Only these ribbons"
													: "Every unpublished customization"
											}
											selectedOptions={[publishStrategy]}
											onOptionSelect={(_, data) => {
												if (
													data.optionValue === "targeted" ||
													data.optionValue === "allAsync"
												) {
													setPublishStrategy(data.optionValue);
													setPublishAllConfirmed(false);
												}
											}}
										>
											<Option value="targeted">Only these ribbons</Option>
											<Option value="allAsync">
												Every unpublished customization
											</Option>
										</Dropdown>
									</Field>
									{publishStrategy === "allAsync" && (
										<MessageBar intent="warning" layout="multiline">
											<MessageBarBody>
												<Text block>
													This publishes <strong>every</strong>{" "}
													unpublished customization in{" "}
													<strong>{connectionName}</strong>, not only
													these ribbons: forms, views, tables and other
													people&apos;s work in progress included.
												</Text>
												<Checkbox
													checked={publishAllConfirmed}
													onChange={(_, d) =>
														setPublishAllConfirmed(d.checked === true)
													}
													label={`Publish all unpublished customizations in ${connectionName}`}
												/>
											</MessageBarBody>
										</MessageBar>
									)}
									<Switch
										label="Increment solution version"
										checked={incrementSolutionVersion}
										onChange={(_, d) =>
											setIncrementSolutionVersion(d.checked === true)
										}
									/>
									<Field label="Solution version">
										<Input
											size="small"
											value={
												incrementSolutionVersion
													? nextVersion
													: solutionVersion
											}
											onChange={(_, d) => setSolutionVersion(d.value)}
											disabled={incrementSolutionVersion}
										/>
									</Field>
									<Field
										label="Publish comment"
										hint="Written to the Console log with this publish; it isn't stored in Dataverse."
									>
										<Textarea
											resize="vertical"
											value={publishComment}
											onChange={(_, d) => setPublishComment(d.value)}
										/>
									</Field>
								</AccordionPanel>
							</AccordionItem>
						</Accordion>
					)}

					{editing && scopes.length > 0 && (
						<Caption1 className={styles.timing}>
							Publishing takes 1–4 minutes. Users may need to refresh to see the
							change.
						</Caption1>
					)}

					{errorMessages.length > 0 && (
						<MessageBar intent="error" layout="multiline">
							<MessageBarBody>
								<MessageBarTitle>
									Publish failed ({plural(errorMessages.length, "error")})
								</MessageBarTitle>
								<ul className={styles.list}>
									{errorMessages.map((e, i) => (
										<li
											key={i}
											style={{ fontFamily: tokens.fontFamilyMonospace }}
										>
											<strong>{e.scope}:</strong> {e.message}
										</li>
									))}
								</ul>
								<div style={{ marginTop: tokens.spacingVerticalS }}>
									Full details are in the <strong>Console</strong> tab of the
									bottom panel.
								</div>
							</MessageBarBody>
						</MessageBar>
					)}

					{done && (
						<MessageBar intent="success" layout="multiline">
							<MessageBarBody>
								<MessageBarTitle>
									Published {plural(runCount, "change")}
									{tableName &&
									runScopes.includes(activeEntity?.logicalName ?? "")
										? ` to ${tableName}`
										: ""}
								</MessageBarTitle>
								Unified Interface can take up to about 25 minutes to show it. To see
								it sooner, run <strong>Regenerate ribbon metadata</strong> in
								Command Checker, or hard-refresh the page (Ctrl+F5).
							</MessageBarBody>
						</MessageBar>
					)}

					{verifications.map((v) => (
						<MessageBar
							key={v.scope}
							intent={v.result.ok ? "success" : "warning"}
							layout="multiline"
						>
							<MessageBarBody>
								<strong>{v.scope}:</strong> {v.result.message}
							</MessageBarBody>
						</MessageBar>
					))}

					{(publishing || done) && (
						<div className={styles.progressList}>
							{runScopes.map((scope) => {
								const status = statusMap[scope] ?? "pending";
								return (
									<div key={scope} className={styles.progressRow}>
										<Badge
											appearance="filled"
											color={STATUS_COLOR[status]}
											size="small"
											className={styles.badge}
										>
											{STATUS_TEXT[status]}
										</Badge>
										<Text>{scope}</Text>
										{status === "publishing" && (
											<ProgressBar thickness="large" style={{ flex: 1 }} />
										)}
									</div>
								);
							})}
							{progressMessage && !done && (
								<Text className={styles.timing}>{progressMessage}</Text>
							)}
						</div>
					)}
				</div>
			)}
		</AppDialog>
	);
};

export default BulkPublishModal;
