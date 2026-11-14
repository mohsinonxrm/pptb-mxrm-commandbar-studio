import { useState } from "react";
import {
	Combobox,
	Field,
	makeStyles,
	useComboboxFilter,
	type ComboboxProps,
} from "@fluentui/react-components";

/**
 * Pick one id from a long list by typing part of it (#184): rules to bind,
 * commands to use. Typing filters; only an id chosen from the list counts, so
 * a half-typed id can't be bound by accident.
 */

const useStyles = makeStyles({
	field: { minWidth: 0 },
	combobox: { minWidth: 0, width: "100%" },
	listbox: { maxHeight: "280px", maxWidth: "min(480px, 90vw)", overflowWrap: "anywhere" },
});

export interface IdPickerProps {
	label: string;
	options: string[];
	/** The chosen id, or "" when none. */
	selected: string;
	onSelect: (id: string) => void;
	placeholder?: string;
	/** Shown when nothing matches what was typed. */
	noOptionsMessage?: string;
	hint?: string;
}

export function IdPicker({
	label,
	options,
	selected,
	onSelect,
	placeholder = "Type to filter",
	noOptionsMessage = "Nothing matches.",
	hint,
}: IdPickerProps) {
	const styles = useStyles();
	const [query, setQuery] = useState(selected);
	// Cleared by the parent (e.g. after binding): clear the text too.
	const [lastSelected, setLastSelected] = useState(selected);
	if (lastSelected !== selected) {
		setLastSelected(selected);
		setQuery(selected);
	}
	const children = useComboboxFilter(
		query,
		options.map((id) => ({ value: id, children: id })),
		{
			noOptionsMessage,
			optionToReactKey: (o) => o.value,
			optionToText: (o) => o.value,
		},
	);
	const onOptionSelect: ComboboxProps["onOptionSelect"] = (_, data) => {
		setQuery(data.optionText ?? "");
		onSelect(data.optionValue ?? "");
	};
	return (
		<Field label={label} hint={hint} className={styles.field}>
			<Combobox
				size="small"
				freeform
				clearable
				className={styles.combobox}
				listbox={{ className: styles.listbox }}
				placeholder={placeholder}
				value={query}
				selectedOptions={selected ? [selected] : []}
				onChange={(e) => {
					setQuery(e.target.value);
					if (selected) onSelect("");
				}}
				onOptionSelect={onOptionSelect}
			>
				{children}
			</Combobox>
		</Field>
	);
}

export default IdPicker;
