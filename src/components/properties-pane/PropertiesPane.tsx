import { makeStyles, tokens, Text, Subtitle2, Divider } from "@fluentui/react-components";
import { CursorHoverRegular } from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { IdentitySection } from "./IdentitySection";
import { CommandSection } from "./CommandSection";
import { DisplayRulesSection } from "./DisplayRulesSection";
import { EnableRulesSection } from "./EnableRulesSection";
import { ScalingSectionSummary } from "./ScalingSectionSummary";
import { AdvancedSection } from "./AdvancedSection";
import { ConflictBanner } from "./ConflictBanner";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflowY: "auto",
		backgroundColor: tokens.colorNeutralBackground2,
		borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	header: {
		padding: `${tokens.spacingHorizontalS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	empty: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
		gap: tokens.spacingHorizontalM,
		color: tokens.colorNeutralForeground3,
		padding: tokens.spacingHorizontalXL,
		textAlign: "center",
	},
	section: {
		padding: `${tokens.spacingHorizontalS} ${tokens.spacingHorizontalM}`,
	},
});

export function PropertiesPane() {
	const styles = useStyles();
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbons = useRibbonStore((s) => s.ribbons);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = group?.buttons.find((b) => b.id === selectedButtonId);

	return (
		<aside className={styles.root} aria-label="Properties">
			<div className={styles.header}>
				<Subtitle2>Properties</Subtitle2>
			</div>

			{!button ? (
				<div className={styles.empty}>
					<CursorHoverRegular fontSize={32} style={{ opacity: 0.4 }} />
					<Text size={300}>Select a button to view its properties</Text>
				</div>
			) : (
				<>
					<ConflictBanner />
					<IdentitySection
						button={button}
						location={location}
						tabId={tabId}
						groupId={selectedGroupId!}
					/>
					<Divider />
					<div className={styles.section}>
						<CommandSection
							button={button}
							groupId={selectedGroupId!}
							tabId={tabId}
							location={location}
						/>
					</div>
					<Divider />
					<div className={styles.section}>
						<DisplayRulesSection />
					</div>
					<Divider />
					<div className={styles.section}>
						<EnableRulesSection />
					</div>
					<Divider />
					<div className={styles.section}>
						<ScalingSectionSummary />
					</div>
					<Divider />
					<div className={styles.section}>
						<AdvancedSection />
					</div>
				</>
			)}
		</aside>
	);
}
