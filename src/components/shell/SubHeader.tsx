import { makeStyles, tokens, Button, Badge, Select } from "@fluentui/react-components";
import {
	EyeRegular,
	CodeRegular,
	ArrowSwapRegular,
	BranchCompareRegular,
} from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";

const useStyles = makeStyles({
	root: {
		height: "36px",
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `0 ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground2,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
		position: "relative",
	},
	breadcrumb: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase200,
	},
	separator: {
		color: tokens.colorNeutralForeground4,
	},
	activeSegment: {
		color: tokens.colorNeutralForeground1,
		fontWeight: tokens.fontWeightSemibold,
	},
	spacer: { flex: 1 },
});

export function SubHeader() {
	const styles = useStyles();
	const mutationsSincePublish = useRibbonStore((s) => s.mutationsSincePublish);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
	const openImportXml = useUIStore((s) => s.openImportXml);
	const openDiffViewer = useUIStore((s) => s.openDiffViewer);
	const rightPaneMode = useUIStore((s) => s.rightPaneMode);
	const setRightPaneMode = useUIStore((s) => s.setRightPaneMode);

	async function handlePreviewInApp() {
		if (!connectionUrl || !activeEntity?.logicalName) return;
		const url =
			`${connectionUrl.replace(/\/$/, "")}/main.aspx?` +
			`pagetype=entitylist&etn=${encodeURIComponent(activeEntity.logicalName)}`;
		await window.toolboxAPI?.utils.openInConnectionBrowser(url, "primary");
	}

	return (
		<div className={styles.root}>
			{/* Breadcrumb */}
			<nav aria-label="Breadcrumb" className={styles.breadcrumb}>
				<span>Solutions</span>
				<span className={styles.separator}>›</span>
				<span>{activeSolution?.friendlyName ?? "—"}</span>
				<span className={styles.separator}>›</span>
				<span>Tables</span>
				<span className={styles.separator}>›</span>
				<span className={styles.activeSegment}>
					{activeEntity?.displayName ?? "Select a table"}
				</span>
			</nav>

			<div className={styles.spacer} />

			{/* Dirty count */}
			{mutationsSincePublish > 0 && (
				<Badge appearance="tint" color="warning">
					{mutationsSincePublish} change{mutationsSincePublish !== 1 ? "s" : ""} since publish
				</Badge>
			)}

			<Button
				appearance="subtle"
				size="small"
				icon={<EyeRegular />}
				onClick={() => {
					void handlePreviewInApp();
				}}
				disabled={!activeEntity?.logicalName}
			>
				Preview in app
			</Button>
			<Button appearance="subtle" size="small" icon={<CodeRegular />} onClick={openXmlDrawer}>
				RibbonDiffXml
			</Button>
			<Button appearance="subtle" size="small" icon={<ArrowSwapRegular />} onClick={openImportXml}>
				Import / Export
			</Button>
			<Button
				appearance="subtle"
				size="small"
				icon={<BranchCompareRegular />}
				onClick={() => openDiffViewer("compare")}
			>
				Compare
			</Button>
			<Select
				size="small"
				value={rightPaneMode}
				onChange={(_, d) => setRightPaneMode(d.value as "docked" | "floating" | "hidden")}
				aria-label="Properties pane mode"
			>
				<option value="docked">Properties: Docked</option>
				<option value="floating">Properties: Floating</option>
				<option value="hidden">Properties: Hidden</option>
			</Select>
		</div>
	);
}
