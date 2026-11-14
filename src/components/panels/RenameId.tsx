import { useState } from "react";
import { Button, Field, Input, makeStyles, tokens } from "@fluentui/react-components";

/**
 * Renaming an id in the editor drawer's header (#186): the error under the
 * field, Enter renames, Esc cancels the rename (not the drawer).
 */

const useStyles = makeStyles({
	rename: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
		marginTop: tokens.spacingVerticalXS,
	},
	field: { flex: 1, minWidth: 0 },
	input: { fontFamily: tokens.fontFamilyMonospace },
	buttons: {
		display: "flex",
		gap: tokens.spacingHorizontalXS,
		// Level with the input, under the field's label.
		marginTop: "22px",
	},
});

function idError(draft: string, current: string, ids: string[], what: string): string | undefined {
	if (!draft.trim()) return "Enter an ID.";
	if (/\s/.test(draft)) return "An ID can't contain spaces.";
	if (draft !== current && ids.some((id) => id.toLowerCase() === draft.toLowerCase()))
		return `Another ${what} already has this ID.`;
	return undefined;
}

export interface RenameIdProps {
	/** The field's label, e.g. "Command ID". */
	label: string;
	current: string;
	/** Ids already taken. */
	ids: string[];
	/** What the id names, for the error: "command", "rule". */
	what: string;
	hint: string;
	/** Renames to `next`, a valid id other than `current`. */
	onRename: (next: string) => void;
	onDone: () => void;
}

export function RenameId({ label, current, ids, what, hint, onRename, onDone }: RenameIdProps) {
	const styles = useStyles();
	const [draft, setDraft] = useState(current);
	const error = idError(draft, current, ids, what);
	const apply = () => {
		const next = draft.trim();
		if (!error && next !== current) onRename(next);
		onDone();
	};
	return (
		<div className={styles.rename}>
			<Field
				className={styles.field}
				label={label}
				validationState={error ? "error" : "none"}
				validationMessage={error}
				hint={error ? undefined : hint}
			>
				<Input
					className={styles.input}
					value={draft}
					// eslint-disable-next-line jsx-a11y/no-autofocus -- shown by the Rename button, to type into at once
					autoFocus
					onChange={(_, d) => setDraft(d.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") apply();
						if (e.key === "Escape") {
							// Cancels the rename, not the drawer.
							e.stopPropagation();
							onDone();
						}
					}}
				/>
			</Field>
			<div className={styles.buttons}>
				<Button
					appearance="primary"
					disabled={!!error || draft.trim() === current}
					onClick={apply}
				>
					Rename
				</Button>
				<Button onClick={onDone}>Cancel</Button>
			</div>
		</div>
	);
}

export default RenameId;
