import { makeStyles, tokens, Text, Button, Tag } from "@fluentui/react-components";
import { CodeRegular, AddRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { generateCommandId } from "@/utils/idGenerator";
import type { RibbonButton } from "@/types/ribbon";
import { CommandProvenanceBar } from "@/components/shared/CommandProvenanceBar";
import { IdField } from "@/components/shared/IdField";
import { IdPicker } from "@/components/shared/IdPicker";
import React from "react";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
		minWidth: 0,
	},
	commandRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground3,
	},
	commandId: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground1,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
});

interface CommandSectionProps {
	button: RibbonButton;
	groupId: string;
	tabId: string;
	location: import("@/types/ribbon").RibbonLocation;
}

export function CommandSection({ button, groupId, tabId, location }: CommandSectionProps) {
	const styles = useStyles();
	const commands = useRibbonStore((s) => s.commands);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const batch = useRibbonStore((s) => s.batch);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const [selectedCommandId, setSelectedCommandId] = React.useState("");

	const command = commands.find((c) => c.id === button.commandId);
	const createAndBindCommand = () => {
		const existingIds = new Set(commands.map((c) => c.id));
		const newId = generateCommandId("New", "Command", existingIds);
		batch(() => {
			upsertCommand({ id: newId, enableRules: [], displayRules: [], actions: [] });
			setButtonProp(location, tabId, groupId, button.id, { commandId: newId });
		});
		openCommandEditor(newId);
	};

	const bindExistingCommand = () => {
		if (!selectedCommandId) return;
		setButtonProp(location, tabId, groupId, button.id, { commandId: selectedCommandId });
		setSelectedCommandId("");
	};

	return (
		<div className={styles.root}>
			{command ? (
				<>
					<IdField
						label="Command ID"
						value={command.id}
						action={
							<Button
								appearance="subtle"
								size="small"
								icon={<CodeRegular />}
								onClick={() => openCommandEditor(command.id)}
							>
								Edit command
							</Button>
						}
					/>
					<CommandProvenanceBar commandId={command.id} compact />

					{command.actions.length > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
							{command.actions.map((a, i) => (
								<Tag key={i} size="extra-small" appearance="outline">
									{a.kind === "javascript"
										? `JS: ${a.functionName}`
										: a.kind === "url"
											? `URL: ${a.address}`
											: a.kind === "powerFx"
												? `Fx: ${a.expression}`
												: a.kind === "customApi"
													? `API: ${a.actionName}`
													: a.kind === "outlookCommand"
														? `Outlook: ${a.actionType}`
														: `XML: ${a.tagName}`}
								</Tag>
							))}
						</div>
					)}

					{command.enableRules.length > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
							<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
								Enable rules:
							</Text>
							{command.enableRules.map((r) => (
								<Tag
									key={r}
									size="extra-small"
									appearance="outline"
									color="success"
								>
									{r}
								</Tag>
							))}
						</div>
					)}

					{command.displayRules.length > 0 && (
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
							<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
								Display rules:
							</Text>
							{command.displayRules.map((r) => (
								<Tag
									key={r}
									size="extra-small"
									appearance="outline"
									color="informative"
								>
									{r}
								</Tag>
							))}
						</div>
					)}
				</>
			) : button.commandId ? (
				<div className={styles.commandRow}>
					<Text
						className={styles.commandId}
						style={{ color: tokens.colorStatusWarningForeground3 }}
					>
						{button.commandId} (not found)
					</Text>
				</div>
			) : (
				<>
					<IdPicker
						label="Use an existing command"
						options={commands.map((c) => c.id)}
						selected={selectedCommandId}
						onSelect={setSelectedCommandId}
						noOptionsMessage="No command matches."
					/>
					<div style={{ display: "flex", gap: tokens.spacingHorizontalXS }}>
						<Button
							appearance="outline"
							size="small"
							disabled={!selectedCommandId}
							onClick={bindExistingCommand}
						>
							Bind
						</Button>
						<Button
							appearance="outline"
							size="small"
							icon={<AddRegular />}
							onClick={createAndBindCommand}
						>
							Create and bind
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
