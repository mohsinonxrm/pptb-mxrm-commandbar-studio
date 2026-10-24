import { makeStyles, tokens, Text, Subtitle2, Divider, Caption1 } from "@fluentui/react-components";
import { useDisplayText } from "@/hooks/useDisplayText";
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
import { HiddenByCustomizationsSection } from "./HiddenByCustomizationsSection";
import { OrphanedCustomizationsSection } from "./OrphanedCustomizationsSection";
import { ReadOnlyControlSection } from "./ReadOnlyControlSection";
import { isReadOnlyControlKind } from "@/utils/controlKinds";
import { findGroupControl, menuItemPlace } from "@/utils/ribbonMenu";
import { ModernCommandProperties, ModernOverrideSection } from "./ModernCommandProperties";
import { useClassicOverrides, useSelectedModernCommand } from "@/hooks/useModernCommands";

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
	const button = findGroupControl(group, selectedButtonId);
	// A menu item (#27): say whose menu it is in.
	const place = group && button ? menuItemPlace(group, button.id) : undefined;
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	// Modern commands (#32) are shown read-only and live outside the ribbon store.
	const modern = useSelectedModernCommand();
	const modernOverrides = useClassicOverrides(location, button?.id);

	return (
		<aside className={styles.root} aria-label="Properties">
			<div className={styles.header}>
				<Subtitle2>Properties</Subtitle2>
			</div>

			{!button && modern ? (
				<ModernCommandProperties command={modern.command} items={modern.children} />
			) : !button ? (
				<>
					<div className={styles.empty}>
						<CursorHoverRegular fontSize={32} style={{ opacity: 0.4 }} />
						<Text size={300}>Select a button to view its properties</Text>
					</div>
					<HiddenByCustomizationsSection />
					<OrphanedCustomizationsSection />
				</>
			) : (
				<>
					<ConflictBanner />
					<ModernOverrideSection overrides={modernOverrides} />
					{place && (
						<div className={styles.section}>
							<Caption1>
								Menu item of “{captionOf(place.parent.label, locLabels, undefined, place.parent.source?.labelToken)}”
								{place.section.title ? ` — section “${place.section.title}”` : ""}
							</Caption1>
						</div>
					)}
					{isReadOnlyControlKind(button.kind) ? (
						// ToggleButton, Label, DropDown, …: shown, never edited (#42).
						<ReadOnlyControlSection
							button={button}
							location={location}
							tabId={tabId}
							groupId={selectedGroupId!}
						/>
					) : (
						<>
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
				</>
			)}
		</aside>
	);
}
