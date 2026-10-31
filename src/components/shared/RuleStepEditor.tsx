import React from "react";
import {
	makeStyles,
	tokens,
	Select,
	Input,
	Checkbox,
	Combobox,
	Field,
	Badge,
	Button,
	Caption1,
	InfoLabel,
	Option,
	SpinButton,
	Text,
	Tooltip,
	Popover,
	PopoverTrigger,
	PopoverSurface,
} from "@fluentui/react-components";
import { AddRegular, DismissRegular } from "@fluentui/react-icons";
import type { EntityProperty, RuleStep } from "@/types/ribbon";
import { RULE_KIND_LABELS, type RuleContainer } from "@/constants/ruleKinds";
import RuleStepPicker from "@/components/shared/RuleStepPicker";
import CrmParameterEditor from "@/components/shared/CrmParameterEditor";

const useStyles = makeStyles({
	step: {
		display: "flex",
		flexDirection: "column",
		minWidth: 0,
		gap: tokens.spacingVerticalXS,
		padding: tokens.spacingVerticalS,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	title: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	kindBadge: {
		flexShrink: 0,
	},
	fields: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		minWidth: 0,
	},
	// Fields side by side while they fit, then wrapped (#189).
	row: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
		gap: tokens.spacingHorizontalS,
		alignItems: "end",
		minWidth: 0,
	},
	number: { maxWidth: "140px" },
	muted: { color: tokens.colorNeutralForeground3 },
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
		flexWrap: "wrap",
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
	/** The rule type this step belongs to; restricts what can be added inside an OrRule (#41). */
	container?: RuleContainer;
	/** The step's place in its rule, shown before its kind (#186). */
	number?: number;
	/** More actions for the step (move up / down), before Remove (#186). */
	menu?: React.ReactNode;
}

/** An option: the value written to the XML, and what it's called (#189). */
type Choice = readonly [value: string, label: string];

/** "DuplicateDetectionEnabled" → "Duplicate detection enabled". */
const words = (name: string) =>
	name
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.replace(/^Is /, "")
		.toLowerCase()
		.replace(/^./, (c) => c.toUpperCase());

const APPLIES_TO: Choice[] = [
	["PrimaryEntity", "Primary table (the form or grid)"],
	["SelectedEntity", "Selected records"],
];
const CONTEXTS: Choice[] = [
	["Form", "Form"],
	["HomePageGrid", "Home page grid"],
	["SubGridStandard", "Sub-grid"],
	["SubGridAssociated", "Associated grid"],
];
const FORM_STATES: Choice[] = [
	["Create", "New record"],
	["Existing", "Existing record"],
	["ReadOnly", "Read-only"],
	["Disabled", "Disabled"],
	["BulkEdit", "Bulk edit"],
];
const FORM_TYPES: Choice[] = [
	["Main", "Main"],
	["Preview", "Preview"],
	["AppointmentBook", "Appointment book"],
	["Dashboard", "Dashboard"],
	["Quick", "Quick view"],
	["QuickCreate", "Quick create"],
	["Card", "Card"],
	["MainInteractionCentric", "Main (interactive experience)"],
];
const DEVICE_TYPES: Choice[] = [
	["None", "None"],
	["Phone", "Phone"],
	["Tablet", "Tablet"],
	["Web", "Web"],
	["Outlook", "Outlook"],
	["InteractionCentric", "Interactive experience"],
];
const PRIVILEGE_TYPES: Choice[] = [
	["Create", "Create"],
	["Read", "Read"],
	["Write", "Write"],
	["Delete", "Delete"],
	["Assign", "Assign"],
	["Share", "Share"],
	["Append", "Append"],
	["AppendTo", "Append to"],
];
const PRIVILEGE_DEPTHS: Choice[] = [
	["None", "None"],
	["Basic", "User (Basic)"],
	["Local", "Business unit (Local)"],
	["Deep", "Parent: child business units (Deep)"],
	["Global", "Organization (Global)"],
];
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
const ORGANIZATION_SETTINGS = [
	"IsSharepointEnabled",
	"IsSOPIntegrationEnabled",
	"IsFiscalCalendarDefined",
	"IsReadFormModeDefined",
	"IsBPFEntityCustomizationFeatureEnabled",
] as const;
const MISC_PRIVILEGE_SUGGESTIONS = [
	"ExportToExcel",
	"MailMerge",
	"GoOffline",
	"OfflineSynchronize",
	"PublishReports",
];

