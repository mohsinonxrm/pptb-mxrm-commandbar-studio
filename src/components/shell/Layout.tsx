import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button, OverlayDrawer, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { PanelLeftExpandRegular, PanelRightExpandRegular } from "@fluentui/react-icons";
import { TopBar } from "./TopBar";
import { ShellMessages } from "./ShellMessages";
import { useUIStore } from "@/store/uiStore";
import { PropertiesHostContext } from "@/components/properties-pane/propertiesHost";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ResizableHandle } from "@/components/shared/ResizableHandle";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { dragPaneWidths, fitPaneWidths } from "@/utils/paneWidths";

// Lazy-loaded panels and modals
// The command and rule editors are views of one drawer (#186).
const EditorDrawer = lazy(() => import("@/components/panels/EditorDrawer"));
const BulkPublishModal = lazy(() => import("@/components/modals/BulkPublishModal"));
const NewButtonModal = lazy(() => import("@/components/modals/NewButtonModal"));
const NewGroupModal = lazy(() => import("@/components/modals/NewGroupModal"));
const NewTabModal = lazy(() => import("@/components/modals/NewTabModal"));
const ImportXmlModal = lazy(() => import("@/components/modals/ImportXmlModal"));
const CommandPalette = lazy(() => import("@/components/command-palette/CommandPalette"));
const IconPickerModal = lazy(() => import("@/components/modals/IconPickerModal"));
const WebResourceBrowser = lazy(() => import("@/components/panels/WebResourceBrowser"));
const UrlComposerModal = lazy(() => import("@/components/panels/UrlComposerModal"));
const HideInsteadOfDeleteModal = lazy(() => import("@/components/modals/HideInsteadOfDeleteModal"));

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
	/** Below NARROW_WIDTH the side panes become a rail and overlay drawers (#179). */
	rail: {
		width: "48px",
		flexShrink: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		paddingTop: tokens.spacingVerticalS,
		borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	drawerBody: {
		position: "relative",
		width: "100%",
		height: "100%",
		overflow: "hidden",
	},
});

/** Below this window width the side panes stop taking canvas width (#179). */
const NARROW_WIDTH = 1200;

