import { Suspense, lazy, useEffect, useState } from "react";
import {
	Button,
	Caption1,
	DrawerBody,
	DrawerFooter,
	DrawerHeader,
	DrawerHeaderNavigation,
	DrawerHeaderTitle,
	OverlayDrawer,
	Spinner,
	Toolbar,
	ToolbarButton,
	makeStyles,
	mergeClasses,
	tokens,
} from "@fluentui/react-components";
import { ArrowLeftRegular, DismissRegular } from "@fluentui/react-icons";
import { IdField } from "@/components/shared/IdField";
import { CommandHeader } from "@/components/panels/CommandHeader";
import { RuleHeader } from "@/components/panels/RuleHeader";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore, type EditorView } from "@/store/uiStore";

const CommandEditorPanel = lazy(() => import("@/components/panels/CommandEditorPanel"));
const RuleEditorPanel = lazy(() => import("@/components/panels/RuleEditorPanel"));
const ScriptView = lazy(() => import("@/components/panels/ScriptView"));
const TabDisplayRulesPanel = lazy(() => import("@/components/panels/TabDisplayRulesPanel"));
const XmlView = lazy(() => import("@/components/panels/XmlView"));
const CompareView = lazy(() => import("@/components/panels/CompareView"));

/**
 * The editor drawer (#186): one drawer that navigates instead of drawers on
 * drawers. A rule opened from the command editor is a view on top of it, and
 * Back returns to the command. Edits apply as you make them; the drawer is one
 * edit session, so a single Undo reverts everything done between opening it
 * and Done, and closing it any way is safe.
 */

const useStyles = makeStyles({
	// One width for every view, so Back doesn't make it jump; wide enough for a
	// rule's nested Or branches (#186).
	drawer: { width: "720px", maxWidth: "90vw" },
	// XML and diffs read better wide; they're opened on their own.
	wide: { width: "960px" },
	// A code view fills the drawer instead of a fixed-height box.
	fill: { display: "flex", flexDirection: "column" },
	navigation: { justifyContent: "space-between" },
	title: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
		minWidth: 0,
	},
	trail: { color: tokens.colorNeutralForeground3 },
	idRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
		marginTop: tokens.spacingVerticalXS,
	},
	id: { flex: 1, minWidth: 0 },
	footer: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: tokens.spacingHorizontalM,
	},
	hint: { color: tokens.colorNeutralForeground3 },
});

function viewTitle(view: EditorView): string {
	if (view.kind === "command") return "Edit command";
	if (view.kind === "rule") return `Edit ${view.ruleKind} rule`;
	if (view.kind === "tabRules") return "Tab display rules";
	if (view.kind === "xml") return "XML of your changes";
	if (view.kind === "diff")
		return view.id === "compare" ? "Compare with published" : "What this change did";
	return view.editable ? "Edit script" : "View script";
}

export function EditorDrawer() {
	const styles = useStyles();
	const stack = useUIStore((s) => s.editorStack);
	const editorBack = useUIStore((s) => s.editorBack);
	const closeEditor = useUIStore((s) => s.closeEditor);
	const open = stack.length > 0;
	// While it slides out, the drawer keeps showing what it showed.
	const [lastStack, setLastStack] = useState(stack);
	if (open && stack !== lastStack) setLastStack(stack);
	const shown = open ? stack : lastStack;
	const view = shown[shown.length - 1];
	const previous = shown[shown.length - 2];

	// One edit session from opening to closing: one Undo reverts it all.
	useEffect(() => {
		if (!open) return;
		const store = useRibbonStore.getState();
		store.beginEditSession();
		return () => useRibbonStore.getState().endEditSession();
	}, [open]);

	return (
		<OverlayDrawer
			position="end"
			open={open}
			onOpenChange={(_, d) => !d.open && closeEditor()}
			className={mergeClasses(
				styles.drawer,
				(view?.kind === "xml" || view?.kind === "diff") && styles.wide,
			)}
			aria-label={view ? viewTitle(view) : "Editor"}
		>
			<DrawerHeader>
				<DrawerHeaderNavigation>
					<Toolbar className={styles.navigation}>
						{previous ? (
							<ToolbarButton
								appearance="subtle"
								icon={<ArrowLeftRegular />}
								onClick={editorBack}
							>
								{viewTitle(previous)}
							</ToolbarButton>
						) : (
							<span />
						)}
						<ToolbarButton
							appearance="subtle"
							icon={<DismissRegular />}
							aria-label="Close"
							onClick={closeEditor}
						/>
					</Toolbar>
				</DrawerHeaderNavigation>
				{view && (
					<DrawerHeaderTitle>
						<span className={styles.title}>
							{shown.length > 1 && (
								<Caption1 className={styles.trail}>
									{shown.slice(0, -1).map(viewTitle).join(" › ")} ›
								</Caption1>
							)}
							{viewTitle(view)}
						</span>
					</DrawerHeaderTitle>
				)}
				{view?.kind === "command" && <CommandHeader key={view.id} commandId={view.id} />}
				{view?.kind === "rule" && (
					<RuleHeader key={view.id} ruleId={view.id} kind={view.ruleKind} />
				)}
				{(view?.kind === "script" || view?.kind === "tabRules") && (
					<div className={styles.idRow}>
						<div className={styles.id}>
							<IdField
								label={view.kind === "tabRules" ? "Tab ID" : "Web resource"}
								value={view.id}
								hideLabel
							/>
						</div>
					</div>
				)}
			</DrawerHeader>
			<DrawerBody
				className={mergeClasses(
					(view?.kind === "script" || view?.kind === "xml" || view?.kind === "diff") &&
						styles.fill,
				)}
			>
				<Suspense fallback={<Spinner size="small" label="Loading…" />}>
					{view?.kind === "command" && <CommandEditorPanel />}
					{view?.kind === "rule" && <RuleEditorPanel />}
					{view?.kind === "tabRules" && (
						<TabDisplayRulesPanel location={view.location} tabId={view.id} />
					)}
					{view?.kind === "script" && (
						<ScriptView key={view.id} name={view.id} editable={view.editable} />
					)}
					{view?.kind === "xml" && <XmlView key={view.id} location={view.id} />}
					{view?.kind === "diff" && (
						<CompareView
							key={`${view.id}:${view.historyIndex ?? ""}`}
							historyIndex={view.historyIndex}
						/>
					)}
				</Suspense>
			</DrawerBody>
			<DrawerFooter className={styles.footer}>
				<Caption1 className={styles.hint}>
					{view?.kind === "script"
						? view.editable
							? "Save writes the script to Dataverse · Undo doesn't revert it"
							: ""
						: view?.kind === "xml" || view?.kind === "diff"
							? ""
							: "Changes apply as you edit · Ctrl Z to undo"}
				</Caption1>
				<Button appearance="primary" onClick={closeEditor}>
					Done
				</Button>
			</DrawerFooter>
		</OverlayDrawer>
	);
}

export default EditorDrawer;
