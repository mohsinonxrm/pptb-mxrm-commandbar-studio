import { useEffect, useMemo, useRef, useState } from "react";
import {
	makeStyles,
	mergeClasses,
	tokens,
	Badge,
	Combobox,
	Option,
	OptionGroup,
	Text,
	type ComboboxProps,
} from "@fluentui/react-components";
import { LockClosedRegular } from "@fluentui/react-icons";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore, draftKeyFor } from "@/store/draftStore";
import { useUIStore } from "@/store/uiStore";
import { usePublishState } from "@/hooks/usePublishState";
import { hasDraft } from "@/services/ribbonDraft";
import type { EntityMetadata } from "@/types/entity";

/**
 * The top bar's table picker (#194): a combobox of the solution's tables,
 * Custom and Standard, filtered as you type. It replaces the Tables tab of the
 * left pane. Switching asks first when there are unpublished changes, as the
 * Tables tab did.
 */

const useStyles = makeStyles({
	combobox: {
		minWidth: "140px",
		width: "220px",
		flexShrink: 1,
		"@media (max-width: 1200px)": { width: "180px" },
	},
	// The input's own width (size="20") would push the chevron out of a narrow box.
	input: { minWidth: 0, width: "100%" },
	listbox: { maxHeight: "min(480px, 70vh)" },
	option: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
		width: "100%",
	},
	names: { display: "flex", flexDirection: "column", minWidth: 0, flex: 1 },
	ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
	logical: {
		fontFamily: tokens.fontFamilyMonospace,
		color: tokens.colorNeutralForeground3,
	},
	muted: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
	empty: { whiteSpace: "normal" },
});

const NONE = "__none";

function matches(entity: EntityMetadata, query: string): boolean {
	const q = query.trim().toLowerCase();
	return (
		!q ||
		entity.displayName.toLowerCase().includes(q) ||
		entity.logicalName.toLowerCase().includes(q)
	);
}

export function TablePicker() {
	const styles = useStyles();
	const entities = useSessionStore((s) => s.entities);
	const activeEntity = useSessionStore((s) => s.activeEntity);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const solutionEntityIds = useSessionStore((s) => s.solutionEntityIds);
	const requestEntitySwitch = useDraftStore((s) => s.requestEntitySwitch);
	const open = useUIStore((s) => s.tablePickerOpen);
	const setOpen = useUIStore((s) => s.setTablePickerOpen);
	const { count } = usePublishState();
	// What's typed; null while the box shows the open table's name.
	const [query, setQuery] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const loading = !!activeSolution && solutionEntityIds === null;
	const disabled = !activeSolution || loading;
	const shown = open && !disabled;

	// "Choose table" on the empty canvas (#195) opens the list: focus goes with it,
	// also when it was asked for while the tables were loading.
	useEffect(() => {
		if (shown && document.activeElement !== inputRef.current) inputRef.current?.focus();
	}, [shown]);

	// Other tables' drafts, read when the list opens (a draft is saved per table, #16).
	const drafts = useMemo(() => {
		const set = new Set<string>();
		if (!open) return set;
		for (const e of entities) if (hasDraft(draftKeyFor(e.logicalName))) set.add(e.logicalName);
		return set;
	}, [open, entities]);

	const filtered = entities.filter((e) => matches(e, query ?? ""));
	const custom = filtered.filter((e) => e.isCustomEntity);
	const standard = filtered.filter((e) => !e.isCustomEntity);

	const renderOption = (e: EntityMetadata) => {
		const isActive = e.logicalName === activeEntity?.logicalName;
		const changes = isActive ? count : 0;
		return (
			<Option key={e.logicalName} value={e.logicalName} text={e.displayName}>
				<div className={styles.option}>
					<div className={styles.names}>
						<Text
							size={200}
							weight={isActive ? "semibold" : "regular"}
							className={styles.ellipsis}
						>
							{e.displayName}
						</Text>
						<Text size={100} className={mergeClasses(styles.logical, styles.ellipsis)}>
							{e.logicalName}
						</Text>
					</div>
					{changes > 0 ? (
						<Badge appearance="tint" color="brand" size="small">
							{changes} change{changes === 1 ? "" : "s"}
						</Badge>
					) : (
						!isActive &&
						drafts.has(e.logicalName) && (
							<Badge appearance="tint" color="brand" size="small">
								Draft
							</Badge>
						)
					)}
					{e.isManaged && (
						<LockClosedRegular
							fontSize={12}
							className={styles.muted}
							aria-label="Managed table"
						/>
					)}
				</div>
			</Option>
		);
	};

	const emptyMessage =
		entities.length === 0 && activeSolution
			? `No tables in ${activeSolution.friendlyName}. Add one in the maker portal (Solutions › ${activeSolution.friendlyName} › Add existing › Table) and reload.`
			: "No tables match.";

	const handleSelect: ComboboxProps["onOptionSelect"] = (ev, data) => {
		// Typing clears a freeform combobox's selection: that's not a choice.
		if (data.optionValue === undefined) return;
		// Nor is Tab (Fluent picks the active option on it): leaving the box mustn't load a table.
		if (ev.type === "keydown" && (ev as React.KeyboardEvent).key === "Tab") return;
		setQuery(null);
		const entity = entities.find((e) => e.logicalName === data.optionValue);
		// Asks first when there are unpublished changes (#16).
		if (entity && entity.logicalName !== activeEntity?.logicalName) requestEntitySwitch(entity);
	};

	const placeholder = !activeSolution
		? "Choose a solution first"
		: loading
			? "Loading tables…"
			: "Choose table";

	return (
		<Combobox
			ref={inputRef}
			aria-label="Table"
			className={styles.combobox}
			input={{ className: styles.input }}
			listbox={{ className: styles.listbox }}
			placeholder={placeholder}
			disabled={disabled}
			freeform
			value={query ?? activeEntity?.displayName ?? ""}
			selectedOptions={activeEntity ? [activeEntity.logicalName] : []}
			open={shown}
			onOpenChange={(_, d) => {
				setOpen(d.open);
				if (!d.open) setQuery(null);
			}}
			onChange={(ev) => {
				setQuery(ev.target.value);
				if (!open) setOpen(true);
			}}
			onOptionSelect={handleSelect}
			// Typing starts from an empty box, not after the open table's name.
			onFocus={(ev) => ev.currentTarget.select()}
		>
			{custom.length > 0 && (
				<OptionGroup label={`Custom (${custom.length})`}>
					{custom.map(renderOption)}
				</OptionGroup>
			)}
			{standard.length > 0 && (
				<OptionGroup label={`Standard (${standard.length})`}>
					{standard.map(renderOption)}
				</OptionGroup>
			)}
			{filtered.length === 0 && (
				<Option value={NONE} text="" disabled>
					<span className={styles.empty}>{emptyMessage}</span>
				</Option>
			)}
		</Combobox>
	);
}
