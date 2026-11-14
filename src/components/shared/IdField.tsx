import React, { useEffect, useId, useRef, useState } from "react";
import { Button, Input, Label, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { CheckmarkRegular, CopyRegular } from "@fluentui/react-icons";
import { copyText } from "@/utils/hostIO";

/**
 * A long ribbon id shown read-only (#190, #184): monospace, cut with an
 * ellipsis when it doesn't fit, the full id in a tooltip, and a copy button
 * instead of selecting text.
 */

const useStyles = makeStyles({
	field: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
		minWidth: 0,
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		minWidth: 0,
	},
	input: {
		flex: 1,
		minWidth: 0,
		backgroundColor: tokens.colorNeutralBackground3,
	},
	srOnly: {
		position: "absolute",
		width: "1px",
		height: "1px",
		overflow: "hidden",
		clipPath: "inset(50%)",
		whiteSpace: "nowrap",
	},
	value: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		textOverflow: "ellipsis",
	},
});

export interface IdFieldProps {
	/** Visible label, e.g. "Button ID". Also names the copy button. */
	label: string;
	value: string;
	/** An extra button after copy, e.g. "Edit command". */
	action?: React.ReactNode;
	/** Hide the visible label when the surrounding layout already names it. */
	hideLabel?: boolean;
}

export const IdField: React.FC<IdFieldProps> = ({ label, value, action, hideLabel }) => {
	const styles = useStyles();
	const inputId = useId();
	const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);

	const copy = async () => {
		const r = await copyText(value);
		setStatus(r.ok ? "copied" : "failed");
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setStatus("idle"), 2000);
	};

	const copyLabel =
		status === "copied"
			? `${label} copied`
			: status === "failed"
				? `Couldn't copy the ${label.toLowerCase()}`
				: `Copy ${label.toLowerCase()}`;

	const control = (
		<div className={styles.row}>
			<Tooltip content={value} relationship="description" withArrow>
				<Input
					id={inputId}
					className={styles.input}
					input={{ className: styles.value }}
					value={value}
					readOnly
					appearance="filled-darker"
					aria-label={hideLabel ? label : undefined}
				/>
			</Tooltip>
			<Tooltip content={copyLabel} relationship="label">
				<Button
					appearance="subtle"
					icon={status === "copied" ? <CheckmarkRegular /> : <CopyRegular />}
					onClick={() => void copy()}
				/>
			</Tooltip>
			{action}
			{/* Announces the copy result to screen readers. */}
			<span aria-live="polite" className={styles.srOnly}>
				{status === "idle" ? "" : copyLabel}
			</span>
		</div>
	);

	if (hideLabel) return control;
	// Not a Field: Field would put the input's id and aria on the wrapping row.
	return (
		<div className={styles.field}>
			<Label htmlFor={inputId} size="small" weight="semibold">
				{label}
			</Label>
			{control}
		</div>
	);
};

export default IdField;
