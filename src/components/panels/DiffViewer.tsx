import React, { useMemo, Suspense } from "react";
import {
	makeStyles,
	tokens,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Button,
	Text,
	Badge,
	Subtitle2,
	MessageBar,
	MessageBarBody,
	Spinner,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { generateRibbonDiffXml } from "@/services/xmlGenerator";
import type { RibbonLocation } from "@/types/ribbon";

// Lazy-load DiffEditor so Monaco stays out of the initial bundle
const DiffEditorLazy = React.lazy(() =>
	import("@monaco-editor/react").then((m) => ({ default: m.DiffEditor })),
);

type IStandaloneDiffEditor = import("monaco-editor").editor.IStandaloneDiffEditor;

const LOCATIONS: RibbonLocation[] = ["HomepageGrid", "SubGrid", "Form", "Application"];

const useStyles = makeStyles({
	drawer: {},
	body: {
		display: "flex",
		flexDirection: "column",
		flex: "1 1 auto",
		minHeight: 0,
		overflow: "hidden",
		gap: tokens.spacingHorizontalS,
	},
	statsBar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		flexShrink: 0,
	},
	toggleRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	editorWrap: {
		flex: 1,
		// height: 0 + flex: 1 = proper flexbox height that children can resolve `height: 100%` against.
		// minHeight ensures at least 400 px even if the panel is very short.
		height: 0,
		minHeight: "400px",
		overflow: "hidden",
		position: "relative",
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

function tryGenerateXml(
	ribbons: ReturnType<typeof useRibbonStore.getState>["ribbons"],
	baseline: ReturnType<typeof useRibbonStore.getState>["baseline"],
	commands: ReturnType<typeof useRibbonStore.getState>["commands"],
	displayRules: ReturnType<typeof useRibbonStore.getState>["displayRules"],
	enableRules: ReturnType<typeof useRibbonStore.getState>["enableRules"],
	locLabels: ReturnType<typeof useRibbonStore.getState>["locLabels"],
	useBaseline: boolean,
): string {
	const xmlParts: string[] = [];
	for (const loc of LOCATIONS) {
		const source = useBaseline ? baseline[loc] : ribbons[loc];
		const base = baseline[loc];
		try {
			xmlParts.push(
				`<!-- ${loc} -->\n` +
					generateRibbonDiffXml({
						location: loc,
						current: source,
						baseline: base,
						commands,
						displayRules,
						enableRules,
						locLabels,
						entityLogicalName: source.entityLogicalName,
					}),
			);
		} catch (e) {
			xmlParts.push(`<!-- ${loc}: Error generating XML: ${String(e)} -->`);
		}
	}
	return xmlParts.join("\n\n");
}

export const DiffViewer: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.diffViewerOpen);
	const mode = useUIStore((s) => s.diffViewerMode);
	const closeDiffViewer = useUIStore((s) => s.closeDiffViewer);
	const themeMode = useUIStore((s) => s.themeMode);
	const [sideBySide, setSideBySide] = React.useState(true);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const locLabels = useRibbonStore((s) => s.locLabels);

	const isDark = themeMode === "dark";

	const baselineXml = useMemo(
		() => tryGenerateXml(ribbons, baseline, commands, displayRules, enableRules, locLabels, true),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[open],
	);

	const currentXml = useMemo(
		() => tryGenerateXml(ribbons, baseline, commands, displayRules, enableRules, locLabels, false),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[open, ribbons, baseline, commands, displayRules, enableRules, locLabels],
	);

	const { added, removed } = diffStats(baselineXml, currentXml);

	// Capture the diff editor instance on mount so we can call updateOptions
	// imperatively. @monaco-editor/react's DiffEditor does not reliably
	// re-apply renderSideBySide via the options prop after the first render.
	const diffEditorRef = React.useRef<IStandaloneDiffEditor | null>(null);

	const handleDiffEditorMount = React.useCallback((editor: IStandaloneDiffEditor) => {
		diffEditorRef.current = editor;
		// Ensure the initial value is applied immediately
		editor.updateOptions({ renderSideBySide: sideBySide });
		// sideBySide intentionally omitted — we only want to sync on mount here
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Imperatively push renderSideBySide whenever the toggle changes
	React.useEffect(() => {
		diffEditorRef.current?.updateOptions({ renderSideBySide: sideBySide });
	}, [sideBySide]);

	return (
		<OverlayDrawer
			className={styles.drawer}
			open={open}
			position="end"
			size="full"
			onOpenChange={(_, d) => !d.open && closeDiffViewer()}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeDiffViewer}
							aria-label="Close"
						/>
					}
				>
					<Subtitle2>{mode === "compare" ? "Compare to baseline" : "Diff viewer"}</Subtitle2>
				</DrawerHeaderTitle>
			</DrawerHeader>

			<DrawerBody
				style={{
					display: "flex",
					flexDirection: "column",
					flex: "1 1 auto",
					minHeight: 0,
					overflow: "hidden",
				}}
			>
				<div className={styles.body}>
					<MessageBar intent="info">
						<MessageBarBody>
							<Text size={200}>
								{mode === "compare"
									? "Showing current state vs. last published baseline."
									: "Showing the change introduced by this history entry."}
							</Text>
						</MessageBarBody>
					</MessageBar>

					<div className={styles.toggleRow}>
						<Badge appearance="tint" color="success">
							+{added} lines
						</Badge>
						<Badge appearance="tint" color="danger">
							-{removed} lines
						</Badge>
						<div style={{ flex: 1 }} />
						<Button
							appearance={sideBySide ? "primary" : "subtle"}
							size="small"
							onClick={() => setSideBySide(true)}
						>
							Side by side
						</Button>
						<Button
							appearance={!sideBySide ? "primary" : "subtle"}
							size="small"
							onClick={() => setSideBySide(false)}
						>
							Unified
						</Button>
					</div>

					<div className={styles.editorWrap}>
						<Suspense
							fallback={
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										height: "100%",
									}}
								>
									<Spinner size="medium" label="Loading diff editor…" />
								</div>
							}
						>
							<DiffEditorLazy
								original={baselineXml}
								modified={currentXml}
								language="xml"
								theme={isDark ? "vs-dark" : "vs"}
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
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default DiffViewer;
