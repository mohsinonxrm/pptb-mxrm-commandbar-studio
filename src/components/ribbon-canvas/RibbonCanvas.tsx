import { makeStyles, tokens, Button, Text } from "@fluentui/react-components";
import { DocumentRegular, AddRegular } from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { defaultTabId, isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import { useUIStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { ClassicRibbon } from "./ClassicRibbon";
import { GroupCards } from "./GroupCards";
import { UsersBar } from "./UsersBar";
import { ModernCommandBar } from "./ModernCommandBar";
import { RibbonListView } from "./RibbonListView";
import { FlyoutMenuPanel } from "./FlyoutMenuPanel";
import { LocationRow } from "./CanvasHeader";
import {
	CanvasEmptyState,
	CanvasLoadError,
	CanvasLoading,
	type CanvasEmptyKind,
} from "./CanvasStates";
import { MessageSlot, type SlotMessage } from "@/components/shared/MessageSlot";
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
	messages: {
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
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
	/** Before a solution or table is open, only this shows (#195). */
	emptyState?: CanvasEmptyKind;
}

export function RibbonCanvas({
	isLoadingRibbon = false,
	loadingTable,
	loadingStep = null,
	ribbonLoadError = null,
	layerReadError = null,
	onRetryRibbonLoad,
	emptyState,
}: RibbonCanvasProps) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const setTabId = useSelectionStore((s) => s.setTabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	// Not yet deleted (a pending delete is crossed out in the list), and not
	// just published from here (most likely not loaded yet, #64 review).
	// Their ids are the dismiss signature, so a different set shows again.
	const orphanIds = useRibbonStore((s) =>
		s.orphans.entity
			.filter(
				(o) => !s.pendingOrphanDeletes.entity.includes(o.id) && !o.recentPublish?.published,
			)
			.map((o) => o.id)
			.sort()
			.join("|"),
	);
	const orphanCount = orphanIds ? orphanIds.split("|").length : 0;
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const clearSelection = useSelectionStore((s) => s.clearSelection);
	const ribbonViewStyle = useUIStore((s) => s.ribbonViewStyle);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	const setPropertiesRequested = useUIStore((s) => s.setPropertiesRequested);
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

	// Things to act on, one at a time (#181). What a location or tab is lives in
	// About this location and the tab's info button instead of permanent banners.
	const messages: SlotMessage[] = [];
	if (layerReadError && !isLoadingRibbon && !ribbonLoadError) {
		messages.push({
			id: "layer-read",
			intent: "warning",
			title: "Couldn't read your unmanaged ribbon customizations",
			body: `Labels may show as ids, and what you can edit or delete is unknown. Reload before editing. Details: ${layerReadError}`,
			dismissible: false,
			actions: onRetryRibbonLoad && (
				<Button
					size="small"
					onClick={() =>
						hasUnpublishedChanges() ? setConfirmingReload(true) : onRetryRibbonLoad()
					}
				>
					Retry
				</Button>
			),
		});
	}
	// Charts / AllEntities tabs: their buttons never show in Unified Interface (#64).
	if (currentTab && isHiddenOnUnifiedInterface(currentTab.id)) {
		messages.push({
			id: `hidden-tab:${currentTab.id}`,
			intent: "warning",
			title: "Unified Interface doesn't show this tab's buttons",
			body: "They don't come back when the table is reloaded either. Add buttons to the table's main tab instead.",
		});
	}
	// The table's customizations the ribbon doesn't return anywhere (#64).
	if (location !== "Application" && orphanCount > 0) {
		messages.push({
			id: "orphans",
			intent: "warning",
			signature: orphanIds,
			title: `${orphanCount} of your customizations ${orphanCount !== 1 ? "aren't" : "isn't"} on the canvas`,
			body: (
				<>
					The ribbon doesn&apos;t return {orphanCount !== 1 ? "them" : "it"}. See{" "}
					<strong>Orphaned customizations</strong> in the Properties pane to delete{" "}
					{orphanCount !== 1 ? "them" : "it"}.
				</>
			),
			actions: (
				<Button
					size="small"
					onClick={() => {
						clearSelection();
						setPropertiesRequested(true);
					}}
				>
					Show
				</Button>
			),
		});
	}

	if (emptyState) {
		return (
			<main className={styles.root} aria-label="Ribbon canvas">
				<CanvasEmptyState kind={emptyState} />
			</main>
		);
	}

	return (
		<main className={styles.root} aria-label="Ribbon canvas">
			<LocationRow />

			<MessageSlot
				messages={messages}
				scope={`canvas:${connectionUrl}:${ribbon.entityLogicalName}:${location}`}
				className={styles.messages}
			/>

			{/* Canvas area */}
			<div className={styles.canvas}>
				{isLoadingRibbon ? (
					<CanvasLoading table={loadingTable} step={loadingStep} />
				) : ribbonLoadError ? (
					<CanvasLoadError
						table={loadingTable}
						error={ribbonLoadError}
						onRetry={onRetryRibbonLoad}
					/>
				) : !currentTab ? (
					<EmptyTab onAddGroup={openNewGroup} />
				) : (
					<>
						{ribbonViewStyle === "groups" ? (
							<>
								<UsersBar tab={currentTab} location={location} />
								<GroupCards tab={currentTab} location={location} />
							</>
						) : ribbonViewStyle === "classic" ? (
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
