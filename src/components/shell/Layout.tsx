import React, { lazy, Suspense, useCallback, useEffect, useRef } from "react";
import { makeStyles, tokens } from "@fluentui/react-components";
import { TopBar } from "./TopBar";
import { SubHeader } from "./SubHeader";
import { useUIStore } from "@/store/uiStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ResizableHandle } from "@/components/shared/ResizableHandle";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

// Lazy-loaded panels and modals
const XmlDrawer = lazy(() => import("@/components/panels/XmlDrawer"));
const CommandEditorPanel = lazy(() => import("@/components/panels/CommandEditorPanel"));
const RuleEditorPanel = lazy(() => import("@/components/panels/RuleEditorPanel"));
const BulkPublishModal = lazy(() => import("@/components/modals/BulkPublishModal"));
const NewButtonModal = lazy(() => import("@/components/modals/NewButtonModal"));
const NewGroupModal = lazy(() => import("@/components/modals/NewGroupModal"));
const NewTabModal = lazy(() => import("@/components/modals/NewTabModal"));
const ImportXmlModal = lazy(() => import("@/components/modals/ImportXmlModal"));
const CommandPalette = lazy(() => import("@/components/command-palette/CommandPalette"));
const LocalizationEditor = lazy(() => import("@/components/modals/LocalizationEditor"));
const IconPickerModal = lazy(() => import("@/components/modals/IconPickerModal"));
const TabDisplayRulesPanel = lazy(() => import("@/components/panels/TabDisplayRulesPanel"));
const ScalingEditorPanel = lazy(() => import("@/components/panels/ScalingEditorPanel"));
const ConflictDrawer = lazy(() => import("@/components/panels/ConflictDrawer"));
const WebResourceBrowser = lazy(() => import("@/components/panels/WebResourceBrowser"));
const UrlComposerModal = lazy(() => import("@/components/panels/UrlComposerModal"));
const DiffViewer = lazy(() => import("@/components/panels/DiffViewer"));

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		height: "100vh",
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground1,
		color: tokens.colorNeutralForeground1,
		fontFamily: tokens.fontFamilyBase,
	},
	body: {
		display: "flex",
		flex: 1,
		overflow: "hidden",
		position: "relative",
	},
	leftPane: {
		flexShrink: 0,
		overflow: "hidden",
		borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	rightPane: {
		flexShrink: 0,
		overflow: "hidden",
		borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	bottomPanel: {
		flexShrink: 0,
	},
});

interface LayoutProps {
	children: React.ReactNode;
	leftPane: React.ReactNode;
	rightPane: React.ReactNode;
	bottomPanel: React.ReactNode;
}