function useWindowWidth(): number {
	const [width, setWidth] = useState(() => window.innerWidth);
	useEffect(() => {
		const onResize = () => setWidth(window.innerWidth);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return width;
}

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
	const windowWidth = useWindowWidth();
	const narrow = windowWidth < NARROW_WIDTH;
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const activeTable = useSessionStore((s) => s.activeEntity?.logicalName ?? null);
	const [leftOpen, setLeftOpen] = useState(false);
	const selectedModernId = useModernCommandStore((s) => s.selectedCommandId);
	const [propsOpenState, setPropsOpen] = useState(false);
	// Show orphans and similar actions ask for Properties (#179 review).
	const propertiesRequested = useUIStore((s) => s.propertiesRequested);
	const setPropertiesRequested = useUIStore((s) => s.setPropertiesRequested);
	const propsOpen = propsOpenState || (narrow && propertiesRequested);
	const closeProps = () => {
		setPropsOpen(false);
		setPropertiesRequested(false);
	};
	// In a narrow window, selecting something (a classic control or a modern
	// command) opens Properties; clearing the selection doesn't close it.
	// While the Structure drawer is open, a selection (opening a node's menu
	// selects it) leaves Properties alone: it would take the focus and close the
	// menu. Choosing a group or control there closes the drawer and opens
	// Properties (#194). Opening a table closes the drawer as well (compared
	// during render).
	const selected = !!(selectedButtonId || selectedGroupId || selectedModernId);
	const selectionKey = `${selectedGroupId ?? ""}|${selectedButtonId ?? ""}|${selectedModernId ?? ""}`;
	const [seenSelection, setSeenSelection] = useState(selectionKey);
	if (seenSelection !== selectionKey) {
		setSeenSelection(selectionKey);
		if (narrow && !leftOpen && selected) setPropsOpen(true);
	}
	// The drawers start closed whenever the window crosses the narrow width.
	const [seenNarrow, setSeenNarrow] = useState(narrow);
	if (seenNarrow !== narrow) {
		setSeenNarrow(narrow);
		setLeftOpen(false);
		setPropsOpen(false);
	}
	const structureChoice = useUIStore((s) => s.structureChoice);
	const [seenChoice, setSeenChoice] = useState(structureChoice);
	if (seenChoice !== structureChoice) {
		setSeenChoice(structureChoice);
		setLeftOpen(false);
		if (narrow && selected) setPropsOpen(true);
	}
	const [seenTable, setSeenTable] = useState(activeTable);
	if (seenTable !== activeTable) {
		setSeenTable(activeTable);
		setLeftOpen(false);
	}
	const fitted = fitPaneWidths(
		windowWidth,
		leftPaneWidth,
		rightPaneMode === "docked" ? rightPaneWidth : 0,
	);
	const anyOverlayOpen = useUIStore(
		(s) =>
			s.editorStack.length > 0 ||
			s.bulkPublishOpen ||
			s.newButtonGroupId !== null ||
			s.newGroupOpen ||
			s.newTabOpen ||
			s.importXmlOpen ||
			s.commandPaletteOpen ||
			s.iconPickerOpen ||
			s.webResourceBrowserOpen ||
			s.urlComposerOpen ||
			s.hideInsteadOfDelete !== null,
	);
	const focusReturnRef = useRef<HTMLElement | null>(null);
	const wasOverlayOpenRef = useRef(false);

	useKeyboardShortcuts();

	useEffect(() => {
		if (propertiesRequested && !narrow) setPropertiesRequested(false);
	}, [propertiesRequested, narrow, setPropertiesRequested]);

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

	const dockedRight = rightPaneMode === "docked" ? rightPaneWidth : 0;
	const resizePane = useCallback(
		(side: "left" | "right", delta: number) => {
			const next = dragPaneWidths(windowWidth, leftPaneWidth, dockedRight, side, delta);
			if (next.left !== undefined) setLeftPaneWidth(next.left);
			if (next.right !== undefined) setRightPaneWidth(next.right);
		},
		[windowWidth, leftPaneWidth, dockedRight, setLeftPaneWidth, setRightPaneWidth],
	);
	const resizeLeft = useCallback((delta: number) => resizePane("left", delta), [resizePane]);
	const resizeRight = useCallback((delta: number) => resizePane("right", delta), [resizePane]);

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
			<ShellMessages />
			<div className={styles.body}>
				{narrow ? (
					<nav className={styles.rail} aria-label="Side panes">
						<Tooltip content="Structure and solution" relationship="label">
							<Button
								appearance="subtle"
								icon={<PanelLeftExpandRegular />}
								aria-expanded={leftOpen}
								onClick={() => setLeftOpen(true)}
							/>
						</Tooltip>
						{rightPaneMode !== "hidden" && (
							<Tooltip content="Properties" relationship="label">
								<Button
									appearance="subtle"
									icon={<PanelRightExpandRegular />}
									aria-pressed={propsOpen}
									onClick={() => (propsOpen ? closeProps() : setPropsOpen(true))}
								/>
							</Tooltip>
						)}
					</nav>
				) : (
					<>
						<div className={styles.leftPane} style={{ width: fitted.left }}>
							<ErrorBoundary label="Left pane">{leftPane}</ErrorBoundary>
						</div>
						<ResizableHandle
							direction="vertical"
							onResize={resizeLeft}
							aria-label="Resize left pane"
						/>
					</>
				)}
				<ErrorBoundary label="Ribbon canvas">{children}</ErrorBoundary>
				{narrow && (
					<>
						<OverlayDrawer
							position="start"
							size="small"
							open={leftOpen}
							onOpenChange={(_, d) => setLeftOpen(d.open)}
							aria-label="Structure and solution"
						>
							<div className={styles.drawerBody}>
								<ErrorBoundary label="Left pane">{leftPane}</ErrorBoundary>
							</div>
						</OverlayDrawer>
						{rightPaneMode !== "hidden" && (
							// Non-modal: the canvas stays usable, so picking another button
							// updates Properties instead of needing a close first.
							<OverlayDrawer
								position="end"
								size="small"
								modalType="non-modal"
								open={propsOpen}
								onOpenChange={(_, d) =>
									d.open ? setPropsOpen(true) : closeProps()
								}
								aria-label="Properties"
							>
								<div className={styles.drawerBody}>
									{/* Properties' own header shows this close button (#184). */}
									<PropertiesHostContext.Provider value={{ onClose: closeProps }}>
										<ErrorBoundary label="Properties pane">
											{rightPane}
										</ErrorBoundary>
									</PropertiesHostContext.Provider>
								</div>
							</OverlayDrawer>
						)}
					</>
				)}
				{!narrow && rightPaneMode === "docked" && (
					<>
						<ResizableHandle
							direction="vertical"
							onResize={resizeRight}
							aria-label="Resize right pane"
						/>
						<div className={styles.rightPane} style={{ width: fitted.right }}>
							<ErrorBoundary label="Properties pane">{rightPane}</ErrorBoundary>
						</div>
					</>
				)}
				{!narrow && rightPaneMode === "floating" && (
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

			{/* Lazy-loaded global overlays. A chunk that fails to load must not take
			    the whole tool down (#89). */}
			<ErrorBoundary label="Panels">
				<Suspense fallback={null}>
					<EditorDrawer />
					<BulkPublishModal />
					<NewButtonModal />
					<NewGroupModal />
					<NewTabModal />
					<ImportXmlModal />
					<CommandPalette />
					<IconPickerModal />
					<WebResourceBrowser />
					<UrlComposerModal />
					<HideInsteadOfDeleteModal />
				</Suspense>
			</ErrorBoundary>

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
