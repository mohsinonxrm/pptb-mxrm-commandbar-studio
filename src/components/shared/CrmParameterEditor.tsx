import React from "react";
import {
	makeStyles,
	tokens,
	Select,
	Input,
	Button,
	Field,
	Switch,
	Tooltip,
} from "@fluentui/react-components";
import {
	AddRegular,
	DismissRegular,
	ArrowUpRegular,
	ArrowDownRegular,
} from "@fluentui/react-icons";
import type { ActionParameter, CrmParameterValue } from "@/types/ribbon";
import { URL_INVALID_CRM_PARAMETER_VALUES } from "@/constants/crmParameters";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		minWidth: 0,
	},
	param: {
		display: "flex",
		// Narrow places (a step inside an Or branch) wrap instead of scrolling sideways (#186).
		flexWrap: "wrap",
		minWidth: 0,
		gap: tokens.spacingHorizontalS,
		alignItems: "flex-end",
		padding: tokens.spacingVerticalXS,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
	},
	typeSelect: {
		flex: "0 1 170px",
		minWidth: "130px",
	},
	nameField: {
		flex: "0 1 150px",
		minWidth: "110px",
	},
	valueField: {
		flex: "1 1 160px",
		minWidth: 0,
		// A native select is as wide as its longest option unless told otherwise.
		"& .fui-Select, & .fui-Input, & select": { width: "100%", minWidth: 0 },
	},
	actions: {
		display: "flex",
		gap: tokens.spacingHorizontalXS,
		flexShrink: 0,
	},
	addButton: {
		alignSelf: "flex-start",
	},
});

const CRM_PARAM_GROUPED = [
	{
		label: "Context",
		values: [
			"PrimaryControl",
			"PrimaryControlId",
			"SelectedControl",
			"CommandProperties",
		] as CrmParameterValue[],
	},
	{
		label: "Record",
		values: [
			"PrimaryEntityTypeCode",
			"PrimaryEntityTypeName",
			"FirstPrimaryItemId",
			"PrimaryItemIds",
		] as CrmParameterValue[],
	},
	{
		label: "Selection context",
		values: [
			"SelectedEntityTypeCode",
			"SelectedEntityTypeName",
			"FirstSelectedItemId",
		] as CrmParameterValue[],
	},
	{
		label: "Grid selection",
		values: [
			"SelectedControlSelectedItemCount",
			"SelectedControlSelectedItemIds",
			"SelectedControlSelectedItemReferences",
			"SelectedControlAllItemCount",
			"SelectedControlAllItemIds",
			"SelectedControlAllItemReferences",
			"SelectedControlUnselectedItemCount",
			"SelectedControlUnselectedItemIds",
			"SelectedControlUnselectedItemReferences",
		] as CrmParameterValue[],
	},
	{
		label: "Org/User",
		values: ["OrgName", "OrgLcid", "UserLcid"] as CrmParameterValue[],
	},
];

interface CrmParameterEditorProps {
	params: ActionParameter[];
	onChange: (params: ActionParameter[]) => void;
	/** For URL actions: show Name field and warn on missing names */
	urlMode?: boolean;
}

/**
 * A number parameter's value. Only a valid number is kept: a cleared or
 * half-typed field ("", "-", "1e") used to be stored as NaN and written as
 * Value="NaN", which the import rejects (#153). Leaving the field shows the
 * kept value again.
 */
function NumberParamInput({
	value,
	integer,
	onChange,
}: {
	value: number;
	integer: boolean;
	onChange: (value: number) => void;
}) {
	const [text, setText] = React.useState(String(value));
	React.useEffect(() => setText(Number.isFinite(value) ? String(value) : ""), [value]);
	return (
		<Input
			type="number"
			value={text}
			onChange={(_, d) => {
				setText(d.value);
				const n = Number(d.value);
				// Written as String(n): 1e-7 would be exponent form, which xs:decimal doesn't allow.
				if (
					d.value.trim() !== "" &&
					Number.isFinite(n) &&
					(!integer || Number.isInteger(n)) &&
					!/e/i.test(String(n))
				)
					onChange(n);
			}}
			onBlur={() => setText(Number.isFinite(value) ? String(value) : "")}
		/>
	);
}