/** A Select of `choices`; `anyLabel` adds an empty first option meaning "not set". */
function ChoiceSelect({
	label,
	info,
	value,
	choices,
	anyLabel,
	disabled,
	onChange,
}: {
	label: string;
	/** Help shown by an InfoLabel next to the label (not a nested label, #189). */
	info?: string;
	value: string | undefined;
	choices: readonly Choice[];
	anyLabel?: string;
	disabled?: boolean;
	onChange: (value: string | undefined) => void;
}) {
	return (
		<Field
			label={
				info
					? {
							children: (_: unknown, slotProps: Record<string, unknown>) => (
								<InfoLabel {...slotProps} info={info}>
									{label}
								</InfoLabel>
							),
						}
					: label
			}
		>
			<Select
				value={value ?? ""}
				disabled={disabled}
				onChange={(_, d) => onChange(d.value || undefined)}
			>
				{anyLabel !== undefined && <option value="">{anyLabel}</option>}
				{choices.map(([v, text]) => (
					<option key={v} value={v}>
						{text}
					</option>
				))}
			</Select>
		</Field>
	);
}

/** A whole number; empty is `undefined` unless `required`, which keeps the last value. */
function WholeNumber({
	label,
	value,
	required,
	min = 0,
	onChange,
}: {
	label: string;
	value: number | undefined;
	required?: boolean;
	min?: number;
	onChange: (value: number | undefined) => void;
}) {
	const styles = useStyles();
	return (
		<Field label={label}>
			<SpinButton
				className={styles.number}
				min={min}
				value={value ?? null}
				onChange={(_, d) => {
					const typed = d.displayValue?.trim();
					const next =
						d.value !== undefined && d.value !== null
							? d.value
							: typed
								? parseInt(typed, 10)
								: undefined;
					if (next === undefined) return required ? undefined : onChange(undefined);
					if (Number.isInteger(next) && next >= min) onChange(next);
				}}
			/>
		</Field>
	);
}

