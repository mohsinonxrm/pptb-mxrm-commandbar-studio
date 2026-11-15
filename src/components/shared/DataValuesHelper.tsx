import { useEffect, useState } from "react";
import {
	Button,
	Caption1,
	Input,
	Label,
	makeStyles,
	MessageBar,
	MessageBarBody,
	Text,
	tokens,
} from "@fluentui/react-components";
import { AddRegular, CopyRegular, DeleteRegular } from "@fluentui/react-icons";
import type { ActionParameter } from "@/types/ribbon";
import {
	DATA_PAGE_SNIPPET,
	decodeDataValues,
	encodeDataValues,
	findDataParameter,
	withDataValues,
	type DataValue,
} from "@/utils/dataParameter";

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
	row: {
		display: "grid",
		gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr) auto",
		gap: tokens.spacingHorizontalS,
		alignItems: "center",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	snippet: {
		margin: 0,
		padding: tokens.spacingHorizontalS,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground3,
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere",
	},
	actions: { display: "flex", gap: tokens.spacingHorizontalS, flexWrap: "wrap" },
});

interface Props {
	params: ActionParameter[];
	onChange: (params: ActionParameter[]) => void;
	readOnly?: boolean;
}

/**
 * "Values for data" (#275): name / value rows packed into a web resource's one `data`
 * parameter, and unpacked again when the action opens.
 */
export function DataValuesHelper({ params, onChange, readOnly }: Props) {
	const styles = useStyles();
	const found = findDataParameter(params);
	const stored = found?.param.kind === "StringParameter" ? found.param.value : "";
	const decoded = found?.param.kind === "StringParameter" ? decodeDataValues(stored) : null;
	const [rows, setRows] = useState<DataValue[]>(decoded ?? []);
	const [copied, setCopied] = useState(false);

	// Follow a change made elsewhere (the parameter list, an undo); a row still being named stays.
	useEffect(() => {
		if (decoded && encodeDataValues(rows) !== stored) setRows(decoded);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored value changes
	}, [stored]);

	// `data` is a context value or a number, or holds text the helper didn't write.
	if (found && (found.param.kind !== "StringParameter" || decoded === null)) {
		return (
			<div className={styles.root}>
				<Label weight="semibold">Values for data</Label>
				<Caption1 className={styles.muted}>
					The data parameter already holds a value of its own, so it can&apos;t also hold
					values from here. Edit it in the list above, or remove it to pack values into
					it.
				</Caption1>
			</div>
		);
	}

	const update = (next: DataValue[]) => {
		setRows(next);
		onChange(withDataValues(params, next));
	};

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(DATA_PAGE_SNIPPET);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// No clipboard access: the code is shown above to copy by hand.
		}
	};

	return (
		<div className={styles.root}>
			<Label weight="semibold">Values for data</Label>
			<Caption1 className={styles.muted}>
				A web resource reads only a few query string names, so put values of your own here:
				Command Bar Studio packs them into the one data parameter.
			</Caption1>
			{rows.map((row, i) => (
				<div key={i} className={styles.row}>
					<Input
						aria-label={`Value ${i + 1} name`}
						placeholder="Name"
						value={row.name}
						disabled={readOnly}
						onChange={(_, d) =>
							update(rows.map((r, j) => (j === i ? { ...r, name: d.value } : r)))
						}
					/>
					<Input
						aria-label={`Value ${i + 1}`}
						placeholder="Value"
						value={row.value}
						disabled={readOnly}
						onChange={(_, d) =>
							update(rows.map((r, j) => (j === i ? { ...r, value: d.value } : r)))
						}
					/>
					<Button
						appearance="subtle"
						icon={<DeleteRegular />}
						aria-label={`Remove value ${i + 1}`}
						disabled={readOnly}
						onClick={() => update(rows.filter((_, j) => j !== i))}
					/>
				</div>
			))}
			<div className={styles.actions}>
				<Button
					size="small"
					icon={<AddRegular />}
					disabled={readOnly}
					onClick={() => setRows([...rows, { name: "", value: "" }])}
				>
					Add value
				</Button>
			</div>
			<MessageBar intent="info">
				<MessageBarBody>
					These are fixed text. A context value, such as the record&apos;s id, can&apos;t
					go in data: the ribbon passes each one under its own name. Turn on Pass
					parameters for the record&apos;s details instead.
				</MessageBarBody>
			</MessageBar>
			{rows.some((r) => r.name.trim()) && (
				<>
					<Text size={200}>Read them in the web resource:</Text>
					<pre className={styles.snippet}>{DATA_PAGE_SNIPPET}</pre>
					<div className={styles.actions}>
						<Button size="small" icon={<CopyRegular />} onClick={() => void copy()}>
							{copied ? "Copied" : "Copy code"}
						</Button>
					</div>
				</>
			)}
		</div>
	);
}
