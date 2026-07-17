import React from "react";
import {
	makeStyles,
	tokens,
	Select,
	Input,
	Checkbox,
	Field,
	Badge,
	Button,
	Text,
	Popover,
	PopoverTrigger,
	PopoverSurface,
} from "@fluentui/react-components";
import { AddRegular, DismissRegular } from "@fluentui/react-icons";
import type { EntityProperty, RuleStep } from "@/types/ribbon";
import { RULE_KIND_LABELS } from "@/constants/ruleKinds";
import RuleStepPicker from "@/components/shared/RuleStepPicker";

const useStyles = makeStyles({
	step: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		padding: tokens.spacingVerticalS,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	header: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},
	kindBadge: {
		flexShrink: 0,
	},
	fields: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	row: {
		display: "flex",
		gap: tokens.spacingHorizontalS,
		alignItems: "flex-end",
		flexWrap: "wrap",
	},
	nested: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		paddingLeft: tokens.spacingHorizontalM,
		borderLeft: `2px solid ${tokens.colorBrandStroke2}`,
	},
	nestedToolbar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	pickerSurface: {
		minWidth: "300px",
		maxHeight: "50vh",
		overflowY: "auto",
		padding: tokens.spacingVerticalS,
	},
});

interface RuleStepEditorProps {
	step: RuleStep;
	onChange: (updated: RuleStep) => void;
	onRemove: () => void;
	disableEnableOnlyKinds?: boolean;
}

const PRIVILEGE_TYPES = [
	"Create",
	"Read",
	"Write",
	"Delete",
	"Assign",
	"Share",
	"Append",
	"AppendTo",
] as const;
const PRIVILEGE_DEPTHS = ["None", "Basic", "Local", "Deep", "Global"] as const;
const ENTITY_PROPERTIES: EntityProperty[] = [
	"DuplicateDetectionEnabled",
	"GridFiltersEnabled",
	"HasStateCode",
	"IsConnectionsEnabled",
	"MailMergeEnabled",
	"WorksWithQueue",
	"HasActivities",
	"IsActivity",
	"HasNotes",
	"IsCustomizable",
	"IsActivityParty",
	"HasEmailAddresses",
	"IsChildEntity",
	"IsImportable",
	"IsEnabledForCharts",
	"IsBusinessProcessEnabled",
	"HasFeedback",
	"IsBPFEntity",
];
const MISC_PRIVILEGE_SUGGESTIONS = [
	"ExportToExcel",
	"MailMerge",
	"GoOffline",
	"OfflineSynchronize",
	"PublishReports",
];

