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

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	param: {
		display: "flex",
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
		flex: 1,
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
								if (kind === "CrmParameter") setParam(i, { kind, value: "PrimaryControl" });
								else if (kind === "BoolParameter") setParam(i, { kind, value: false });
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
						<Field label="Name (querystring key)" style={{ width: "130px", flexShrink: 0 }}>
							<Input
								value={param.name ?? ""}
								onChange={(_, d) => setParam(i, { ...param, name: d.value || undefined })}
								placeholder="key"
							/>
						</Field>
					)}

					<div className={styles.valueField}>
						{param.kind === "CrmParameter" ? (
							<Select
								value={param.value as string}
								onChange={(_, d) => setParam(i, { ...param, value: d.value as CrmParameterValue })}
							>
								{CRM_PARAM_GROUPED.map((group) =>
									group.values.map((v) => (
										<option key={v} value={v}>
											{v}
										</option>
									)),
								)}
							</Select>
						) : param.kind === "BoolParameter" ? (
							<Checkbox
								checked={param.value as boolean}
								onChange={(_, d) => setParam(i, { ...param, value: d.checked as boolean })}
								label="true"
							/>
						) : (
							<Input
								type={param.kind === "StringParameter" ? "text" : "number"}
								value={String(param.value)}
								onChange={(_, d) => {
									const val =
										param.kind === "StringParameter"
											? d.value
											: param.kind === "IntParameter"
												? parseInt(d.value)
												: parseFloat(d.value);
									setParam(i, { ...param, value: val } as ActionParameter);
								}}
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
					For URL actions, each CrmParameter must have a <code>name</code> attribute (querystring
					key).
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
