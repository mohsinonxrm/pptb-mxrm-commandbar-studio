import React from "react";
import { makeStyles, tokens, Button, Text, Badge, Field, Select } from "@fluentui/react-components";
import { DismissRegular, AddRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { generateRuleId } from "@/utils/idGenerator";

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
	pill: {
		display: "inline-flex",
		alignItems: "center",
		gap: "4px",
		padding: `2px ${tokens.spacingHorizontalXS}`,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusCircular,
		fontSize: tokens.fontSizeBase200,
		fontFamily: tokens.fontFamilyMonospace,
		cursor: "pointer",
		backgroundColor: tokens.colorNeutralBackground2,
		// Cap pill width so long rule IDs (e.g. Mscrm.userqueryvisualization.CreateOrWrite)
		// don't force the whole panel to scroll horizontally. The full ID
		// is still discoverable via the `title` tooltip on hover.
		maxWidth: "100%",
		minWidth: 0,
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	pillLabel: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
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

	const openRuleEditor = useUIStore((s) => s.openRuleEditor);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = group?.buttons.find((b) => b.id === selectedButtonId);

	const command = commands.find((c) => c.id === button?.commandId);
	const ruleIds = kind === "display" ? (command?.displayRules ?? []) : (command?.enableRules ?? []);
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

	const header =
		kind === "display" ? "Display rules (ALL must pass)" : "Enable rules (ALL must pass)";

	const handleAddRule = () => {
		if (!command) return;

		if (kind === "display") {
			const existingIds = new Set(displayRules.map((r) => r.id));
			const newRuleId = generateRuleId(
				command.id.split(".").pop() || "Rule",
				"Display",
				existingIds,
			);
			upsertDisplayRule({ id: newRuleId, steps: [] });
			upsertCommand({ ...command, displayRules: [...command.displayRules, newRuleId] });
			openRuleEditor(newRuleId, "display");
			return;
		}

		const existingIds = new Set(enableRules.map((r) => r.id));
		const newRuleId = generateRuleId(command.id.split(".").pop() || "Rule", "Enable", existingIds);
		upsertEnableRule({ id: newRuleId, steps: [] });
		upsertCommand({ ...command, enableRules: [...command.enableRules, newRuleId] });
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
			upsertCommand({ ...command, enableRules: [...command.enableRules, selectedExistingRuleId] });
		}
		setSelectedExistingRuleId("");
	};

	return (
		<div className={styles.section}>
			<div className={styles.header}>
				<Text size={200} weight="semibold">
					{header}
				</Text>
				{ruleIds.length > 0 && (
					<Badge appearance="tint" size="small" color="informative">
						{ruleIds.length}
					</Badge>
				)}
			</div>

			{!command && <Text className={styles.note}>Bind a command first to manage rules.</Text>}

			<div className={styles.pillList}>
				{ruleIds.map((ruleId) => {
					const rule = allRules.find((r) => r.id === ruleId);
					return (
						<div key={ruleId} className={styles.pill}>
							<span
								className={styles.pillLabel}
								onClick={() => openRuleEditor(ruleId, kind === "display" ? "display" : "enable")}
								title={`${ruleId} — ${rule?.steps.length ?? 0} step(s)`}
							>
								{ruleId}
							</span>
							<button
								style={{
									background: "none",
									border: "none",
									cursor: "pointer",
									padding: 0,
									display: "flex",
									color: tokens.colorNeutralForeground3,
								}}
								onClick={() => handleUnbind(ruleId)}
								aria-label={`Remove rule ${ruleId}`}
							>
								<DismissRegular style={{ fontSize: 12 }} />
							</button>
						</div>
					);
				})}
			</div>

			{command && (
				<>
					<Field
						label={`Bind existing ${kind} rule`}
						// Fill the available column width — long rule IDs in the options
						// list previously expanded the native <select> beyond the
						// properties pane and produced a horizontal scrollbar.
						style={{ width: "100%", minWidth: 0 }}
					>
						<Select
							size="small"
							value={selectedExistingRuleId}
							onChange={(_, d) => setSelectedExistingRuleId(d.value)}
							style={{ width: "100%", minWidth: 0 }}
						>
							<option value="">Select rule…</option>
							{availableRules.map((rule) => (
								<option key={rule.id} value={rule.id}>
									{rule.id}
								</option>
							))}
						</Select>
					</Field>
					<div style={{ display: "flex", gap: tokens.spacingHorizontalXS }}>
						<Button
							className={styles.addBtn}
							appearance="subtle"
							size="small"
							onClick={handleBindExistingRule}
							disabled={!selectedExistingRuleId}
						>
							Bind selected
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
				<Text className={styles.note}>
					Note: Disabled buttons are <strong>hidden</strong> in the modern command bar (Unified
					Interface). In the classic ribbon (Legacy client), disabled buttons remain visible but do
					not respond to clicks.
				</Text>
			)}
		</div>
	);
};

export const DisplayRulesSection: React.FC = () => <RulesSection kind="display" />;
export const EnableRulesSection: React.FC = () => <RulesSection kind="enable" />;

export default RulesSection;