export const RuleStepEditor: React.FC<RuleStepEditorProps> = ({
	step,
	onChange,
	onRemove,
	disableEnableOnlyKinds = false,
}) => {
	const styles = useStyles();
	const [orPickerOpen, setOrPickerOpen] = React.useState(false);

	const invertResult = "invertResult" in step ? step.invertResult : false;
	const hasDefault = "default" in step;
	const defaultVal = hasDefault ? (step as Record<string, unknown>).default : undefined;
	const hasInvert = "invertResult" in step;

	const setField = (patch: Partial<RuleStep>) => {
		onChange({ ...step, ...patch } as RuleStep);
	};

	const toInt = (value: string) => {
		if (!value.trim()) return undefined;
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? undefined : parsed;
	};

	const renderFields = () => {
		switch (step.kind) {
			case "CommandClientTypeRule":
				return (
					<Field label="Type">
						<Select
							value={step.type}
							onChange={(_, d) => setField({ type: d.value as "Modern" | "Refresh" | "Legacy" })}
						>
							<option value="Refresh">Refresh (Unified Interface / modern web)</option>
							<option value="Modern">Modern (Dynamics 365 for tablets)</option>
							<option value="Legacy">Legacy (classic ribbon + Outlook list views)</option>
						</Select>
					</Field>
				);

			case "CrmClientTypeRule":
				return (
					<Field label="Type">
						<Select
							value={step.type}
							onChange={(_, d) => setField({ type: d.value as "Web" | "Outlook" })}
						>
							<option value="Web">Web</option>
							<option value="Outlook">Outlook</option>
						</Select>
					</Field>
				);

			case "FormStateRule":
				return (
					<Field label="State">
						<Select
							value={step.state}
							onChange={(_, d) => setField({ state: d.value as typeof step.state })}
						>
							{["Create", "Existing", "ReadOnly", "Disabled", "BulkEdit"].map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</Select>
					</Field>
				);

			case "FormTypeRule":
				return (
					<Field label="Type">
						<Select
							value={step.type}
							onChange={(_, d) => setField({ type: d.value as typeof step.type })}
						>
							{[
								"Main",
								"Preview",
								"AppointmentBook",
								"Dashboard",
								"Quick",
								"QuickCreate",
								"Card",
								"MainInteractionCentric",
							].map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</Select>
					</Field>
				);

			case "SelectionCountRule":
				return (
					<div className={styles.row}>
						<Field label="Minimum">
							<Input
								value={String(step.minimum ?? "")}
								onChange={(_, d) => setField({ minimum: d.value ? parseInt(d.value) : undefined })}
								style={{ width: "80px" }}
							/>
						</Field>
						<Field label="Maximum">
							<Input
								type="number"
								value={String(step.maximum ?? "")}
								onChange={(_, d) => setField({ maximum: d.value ? parseInt(d.value) : undefined })}
								style={{ width: "80px" }}
							/>
						</Field>
						<Field label="Applies To">
							<Select
								value={step.appliesTo ?? ""}
								onChange={(_, d) =>
									setField({ appliesTo: d.value as "PrimaryEntity" | "SelectedEntity" | undefined })
								}
							>
								<option value="">Any</option>
								<option value="PrimaryEntity">PrimaryEntity</option>
								<option value="SelectedEntity">SelectedEntity</option>
							</Select>
						</Field>
					</div>
				);

			case "EntityRule":
				return (
					<div className={styles.row}>
						<Field label="Entity name">
							<Input
								value={step.entityName ?? ""}
								onChange={(_, d) => setField({ entityName: d.value || undefined })}
							/>
						</Field>
						<Field label="Applies To">
							<Select
								value={step.appliesTo ?? ""}
								onChange={(_, d) =>
									setField({ appliesTo: d.value as "PrimaryEntity" | "SelectedEntity" | undefined })
								}
							>
								<option value="">Any</option>
								<option value="PrimaryEntity">PrimaryEntity</option>
								<option value="SelectedEntity">SelectedEntity</option>
							</Select>
						</Field>
						<Field label="Context">
							<Select
								value={step.context ?? ""}
								onChange={(_, d) => setField({ context: d.value || undefined })}
							>
								<option value="">Any</option>
								<option value="Form">Form</option>
								<option value="HomePageGrid">HomePageGrid</option>
								<option value="SubGridStandard">SubGridStandard</option>
								<option value="SubGridAssociated">SubGridAssociated</option>
							</Select>
						</Field>
					</div>
				);

			case "FormEntityContextRule":
				return (
					<Field label="Entity name">
						<Input value={step.entityName} onChange={(_, d) => setField({ entityName: d.value })} />
					</Field>
				);

			case "CustomRule":
				return (
					<>
						<div className={styles.row}>
							<Field label="Library ($webresource:)">
								<Input
									value={step.library}
									onChange={(_, d) => setField({ library: d.value })}
									placeholder="$webresource:..."
								/>
							</Field>
							<Field label="Function name">
								<Input
									value={step.functionName}
									onChange={(_, d) => setField({ functionName: d.value })}
								/>
							</Field>
						</div>
						<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
							Async support: on Unified Interface, custom rules can return Promise&lt;boolean&gt;;
							unresolved promises default to false after 10 seconds.
						</Text>
					</>
				);

			case "CrmOfflineAccessStateRule":
				return (
					<Field label="State">
						<Select
							value={step.state}
							onChange={(_, d) => setField({ state: d.value as "Offline" | "Online" })}
						>
							<option value="Online">Online</option>
							<option value="Offline">Offline</option>
						</Select>
					</Field>
				);

			case "CrmOutlookClientTypeRule":
				return (
					<Field label="Type">
						<Select
							value={step.type}
							onChange={(_, d) =>
								setField({ type: d.value as "CrmForOutlook" | "CrmForOutlookOfflineAccess" })
							}
						>
							<option value="CrmForOutlook">CrmForOutlook</option>
							<option value="CrmForOutlookOfflineAccess">CrmForOutlookOfflineAccess</option>
						</Select>
					</Field>
				);

			case "CrmOutlookClientVersionRule":
				return (
					<div className={styles.row}>
						<Field label="Major">
							<Input
								type="number"
								value={String(step.major)}
								onChange={(_, d) => setField({ major: toInt(d.value) ?? step.major })}
								style={{ width: "84px" }}
							/>
						</Field>
						<Field label="Minor">
							<Input
								type="number"
								value={String(step.minor ?? "")}
								onChange={(_, d) => setField({ minor: toInt(d.value) })}
								style={{ width: "84px" }}
							/>
						</Field>
						<Field label="Build">
							<Input
								type="number"
								value={String(step.build ?? "")}
								onChange={(_, d) => setField({ build: toInt(d.value) })}
								style={{ width: "84px" }}
							/>
						</Field>
						<Field label="Revision">
							<Input
								type="number"
								value={String(step.revision ?? "")}
								onChange={(_, d) => setField({ revision: toInt(d.value) })}
								style={{ width: "84px" }}
							/>
						</Field>
					</div>
				);

			case "DeviceTypeRule":
				return (
					<Field label="Device type">
						<Select
							value={step.type}
							onChange={(_, d) => setField({ type: d.value as typeof step.type })}
						>
							<option value="None">None</option>
							<option value="Phone">Phone</option>
							<option value="Tablet">Tablet</option>
							<option value="Web">Web</option>
							<option value="Outlook">Outlook</option>
							<option value="InteractionCentric">InteractionCentric</option>
						</Select>
					</Field>
				);

			case "EntityPrivilegeRule":
				return (
					<div className={styles.row}>
						<Field label="Entity (optional)">
							<Input
								value={step.entityName ?? ""}
								onChange={(_, d) => setField({ entityName: d.value || undefined })}
							/>
						</Field>
						<Field label="Applies To">
							<Select
								value={step.appliesTo ?? ""}
								onChange={(_, d) =>
									setField({
										appliesTo: (d.value || undefined) as
											| "PrimaryEntity"
											| "SelectedEntity"
											| undefined,
									})
								}
							>
								<option value="">Any</option>
								<option value="PrimaryEntity">PrimaryEntity</option>
								<option value="SelectedEntity">SelectedEntity</option>
							</Select>
						</Field>
						<Field label="Privilege">
							<Select
								value={step.privilegeType}
								onChange={(_, d) =>
									setField({ privilegeType: d.value as typeof step.privilegeType })
								}
							>
								{PRIVILEGE_TYPES.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Depth">
							<Select
								value={step.privilegeDepth}
								onChange={(_, d) =>
									setField({ privilegeDepth: d.value as typeof step.privilegeDepth })
								}
							>
								{PRIVILEGE_DEPTHS.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</Select>
						</Field>
					</div>
				);

			case "EntityPropertyRule":
				return (
					<div className={styles.row}>
						<Field label="Entity (optional)">
							<Input
								value={step.entityName ?? ""}
								onChange={(_, d) => setField({ entityName: d.value || undefined })}
							/>
						</Field>
						<Field label="Applies To">
							<Select
								value={step.appliesTo ?? ""}
								onChange={(_, d) =>
									setField({
										appliesTo: (d.value || undefined) as
											| "PrimaryEntity"
											| "SelectedEntity"
											| undefined,
									})
								}
							>
								<option value="">Any</option>
								<option value="PrimaryEntity">PrimaryEntity</option>
								<option value="SelectedEntity">SelectedEntity</option>
							</Select>
						</Field>
						<Field label="Property">
							<Select
								value={step.propertyName}
								onChange={(_, d) => setField({ propertyName: d.value as EntityProperty })}
							>
								{ENTITY_PROPERTIES.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</Select>
						</Field>
						<Checkbox
							label="Property value"
							checked={step.propertyValue}
							onChange={(_, d) => setField({ propertyValue: d.checked === true })}
						/>
					</div>
				);

			case "ValueRule":
				return (
					<div className={styles.row}>
						<Field label="Field">
							<Input value={step.field} onChange={(_, d) => setField({ field: d.value })} />
						</Field>
						<Field label="Value">
							<Input value={step.value} onChange={(_, d) => setField({ value: d.value })} />
						</Field>
					</div>
				);

			case "OrRule":
				return (
					<div className={styles.nested}>
						{step.rules.map((nested, idx) => (
							<RuleStepEditor
								key={`${idx}-${nested.kind}`}
								step={nested}
								onChange={(updated) => {
									const nextRules = [...step.rules];
									nextRules[idx] = updated;
									onChange({ ...step, rules: nextRules });
								}}
								onRemove={() => {
									const nextRules = step.rules.filter((_, i) => i !== idx);
									onChange({ ...step, rules: nextRules });
								}}
								disableEnableOnlyKinds={disableEnableOnlyKinds}
							/>
						))}
						<div className={styles.nestedToolbar}>
							<Popover open={orPickerOpen} onOpenChange={(_, d) => setOrPickerOpen(d.open)}>
								<PopoverTrigger>
									<Button icon={<AddRegular />} appearance="secondary" size="small">
										Add nested step
									</Button>
								</PopoverTrigger>
								<PopoverSurface className={styles.pickerSurface}>
									<RuleStepPicker
										disableEnableOnlyKinds={disableEnableOnlyKinds}
										onSelect={(newStep) => {
											onChange({ ...step, rules: [...step.rules, newStep] });
											setOrPickerOpen(false);
										}}
									/>
								</PopoverSurface>
							</Popover>
							<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
								OrRule should contain at least two nested steps.
							</Text>
						</div>
					</div>
				);

			case "SkuRule":
				return (
					<Field label="SKU">
						<Select
							value={step.sku}
							onChange={(_, d) => setField({ sku: d.value as "OnPremise" | "Online" | "Spla" })}
						>
							<option value="Online">Online</option>
							<option value="OnPremise">OnPremise</option>
							<option value="Spla">Spla</option>
						</Select>
					</Field>
				);

			case "OrganizationSettingRule":
				return (
					<Field label="Setting">
						<Select
							value={step.setting}
							onChange={(_, d) => setField({ setting: d.value as typeof step.setting })}
						>
							{[
								"IsSharepointEnabled",
								"IsSOPIntegrationEnabled",
								"IsFiscalCalendarDefined",
								"IsReadFormModeDefined",
								"IsBPFEntityCustomizationFeatureEnabled",
							].map((s) => (
								<option key={s} value={s}>
									{s}
								</option>
							))}
						</Select>
					</Field>
				);

			case "MiscellaneousPrivilegeRule":
				return (
					<div className={styles.row}>
						<Field label="Privilege name">
							<Input
								value={step.privilegeName}
								onChange={(_, d) => setField({ privilegeName: d.value })}
								placeholder="ExportToExcel"
								list="misc-privilege-suggestions"
							/>
							<datalist id="misc-privilege-suggestions">
								{MISC_PRIVILEGE_SUGGESTIONS.map((value) => (
									<option key={value} value={value} />
								))}
							</datalist>
						</Field>
						<Field label="Depth (optional)">
							<Select
								value={step.privilegeDepth ?? ""}
								onChange={(_, d) =>
									setField({ privilegeDepth: (d.value || undefined) as typeof step.privilegeDepth })
								}
							>
								<option value="">Any</option>
								{PRIVILEGE_DEPTHS.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</Select>
						</Field>
					</div>
				);

			case "OptionSetRule":
				return (
					<div className={styles.row}>
						<Field label="Option set">
							<Input value={step.optionSet} onChange={(_, d) => setField({ optionSet: d.value })} />
						</Field>
						<Field label="State code">
							<Input value={step.stateCode} onChange={(_, d) => setField({ stateCode: d.value })} />
						</Field>
						<Field label="Object type code">
							<Input
								value={step.objectTypeCode}
								onChange={(_, d) => setField({ objectTypeCode: d.value })}
							/>
						</Field>
					</div>
				);

			case "OutlookItemTrackingRule":
				return (
					<div className={styles.row}>
						<Checkbox
							label="Tracked in CRM"
							checked={step.trackedInCrm}
							onChange={(_, d) => setField({ trackedInCrm: d.checked === true })}
						/>
						<Field label="Applies To">
							<Select
								value={step.appliesTo ?? "PrimaryEntity"}
								onChange={(_, d) => setField({ appliesTo: d.value as "PrimaryEntity" })}
							>
								<option value="PrimaryEntity">PrimaryEntity</option>
							</Select>
						</Field>
					</div>
				);

			case "OutlookRenderTypeRule":
				return (
					<Field label="Render type">
						<Select
							value={step.type}
							onChange={(_, d) => setField({ type: d.value as "Web" | "Outlook" })}
						>
							<option value="Web">Web</option>
							<option value="Outlook">Outlook</option>
						</Select>
					</Field>
				);

			case "OutlookVersionRule":
				return (
					<Field label="Outlook version">
						<Select
							value={step.version}
							onChange={(_, d) => setField({ version: d.value as "2003" | "2007" | "2010" })}
						>
							<option value="2003">2003</option>
							<option value="2007">2007</option>
							<option value="2010">2010</option>
						</Select>
					</Field>
				);

			case "PageRule":
				return (
					<Field label="Address pattern">
						<Input
							value={step.address}
							onChange={(_, d) => setField({ address: d.value })}
							placeholder="main.aspx"
						/>
					</Field>
				);

			case "RecordPrivilegeRule":
				return (
					<div className={styles.row}>
						<Field label="Privilege">
							<Select
								value={step.privilegeType}
								onChange={(_, d) =>
									setField({ privilegeType: d.value as typeof step.privilegeType })
								}
							>
								{PRIVILEGE_TYPES.map((v) => (
									<option key={v} value={v}>
										{v}
									</option>
								))}
							</Select>
						</Field>
						<Field label="Applies To">
							<Select
								value={step.appliesTo ?? ""}
								onChange={(_, d) =>
									setField({ appliesTo: (d.value || undefined) as "PrimaryEntity" | undefined })
								}
							>
								<option value="">Default</option>
								<option value="PrimaryEntity">PrimaryEntity</option>
							</Select>
						</Field>
					</div>
				);

			case "RelationshipTypeRule":
				return (
					<div className={styles.row}>
						<Field label="Applies To">
							<Select value={step.appliesTo} disabled>
								<option value="SelectedEntity">SelectedEntity</option>
							</Select>
						</Field>
						<Field label="Relationship type">
							<Select
								value={step.relationshipType ?? ""}
								onChange={(_, d) =>
									setField({
										relationshipType: (d.value || undefined) as
											| "OneToMany"
											| "ManyToMany"
											| "NoRelationship"
											| undefined,
									})
								}
							>
								<option value="">Any</option>
								<option value="OneToMany">OneToMany</option>
								<option value="ManyToMany">ManyToMany</option>
								<option value="NoRelationship">NoRelationship</option>
							</Select>
						</Field>
						<Checkbox
							label="Allow custom relationship"
							checked={step.allowCustomRelationship === true}
							onChange={(_, d) => setField({ allowCustomRelationship: d.checked === true })}
						/>
						<Checkbox
							label="Allow system relationship"
							checked={step.allowSystemRelationship === true}
							onChange={(_, d) => setField({ allowSystemRelationship: d.checked === true })}
						/>
					</div>
				);

			default:
				return (
					<Text size={200} italic style={{ color: tokens.colorNeutralForeground3 }}>
						{step.kind} — no additional parameters
					</Text>
				);
		}
	};

	return (
		<div className={styles.step} role="listitem">
			<div className={styles.header}>
				<Badge appearance="outline" size="small" className={styles.kindBadge}>
					{RULE_KIND_LABELS[step.kind] ?? step.kind}
				</Badge>
				<Button
					appearance="subtle"
					icon={<DismissRegular />}
					size="small"
					onClick={onRemove}
					aria-label={`Remove ${step.kind} step`}
				/>
			</div>
			<div className={styles.fields}>
				{renderFields()}
				<div className={styles.row}>
					<Checkbox
						label="Default value"
						checked={hasDefault ? ((defaultVal as boolean) ?? true) : true}
						disabled={!hasDefault}
						title={
							hasDefault
								? "Default value returned if the rule cannot be evaluated."
								: "This rule kind does not support a Default attribute in Ribbon XML."
						}
						onChange={(_, d) => {
							if (!hasDefault) return;
							setField({ default: d.checked as boolean });
						}}
					/>
					<Checkbox
						label="Invert result"
						checked={hasInvert ? (invertResult ?? false) : false}
						disabled={!hasInvert}
						title={
							hasInvert
								? "Reverse the evaluated result."
								: "This rule kind does not support InvertResult in Ribbon XML."
						}
						onChange={(_, d) => {
							if (!hasInvert) return;
							setField({ invertResult: d.checked as boolean });
						}}
					/>
				</div>
			</div>
		</div>
	);
};

export default RuleStepEditor;
