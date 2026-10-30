import React from "react";
import { makeStyles, tokens, Button, Text, InfoLabel, TagGroup } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { RuleTag } from "@/components/shared/RuleTag";
import { IdPicker } from "@/components/shared/IdPicker";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { generateRuleId, ruleNameFromCommandId } from "@/utils/idGenerator";
import { findGroupControl } from "@/utils/ribbonMenu";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	pillList: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalXS,
		maxWidth: "100%",
		minWidth: 0,
	},
	addBtn: {
		alignSelf: "flex-start",
	},
	note: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		fontStyle: "italic",
	},
});

interface RulesSectionProps {
	kind: "display" | "enable";
}

export const RulesSection: React.FC<RulesSectionProps> = ({ kind }) => {
	const styles = useStyles();

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);

	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const batch = useRibbonStore((s) => s.batch);

	const openRuleEditor = useUIStore((s) => s.openRuleEditor);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = findGroupControl(group, selectedButtonId);

	const command = commands.find((c) => c.id === button?.commandId);
	const ruleIds =
		kind === "display" ? (command?.displayRules ?? []) : (command?.enableRules ?? []);
	const allRules = kind === "display" ? displayRules : enableRules;
	const [selectedExistingRuleId, setSelectedExistingRuleId] = React.useState("");
	const availableRules = allRules.filter((r) => !ruleIds.includes(r.id));

	const handleUnbind = (ruleId: string) => {
		if (!command) return;
		const updated = ruleIds.filter((id) => id !== ruleId);
		upsertCommand(
			kind === "display"
				? { ...command, displayRules: updated }
				: { ...command, enableRules: updated },
		);
	};

	const handleAddRule = () => {
		if (!command) return;

		if (kind === "display") {
			const existingIds = new Set(displayRules.map((r) => r.id));
			const newRuleId = generateRuleId(
				ruleNameFromCommandId(command.id),
				"Display",
				existingIds,
			);
			batch(() => {
				upsertDisplayRule({ id: newRuleId, steps: [] });
				upsertCommand({ ...command, displayRules: [...command.displayRules, newRuleId] });
			});
			openRuleEditor(newRuleId, "display");
			return;
		}

		const existingIds = new Set(enableRules.map((r) => r.id));
		const newRuleId = generateRuleId(ruleNameFromCommandId(command.id), "Enable", existingIds);
		batch(() => {
			upsertEnableRule({ id: newRuleId, steps: [] });
			upsertCommand({ ...command, enableRules: [...command.enableRules, newRuleId] });
		});
		openRuleEditor(newRuleId, "enable");
	};

	const handleBindExistingRule = () => {
		if (!command || !selectedExistingRuleId) return;
		if (kind === "display") {
			upsertCommand({
				...command,
				displayRules: [...command.displayRules, selectedExistingRuleId],
			});
		} else {
			upsertCommand({
				...command,
				enableRules: [...command.enableRules, selectedExistingRuleId],
			});
		}
		setSelectedExistingRuleId("");
	};

	return (
		<div className={styles.section}>
			{!command && <Text className={styles.note}>Bind a command first to manage rules.</Text>}

			{ruleIds.length > 0 && (
				<TagGroup
					className={styles.pillList}
					aria-label={kind === "display" ? "Bound display rules" : "Bound enable rules"}
				>
					{ruleIds.map((ruleId) => (
						<RuleTag
							key={ruleId}
							ruleId={ruleId}
							kind={kind}
							onOpen={() => openRuleEditor(ruleId, kind)}
							onRemove={() => handleUnbind(ruleId)}
						/>
					))}
				</TagGroup>
			)}

			{command && (
				<>
					<IdPicker
						label={`Bind an existing ${kind} rule`}
						options={availableRules.map((r) => r.id)}
						selected={selectedExistingRuleId}
						onSelect={setSelectedExistingRuleId}
						noOptionsMessage="No rule matches."
					/>
					<div style={{ display: "flex", gap: tokens.spacingHorizontalXS }}>
						<Button
							className={styles.addBtn}
							appearance="subtle"
							size="small"
							onClick={handleBindExistingRule}
							disabled={!selectedExistingRuleId}
						>
							Bind
						</Button>
						<Button
							className={styles.addBtn}
							appearance="subtle"
							size="small"
							icon={<AddRegular />}
							onClick={handleAddRule}
						>
							Create new {kind} rule
						</Button>
					</div>
				</>
			)}

			{kind === "enable" && (
				<InfoLabel
					size="small"
					info="Disabled buttons are hidden in the modern command bar (Unified Interface). In the classic ribbon, they stay visible but do nothing when clicked."
				>
					What a failing enable rule does
				</InfoLabel>
			)}
		</div>
	);
};

export const DisplayRulesSection: React.FC = () => <RulesSection kind="display" />;
export const EnableRulesSection: React.FC = () => <RulesSection kind="enable" />;

export default RulesSection;
