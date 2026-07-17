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
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";

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
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);

	const newTabOpen = useUIStore((s) => s.newTabOpen);
	const closeNewTab = useUIStore((s) => s.closeNewTab);

	const prefix = publisherPrefix || "new";
	const entityName = activeEntity?.logicalName ?? "entity";
	const safeName = label.replace(/\s+/g, "");
	const generatedId = `${prefix}.${entityName}.${safeName}.Tab`;
	const finalId = customId || generatedId;

	const handleCreate = () => {
		createTab(location, {
			id: finalId,
			label,
			sequence: 100,
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
									Tabs are hidden by default. Add a Tab Display Rule to make the tab visible.
								</Text>
							</MessageBarBody>
						</MessageBar>

						<Field label="Tab label" required>
							<Input value={label} onChange={(_, d) => setLabel(d.value)} placeholder="My Tab" />
						</Field>

						<Field label="Tab ID" hint="Leave blank to auto-generate from label">
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
						<Button appearance="primary" disabled={!label.trim()} onClick={handleCreate}>
							Create tab
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default NewTabModal;
