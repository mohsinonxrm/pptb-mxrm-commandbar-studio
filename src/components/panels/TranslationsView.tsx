import React, { useMemo, useState } from "react";
import {
	makeStyles,
	tokens,
	Button,
	Caption1,
	Combobox,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Option,
	Text,
	Textarea,
	Tooltip,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, TextAddRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { groupControls } from "@/utils/ribbonMenu";
import type { LocLabel, RibbonButton, RibbonDefinition, RibbonLocation } from "@/types/ribbon";
import {
	buttonLabelId,
	buttonTooltipBodyId,
	buttonTooltipTitleId,
	textLabelId,
} from "@/utils/locLabelRef";

/** Language names for the LCIDs Dataverse ships, shown instead of flags (#187). */
const LANGUAGES: Record<number, string> = {
	1033: "English (United States)",
	1031: "German",
	1034: "Spanish (traditional)",
	1036: "French",
	1040: "Italian",
	1041: "Japanese",
	1042: "Korean",
	1043: "Dutch",
	1044: "Norwegian",
	1045: "Polish",
	1046: "Portuguese (Brazil)",
	1049: "Russian",
	1053: "Swedish",
	1054: "Thai",
	1055: "Turkish",
	1057: "Indonesian",
	1058: "Ukrainian",
	1066: "Vietnamese",
	2052: "Chinese (Simplified)",
	3082: "Spanish (Spain)",
};
const languageName = (lcid: number) => LANGUAGES[lcid] ?? `Language ${lcid}`;

/** Dataverse's line break in a ribbon label: two zero-width spaces. */
const LINE_BREAK = "​​";

type TextField = "label" | "tooltipTitle" | "tooltipBody";
const FIELDS: { field: TextField; name: string; multiline?: boolean }[] = [
	{ field: "label", name: "Label" },
	{ field: "tooltipTitle", name: "Tooltip title" },
	{ field: "tooltipBody", name: "Tooltip body", multiline: true },
];

const useStyles = makeStyles({
	// A view of the editor drawer (#186): its body scrolls and pads it.
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	muted: { color: tokens.colorNeutralForeground3 },
	add: {
		display: "flex",
		alignItems: "flex-end",
		gap: tokens.spacingHorizontalS,
	},
	addField: { flex: "0 1 320px", minWidth: 0 },
	language: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: tokens.spacingVerticalM,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
	},
	languageHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	languageName: { flex: 1, minWidth: 0 },
	fields: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
		gap: tokens.spacingHorizontalM,
	},
});

interface Found {
	button: RibbonButton;
	location: RibbonLocation;
	tabId: string;
	groupId: string;
}

/**
 * A button's text in every language, as a view of the editor drawer (#187):
 * it applies as you edit, like every editor there. The base language is the
 * button's own text (#157); other languages are the titles of the labels its
 * texts are published to.
 */
