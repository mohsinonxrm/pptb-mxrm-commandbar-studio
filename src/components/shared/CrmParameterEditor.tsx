import React from "react";
import {
	makeStyles,
	tokens,
	Select,
	Input,
	Button,
	Text,
	Badge,
	Checkbox,
	Field,
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
		width: "140px",
		flexShrink: 0,
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
	hint: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase100,
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
					<div className={styles.typeSelect}>
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
							<option value="CrmParameter">CrmParameter</option>
							<option value="StringParameter">String</option>
							<option value="BoolParameter">Boolean</option>
							<option value="IntParameter">Integer</option>
							<option value="DecimalParameter">Decimal</option>
						</Select>
					</div>

					{urlMode && (
						<Field
							label="Name (querystring key)"
							style={{ width: "130px", flexShrink: 0 }}
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

					<div className={styles.valueField}>
						{param.kind === "CrmParameter" ? (
							<Select
								value={param.value as string}
								onChange={(_, d) =>
									setParam(i, { ...param, value: d.value as CrmParameterValue })
								}
							>
								{CRM_PARAM_GROUPED.map((group) =>
									group.values
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
										)),
								)}
							</Select>
						) : param.kind === "BoolParameter" ? (
							<Checkbox
								checked={param.value as boolean}
								onChange={(_, d) =>
									setParam(i, { ...param, value: d.checked as boolean })
								}
								label="true"
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
					</div>

					{urlMode && param.kind === "CrmParameter" && !param.name && (
						<Badge
							appearance="filled"
							color="warning"
							size="small"
							title="Name required for URL actions"
						/>
					)}

					<div className={styles.actions}>
						<Button
							appearance="subtle"
							size="small"
							icon={<ArrowUpRegular />}
							onClick={() => moveParam(i, -1)}
							disabled={i === 0}
							aria-label="Move up"
						/>
						<Button
							appearance="subtle"
							size="small"
							icon={<ArrowDownRegular />}
							onClick={() => moveParam(i, 1)}
							disabled={i === params.length - 1}
							aria-label="Move down"
						/>
						<Button
							appearance="subtle"
							size="small"
							icon={<DismissRegular />}
							onClick={() => removeParam(i)}
							aria-label="Remove parameter"
						/>
					</div>
				</div>
			))}

			{urlMode && (
				<Text className={styles.hint}>
					For URL actions, each CrmParameter must have a <code>name</code> attribute
					(querystring key).
				</Text>
			)}

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
