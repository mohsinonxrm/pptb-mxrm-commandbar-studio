import { Suspense, lazy, useEffect } from "react";
import {
	Badge,
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
	type BadgeProps,
} from "@fluentui/react-components";
import { ArrowLeftRegular, DismissRegular } from "@fluentui/react-icons";
import { IdField } from "@/components/shared/IdField";
import { useCommandProvenance } from "@/hooks/useCommandProvenance";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore, type EditorView } from "@/store/uiStore";
import type { CommandProvenance } from "@/utils/commandProvenance";

const CommandEditorPanel = lazy(() => import("@/components/panels/CommandEditorPanel"));
const RuleEditorPanel = lazy(() => import("@/components/panels/RuleEditorPanel"));

/**
 * The editor drawer (#186): one drawer that navigates instead of drawers on
 * drawers. A rule opened from the command editor is a view on top of it, and
 * Back returns to the command. Edits apply as you make them; the drawer is one
 * edit session, so a single Undo reverts everything done between opening it
 * and Done, and closing it any way is safe.
 */

const useStyles = makeStyles({
	drawer: { width: "560px", maxWidth: "90vw" },
	wide: { width: "640px" },
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
	badge: { flexShrink: 0 },
	footer: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: tokens.spacingHorizontalM,
	},
	hint: { color: tokens.colorNeutralForeground3 },
});

function viewTitle(view: EditorView): string {
	return view.kind === "command" ? "Edit command" : `Edit ${view.ruleKind} rule`;
}

const PROVENANCE_BADGE: Record<CommandProvenance, { text: string; color: BadgeProps["color"] }> = {
	custom: { text: "Yours", color: "success" },
	customising: { text: "Your copy", color: "brand" },
	customised: { text: "Your copy", color: "brand" },
	oob: { text: "Read-only", color: "informative" },
	uncustomising: { text: "Read-only", color: "informative" },
	reloadRequired: { text: "Read-only", color: "informative" },
};

/** Whose command it is, next to its id. */
function CommandBadge({ commandId }: { commandId: string }) {
	const styles = useStyles();
	const provenance = useCommandProvenance(commandId);
	if (!provenance) return null;
	const badge = PROVENANCE_BADGE[provenance.provenance];
	return (
		<Badge appearance="tint" color={badge.color} size="small" className={styles.badge}>
			{badge.text}
		</Badge>
	);
}

export function EditorDrawer() {
	const styles = useStyles();
	const stack = useUIStore((s) => s.editorStack);
	const editorBack = useUIStore((s) => s.editorBack);
	const closeEditor = useUIStore((s) => s.closeEditor);
	const open = stack.length > 0;
	const view = stack[stack.length - 1];
	const previous = stack[stack.length - 2];

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
			className={mergeClasses(styles.drawer, view?.kind === "command" && styles.wide)}
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
							{stack.length > 1 && (
								<Caption1 className={styles.trail}>
									{stack.slice(0, -1).map(viewTitle).join(" › ")} ›
								</Caption1>
							)}
							{viewTitle(view)}
						</span>
					</DrawerHeaderTitle>
				)}
				{view && (
					<div className={styles.idRow}>
						<div className={styles.id}>
							<IdField
								label={view.kind === "command" ? "Command ID" : "Rule ID"}
								value={view.id}
								hideLabel
							/>
						</div>
						{view.kind === "command" && <CommandBadge commandId={view.id} />}
					</div>
				)}
			</DrawerHeader>
			<DrawerBody>
				<Suspense fallback={<Spinner size="small" label="Loading…" />}>
					{view?.kind === "command" && <CommandEditorPanel />}
					{view?.kind === "rule" && <RuleEditorPanel />}
				</Suspense>
			</DrawerBody>
			<DrawerFooter className={styles.footer}>
				<Caption1 className={styles.hint}>
					Changes apply as you edit · Ctrl Z to undo
				</Caption1>
				<Button appearance="primary" onClick={closeEditor}>
					Done
				</Button>
			</DrawerFooter>
		</OverlayDrawer>
	);
}

export default EditorDrawer;