export const TranslationsView: React.FC<{ buttonId: string }> = ({ buttonId }) => {
	const styles = useStyles();
	const editorBack = useUIStore((s) => s.editorBack);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const baseLcid = useRibbonStore((s) => s.baseLanguageCode);
	const upsertLocLabel = useRibbonStore((s) => s.upsertLocLabel);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);

	const found = useMemo((): Found | undefined => {
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

	// Languages added here that have no text yet: nothing to store until typed.
	const [added, setAdded] = useState<number[]>([]);
	const [adding, setAdding] = useState("");
	// The base label while it's empty: a button needs one, so it isn't applied.
	const [emptyLabel, setEmptyLabel] = useState(false);

	// The button went away while it was shown (an undo of the step that added it).
	const gone = !found;
	React.useEffect(() => {
		if (gone) editorBack();
	}, [gone, editorBack]);
	if (!found) return null;

	const { button } = found;
	const source = button.source;
	// The labels the texts are published to: the one a text references keeps its
	// id (a Ribbon Workbench or solution label, #49), else the convention id.
	// Another solution's label, shared and not loaded, isn't edited here (#137).
	const ids: Record<TextField, string | null> = {
		label: textLabelId(
			source?.labelToken,
			buttonLabelId(button.id),
			button.label,
			locLabels,
			baseLcid,
		),
		tooltipTitle: textLabelId(
			source?.tooltipTitleToken,
			buttonTooltipTitleId(button.id),
			button.tooltipTitle,
			locLabels,
			baseLcid,
		),
		tooltipBody: textLabelId(
			source?.tooltipBodyToken,
			buttonTooltipBodyId(button.id),
			button.tooltipBody,
			locLabels,
			baseLcid,
		),
	};
	const tokenOf: Record<TextField, string | undefined> = {
		label: source?.labelToken,
		tooltipTitle: source?.tooltipTitleToken,
		tooltipBody: source?.tooltipBodyToken,
	};
	const shared = FIELDS.filter(({ field }) => ids[field] === null && tokenOf[field])
		.map(({ field }) => tokenOf[field]!.slice("$LocLabels:".length))
		.filter((id, i, all) => all.indexOf(id) === i);
	// Your own buttons only: Customise a built-in or another solution's first.
	const locked = button.origin !== undefined && button.origin !== "unmanaged";

	const labelOf = (field: TextField): LocLabel | undefined =>
		locLabels.find((l) => l.id === ids[field]);
	const baseText = (field: TextField) => button[field] ?? "";
	const textIn = (field: TextField, lcid: number) =>
		lcid === baseLcid
			? baseText(field)
			: (labelOf(field)?.titles.find((t) => t.languageCode === lcid)?.description ?? "");

	const languages = [
		baseLcid,
		...new Set(
			[
				...FIELDS.flatMap(({ field }) =>
					(labelOf(field)?.titles ?? []).map((t) => t.languageCode),
				),
				...added,
			].filter((l) => l !== baseLcid),
		),
	].sort((a, b) => (a === baseLcid ? -1 : b === baseLcid ? 1 : a - b));

	/**
	 * Writes a field's label with `lcid` set to `text` (removed when empty).
	 * The base title is the button's text (`base`). A label is written when it
	 * exists or gets another language: the base text alone lives on the button
	 * (#157 review: a label for a literal or platform text blocked the publish).
	 */
	const writeLabel = (field: TextField, lcid: number | null, text: string, base: string) => {
		const id = ids[field];
		if (!id) return;
		const existing = labelOf(field);
		const others = new Map(
			(existing?.titles ?? [])
				.filter((t) => t.languageCode !== baseLcid)
				.map((t) => [t.languageCode, t.description]),
		);
		if (lcid !== null && lcid !== baseLcid) {
			if (text) others.set(lcid, text);
			else others.delete(lcid);
		}
		if (!existing && others.size === 0) return;
		upsertLocLabel({
			id,
			titles: [
				...(base ? [{ languageCode: baseLcid, description: base }] : []),
				...[...others].map(([languageCode, description]) => ({
					languageCode,
					description,
				})),
			],
		});
	};

	const change = (field: TextField, lcid: number, text: string) => {
		if (lcid !== baseLcid) return writeLabel(field, lcid, text, baseText(field));
		if (field === "label") {
			// A button needs a label: an empty one isn't applied.
			setEmptyLabel(!text);
			if (!text) return;
		}
		setButtonProp(found.location, found.tabId, found.groupId, button.id, {
			[field]: field === "label" ? text : text || undefined,
		});
		if (labelOf(field)) writeLabel(field, null, "", text);
	};

	const removeLanguage = (lcid: number) => {
		for (const { field } of FIELDS)
			if (labelOf(field)?.titles.some((t) => t.languageCode === lcid))
				writeLabel(field, lcid, "", baseText(field));
		setAdded((a) => a.filter((l) => l !== lcid));
	};

	const addLanguage = (value: string) => {
		const lcid =
			Number(/\d+/.exec(value)?.[0]) ||
			Number(Object.entries(LANGUAGES).find(([, n]) => n === value)?.[0]);
		if (!lcid || languages.includes(lcid)) return;
		setAdded((a) => [...a, lcid]);
		setAdding("");
	};

	const insertBreak = (field: TextField, lcid: number, id: string) => {
		const el = document.getElementById(id) as HTMLInputElement | null;
		const current = textIn(field, lcid);
		const start = el?.selectionStart ?? current.length;
		const end = el?.selectionEnd ?? current.length;
		change(field, lcid, current.slice(0, start) + LINE_BREAK + current.slice(end));
	};

	const addable = Object.keys(LANGUAGES)
		.map(Number)
		.filter((l) => !languages.includes(l));

	return (
		<div className={styles.body}>
			{locked ? (
				<MessageBar intent="info">
					<MessageBarBody>
						This button isn&apos;t yours, so its text is read-only. Customise it in
						Properties to give it text of its own, then translate it.
					</MessageBarBody>
				</MessageBar>
			) : (
				<Text>
					{languageName(baseLcid)} is the organization&apos;s base language: its text is
					the button&apos;s own. Other languages are published with it.
				</Text>
			)}
			{shared.length > 0 && (
				<MessageBar intent="info">
					<MessageBarBody>
						{shared.join(", ")} {shared.length === 1 ? "is a label" : "are labels"} of
						another solution, shared with the controls that use{" "}
						{shared.length === 1 ? "it" : "them"}, so{" "}
						{shared.length === 1 ? "it isn't" : "they aren't"} edited here. Change the
						text in Properties to give this button a label of its own.
					</MessageBarBody>
				</MessageBar>
			)}

			{languages.map((lcid) => (
				<section
					key={lcid}
					className={styles.language}
					aria-label={`${languageName(lcid)} (${lcid})`}
				>
					<div className={styles.languageHeader}>
						<Text weight="semibold" className={styles.languageName}>
							{languageName(lcid)}{" "}
							<Caption1 className={styles.muted}>
								{lcid}
								{lcid === baseLcid ? " · base language" : ""}
							</Caption1>
						</Text>
						{lcid !== baseLcid && !locked && (
							<Tooltip content={`Remove ${languageName(lcid)}`} relationship="label">
								<Button
									appearance="subtle"
									size="small"
									icon={<DeleteRegular />}
									onClick={() => removeLanguage(lcid)}
								/>
							</Tooltip>
						)}
					</div>
					<div className={styles.fields}>
						{FIELDS.map(({ field, name, multiline }) => {
							const id = `tr-${lcid}-${field}`;
							const disabled = locked || !ids[field];
							const label = `${name} (${languageName(lcid)})`;
							const invalid = field === "label" && lcid === baseLcid && emptyLabel;
							return (
								<Field
									key={field}
									label={name}
									validationState={invalid ? "error" : "none"}
									validationMessage={
										invalid ? "A button needs a label." : undefined
									}
								>
									{multiline ? (
										<Textarea
											id={id}
											aria-label={label}
											value={textIn(field, lcid)}
											readOnly={disabled}
											resize="vertical"
											onChange={(_, d) => change(field, lcid, d.value)}
										/>
									) : (
										<Input
											id={id}
											aria-label={label}
											value={invalid ? "" : textIn(field, lcid)}
											readOnly={disabled}
											onChange={(_, d) => change(field, lcid, d.value)}
											contentAfter={
												disabled ? undefined : (
													<Tooltip
														content="Insert a line break"
														relationship="label"
													>
														<Button
															appearance="transparent"
															size="small"
															icon={<TextAddRegular />}
															onClick={() =>
																insertBreak(field, lcid, id)
															}
														/>
													</Tooltip>
												)
											}
										/>
									)}
								</Field>
							);
						})}
					</div>
				</section>
			))}

			{!locked && (
				<div className={styles.add}>
					<Field label="Add a language" className={styles.addField}>
						<Combobox
							freeform
							placeholder="Language or LCID"
							value={adding}
							onChange={(e) => setAdding(e.target.value)}
							onOptionSelect={(_, d) => d.optionValue && addLanguage(d.optionValue)}
							onKeyDown={(e) => e.key === "Enter" && addLanguage(adding)}
						>
							{addable.map((l) => (
								<Option
									key={l}
									value={String(l)}
									text={`${languageName(l)} (${l})`}
								>
									{`${languageName(l)} (${l})`}
								</Option>
							))}
						</Combobox>
					</Field>
					<Button
						icon={<AddRegular />}
						disabled={!adding.trim()}
						onClick={() => addLanguage(adding)}
					>
						Add
					</Button>
				</div>
			)}
			<Caption1 className={styles.muted}>
				The line break button puts Dataverse&apos;s line break (two zero-width spaces) where
				a long label should wrap.
			</Caption1>
		</div>
	);
};

export default TranslationsView;
