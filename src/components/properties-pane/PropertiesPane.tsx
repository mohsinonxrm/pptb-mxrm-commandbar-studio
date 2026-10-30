import { makeStyles, tokens, Text, Caption1 } from "@fluentui/react-components";
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
import { HiddenByCustomizationsSection } from "./HiddenByCustomizationsSection";
import { OrphanedCustomizationsSection } from "./OrphanedCustomizationsSection";
import { ReadOnlyControlSection } from "./ReadOnlyControlSection";
import { isReadOnlyControlKind } from "@/utils/controlKinds";
import { findGroupControl, menuItemPlace } from "@/utils/ribbonMenu";
import { ModernCommandProperties } from "./ModernCommandProperties";
import { ButtonNotices } from "./ButtonNotices";
import { PropertiesHeader } from "./PropertiesHeader";
import { ShowOnField } from "./ShowOnField";
import { PropertySection, PropertySections } from "@/components/shared/PropertySection";
import { useClassicOverrides, useSelectedModernCommand } from "@/hooks/useModernCommands";

const useStyles = makeStyles({
	// The host (docked pane, drawer or floating panel) draws the edge (#184).
	root: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflowY: "auto",
		overflowX: "hidden",
		backgroundColor: tokens.colorNeutralBackground2,
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
	place: {
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
		color: tokens.colorNeutralForeground2,
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
	const command = useRibbonStore((s) =>
		button?.commandId ? s.commands.find((c) => c.id === button.commandId) : undefined,
	);

	return (
		<aside className={styles.root} aria-label="Properties">
			<PropertiesHeader button={button} />

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
					<ButtonNotices
						button={button}
						location={location}
						tabId={tabId}
						groupId={selectedGroupId!}
						overrides={modernOverrides}
					/>
					{place && (
						<Caption1 className={styles.place}>
							Menu item of “
							{captionOf(
								place.parent.label,
								locLabels,
								undefined,
								place.parent.source?.labelToken,
							)}
							”{place.section.title ? ` — section “${place.section.title}”` : ""}
						</Caption1>
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
						<PropertySections
							storageKey="properties.button"
							defaultOpen={["appearance", "position", "command", "display", "enable"]}
						>
							<PropertySection value="appearance" title="Appearance">
								<IdentitySection
									part="appearance"
									button={button}
									location={location}
									tabId={tabId}
									groupId={selectedGroupId!}
								/>
								<ShowOnField button={button} />
							</PropertySection>
							<PropertySection value="position" title="Position">
								<IdentitySection
									part="position"
									button={button}
									location={location}
									tabId={tabId}
									groupId={selectedGroupId!}
								/>
							</PropertySection>
							<PropertySection value="command" title="Command">
								<CommandSection
									button={button}
									groupId={selectedGroupId!}
									tabId={tabId}
									location={location}
								/>
							</PropertySection>
							<PropertySection
								value="display"
								title="Display rules"
								count={command?.displayRules.length}
								info="All of them must pass for the button to show."
							>
								<DisplayRulesSection />
							</PropertySection>
							<PropertySection
								value="enable"
								title="Enable rules"
								count={command?.enableRules.length}
								info="All of them must pass for the button to be enabled. Unified Interface hides a button that isn't enabled."
							>
								<EnableRulesSection />
							</PropertySection>
							<PropertySection
								value="scaling"
								title="Scaling"
								info="Scaling only applies to the classic ribbon. Unified Interface ignores it."
							>
								<ScalingSectionSummary />
							</PropertySection>
							<PropertySection value="advanced" title="Advanced">
								<IdentitySection
									part="advanced"
									button={button}
									location={location}
									tabId={tabId}
									groupId={selectedGroupId!}
								/>
								<AdvancedSection />
							</PropertySection>
						</PropertySections>
					)}
				</>
			)}
		</aside>
	);
}
