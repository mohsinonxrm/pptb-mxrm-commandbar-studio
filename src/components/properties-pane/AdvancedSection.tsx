import React from "react";
import {
	makeStyles,
	tokens,
	Text,
	Switch,
	Badge,
	Field,
	Select,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import type { CommandDefinition, DisplayRule, RuleStep } from "@/types/ribbon";
import { fetchEntityForms } from "@/services/dataverse/entityService";

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
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = group?.buttons.find((b) => b.id === selectedButtonId);
	const showOpenRecordItemToggle = location === "HomepageGrid" || location === "SubGrid";
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const formRibbonScope = useSessionStore((s) => s.formRibbonScope);
	const setFormRibbonScope = useSessionStore((s) => s.setFormRibbonScope);
	const entityForms = useSessionStore((s) => s.entityForms);
	const setEntityForms = useSessionStore((s) => s.setEntityForms);
	const selectedFormId = useSessionStore((s) => s.selectedFormId);
	const setSelectedFormId = useSessionStore((s) => s.setSelectedFormId);
	const [formsLoading, setFormsLoading] = React.useState(false);
	const [formsError, setFormsError] = React.useState<string | null>(null);

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
			const rule: DisplayRule = {
				id: ruleId,
				steps: [step],
			};
			upsertDisplayRule(rule);
		}

		if (!selectedCommand.displayRules.includes(ruleId)) {
			upsertCommand({
				...selectedCommand,
				displayRules: [...selectedCommand.displayRules, ruleId],
			});
		}
	};

	React.useEffect(() => {
		if (location !== "Form") return;
		if (!activeEntity?.logicalName) {
			setEntityForms([]);
			return;
		}

		let disposed = false;
		setFormsLoading(true);
		setFormsError(null);
		void fetchEntityForms(activeEntity.logicalName)
			.then((forms) => {
				if (disposed) return;
				setEntityForms(forms);
			})
			.catch((error: unknown) => {
				if (disposed) return;
				setEntityForms([]);
				setFormsError(String(error));
			})
			.finally(() => {
				if (!disposed) setFormsLoading(false);
			});

		return () => {
			disposed = true;
		};
	}, [location, activeEntity?.logicalName, setEntityForms]);

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
				<div style={{ display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS }}>
					<Text size={100} weight="semibold" className={styles.note}>
						Form ribbon scope
					</Text>
					<Field label="Scope target">
						<Select
							value={formRibbonScope}
							onChange={(_, d) => setFormRibbonScope(d.value as "entity" | "form")}
						>
							<option value="entity">All forms for this table</option>
							<option value="form">Specific form only</option>
						</Select>
					</Field>

					{formRibbonScope === "form" && (
						<Field label="Form picker" hint="Target systemform for RibbonDiffXml placement">
							<Select
								value={selectedFormId}
								onChange={(_, d) => setSelectedFormId(d.value)}
								disabled={formsLoading || entityForms.length === 0}
							>
								{entityForms.length === 0 && <option value="">No forms available</option>}
								{entityForms.map((form) => (
									<option key={form.formId} value={form.formId}>
										{form.name}
									</option>
								))}
							</Select>
						</Field>
					)}

					{formsLoading && (
						<Text size={100} className={styles.note}>
							Loading forms...
						</Text>
					)}

					{formsError && (
						<MessageBar intent="warning">
							<MessageBarBody>
								Unable to load forms from Dataverse. Specific-form scope requires a valid form ID.
							</MessageBarBody>
						</MessageBar>
					)}

					<Text size={100} className={styles.note}>
						All forms scope maps to ImportExportXml/Entities/Entity/RibbonDiffXml. Specific form
						scope maps to
						ImportExportXml/Entities/Entity/FormXml/forms/systemform/form/RibbonDiffXml.
					</Text>
				</div>
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
