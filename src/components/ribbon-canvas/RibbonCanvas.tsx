import {
	makeStyles,
	tokens,
	Button,
	Text,
	MessageBar,
	MessageBarBody,
	MessageBarActions,
	Spinner,
} from "@fluentui/react-components";
import { DocumentRegular, AddRegular } from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { defaultTabId, isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import { useUIStore } from "@/store/uiStore";
import { UCI_TAB_NOTE } from "@/services/publishPlan";
import { ClassicRibbon } from "./ClassicRibbon";
import { ModernCommandBar } from "./ModernCommandBar";
import { RibbonListView } from "./RibbonListView";
import { FlyoutMenuPanel } from "./FlyoutMenuPanel";
import { LocationRow, RibbonTabStrip } from "./CanvasHeader";
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";
import { hasUnpublishedChanges } from "@/store/draftStore";
import { useState, useEffect } from "react";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		flex: 1,
		minWidth: 0,
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground1,
	},
	canvas: {
		flex: 1,
		overflow: "auto",
		padding: tokens.spacingHorizontalM,
	},
});

const useEmptyTabStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		padding: "80px",
		gap: tokens.spacingHorizontalM,
		color: tokens.colorNeutralForeground3,
	},
});

interface RibbonCanvasProps {
	isLoadingRibbon?: boolean;
	/** The table being loaded and the step the load is on (#4). */
	loadingTable?: string;
	loadingStep?: string | null;
	ribbonLoadError?: string | null;
	/** The ribbon loaded, but an unmanaged layer couldn't be read (#110). */
	layerReadError?: string | null;
	onRetryRibbonLoad?: () => void;
}

