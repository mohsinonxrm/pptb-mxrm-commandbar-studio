import {
	makeStyles,
	tokens,
	FluentProvider,
	webLightTheme,
	webDarkTheme,
	Tab,
	TabList,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { Layout } from "@/components/shell/Layout";

import { RibbonCanvas } from "@/components/ribbon-canvas/RibbonCanvas";
import { PropertiesPane } from "@/components/properties-pane/PropertiesPane";
import { BottomPanel } from "@/components/bottom-panel/BottomPanel";
import { TablesPane } from "@/components/left-pane/TablesPane";
import { SolutionElementsPane } from "@/components/left-pane/SolutionElementsPane";
import { useSessionStore } from "@/store/sessionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { useSelectionStore } from "@/store/selectionStore";
import {
	fetchSolutions,
	fetchSolutionEntityIds,
	fetchSolutionRibbonComponentIds,
} from "@/services/dataverse/solutionService";
import { fetchEntitiesByMetadataIds } from "@/services/dataverse/entityService";
import { fetchRibbonWorkspace } from "@/services/dataverse/ribbonService";
import { fetchRibbonProvenance } from "@/services/dataverse/ribbonProvenanceService";
import { applyProvenanceToRibbons, type ButtonProvenance } from "@/utils/ribbonProvenance";
import { defaultTabId, isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import type { ConflictEntry } from "@/types/ribbon";
import { fetchCurrentUser } from "@/services/dataverse/userService";
import { useRibbonPersistence } from "@/hooks/useRibbonPersistence";
import { useDraftStore, draftKeyFor } from "@/store/draftStore";
import { DraftSaveWarning } from "@/components/shell/DraftSaveWarning";
import { ConnectionChangedNotice } from "@/components/shell/ConnectionChangedNotice";
import { DraftRestoreDialog } from "@/components/modals/DraftRestoreDialog";
import { UnsavedChangesDialog } from "@/components/modals/UnsavedChangesDialog";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { groupControls } from "@/utils/ribbonMenu";
import { annotateRecentPublish } from "@/services/layerOrphans";
import { recentPublishOf } from "@/utils/recentPublish";
import { useModernCommandsLoader } from "@/hooks/useModernCommands";

const useStyles = makeStyles({
	leftPaneTabs: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
	},
	tabList: {
		flexShrink: 0,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	tabContent: {
		flex: 1,
		overflow: "hidden",
	},
});

function LeftPane() {
	const styles = useStyles();
	const [tab, setTab] = useState<"tables" | "elements">("tables");

	return (
		<div className={styles.leftPaneTabs}>
			<TabList
				className={styles.tabList}
				selectedValue={tab}
				onTabSelect={(_, d) => setTab(d.value as "tables" | "elements")}
				size="small"
			>
				<Tab value="tables">Tables</Tab>
				<Tab value="elements">Solution</Tab>
			</TabList>
			<div className={styles.tabContent}>
				{tab === "tables" ? <TablesPane /> : <SolutionElementsPane />}
			</div>
		</div>
	);
}

export function App() {
	const setSolutions = useSessionStore((s) => s.setSolutions);
	const setEntities = useSessionStore((s) => s.setEntities);
	const setCurrentUser = useSessionStore((s) => s.setCurrentUser);
	const setSolutionEntityIds = useSessionStore((s) => s.setSolutionEntityIds);
	const setSolutionRibbonComponentIds = useSessionStore((s) => s.setSolutionRibbonComponentIds);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const connectionVersion = useSessionStore((s) => s.connectionVersion);
	const loadWorkspace = useRibbonStore((s) => s.loadWorkspace);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const themeMode = useUIStore((s) => s.themeMode);
	const logInfo = useRuntimeLogStore((s) => s.logInfo);
	const logWarn = useRuntimeLogStore((s) => s.logWarn);
	const logError = useRuntimeLogStore((s) => s.logError);

	// Saves unpublished changes as the table's draft on every change (#16).
	useRibbonPersistence();

	// Modern commands (appaction, #32): read-only, loaded alongside the ribbon,
	// never part of the ribbon store or publish.
	useModernCommandsLoader();

	const [ribbonLoadState, setRibbonLoadState] = useState<"idle" | "loading" | "error">("idle");
	const [ribbonLoadError, setRibbonLoadError] = useState<string | null>(null);
	const [reloadVersion, setReloadVersion] = useState(0);

	// ----- Initial bootstrap: solutions + current user only -----
	// Entities are deferred until the user picks a solution. Ribbon Workbench's
	// convention (and what MS doc `export-prepare-edit-import-ribbon` shows) is
	// that an entity must be a component of the unmanaged solution before its
	// ribbon can be exported, edited, and re-imported. CBS now enforces the
	// same workflow up-front.
	useEffect(() => {
		logInfo("runtime", "Loading solutions and current user...");
		// An answer from the previous connection must not land after a switch (#120).
		let cancelled = false;

		fetchSolutions()
			.then((sols) => {
				if (cancelled) return;
				setSolutions(sols);
				logInfo("runtime", `Loaded ${sols.length} solution(s). Pick one to load its tables.`);
			})
			.catch((error) => {
				logError(
					"runtime",
					`Failed to load solutions: ${error instanceof Error ? error.message : String(error)}`,
				);
			});

		void fetchCurrentUser()
			.then((user) => {
				if (cancelled || !user.id) return;
				setCurrentUser(user.id, user.name);
				logInfo("runtime", `Current user: ${user.name}.`);
			})
			.catch((error) => {
				logWarn(
					"runtime",
					`Failed to resolve current user: ${error instanceof Error ? error.message : String(error)}`,
				);
			});
		return () => {
			cancelled = true;
		};
		// Again after the tool's connection changed (#120).
	}, [setSolutions, setCurrentUser, logInfo, logWarn, logError, connectionVersion]);

	// ----- When the user picks a solution: resolve its entity components and
	// fetch metadata for ONLY those entities (no bulk 1883-row catalog load).
	// This matches Ribbon Workbench's behavior and is more reliable than
	// PPTB's `getAllEntitiesMetadata` (which was silently dropping entities,
	// likely due to OData paging not being followed).
	useEffect(() => {
		if (!activeSolution) {
			setSolutionEntityIds(null);
			setSolutionRibbonComponentIds(null);
			setEntities([]);
			return;
		}

		let cancelled = false;

		void (async () => {
			try {
				// Fetch both component sets in parallel — entity components for
				// the table picker, ribbon-customization components (type=50)
				// so the publish dialog can correctly enable / declare the
				// application-ribbon publish path.
				const [entityIds, ribbonIds] = await Promise.all([
					fetchSolutionEntityIds(activeSolution.id),
					fetchSolutionRibbonComponentIds(activeSolution.id),
				]);
				if (cancelled) return;
				setSolutionEntityIds(entityIds);
				setSolutionRibbonComponentIds(ribbonIds);

				if (entityIds.length === 0) {
					setEntities([]);
					return;
				}

				const ents = await fetchEntitiesByMetadataIds(entityIds);
				if (cancelled) return;
				setEntities(ents);
			} catch (error) {
				if (cancelled) return;
				logError(
					"runtime",
					`Failed to load solution tables: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
				setSolutionEntityIds([]);
				setSolutionRibbonComponentIds([]);
				setEntities([]);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [activeSolution, setEntities, setSolutionEntityIds, setSolutionRibbonComponentIds, logError]);

	// ----- When the user picks an entity (inside an active solution),
	// load the ribbon workspace.
	useEffect(() => {
		// Until a table's workspace is loaded, no draft belongs to the store's (#16).
		useDraftStore.getState().beginLoad();
		// No table (e.g. after switching solution, which also empties the ribbon
		// store, #22): a previous table's load error or spinner doesn't apply.
		if (!activeEntity?.logicalName) {
			setRibbonLoadState("idle");
			setRibbonLoadError(null);
			return;
		}

		let cancelled = false;
		const draftKey = draftKeyFor(activeEntity.logicalName);
		setRibbonLoadState("loading");
		setRibbonLoadError(null);
		logInfo("ribbon", `Loading ribbon workspace for ${activeEntity.logicalName}...`);

		// Load the ribbon and its solution-layer provenance in parallel, then
		// overlay accurate OOB/managed/unmanaged origin onto each button before
		// seeding the store. Provenance is best-effort — if the layer API is
		// unavailable we keep the parser's heuristic (so this never blocks load).
		void Promise.all([
			fetchRibbonWorkspace(activeEntity.logicalName),
			fetchRibbonProvenance(activeEntity.logicalName).catch(
				() => new Map<string, ButtonProvenance>(),
			),
		])
			.then(([workspace, provenance]) => {
				if (cancelled) return;
				applyProvenanceToRibbons(workspace.ribbons, provenance);

				// Build ConflictEntry records for buttons whose provenance resolved
				// to "managed" — i.e. they belong to a managed solution layer.
				// The ConflictBanner uses these to surface a warning without any
				// additional API calls. The ConflictDrawer then fetches live layer
				// detail on demand.
				const conflictEntries: ConflictEntry[] = [];
				const seenButtonIds = new Set<string>();
				for (const ribbon of Object.values(workspace.ribbons)) {
					for (const tab of ribbon.tabs) {
						for (const group of tab.groups) {
							for (const btn of groupControls(group)) {
								if (btn.origin === "managed" && !seenButtonIds.has(btn.id)) {
									seenButtonIds.add(btn.id);
									conflictEntries.push({
										elementId: btn.id,
										elementKind: "button",
										solutions: [
											{
												solutionId: "",
												solutionName: btn.solutionName ?? "Managed Solution",
												publisher: btn.publisherName ?? "",
												managed: true,
												wins: true,
												importedOn: undefined,
											},
										],
									});
								}
							}
						}
					}
				}
				// Sync to store without triggering a history entry.
				useRibbonStore.getState().setConflicts(conflictEntries);

				loadWorkspace({
					ribbons: workspace.ribbons,
					commands: workspace.commands,
					displayRules: workspace.displayRules,
					enableRules: workspace.enableRules,
					locLabels: workspace.locLabels,
					layers: workspace.layers,
					baseLanguageCode: workspace.baseLanguageCode,
					// Right after a publish the ribbon can be the one from before it:
					// what that publish wrote isn't offered for deletion (#64 review).
					orphans: {
						entity: annotateRecentPublish(
							workspace.orphans ?? [],
							recentPublishOf(useSessionStore.getState().connectionUrl, activeEntity.logicalName),
						),
					},
				});

				// Snapshot the current selection at success-time via getState()
				// — depending on the reactive `location` / `tabId` selectors
				// here would re-fire this whole effect (and the RetrieveEntityRibbon
				// + RetrieveApplicationRibbon network calls) every time the user
				// clicks a tab or switches between Home/Sub/Form/Application.
				const { location: currentLocation, tabId: currentTabId } = useSelectionStore.getState();
				const tabsForLocation = workspace.ribbons[currentLocation]?.tabs ?? [];
				// A tab shared by every table (the Charts / AllEntities tabs) "still
				// exists" after switching tables; land on the new table's main tab.
				const tabStillExists =
					tabsForLocation.some((t) => t.id === currentTabId) && !isHiddenOnUnifiedInterface(currentTabId);
				if (!tabStillExists) {
					const firstTabId = defaultTabId(tabsForLocation);
					if (firstTabId) setTabId(firstTabId);
				}

				// Autosave starts now, and a draft saved for this table is offered
				// on top of what was just loaded (#16).
				useDraftStore.getState().workspaceLoaded(draftKey);

				setRibbonLoadState("idle");
				logInfo("ribbon", `Ribbon workspace loaded for ${activeEntity.logicalName}.`);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				const message = error instanceof Error ? error.message : "Failed to load ribbon";
				setRibbonLoadState("error");
				setRibbonLoadError(message);
				logError("ribbon", `Ribbon load failed for ${activeEntity.logicalName}: ${message}`);
			});

		return () => {
			cancelled = true;
		};
	}, [activeEntity?.logicalName, loadWorkspace, reloadVersion, setTabId, logInfo, logError]);

	function handleRetryRibbonLoad() {
		setReloadVersion((v) => v + 1);
	}

	return (
		<FluentProvider theme={themeMode === "dark" ? webDarkTheme : webLightTheme}>
			<Layout leftPane={<LeftPane />} rightPane={<PropertiesPane />} bottomPanel={<BottomPanel />}>
				<DraftSaveWarning />
				<ConnectionChangedNotice />
				<RibbonCanvas
					isLoadingRibbon={ribbonLoadState === "loading"}
					ribbonLoadError={ribbonLoadError}
					onRetryRibbonLoad={handleRetryRibbonLoad}
				/>
			</Layout>
			<DraftRestoreDialog />
			<UnsavedChangesDialog />
		</FluentProvider>
	);
}
