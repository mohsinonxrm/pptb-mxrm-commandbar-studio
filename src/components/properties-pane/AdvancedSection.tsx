import React from "react";
import {
	makeStyles,
	tokens,
	Text,
	Switch,
	Badge,
} from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { CommandDefinition, DisplayRule, RuleStep } from "@/types/ribbon";
import { findGroupControl } from "@/utils/ribbonMenu";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	note: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
	},
});

const CLIENT_TYPE_RULES = [
	{ label: "Show on Unified Interface (Refresh)", value: "Refresh" },
	{ label: "Show on Classic ribbon (Legacy)", value: "Legacy" },
	{ label: "Show on Tablets (Modern)", value: "Modern" },
];

export const AdvancedSection: React.FC = () => {
	const styles = useStyles();

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const batch = useRibbonStore((s) => s.batch);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = findGroupControl(group, selectedButtonId);
	const showOpenRecordItemToggle = location === "HomepageGrid" || location === "SubGrid";

	const hasOpenRecordOverride = commands.some((c) => c.id === "Mscrm.OpenRecordItem");

	const handleOpenRecordToggle = (checked: boolean) => {
		if (checked && !hasOpenRecordOverride) {
			upsertCommand({
				id: "Mscrm.OpenRecordItem",
				enableRules: [],
				displayRules: [],
				actions: [
					{
						kind: "javascript",
						library: "$webresource:",
						functionName: "YourNamespace.openRecord",
						params: [{ kind: "CrmParameter", value: "PrimaryControl" }],
					},
				],
			});
			// Open the Command Editor immediately so the user can set the real
			// library path and function name.
			openCommandEditor("Mscrm.OpenRecordItem");
		}
	};

	const getSelectedCommand = (): CommandDefinition | undefined => {
		if (!button?.commandId) return undefined;
		return commands.find((c) => c.id === button.commandId);
	};

	const addClientTypeFilter = (type: "Refresh" | "Legacy" | "Modern") => {
		const selectedCommand = getSelectedCommand();
		if (!selectedCommand) return;

		const existingRule = displayRules.find(
			(r) =>
				r.steps.length === 1 &&
				r.steps[0].kind === "CommandClientTypeRule" &&
				r.steps[0].type === type,
		);

		let ruleId = existingRule?.id;
		let rule: DisplayRule | undefined;
		if (!ruleId) {
			const baseRuleId = `${selectedCommand.id}.${type}.DisplayRule`;
			ruleId = baseRuleId;
			let suffix = 1;
			while (displayRules.some((r) => r.id === ruleId)) {
				ruleId = `${baseRuleId}.${suffix}`;
				suffix += 1;
			}

			const step: RuleStep = {
				kind: "CommandClientTypeRule",
				type,
			};
			rule = {
				id: ruleId,
				steps: [step],
			};
		}

		// The new rule and its binding are one undo step (#34).
		const boundRuleId = ruleId;
		batch(() => {
			if (rule) upsertDisplayRule(rule);
			if (!selectedCommand.displayRules.includes(boundRuleId)) {
				upsertCommand({
					...selectedCommand,
					displayRules: [...selectedCommand.displayRules, boundRuleId],
				});
			}
		});
	};

	return (
		<div className={styles.section}>
			<Text size={200} weight="semibold">
				Advanced
			</Text>

			{button && (
				<div>
					<Text size={100} className={styles.note}>
						Tab: <code style={{ fontFamily: tokens.fontFamilyMonospace }}>{tabId}</code>
					</Text>
				</div>
			)}

			{showOpenRecordItemToggle && (
				<div>
					<Switch
						label="Override default record open behavior (Mscrm.OpenRecordItem)"
						checked={hasOpenRecordOverride}
						onChange={(_, d) => handleOpenRecordToggle(d.checked)}
					/>
					<Text size={100} className={styles.note}>
						When enabled, creates a CommandDefinition with Id=&quot;Mscrm.OpenRecordItem&quot; whose
						JavaScript action overrides what happens when a user double-clicks a grid row or presses
						Enter on a selected row. <strong>Unified Interface only.</strong> The Command Editor
						will open so you can set the real web resource and function name.
					</Text>
				</div>
			)}

			{location === "Form" && (
				<Text size={100} className={styles.note}>
					Form command bar changes apply to every main form of this table
					(ImportExportXml/Entities/Entity/RibbonDiffXml). Form-specific ribbons
					(systemform/form/RibbonDiffXml) aren&apos;t supported on Unified Interface, so CBS
					doesn&apos;t write them (#14).
				</Text>
			)}

			<div>
				<Text size={100} weight="semibold" className={styles.note}>
					Client type filter (adds a CommandClientTypeRule):
				</Text>
				<Text size={100} className={styles.note}>
					<strong>Refresh</strong> = Unified Interface web client | <strong>Legacy</strong> =
					Classic ribbon / Outlook | <strong>Modern</strong> = Dynamics 365 for tablets
				</Text>
				<div className={styles.row} style={{ marginTop: "4px" }}>
					{CLIENT_TYPE_RULES.map((rule) => (
						<Badge
							key={rule.value}
							appearance="outline"
							style={{ cursor: "pointer" }}
							title={`Add CommandClientTypeRule: ${rule.value}`}
							onClick={() => addClientTypeFilter(rule.value as "Refresh" | "Legacy" | "Modern")}
						>
							{rule.label}
						</Badge>
					))}
				</div>
			</div>
		</div>
	);
};

export default AdvancedSection;