export function RibbonCanvas({
	isLoadingRibbon = false,
	loadingTable,
	loadingStep = null,
	ribbonLoadError = null,
	layerReadError = null,
	onRetryRibbonLoad,
}: RibbonCanvasProps) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	// Not yet deleted (a pending delete is crossed out in the list), and not
	// just published from here (most likely not loaded yet, #64 review).
	const orphanCount = useRibbonStore(
		(s) =>
			s.orphans.entity.filter(
				(o) => !s.pendingOrphanDeletes.entity.includes(o.id) && !o.recentPublish?.published,
			).length,
	);
	const clearSelection = useSelectionStore((s) => s.clearSelection);
	const ribbonViewStyle = useUIStore((s) => s.ribbonViewStyle);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	// Retry of an unread layer replaces the canvas: unpublished changes are asked about first (#110).
	const [confirmingReload, setConfirmingReload] = useState(false);

	const ribbon = ribbons[location];
	const currentTab =
		ribbon.tabs.find((t) => t.id === tabId) ??
		ribbon.tabs.find((t) => t.id === defaultTabId(ribbon.tabs));

	useEffect(() => {
		if (!ribbon.tabs.length) return;
		const exists = ribbon.tabs.some((t) => t.id === tabId);
		if (!exists) {
			const first = defaultTabId(ribbon.tabs);
			if (first) setTabId(first);
		}
	}, [ribbon.tabs, tabId, setTabId]);

	return (
		<main className={styles.root} aria-label="Ribbon canvas">
			<LocationRow />

			{layerReadError && !isLoadingRibbon && !ribbonLoadError && (
				<MessageBar intent="warning" layout="multiline" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Couldn&apos;t read your unmanaged ribbon customizations, so labels may show
						as ids and ownership (what you can edit or delete) is unknown. Reload before
						editing. Details: {layerReadError}
					</MessageBarBody>
					{onRetryRibbonLoad && (
						<MessageBarActions>
							<Button
								size="small"
								onClick={() =>
									hasUnpublishedChanges()
										? setConfirmingReload(true)
										: onRetryRibbonLoad()
								}
							>
								Retry
							</Button>
						</MessageBarActions>
					)}
				</MessageBar>
			)}

			{/* Location-specific info banners */}
			{location === "Form" && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Form ribbon customizations target the legacy web client. On Unified
						Interface, form commands render in a flat command bar — tab layout and
						scaling are ignored, but button visibility and command actions work as
						configured (same behaviour as Ribbon Workbench). Microsoft does not
						officially support the tabbed ribbon UI on Unified Interface.
					</MessageBarBody>
				</MessageBar>
			)}
			{location === "SubGrid" && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Subgrid ribbons support only 3 native controls: Add, Show List, and Delete.
						Their icons cannot be changed.
					</MessageBarBody>
				</MessageBar>
			)}
			{location === "Application" && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Buttons added to GlobalTab appear in the persistent global command bar at
						the top of every page. OOB GlobalTab buttons are read-only and cannot be
						customized.
					</MessageBarBody>
				</MessageBar>
			)}

			{/* A custom tab: how Unified Interface shows it (#58). */}
			{currentTab && !/^(Mscrm|Microsoft)\./.test(currentTab.id) && (
				<MessageBar intent="info" style={{ flexShrink: 0 }}>
					<MessageBarBody>{UCI_TAB_NOTE}</MessageBarBody>
				</MessageBar>
			)}

			{/* Charts / AllEntities tabs: their buttons never show in Unified Interface (#64). */}
			{currentTab && isHiddenOnUnifiedInterface(currentTab.id) && (
				<MessageBar intent="warning" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						Unified Interface doesn&apos;t show this tab&apos;s buttons on the command
						bar, and they don&apos;t come back when the table is reloaded. Add buttons
						to the table&apos;s main tab instead.
					</MessageBarBody>
				</MessageBar>
			)}

			{/* The table's customizations the ribbon doesn't return anywhere (#64). */}
			{location !== "Application" && orphanCount > 0 && (
				<MessageBar intent="warning" style={{ flexShrink: 0 }}>
					<MessageBarBody>
						{orphanCount} element{orphanCount !== 1 ? "s" : ""} of your customizations
						for this table
						{orphanCount !== 1 ? " aren't" : " isn't"} on the canvas: the ribbon
						doesn&apos;t return {orphanCount !== 1 ? "them" : "it"}. See{" "}
						<strong>Orphaned customizations</strong> in the Properties pane to delete{" "}
						{orphanCount !== 1 ? "them" : "it"}.
					</MessageBarBody>
					<MessageBarActions>
						<Button size="small" onClick={clearSelection}>
							Show
						</Button>
					</MessageBarActions>
				</MessageBar>
			)}

			<RibbonTabStrip currentTab={currentTab} />

			{/* Canvas area */}
			<div className={styles.canvas}>
				{isLoadingRibbon ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							height: "100%",
						}}
					>
						<Spinner
							label={
								<>
									{loadingTable
										? `Loading ${loadingTable}`
										: "Loading the ribbon"}
									{loadingStep && (
										<>
											<br />
											<span style={{ fontSize: "12px", opacity: 0.8 }}>
												{loadingStep}
											</span>
										</>
									)}
								</>
							}
						/>
					</div>
				) : ribbonLoadError ? (
					<MessageBar intent="error">
						<MessageBarBody>
							Failed to load ribbon definition. {ribbonLoadError}
						</MessageBarBody>
						{onRetryRibbonLoad && (
							<MessageBarActions
								containerAction={
									<Button
										appearance="primary"
										size="small"
										onClick={onRetryRibbonLoad}
									>
										Retry
									</Button>
								}
							/>
						)}
					</MessageBar>
				) : !currentTab ? (
					<EmptyTab onAddGroup={openNewGroup} />
				) : (
					<>
						{ribbonViewStyle === "classic" ? (
							<ClassicRibbon tab={currentTab} location={location} />
						) : ribbonViewStyle === "modern" ? (
							<ModernCommandBar tab={currentTab} location={location} />
						) : (
							<RibbonListView tab={currentTab} location={location} />
						)}
						{/* The selected flyout / split button's menu (#27). */}
						<FlyoutMenuPanel tab={currentTab} location={location} />
					</>
				)}
			</div>
			{confirmingReload && onRetryRibbonLoad && (
				<ConfirmDialog
					open
					title="Reload the ribbon"
					confirmLabel="Reload"
					onConfirm={() => {
						setConfirmingReload(false);
						onRetryRibbonLoad();
					}}
					onCancel={() => setConfirmingReload(false)}
				>
					You have unpublished changes. Reloading replaces the canvas; your changes are
					kept in a draft that is offered after the reload. They were made while your
					labels weren&apos;t loaded, so check their texts before you publish: a text can
					read a label&apos;s id.
				</ConfirmDialog>
			)}
		</main>
	);
}

function EmptyTab({ onAddGroup }: { onAddGroup: () => void }) {
	const styles = useEmptyTabStyles();
	return (
		<div className={styles.root}>
			<DocumentRegular fontSize={32} style={{ opacity: 0.4 }} />
			<Text size={300}>This tab has no groups yet</Text>
			<Button appearance="primary" size="small" icon={<AddRegular />} onClick={onAddGroup}>
				Add first group
			</Button>
		</div>
	);
}
