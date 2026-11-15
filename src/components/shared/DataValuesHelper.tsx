import { useEffect, useId, useRef, useState } from "react";
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
	dataPageSnippet,
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
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const labelId = useId();
	useEffect(() => () => clearTimeout(timer.current), []);

	// Follow a change made elsewhere (the parameter list): the value changed, or the parameter
	// was removed or renamed. A row still being named (it encodes to nothing) stays.
	const next = decoded ?? (found ? null : []);
	useEffect(() => {
		if (next && encodeDataValues(rows) !== stored) setRows(next);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored value changes
	}, [stored, !!found]);

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

	const snippet = dataPageSnippet(rows.find((r) => r.name.trim())?.name.trim());
	const copy = async () => {
		clearTimeout(timer.current);
		try {
			await navigator.clipboard.writeText(snippet);
			setCopyState("copied");
		} catch {
			setCopyState("failed");
		}
		timer.current = setTimeout(() => setCopyState("idle"), 3000);
	};

	return (
		<div className={styles.root} role="group" aria-labelledby={labelId}>
			<Label id={labelId} weight="semibold">
				Values for data
			</Label>
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
					<Text size={200}>
						Read them in the web resource with this code. A reader written for
						Microsoft&apos;s data parameter sample doesn&apos;t read this format.
					</Text>
					<pre className={styles.snippet}>{snippet}</pre>
					<div className={styles.actions}>
						<Button size="small" icon={<CopyRegular />} onClick={() => void copy()}>
							Copy code
						</Button>
						<Text size={200} aria-live="polite" className={styles.muted}>
							{copyState === "copied"
								? "Copied"
								: copyState === "failed"
									? "Couldn't copy: select the code and copy it"
									: ""}
						</Text>
					</div>
				</>
			)}
		</div>
	);
}
