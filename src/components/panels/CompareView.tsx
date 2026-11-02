import React, { useMemo, Suspense } from "react";
import {
	makeStyles,
	tokens,
	Button,
	Caption1,
	Text,
	Badge,
	Spinner,
	Tab,
	TabList,
} from "@fluentui/react-components";
import { CheckmarkCircleRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import {
	hasPendingChanges,
	useRibbonStore,
	workspaceOf,
	type WorkspaceSnapshot,
} from "@/store/ribbonStore";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import type { RibbonDefinition, RibbonLocation } from "@/types/ribbon";

// Lazy-load DiffEditor, with Monaco's setup, so Monaco stays out of the initial bundle
const DiffEditorLazy = React.lazy(() =>
	import("@/utils/monacoSetup")
		.then(() => import("@monaco-editor/react"))
		.then((m) => ({ default: m.DiffEditor })),
);

type IStandaloneDiffEditor = import("monaco-editor/editor/editor.api").editor.IStandaloneDiffEditor;
type TokenEvents = { onDidChangeModelTokens?: (listener: () => void) => { dispose(): void } };

const LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form", "Application"];

const useStyles = makeStyles({
	// A view of the editor drawer (#186): the diff fills the drawer's height.
	root: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		minHeight: "320px",
	},
	unchanged: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: tokens.spacingVerticalM,
		textAlign: "center",
		color: tokens.colorNeutralForeground3,
	},
	bar: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalS,
	},
	spacer: { flex: 1 },
	muted: { color: tokens.colorNeutralForeground3 },
	editor: {
		flex: 1,
		minHeight: "240px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		overflow: "hidden",
		position: "relative",
	},
	loading: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		height: "100%",
	},
});

function diffStats(before: string, after: string) {
	const bLines = before.split("\n");
	const aLines = after.split("\n");
	let added = 0;
	let removed = 0;
	const bSet = new Set(bLines);
	const aSet = new Set(aLines);
	for (const line of aLines) if (!bSet.has(line)) added++;
	for (const line of bLines) if (!aSet.has(line)) removed++;
	return { added, removed };
}

/** The XML every location would publish for `workspace`, or `baseline` itself. */
function xmlOf(
	workspace: Pick<
		WorkspaceSnapshot,
		"ribbons" | "commands" | "displayRules" | "enableRules" | "locLabels"
	>,
	baseline: Record<RibbonLocation, RibbonDefinition>,
	useBaseline = false,
): string {
	return LOCATIONS.map((loc) => {
		const source = useBaseline ? baseline[loc] : workspace.ribbons[loc];
		try {
			return (
				`<!-- ${loc} -->\n` +
				generateRibbonDiffXml({
					location: loc,
					current: source,
					baseline: baseline[loc],
					commands: workspace.commands,
					displayRules: workspace.displayRules,
					enableRules: workspace.enableRules,
					locLabels: workspace.locLabels,
					entityLogicalName: source.entityLogicalName,
				})
			);
		} catch (e) {
			return `<!-- ${loc}: Error generating XML: ${String(e)} -->`;
		}
	}).join("\n\n");
}

/**
 * Compare with published (`historyIndex` absent), or what one history entry
 * changed, as a view of the editor drawer (#186).
 */
