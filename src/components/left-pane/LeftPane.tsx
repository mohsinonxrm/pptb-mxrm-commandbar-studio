import { Tab, TabList, makeStyles, tokens } from "@fluentui/react-components";
import { BoxRegular, TextBulletListTreeRegular } from "@fluentui/react-icons";
import { useUIStore, type LeftPaneTab } from "@/store/uiStore";
import { StructurePane } from "./StructurePane";
import { SolutionElementsPane } from "./SolutionElementsPane";

/**
 * The left pane (#194): Structure, the location's ribbon as a tree, and
 * Solution, the solution's buttons, commands and rules. Tables are picked in
 * the top bar.
 */

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
	tabs: {
		flexShrink: 0,
		padding: `0 ${tokens.spacingHorizontalXS}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	body: { flex: 1, minHeight: 0, overflow: "hidden" },
});

export function LeftPane() {
	const styles = useStyles();
	const tab = useUIStore((s) => s.leftPaneTab);
	const setTab = useUIStore((s) => s.setLeftPaneTab);
	return (
		<div className={styles.root}>
			<TabList
				size="small"
				className={styles.tabs}
				aria-label="Left pane"
				selectedValue={tab}
				onTabSelect={(_, d) => setTab(d.value as LeftPaneTab)}
			>
				<Tab value="structure" icon={<TextBulletListTreeRegular />}>
					Structure
				</Tab>
				<Tab value="solution" icon={<BoxRegular />}>
					Solution
				</Tab>
			</TabList>
			<div
				className={styles.body}
				role="tabpanel"
				aria-label={tab === "structure" ? "Structure" : "Solution"}
			>
				{tab === "structure" ? <StructurePane /> : <SolutionElementsPane />}
			</div>
		</div>
	);
}
