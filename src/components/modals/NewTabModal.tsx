import React, { useState } from "react";
import {
	makeStyles,
	tokens,
	Dialog,
	DialogSurface,
	DialogBody,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Field,
	Input,
	Text,
	Subtitle2,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore, workspaceIds } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { generateRibbonId, validateRibbonId } from "@/utils/idGenerator";
import { useSessionStore } from "@/store/sessionStore";
import { UCI_TAB_NOTE } from "@/services/publishPlan";

const LOCATION_NAMES = {
	HomepageGrid: "home grid",
	Form: "form",
	SubGrid: "sub-grid",
	Application: "",
} as const;

const useStyles = makeStyles({
	surface: {
		width: "480px",
		maxWidth: "95vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalM,
	},
	hint: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		backgroundColor: tokens.colorNeutralBackground3,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusMedium,
	},
});

export const NewTabModal: React.FC = () => {
	const styles = useStyles();
	// NewTabModal has its own open state tracked in uiStore via openNewTab/closeNewTab
	// We need to check uiStore — but no such entry exists yet. We use a local approach:
	// The RibbonCanvas "+" button currently calls createTab(location, {}) directly.
	// This modal is designed to be opened from the tab strip. It re-uses xmlDrawerOpen flag
	// but since that's taken, we use the newTabOpen state.
	// Actually let's check uiStore... it has no newTabOpen. We'll add it.
	// For now, export the component and the parent can manage open state via props.
	// Per architectural pattern, this modal uses its own open prop from parent.
	const [label, setLabel] = useState("New Tab");
	const [customId, setCustomId] = useState("");

	const location = useSelectionStore((s) => s.location);
	const createTab = useRibbonStore((s) => s.createTab);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	// Re-read so the generated id follows the publisher prefix.
	useSessionStore((s) => s.publisherPrefix);

	const newTabOpen = useUIStore((s) => s.newTabOpen);
	const closeNewTab = useUIStore((s) => s.closeNewTab);

	// {prefix}.{table}.{Location}.{Label}.Tab, sanitized and unique in the
	// workspace — the location keeps the same name on the grid and the form
	// apart, and a second tab with the same label gets its own id (#66 review M3, m6).
	const ids = React.useMemo(
		() => workspaceIds({ baseline, layers }, ribbons),
		[baseline, layers, ribbons],
	);
	const table =
		location === "Application"
			? "global"
			: (activeEntity?.logicalName ?? ribbons[location].entityLogicalName);
	const generatedId = generateRibbonId(table, `${location}.${label}`, "Tab", ids);
	const custom = customId.trim();
	const idError = !custom
		? null
		: (validateRibbonId(custom) ??
			(/[^a-zA-Z0-9._]/.test(custom)
				? "Use letters, digits, dots and underscores only"
				: ids.has(custom)
					? "This ID is already used"
					: null));
	const finalId = custom || generatedId;

	const handleCreate = () => {
		if (idError) return;
		// No sequence: the store puts the tab after the location's last one.
		createTab(location, {
			id: finalId,
			label,
			tabDisplayRules: [],
			groups: [],
		});
		setLabel("New Tab");
		setCustomId("");
		closeNewTab();
	};

	return (
		<Dialog open={newTabOpen} onOpenChange={(_, d) => !d.open && closeNewTab()}>
			<DialogSurface className={styles.surface}>
				<DialogBody>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<DismissRegular />}
								onClick={closeNewTab}
								aria-label="Close"
							/>
						}
					>
						<Subtitle2>Add Tab</Subtitle2>
					</DialogTitle>

					<DialogContent className={styles.body}>
						<MessageBar intent="info">
							<MessageBarBody>
								<Text size={200}>
									{location === "Application"
										? "A tab is shown only where a Tab Display Rule allows it. Add one in Tab rules before publishing."
										: `The tab gets a Tab Display Rule for this table's ${LOCATION_NAMES[location]}. You can change it in Tab rules.`}
								</Text>
							</MessageBarBody>
						</MessageBar>
						<MessageBar intent="info">
							<MessageBarBody>
								<Text size={200}>{UCI_TAB_NOTE}</Text>
							</MessageBarBody>
						</MessageBar>

						<Field label="Tab label" required>
							<Input
								value={label}
								onChange={(_, d) => setLabel(d.value)}
								placeholder="My Tab"
							/>
						</Field>

						<Field
							label="Tab ID"
							hint="Leave blank to auto-generate from label"
							validationState={idError ? "error" : "none"}
							validationMessage={idError ?? undefined}
						>
							<Input
								value={customId}
								onChange={(_, d) => setCustomId(d.value)}
								placeholder={generatedId}
							/>
						</Field>

						<div>
							<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
								Generated ID:
							</Text>
							<div className={styles.hint}>{finalId}</div>
						</div>

						<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
							Location: <strong>{location}</strong>
						</Text>
					</DialogContent>

					<DialogActions>
						<Button appearance="secondary" onClick={closeNewTab}>
							Cancel
						</Button>
						<Button
							appearance="primary"
							disabled={!label.trim() || !!idError}
							onClick={handleCreate}
						>
							Create tab
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default NewTabModal;