export const CompareView: React.FC<{ historyIndex?: number }> = ({ historyIndex }) => {
	const styles = useStyles();
	const themeMode = useUIStore((s) => s.themeMode);
	const isHistory = historyIndex !== undefined;
	const [sideBySide, setSideBySide] = React.useState(true);
	// Compare with nothing changed shows an empty state first (#195); the
	// "show anyway" choice lasts for one opening (the view mounts per opening).
	const [showUnchanged, setShowUnchanged] = React.useState(false);
	// The generated XML can match while commands, rules or labels differ, so
	// "no changes" comes from the store's own comparison with the baseline.
	const nothingPending = useRibbonStore(
		(s) => !isHistory && s.mutationsSincePublish === 0 && !hasPendingChanges(s),
	);
	const state = useRibbonStore();
	const entry = isHistory ? state.past[historyIndex] : undefined;

	// Compare: the published baseline against now, the baseline taken once per
	// opening. History: the workspace before the entry against the one after it.
	const before = useMemo(
		() =>
			isHistory
				? entry
					? xmlOf(entry.snapshot, state.baseline)
					: ""
				: xmlOf(state, state.baseline, true),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[isHistory, entry],
	);
	const afterWorkspace = isHistory
		? (state.past[historyIndex + 1]?.snapshot ?? workspaceOf(state))
		: workspaceOf(state);
	const after = useMemo(
		() => (isHistory && !entry ? "" : xmlOf(afterWorkspace, state.baseline)),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[
			isHistory,
			entry,
			afterWorkspace.ribbons,
			afterWorkspace.commands,
			afterWorkspace.displayRules,
			afterWorkspace.enableRules,
			afterWorkspace.locLabels,
			state.baseline,
		],
	);
	const { added, removed } = diffStats(before, after);

	// Capture the diff editor instance on mount so we can call updateOptions
	// imperatively. @monaco-editor/react's DiffEditor does not reliably
	// re-apply renderSideBySide via the options prop after the first render.
	const diffEditorRef = React.useRef<IStandaloneDiffEditor | null>(null);

	const handleDiffEditorMount = React.useCallback((editor: IStandaloneDiffEditor) => {
		diffEditorRef.current = editor;
		// Ensure the initial value is applied immediately
		editor.updateOptions({ renderSideBySide: sideBySide });
		// With a table open the diff can paint before the XML tokens arrive, and
		// it doesn't repaint those lines when they do: the text stays uncoloured
		// (seen in PPTB, #195 review). Repaint both sides once per batch of tokens.
		const sides = [editor.getOriginalEditor(), editor.getModifiedEditor()];
		let frame = 0;
		const repaint = () => {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				for (const side of sides) side.render(true);
			});
		};
		// The code editor has this event, but Monaco's public typings leave it out.
		const subscriptions = sides.flatMap((side) => {
			const onTokens = (side as TokenEvents).onDidChangeModelTokens;
			return onTokens ? [onTokens.call(side, repaint)] : [];
		});
		editor.onDidDispose(() => {
			cancelAnimationFrame(frame);
			for (const s of subscriptions) s.dispose();
		});
		// sideBySide intentionally omitted — we only want to sync on mount here
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Imperatively push renderSideBySide whenever the toggle changes
	React.useEffect(() => {
		diffEditorRef.current?.updateOptions({ renderSideBySide: sideBySide });
	}, [sideBySide]);

	if (isHistory && !entry)
		return (
			<div className={styles.unchanged}>
				<Text>This change was undone, so there&apos;s nothing to show.</Text>
			</div>
		);

	if (!isHistory && !showUnchanged && nothingPending)
		return (
			<div className={styles.unchanged}>
				<CheckmarkCircleRegular
					fontSize={40}
					color={tokens.colorPaletteGreenForeground1}
					aria-hidden="true"
				/>
				<Text size={500} weight="semibold">
					No changes since the last publish
				</Text>
				<Text>What you see matches what&apos;s published for this table.</Text>
				<Button onClick={() => setShowUnchanged(true)}>Show the full XML anyway</Button>
			</div>
		);

	return (
		<div className={styles.root}>
			<Caption1 className={styles.muted}>
				{isHistory
					? `${[entry!.op, entry!.target].filter(Boolean).join(" ")}${entry!.detail ? ` (${entry!.detail})` : ""}: the XML before it (left) and after it (right).`
					: "The published XML (left) and the XML with your changes (right)."}
			</Caption1>
			<div className={styles.bar}>
				{/* A count of none isn't news: neutral, not green or red (#229). */}
				<Badge appearance="tint" color={added ? "success" : "informative"}>
					+{added} lines
				</Badge>
				<Badge appearance="tint" color={removed ? "danger" : "informative"}>
					-{removed} lines
				</Badge>
				<div className={styles.spacer} />
				<TabList
					size="small"
					selectedValue={sideBySide ? "side" : "unified"}
					onTabSelect={(_, d) => setSideBySide(d.value === "side")}
					aria-label="Diff layout"
				>
					<Tab value="side">Side by side</Tab>
					<Tab value="unified">Unified</Tab>
				</TabList>
			</div>
			<div className={styles.editor}>
				<Suspense
					fallback={
						<div className={styles.loading}>
							<Spinner size="small" label="Loading the diff…" />
						</div>
					}
				>
					<DiffEditorLazy
						original={before}
						modified={after}
						language="xml"
						theme={themeMode === "dark" ? "vs-dark" : "vs"}
						height="100%"
						onMount={handleDiffEditorMount}
						options={{
							readOnly: true,
							renderSideBySide: sideBySide,
							lineNumbers: "on",
							minimap: { enabled: false },
							scrollBeyondLastLine: false,
							automaticLayout: true,
							wordWrap: "on",
						}}
					/>
				</Suspense>
			</div>
		</div>
	);
};

export default CompareView;