export function Layout({ children, leftPane, rightPane, bottomPanel }: LayoutProps) {
	const styles = useStyles();
	const leftPaneWidth = useUIStore((s) => s.leftPaneWidth);
	const rightPaneWidth = useUIStore((s) => s.rightPaneWidth);
	const rightPaneMode = useUIStore((s) => s.rightPaneMode);
	const setLeftPaneWidth = useUIStore((s) => s.setLeftPaneWidth);
	const setRightPaneWidth = useUIStore((s) => s.setRightPaneWidth);
	const bottomPanelHeight = useUIStore((s) => s.bottomPanelHeight);
	const bottomCollapsed = useUIStore((s) => s.bottomCollapsed);
	const setBottomPanelHeight = useUIStore((s) => s.setBottomPanelHeight);
	const announcement = useUIStore((s) => s.announcement);
	const anyOverlayOpen = useUIStore(
		(s) =>
			s.xmlDrawerOpen ||
			s.commandEditorOpen ||
			s.ruleEditorOpen ||
			s.bulkPublishOpen ||
			s.newButtonGroupId !== null ||
			s.newGroupOpen ||
			s.newTabOpen ||
			s.importXmlOpen ||
			s.commandPaletteOpen ||
			s.localizationEditorOpen ||
			s.iconPickerOpen ||
			s.tabDisplayRulesOpen ||
			s.scalingEditorOpen ||
			s.conflictDrawerOpen ||
			s.webResourceBrowserOpen ||
			s.urlComposerOpen ||
			s.diffViewerOpen,
	);
	const focusReturnRef = useRef<HTMLElement | null>(null);
	const wasOverlayOpenRef = useRef(false);

	useKeyboardShortcuts();

	useEffect(() => {
		if (anyOverlayOpen && !wasOverlayOpenRef.current) {
			const active = document.activeElement;
			focusReturnRef.current = active instanceof HTMLElement ? active : null;
		}

		if (!anyOverlayOpen && wasOverlayOpenRef.current) {
			const previous = focusReturnRef.current;
			requestAnimationFrame(() => {
				if (!previous || !previous.isConnected) return;
				previous.focus();
			});
		}

		wasOverlayOpenRef.current = anyOverlayOpen;
	}, [anyOverlayOpen]);

	const resizeLeft = useCallback(
		(delta: number) => {
			setLeftPaneWidth(Math.max(160, Math.min(500, leftPaneWidth + delta)));
		},
		[leftPaneWidth, setLeftPaneWidth],
	);

	const resizeRight = useCallback(
		(delta: number) => {
			setRightPaneWidth(Math.max(200, Math.min(600, rightPaneWidth - delta)));
		},
		[rightPaneWidth, setRightPaneWidth],
	);

	const resizeBottom = useCallback(
		(delta: number) => {
			const next = bottomPanelHeight - delta;
			setBottomPanelHeight(Math.max(120, Math.min(520, next)));
		},
		[bottomPanelHeight, setBottomPanelHeight],
	);

	return (
		<div className={styles.root}>
			<TopBar />
			<SubHeader />
			<div className={styles.body}>
				<div className={styles.leftPane} style={{ width: leftPaneWidth }}>
					<ErrorBoundary label="Left pane">{leftPane}</ErrorBoundary>
				</div>
				<ResizableHandle direction="vertical" onResize={resizeLeft} aria-label="Resize left pane" />
				<ErrorBoundary label="Ribbon canvas">{children}</ErrorBoundary>
				{rightPaneMode === "docked" && (
					<>
						<ResizableHandle
							direction="vertical"
							onResize={resizeRight}
							aria-label="Resize right pane"
						/>
						<div className={styles.rightPane} style={{ width: rightPaneWidth }}>
							<ErrorBoundary label="Properties pane">{rightPane}</ErrorBoundary>
						</div>
					</>
				)}
				{rightPaneMode === "floating" && (
					<div
						style={{
							position: "absolute",
							right: 8,
							top: 8,
							bottom: 8,
							width: rightPaneWidth,
							maxWidth: "90vw",
							border: `1px solid ${tokens.colorNeutralStroke2}`,
							backgroundColor: tokens.colorNeutralBackground1,
							boxShadow: tokens.shadow16,
							borderRadius: tokens.borderRadiusMedium,
							overflow: "hidden",
							zIndex: 10,
						}}
					>
						<ErrorBoundary label="Properties pane">{rightPane}</ErrorBoundary>
					</div>
				)}
			</div>
			{!bottomCollapsed && (
				<ResizableHandle
					direction="horizontal"
					onResize={resizeBottom}
					aria-label="Resize bottom panel"
				/>
			)}
			<div className={styles.bottomPanel}>
				<ErrorBoundary label="Bottom panel">{bottomPanel}</ErrorBoundary>
			</div>

			{/* Lazy-loaded global overlays */}
			<Suspense fallback={null}>
				<XmlDrawer />
				<CommandEditorPanel />
				<RuleEditorPanel />
				<BulkPublishModal />
				<NewButtonModal />
				<NewGroupModal />
				<NewTabModal />
				<ImportXmlModal />
				<CommandPalette />
				<LocalizationEditor />
				<IconPickerModal />
				<TabDisplayRulesPanel />
				<ScalingEditorPanel />
				<ConflictDrawer />
				<WebResourceBrowser />
				<UrlComposerModal />
				<DiffViewer />
			</Suspense>

			{/* ARIA live region — announces keyboard shortcut actions to screen readers */}
			<div
				role="status"
				aria-live="polite"
				aria-atomic="true"
				style={{
					position: "absolute",
					width: 1,
					height: 1,
					overflow: "hidden",
					clip: "rect(0 0 0 0)",
					whiteSpace: "nowrap",
					left: -9999,
					top: "auto",
				}}
			>
				{announcement}
			</div>
		</div>
	);
}
