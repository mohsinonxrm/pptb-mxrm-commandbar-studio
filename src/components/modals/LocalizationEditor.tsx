import React, { useState, useCallback } from "react";
import {
	makeStyles,
	tokens,
	Dialog,
	DialogSurface,
	DialogBody,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Input,
	Badge,
	Text,
	Subtitle2,
	Tooltip,
} from "@fluentui/react-components";
import { DismissRegular, AddRegular, DeleteRegular, TextAddRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { groupControls } from "@/utils/ribbonMenu";
import type { RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import {
	buttonLabelId,
	buttonTooltipBodyId,
	buttonTooltipTitleId,
	textLabelId,
} from "@/utils/locLabelRef";

const KNOWN_LCIDS: Record<number, { name: string; flag: string }> = {
	1033: { name: "English (US)", flag: "🇺🇸" },
	1031: { name: "German", flag: "🇩🇪" },
	1034: { name: "Spanish", flag: "🇪🇸" },
	1036: { name: "French", flag: "🇫🇷" },
	1040: { name: "Italian", flag: "🇮🇹" },
	1041: { name: "Japanese", flag: "🇯🇵" },
	1042: { name: "Korean", flag: "🇰🇷" },
	1043: { name: "Dutch", flag: "🇳🇱" },
	1044: { name: "Norwegian", flag: "🇳🇴" },
	1045: { name: "Polish", flag: "🇵🇱" },
	1046: { name: "Portuguese (Brazil)", flag: "🇧🇷" },
	1049: { name: "Russian", flag: "🇷🇺" },
	1053: { name: "Swedish", flag: "🇸🇪" },
	1054: { name: "Thai", flag: "🇹🇭" },
	1055: { name: "Turkish", flag: "🇹🇷" },
	1057: { name: "Indonesian", flag: "🇮🇩" },
	1058: { name: "Ukrainian", flag: "🇺🇦" },
	1066: { name: "Vietnamese", flag: "🇻🇳" },
	2052: { name: "Chinese (Simplified)", flag: "🇨🇳" },
	3082: { name: "Spanish (Spain)", flag: "🇪🇸" },
};

const ALL_LCIDS = Object.keys(KNOWN_LCIDS).map(Number);

const useStyles = makeStyles({
	surface: {
		width: "760px",
		maxWidth: "95vw",
		maxHeight: "80vh",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalM,
		overflowY: "auto",
	},
	chipRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalXS,
		alignItems: "center",
	},
	chip: {
		cursor: "pointer",
		userSelect: "none",
	},
	table: {
		width: "100%",
		borderCollapse: "collapse",
	},
	th: {
		textAlign: "left",
		fontSize: tokens.fontSizeBase100,
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground3,
		paddingBottom: tokens.spacingHorizontalXS,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	td: {
		verticalAlign: "top",
		paddingTop: tokens.spacingHorizontalXS,
		paddingBottom: tokens.spacingHorizontalXS,
		paddingRight: tokens.spacingHorizontalS,
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
	},
	langCell: {
		whiteSpace: "nowrap",
		width: "160px",
	},
	actionCell: {
		width: "40px",
	},
	insertBreakBtn: {
		fontSize: tokens.fontSizeBase100,
		height: "20px",
		minWidth: "unset",
		padding: `0 ${tokens.spacingHorizontalXS}`,
	},
	noteBar: {
		backgroundColor: tokens.colorNeutralBackground3,
		borderRadius: tokens.borderRadiusMedium,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
	},
});

interface LcidEntry {
	lcid: number;
	label: string;
	tooltipTitle: string;
	tooltipBody: string;
}

export const LocalizationEditor: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.localizationEditorOpen);
	const buttonId = useUIStore((s) => s.localizationEditorButtonId);
	const closeLocalizationEditor = useUIStore((s) => s.closeLocalizationEditor);

	const locLabels = useRibbonStore((s) => s.locLabels);
	const upsertLocLabel = useRibbonStore((s) => s.upsertLocLabel);
	const batch = useRibbonStore((s) => s.batch);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseLcid = useRibbonStore((s) => s.baseLanguageCode);
	// Edit the labels the button's texts are published to: one it references
	// keeps its own id (a Ribbon Workbench or solution label, #49), else the
	// convention id. Another solution's label, shared and not loaded, isn't
	// edited here (#137): its fields are read-only until the text changes.
	const found = React.useMemo(() => {
		if (!buttonId) return undefined;
		for (const [location, def] of Object.entries(ribbons) as [
			RibbonLocation,
			RibbonDefinition,
		][])
			for (const tab of def.tabs)
				for (const group of tab.groups)
					for (const b of groupControls(group))
						if (b.id === buttonId)
							return { button: b, location, tabId: tab.id, groupId: group.id };
		return undefined;
	}, [ribbons, buttonId]);
	const button = found?.button;
	const source = button?.source;
	const labelId = button
		? textLabelId(
				source?.labelToken,
				buttonLabelId(button.id),
				button.label,
				locLabels,
				baseLcid,
			)
		: null;
	const tooltipTitleId = button
		? textLabelId(
				source?.tooltipTitleToken,
				buttonTooltipTitleId(button.id),
				button.tooltipTitle,
				locLabels,
				baseLcid,
			)
		: null;
	const tooltipBodyId = button
		? textLabelId(
				source?.tooltipBodyToken,
				buttonTooltipBodyId(button.id),
				button.tooltipBody,
				locLabels,
				baseLcid,
			)
		: null;
	const shared = button
		? [
				[labelId, source?.labelToken],
				[tooltipTitleId, source?.tooltipTitleToken],
				[tooltipBodyId, source?.tooltipBodyToken],
			]
				.filter(([id, token]) => id === null && token)
				.map(([, token]) => (token as string).slice("$LocLabels:".length))
				.filter((id, i, all) => all.indexOf(id) === i)
		: [];

	const getLcidEntries = useCallback((): LcidEntry[] => {
		const labelRecord = locLabels.find((l) => l.id === labelId);
		const ttRecord = locLabels.find((l) => l.id === tooltipTitleId);
		const tbRecord = locLabels.find((l) => l.id === tooltipBodyId);

		const lcidSet = new Set<number>([baseLcid]);
		labelRecord?.titles.forEach((t) => lcidSet.add(t.languageCode));
		ttRecord?.titles.forEach((t) => lcidSet.add(t.languageCode));
		tbRecord?.titles.forEach((t) => lcidSet.add(t.languageCode));

		return Array.from(lcidSet)
			.sort((a, b) => (a === baseLcid ? -1 : b === baseLcid ? 1 : a - b))
			.map((lcid) =>
				// The base language is the button's own text — what Properties edits and
				// a publish writes as the base title (#157) — not a copy kept in the label.
				lcid === baseLcid
					? {
							lcid,
							label: button?.label ?? "",
							tooltipTitle: button?.tooltipTitle ?? "",
							tooltipBody: button?.tooltipBody ?? "",
						}
					: {
							lcid,
							label:
								labelRecord?.titles.find((t) => t.languageCode === lcid)
									?.description ?? "",
							tooltipTitle:
								ttRecord?.titles.find((t) => t.languageCode === lcid)
									?.description ?? "",
							tooltipBody:
								tbRecord?.titles.find((t) => t.languageCode === lcid)
									?.description ?? "",
						},
			);
	}, [locLabels, labelId, tooltipTitleId, tooltipBodyId, baseLcid, button]);

	const [entries, setEntries] = useState<LcidEntry[]>([]);
	const [addingLcid, setAddingLcid] = useState<string>("");

	// Sync from store when opening
	React.useEffect(() => {
		if (open) setEntries(getLcidEntries());
	}, [open, getLcidEntries]);

	const updateEntry = (lcid: number, field: keyof Omit<LcidEntry, "lcid">, value: string) => {
		setEntries((prev) => prev.map((e) => (e.lcid === lcid ? { ...e, [field]: value } : e)));
	};

	const insertBreak = (
		lcid: number,
		field: keyof Omit<LcidEntry, "lcid">,
		el: HTMLInputElement | HTMLTextAreaElement | null,
	) => {
		if (!el) return;
		const start = el.selectionStart ?? el.value.length;
		const end = el.selectionEnd ?? el.value.length;
		const current = entries.find((e) => e.lcid === lcid)?.[field] ?? "";
		const next = current.slice(0, start) + "\u200b\u200b" + current.slice(end);
		updateEntry(lcid, field, next);
	};

	const addLanguage = () => {
		const lcid = parseInt(addingLcid, 10);
		if (!lcid || entries.find((e) => e.lcid === lcid)) return;
		setEntries((prev) => [...prev, { lcid, label: "", tooltipTitle: "", tooltipBody: "" }]);
		setAddingLcid("");
	};

	const removeEntry = (lcid: number) => {
		if (lcid === baseLcid) return;
		setEntries((prev) => prev.filter((e) => e.lcid !== lcid));
	};

	const handleSave = () => {
		if (!button) return;

		const toTitles = (field: keyof Omit<LcidEntry, "lcid">) =>
			entries
				.filter((e) => e[field])
				.map((e) => ({ languageCode: e.lcid, description: e[field] as string }));

		// The base-language texts are the button's own (#157): saved to it, so the
		// canvas, Properties and the publish all use them. A label can't be emptied here.
		const base = entries.find((e) => e.lcid === baseLcid);
		const patch: Partial<RibbonButton> = {};
		if (base && labelId && base.label && base.label !== button.label) patch.label = base.label;
		if (base && tooltipTitleId && base.tooltipTitle !== (button.tooltipTitle ?? ""))
			patch.tooltipTitle = base.tooltipTitle || undefined;
		if (base && tooltipBodyId && base.tooltipBody !== (button.tooltipBody ?? ""))
			patch.tooltipBody = base.tooltipBody || undefined;

		// A label is written when the text has one already or gets another
		// language: the base text alone lives on the button (#157 review — saving
		// with no change created a label for a literal or platform text, and
		// the publish plan then refused it).
		const write = (id: string | null, field: keyof Omit<LcidEntry, "lcid">) =>
			!!id &&
			(locLabels.some((l) => l.id === id) ||
				toTitles(field).some((t) => t.languageCode !== baseLcid));

		// One undo step for the whole dialog (#34).
		batch(() => {
			if (found && Object.keys(patch).length > 0)
				setButtonProp(found.location, found.tabId, found.groupId, button.id, patch);
			if (labelId && write(labelId, "label") && toTitles("label").length > 0) {
				upsertLocLabel({ id: labelId, titles: toTitles("label") });
			}
			if (
				tooltipTitleId &&
				write(tooltipTitleId, "tooltipTitle") &&
				toTitles("tooltipTitle").length > 0
			) {
				upsertLocLabel({ id: tooltipTitleId, titles: toTitles("tooltipTitle") });
			}
			if (
				tooltipBodyId &&
				write(tooltipBodyId, "tooltipBody") &&
				toTitles("tooltipBody").length > 0
			) {
				upsertLocLabel({ id: tooltipBodyId, titles: toTitles("tooltipBody") });
			}
		});
		closeLocalizationEditor();
	};

	const baseEntry = entries.find((e) => e.lcid === baseLcid);

	return (
		<Dialog open={open} onOpenChange={(_, d) => !d.open && closeLocalizationEditor()}>
			<DialogSurface className={styles.surface}>
				<DialogBody>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<DismissRegular />}
								onClick={closeLocalizationEditor}
								aria-label="Close"
							/>
						}
					>
						<Subtitle2>
							Translations — {baseEntry?.label || buttonId || "Button"}
						</Subtitle2>
						<Badge appearance="tint" size="small" style={{ marginLeft: 8 }}>
							{entries.length} language{entries.length !== 1 ? "s" : ""}
						</Badge>
					</DialogTitle>

					<DialogContent className={styles.body}>
						{/* Locale chips */}
						<div className={styles.chipRow}>
							{entries.map((e) => {
								const info = KNOWN_LCIDS[e.lcid];
								return (
									<Badge
										key={e.lcid}
										className={styles.chip}
										appearance={e.label ? "filled" : "outline"}
										color={e.label ? "brand" : "informative"}
										size="medium"
									>
										{info?.flag ?? "🌐"} {info?.name ?? `LCID ${e.lcid}`}
										{e.lcid !== baseLcid && (
											<span
												style={{
													marginLeft: 4,
													cursor: "pointer",
													opacity: 0.7,
												}}
												onClick={() => removeEntry(e.lcid)}
												aria-label={`Remove ${info?.name}`}
											>
												×
											</span>
										)}
									</Badge>
								);
							})}
							{/* Add language */}
							<div style={{ display: "flex", gap: 4, alignItems: "center" }}>
								<Input
									size="small"
									style={{ width: "180px" }}
									placeholder="LCID or language…"
									value={addingLcid}
									onChange={(_, d) => setAddingLcid(d.value)}
									list="lcid-list"
									onKeyDown={(e) => e.key === "Enter" && addLanguage()}
								/>
								<datalist id="lcid-list">
									{ALL_LCIDS.filter(
										(l) => !entries.find((e) => e.lcid === l),
									).map((l) => (
										<option key={l} value={String(l)}>
											{KNOWN_LCIDS[l]?.flag} {KNOWN_LCIDS[l]?.name} ({l})
										</option>
									))}
								</datalist>
								<Button
									size="small"
									appearance="subtle"
									icon={<AddRegular />}
									onClick={addLanguage}
									aria-label="Add language"
								/>
							</div>
						</div>

						<div className={styles.noteBar}>
							💡 LCID {baseLcid} ({KNOWN_LCIDS[baseLcid]?.name ?? "base language"}) is
							the organisation's base language and cannot be removed. Use "Insert
							&#x200b;&#x200b;" to force a line break in long labels.
						</div>

						{shared.length > 0 && (
							<div className={styles.noteBar}>
								{shared.join(", ")}{" "}
								{shared.length === 1 ? "is a label" : "are labels"} of another
								solution, shared with the controls that use{" "}
								{shared.length === 1 ? "it" : "them"}, so{" "}
								{shared.length === 1 ? "it isn't" : "they aren't"} edited here.
								Change the text in Properties to give this button a label of its
								own, then add translations.
							</div>
						)}

						{/* Table */}
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={styles.th} style={{ width: "160px" }}>
										Language
									</th>
									<th className={styles.th}>Label</th>
									<th className={styles.th}>Tooltip title</th>
									<th className={styles.th}>Tooltip body</th>
									<th className={styles.th} style={{ width: "40px" }}></th>
								</tr>
							</thead>
							<tbody>
								{entries.map((entry) => {
									const info = KNOWN_LCIDS[entry.lcid];
									return (
										<tr key={entry.lcid}>
											<td className={`${styles.td} ${styles.langCell}`}>
												<Text size={200}>
													{info?.flag ?? "🌐"}{" "}
													{info?.name ?? `LCID ${entry.lcid}`}
												</Text>
												<br />
												<Text
													size={100}
													style={{
														color: tokens.colorNeutralForeground3,
													}}
												>
													{entry.lcid}
												</Text>
											</td>
											<td className={styles.td}>
												<LabelCellInput
													value={entry.label}
													disabled={!labelId}
													onChange={(v) =>
														updateEntry(entry.lcid, "label", v)
													}
													onInsertBreak={(el) =>
														insertBreak(entry.lcid, "label", el)
													}
												/>
											</td>
											<td className={styles.td}>
												<LabelCellInput
													value={entry.tooltipTitle}
													disabled={!tooltipTitleId}
													onChange={(v) =>
														updateEntry(entry.lcid, "tooltipTitle", v)
													}
													onInsertBreak={(el) =>
														insertBreak(entry.lcid, "tooltipTitle", el)
													}
												/>
											</td>
											<td className={styles.td}>
												<BodyCellInput
													value={entry.tooltipBody}
													disabled={!tooltipBodyId}
													onChange={(v) =>
														updateEntry(entry.lcid, "tooltipBody", v)
													}
												/>
											</td>
											<td className={`${styles.td} ${styles.actionCell}`}>
												{entry.lcid !== baseLcid && (
													<Tooltip
														content="Remove this language"
														relationship="label"
													>
														<Button
															appearance="subtle"
															size="small"
															icon={<DeleteRegular />}
															onClick={() => removeEntry(entry.lcid)}
															aria-label="Remove language"
														/>
													</Tooltip>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</DialogContent>

					<DialogActions>
						<Button appearance="secondary" onClick={closeLocalizationEditor}>
							Cancel
						</Button>
						<Button appearance="primary" onClick={handleSave}>
							Save translations
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

function LabelCellInput({
	value,
	disabled,
	onChange,
	onInsertBreak,
}: {
	value: string;
	disabled?: boolean;
	onChange: (v: string) => void;
	onInsertBreak: (el: HTMLInputElement | null) => void;
}) {
	const ref = React.useRef<HTMLInputElement>(null);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<input
				ref={ref}
				style={{
					width: "100%",
					fontFamily: "inherit",
					fontSize: 13,
					padding: "3px 6px",
					border: `1px solid var(--colorNeutralStroke1)`,
					borderRadius: 4,
					boxSizing: "border-box",
				}}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value)}
			/>
			<Tooltip content="Insert Dataverse line break (&#x200b;&#x200b;)" relationship="label">
				<button
					type="button"
					disabled={disabled}
					onClick={() => onInsertBreak(ref.current)}
					style={{
						fontSize: 11,
						border: "none",
						background: "none",
						color: "var(--colorNeutralForeground3)",
						cursor: "pointer",
						padding: 0,
						textAlign: "left",
						display: "flex",
						alignItems: "center",
						gap: 2,
					}}
				>
					<TextAddRegular fontSize={12} /> Insert ⏎
				</button>
			</Tooltip>
		</div>
	);
}

function BodyCellInput({
	value,
	disabled,
	onChange,
}: {
	value: string;
	disabled?: boolean;
	onChange: (v: string) => void;
}) {
	return (
		<textarea
			style={{
				width: "100%",
				fontFamily: "inherit",
				fontSize: 13,
				padding: "3px 6px",
				border: `1px solid var(--colorNeutralStroke1)`,
				borderRadius: 4,
				boxSizing: "border-box",
				resize: "vertical",
				minHeight: "42px",
			}}
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			rows={2}
		/>
	);
}

export default LocalizationEditor;