export const RuleStepEditor: React.FC<RuleStepEditorProps> = ({
	step,
	onChange,
	onRemove,
	container,
	number,
	menu,
}) => {
	const styles = useStyles();
	// Which OrRule picker is open: an existing group's index, or "new" for a new <Or>.
	const [orPicker, setOrPicker] = React.useState<number | "new" | null>(null);

	// Every rule kind except OrRule (and unmodelled raw XML) carries the schema's
	// StandardRuleAttributes, Default and InvertResult (#7). undefined = not set,
	// which keeps a loaded rule's XML unchanged.
	const hasStandardAttributes = step.kind !== "OrRule" && step.kind !== "RawRule";
	const invertResult = hasStandardAttributes ? step.invertResult : undefined;
	const defaultVal = hasStandardAttributes ? step.default : undefined;
	const kindLabel = RULE_KIND_LABELS[step.kind] ?? step.kind;

	const setField = (patch: Partial<RuleStep>) => {
		onChange({ ...step, ...patch } as RuleStep);
	};

	const tableField = (value: string | undefined, onSet: (v: string | undefined) => void) => (
		<Field label="Table" hint="Its logical name; empty for any.">
			<Input value={value ?? ""} onChange={(_, d) => onSet(d.value || undefined)} />
		</Field>
	);

	const renderFields = () => {
		switch (step.kind) {
			case "CommandClientTypeRule":
				return (
					<ChoiceSelect
						label="Client"
						value={step.type}
						choices={[
							// Named with the platform value (#152): the docs and the XML use it.
							["Modern", "Modern (Unified Interface: web, tablets and phones)"],
							["Refresh", "Refresh (legacy updated web client)"],
							["Legacy", "Legacy (classic ribbon + Outlook list views)"],
						]}
						onChange={(v) => setField({ type: v as "Modern" | "Refresh" | "Legacy" })}
					/>
				);

			case "CrmClientTypeRule":
				return (
					<ChoiceSelect
						label="Client"
						value={step.type}
						choices={[
							["Web", "Web"],
							["Outlook", "Outlook"],
						]}
						onChange={(v) => setField({ type: v as "Web" | "Outlook" })}
					/>
				);

			case "FormStateRule":
				return (
					<ChoiceSelect
						label="State"
						value={step.state}
						choices={FORM_STATES}
						onChange={(v) => setField({ state: v as typeof step.state })}
					/>
				);

			case "FormTypeRule":
				return (
					<ChoiceSelect
						label="Form type"
						value={step.type}
						choices={FORM_TYPES}
						onChange={(v) => setField({ type: v as typeof step.type })}
					/>
				);

			case "SelectionCountRule":
				return (
					<div className={styles.row}>
						<WholeNumber
							label="At least"
							value={step.minimum}
							onChange={(minimum) => setField({ minimum })}
						/>
						<WholeNumber
							label="At most"
							value={step.maximum}
							onChange={(maximum) => setField({ maximum })}
						/>
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo}
							choices={APPLIES_TO}
							anyLabel="Any"
							onChange={(v) =>
								setField({
									appliesTo: v as "PrimaryEntity" | "SelectedEntity" | undefined,
								})
							}
						/>
					</div>
				);

			case "EntityRule":
				return (
					<div className={styles.row}>
						{tableField(step.entityName, (entityName) => setField({ entityName }))}
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo}
							choices={APPLIES_TO}
							anyLabel="Any"
							onChange={(v) =>
								setField({
									appliesTo: v as "PrimaryEntity" | "SelectedEntity" | undefined,
								})
							}
						/>
						<ChoiceSelect
							label="Where"
							value={step.context}
							choices={CONTEXTS}
							anyLabel="Anywhere"
							onChange={(context) => setField({ context })}
						/>
					</div>
				);

			case "FormEntityContextRule":
				return (
					<Field label="The form's table" hint="Its logical name.">
						<Input
							value={step.entityName}
							onChange={(_, d) => setField({ entityName: d.value })}
						/>
					</Field>
				);

			case "CustomRule":
				return (
					<>
						<div className={styles.row}>
							<Field
								label="Library"
								hint="A JavaScript web resource ($webresource:…)."
							>
								<Input
									value={step.library}
									onChange={(_, d) => setField({ library: d.value })}
									placeholder="$webresource:publisher_/scripts/file.js"
								/>
							</Field>
							<Field
								label="Function"
								hint="The function's full name, including its namespace."
							>
								<Input
									value={step.functionName}
									onChange={(_, d) => setField({ functionName: d.value })}
								/>
							</Field>
						</div>
						<Field label="Parameters, in order">
							<CrmParameterEditor
								params={step.params ?? []}
								onChange={(params) =>
									setField({ params: params.length ? params : undefined })
								}
							/>
						</Field>
						<Caption1 className={styles.muted}>
							In Unified Interface the function can return a Promise of true or false;
							one that hasn&apos;t settled after 10 seconds counts as false.
						</Caption1>
					</>
				);

			case "CrmOfflineAccessStateRule":
				return (
					<ChoiceSelect
						label="State"
						value={step.state}
						choices={[
							["Online", "Online"],
							["Offline", "Offline"],
						]}
						onChange={(v) => setField({ state: v as "Offline" | "Online" })}
					/>
				);

			case "CrmOutlookClientTypeRule":
				return (
					<ChoiceSelect
						label="Outlook client"
						value={step.type}
						choices={[
							["CrmForOutlook", "Outlook"],
							["CrmForOutlookOfflineAccess", "Outlook with offline access"],
						]}
						onChange={(v) =>
							setField({ type: v as "CrmForOutlook" | "CrmForOutlookOfflineAccess" })
						}
					/>
				);

			case "CrmOutlookClientVersionRule":
				return (
					<div className={styles.row}>
						<WholeNumber
							label="Major"
							value={step.major}
							required
							onChange={(major) => major !== undefined && setField({ major })}
						/>
						<WholeNumber
							label="Minor"
							value={step.minor}
							onChange={(minor) => setField({ minor })}
						/>
						<WholeNumber
							label="Build"
							value={step.build}
							onChange={(build) => setField({ build })}
						/>
						<WholeNumber
							label="Revision"
							value={step.revision}
							onChange={(revision) => setField({ revision })}
						/>
					</div>
				);

			case "DeviceTypeRule":
				return (
					<ChoiceSelect
						label="Device"
						value={step.type}
						choices={DEVICE_TYPES}
						onChange={(v) => setField({ type: v as typeof step.type })}
					/>
				);

			case "EntityPrivilegeRule":
				return (
					<div className={styles.row}>
						{tableField(step.entityName, (entityName) => setField({ entityName }))}
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo}
							choices={APPLIES_TO}
							anyLabel="Any"
							onChange={(v) =>
								setField({
									appliesTo: v as "PrimaryEntity" | "SelectedEntity" | undefined,
								})
							}
						/>
						<ChoiceSelect
							label="Privilege"
							value={step.privilegeType}
							choices={PRIVILEGE_TYPES}
							onChange={(v) =>
								setField({ privilegeType: v as typeof step.privilegeType })
							}
						/>
						<ChoiceSelect
							label="Depth"
							value={step.privilegeDepth}
							choices={PRIVILEGE_DEPTHS}
							onChange={(v) =>
								setField({ privilegeDepth: v as typeof step.privilegeDepth })
							}
						/>
					</div>
				);

			case "EntityPropertyRule":
				return (
					<div className={styles.row}>
						{tableField(step.entityName, (entityName) => setField({ entityName }))}
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo}
							choices={APPLIES_TO}
							anyLabel="Any"
							onChange={(v) =>
								setField({
									appliesTo: v as "PrimaryEntity" | "SelectedEntity" | undefined,
								})
							}
						/>
						<ChoiceSelect
							label="Property"
							value={step.propertyName}
							choices={ENTITY_PROPERTIES.map((p) => [p, words(p)] as const)}
							onChange={(v) => setField({ propertyName: v as EntityProperty })}
						/>
						<Checkbox
							label="The property is true"
							checked={step.propertyValue}
							onChange={(_, d) => setField({ propertyValue: d.checked === true })}
						/>
					</div>
				);

			case "ValueRule":
				return (
					<div className={styles.row}>
						<Field label="Column" hint="Its logical name.">
							<Input
								value={step.field}
								onChange={(_, d) => setField({ field: d.value })}
							/>
						</Field>
						<Field label="Equals">
							<Input
								value={step.value}
								onChange={(_, d) => setField({ value: d.value })}
							/>
						</Field>
					</div>
				);

			case "OrRule": {
				// Each <Or> group is ANDed; the rule passes when any group passes (#29).
				const setGroups = (groups: RuleStep[][]) =>
					onChange({ ...step, groups: groups.filter((g) => g.length > 0) });
				const picker = (target: number | "new", label: string) => (
					<Popover
						open={orPicker === target}
						onOpenChange={(_, d) => setOrPicker(d.open ? target : null)}
					>
						<PopoverTrigger>
							<Button icon={<AddRegular />} appearance="secondary" size="small">
								{label}
							</Button>
						</PopoverTrigger>
						<PopoverSurface className={styles.pickerSurface}>
							<RuleStepPicker
								container={container}
								insideOr
								onSelect={(newStep) => {
									setGroups(
										target === "new"
											? [...step.groups, [newStep]]
											: step.groups.map((g, gi) =>
													gi === target ? [...g, newStep] : g,
												),
									);
									setOrPicker(null);
								}}
							/>
						</PopoverSurface>
					</Popover>
				);
				return (
					<div className={styles.nested}>
						{step.groups.map((group, gi) => (
							<div key={gi} className={styles.nested}>
								<Text size={200} weight="semibold">
									{gi === 0 ? "Either" : "Or"}
									{group.length > 1 ? " (all of)" : ""}
								</Text>
								{group.map((nested, si) => (
									<RuleStepEditor
										key={`${gi}-${si}-${nested.kind}`}
										step={nested}
										container={container}
										onChange={(updated) =>
											setGroups(
												step.groups.map((g, i) =>
													i === gi
														? g.map((s, j) => (j === si ? updated : s))
														: g,
												),
											)
										}
										onRemove={() =>
											setGroups(
												step.groups.map((g, i) =>
													i === gi ? g.filter((_, j) => j !== si) : g,
												),
											)
										}
									/>
								))}
								<div className={styles.nestedToolbar}>{picker(gi, "And…")}</div>
							</div>
						))}
						<div className={styles.nestedToolbar}>
							{picker("new", "Add an Or branch")}
							<Caption1 className={styles.muted}>
								An Or needs at least two branches.
							</Caption1>
						</div>
					</div>
				);
			}

			case "FeatureControlRule":
				return (
					<div className={styles.row}>
						<Field label="Feature control bit">
							<Input
								value={step.featureControlBit}
								onChange={(_, d) => setField({ featureControlBit: d.value })}
							/>
						</Field>
						<Checkbox
							label="The bit is set"
							checked={step.expectedValue}
							onChange={(_, d) => setField({ expectedValue: d.checked === true })}
						/>
					</div>
				);

			case "RawRule":
				return (
					<>
						<Caption1 className={styles.muted}>
							Command Bar Studio doesn&apos;t edit this rule; it is kept exactly as
							loaded.
						</Caption1>
						<pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "11px" }}>
							{step.xml}
						</pre>
					</>
				);

			case "SkuRule":
				return (
					<ChoiceSelect
						label="Deployment"
						value={step.sku}
						choices={[
							["Online", "Online"],
							["OnPremise", "On-premises"],
							["Spla", "Hosted (SPLA)"],
						]}
						onChange={(v) => setField({ sku: v as "OnPremise" | "Online" | "Spla" })}
					/>
				);

			case "OrganizationSettingRule":
				return (
					<ChoiceSelect
						label="Setting is on"
						value={step.setting}
						choices={ORGANIZATION_SETTINGS.map((s) => [s, words(s)] as const)}
						onChange={(v) => setField({ setting: v as typeof step.setting })}
					/>
				);

			case "MiscellaneousPrivilegeRule":
				return (
					<div className={styles.row}>
						<Field label="Privilege">
							<Combobox
								freeform
								value={step.privilegeName}
								placeholder="ExportToExcel"
								onChange={(e) => setField({ privilegeName: e.target.value })}
								onOptionSelect={(_, d) =>
									d.optionValue && setField({ privilegeName: d.optionValue })
								}
							>
								{MISC_PRIVILEGE_SUGGESTIONS.map((value) => (
									<Option key={value} value={value}>
										{value}
									</Option>
								))}
							</Combobox>
						</Field>
						<ChoiceSelect
							label="Depth"
							value={step.privilegeDepth}
							choices={PRIVILEGE_DEPTHS}
							anyLabel="Any"
							onChange={(v) =>
								setField({ privilegeDepth: v as typeof step.privilegeDepth })
							}
						/>
					</div>
				);

			case "OptionSetRule":
				return (
					<div className={styles.row}>
						<Field label="Choice column">
							<Input
								value={step.optionSet}
								onChange={(_, d) => setField({ optionSet: d.value })}
							/>
						</Field>
						<Field label="State code">
							<Input
								value={step.stateCode}
								onChange={(_, d) => setField({ stateCode: d.value })}
							/>
						</Field>
						<Field label="Table type code">
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
							label="The item is tracked"
							checked={step.trackedInCrm}
							onChange={(_, d) => setField({ trackedInCrm: d.checked === true })}
						/>
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo ?? "PrimaryEntity"}
							choices={APPLIES_TO.slice(0, 1)}
							onChange={(v) => setField({ appliesTo: v as "PrimaryEntity" })}
						/>
					</div>
				);

			case "OutlookRenderTypeRule":
				return (
					<ChoiceSelect
						label="Shown in"
						value={step.type}
						choices={[
							["Web", "Web"],
							["Outlook", "Outlook"],
						]}
						onChange={(v) => setField({ type: v as "Web" | "Outlook" })}
					/>
				);

			case "OutlookVersionRule":
				return (
					<ChoiceSelect
						label="Outlook version"
						value={step.version}
						choices={[
							["2003", "2003"],
							["2007", "2007"],
							["2010", "2010"],
						]}
						onChange={(v) => setField({ version: v as "2003" | "2007" | "2010" })}
					/>
				);

			case "PageRule":
				return (
					<Field label="Page address contains">
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
						<ChoiceSelect
							label="Privilege"
							value={step.privilegeType}
							choices={PRIVILEGE_TYPES}
							onChange={(v) =>
								setField({ privilegeType: v as typeof step.privilegeType })
							}
						/>
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo}
							choices={APPLIES_TO.slice(0, 1)}
							anyLabel="The selected record"
							onChange={(v) =>
								setField({ appliesTo: v as "PrimaryEntity" | undefined })
							}
						/>
					</div>
				);

			case "RelationshipTypeRule":
				return (
					<div className={styles.row}>
						<ChoiceSelect
							label="Applies to"
							value={step.appliesTo}
							choices={APPLIES_TO.slice(1)}
							disabled
							onChange={() => {}}
						/>
						<ChoiceSelect
							label="Relationship"
							value={step.relationshipType}
							choices={[
								["OneToMany", "One-to-many"],
								["ManyToMany", "Many-to-many"],
								["NoRelationship", "No relationship"],
							]}
							anyLabel="Any"
							onChange={(v) =>
								setField({
									relationshipType: v as
										"OneToMany" | "ManyToMany" | "NoRelationship" | undefined,
								})
							}
						/>
						<Checkbox
							label="Custom relationships too"
							checked={step.allowCustomRelationship === true}
							onChange={(_, d) =>
								setField({ allowCustomRelationship: d.checked === true })
							}
						/>
						<Checkbox
							label="System relationships too"
							checked={step.allowSystemRelationship === true}
							onChange={(_, d) =>
								setField({ allowSystemRelationship: d.checked === true })
							}
						/>
					</div>
				);

			default:
				return <Caption1 className={styles.muted}>Nothing to set for this step.</Caption1>;
		}
	};

	return (
		<div className={styles.step}>
			<div className={styles.header}>
				<div className={styles.title}>
					{number !== undefined && <Text weight="semibold">{number}.</Text>}
					<Badge appearance="outline" size="small" className={styles.kindBadge}>
						{kindLabel}
					</Badge>
				</div>
				{menu}
				<Tooltip content={`Remove ${kindLabel} step`} relationship="label">
					<Button
						appearance="subtle"
						icon={<DismissRegular />}
						size="small"
						onClick={onRemove}
					/>
				</Tooltip>
			</div>
			<div className={styles.fields}>
				{renderFields()}
				{hasStandardAttributes && (
					<div className={styles.row}>
						<ChoiceSelect
							label="If it can't be evaluated"
							info="What the step counts as when it can't be evaluated."
							value={defaultVal === undefined ? undefined : String(defaultVal)}
							choices={[
								["true", "Passes"],
								["false", "Fails"],
							]}
							anyLabel="Not set"
							onChange={(v) =>
								setField({ default: v === undefined ? undefined : v === "true" })
							}
						/>
						<Field hint="The step passes when its condition is false.">
							<Checkbox
								label="Invert result"
								checked={invertResult === true}
								onChange={(_, d) =>
									// Unchecked → no attribute (same meaning as false).
									setField({
										invertResult: d.checked === true ? true : undefined,
									})
								}
							/>
						</Field>
					</div>
				)}
			</div>
		</div>
	);
};

export default RuleStepEditor;