export const CrmParameterEditor: React.FC<CrmParameterEditorProps> = ({
	params,
	onChange,
	urlMode = false,
}) => {
	const styles = useStyles();

	const setParam = (index: number, updated: ActionParameter) => {
		const next = [...params];
		next[index] = updated;
		onChange(next);
	};

	const removeParam = (index: number) => {
		onChange(params.filter((_, i) => i !== index));
	};

	const moveParam = (index: number, direction: -1 | 1) => {
		const next = [...params];
		const swap = index + direction;
		if (swap < 0 || swap >= next.length) return;
		[next[index], next[swap]] = [next[swap], next[index]];
		onChange(next);
	};

	const addParam = () => {
		onChange([...params, { kind: "CrmParameter", value: "PrimaryControl" }]);
	};

	return (
		<div className={styles.root}>
			{params.map((param, i) => (
				<div key={i} className={styles.param}>
					<Field label="Type" size="small" className={styles.typeSelect}>
						<Select
							value={param.kind}
							onChange={(_, d) => {
								const kind = d.value as ActionParameter["kind"];
								if (kind === "CrmParameter")
									setParam(i, { kind, value: "PrimaryControl" });
								else if (kind === "BoolParameter")
									setParam(i, { kind, value: false });
								else if (kind === "IntParameter" || kind === "DecimalParameter")
									setParam(i, { kind, value: 0 });
								else setParam(i, { kind: "StringParameter", value: "" });
							}}
						>
							<option value="CrmParameter">From the context</option>
							<option value="StringParameter">Text</option>
							<option value="BoolParameter">True or false</option>
							<option value="IntParameter">Whole number</option>
							<option value="DecimalParameter">Decimal number</option>
						</Select>
					</Field>

					{urlMode && (
						<Field
							label="Name"
							size="small"
							className={styles.nameField}
							// Url parameters are sent by name, so a context value needs one (#41, #189).
							validationState={
								param.kind === "CrmParameter" && !param.name ? "error" : "none"
							}
							validationMessage={
								param.kind === "CrmParameter" && !param.name
									? "Needs a name: it's the query string key."
									: undefined
							}
						>
							<Input
								value={param.name ?? ""}
								onChange={(_, d) =>
									setParam(i, { ...param, name: d.value || undefined })
								}
								placeholder="key"
							/>
						</Field>
					)}

					<Field label="Value" size="small" className={styles.valueField}>
						{param.kind === "CrmParameter" ? (
							<Select
								value={param.value as string}
								onChange={(_, d) =>
									setParam(i, { ...param, value: d.value as CrmParameterValue })
								}
							>
								{/* Grouped as the platform documents them (#189). */}
								{CRM_PARAM_GROUPED.map((group) => (
									<optgroup key={group.label} label={group.label}>
										{group.values
											// Url parameters take CrmNamedParameterValue (no …ItemReferences) — #41.
											.filter(
												(v) =>
													!urlMode ||
													!URL_INVALID_CRM_PARAMETER_VALUES.has(v),
											)
											.map((v) => (
												<option key={v} value={v}>
													{v}
												</option>
											))}
									</optgroup>
								))}
							</Select>
						) : param.kind === "BoolParameter" ? (
							<Switch
								checked={param.value as boolean}
								onChange={(_, d) => setParam(i, { ...param, value: d.checked })}
								label={param.value ? "True" : "False"}
							/>
						) : param.kind === "StringParameter" ? (
							<Input
								value={String(param.value)}
								onChange={(_, d) => setParam(i, { ...param, value: d.value })}
							/>
						) : (
							<NumberParamInput
								value={param.value as number}
								integer={param.kind === "IntParameter"}
								onChange={(value) =>
									setParam(i, { ...param, value } as ActionParameter)
								}
							/>
						)}
					</Field>

					<div className={styles.actions}>
						<Tooltip content={`Move parameter ${i + 1} up`} relationship="label">
							<Button
								appearance="subtle"
								size="small"
								icon={<ArrowUpRegular />}
								onClick={() => moveParam(i, -1)}
								disabled={i === 0}
							/>
						</Tooltip>
						<Tooltip content={`Move parameter ${i + 1} down`} relationship="label">
							<Button
								appearance="subtle"
								size="small"
								icon={<ArrowDownRegular />}
								onClick={() => moveParam(i, 1)}
								disabled={i === params.length - 1}
							/>
						</Tooltip>
						<Tooltip content={`Remove parameter ${i + 1}`} relationship="label">
							<Button
								appearance="subtle"
								size="small"
								icon={<DismissRegular />}
								onClick={() => removeParam(i)}
							/>
						</Tooltip>
					</div>
				</div>
			))}

			<Button
				className={styles.addButton}
				appearance="secondary"
				size="small"
				icon={<AddRegular />}
				onClick={addParam}
			>
				Add parameter
			</Button>
		</div>
	);
};

export default CrmParameterEditor;
