import React, { useState } from "react";
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
	Tooltip,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { scopeLayer, useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { LANGUAGES, languageName } from "@/constants/languages";
import { extractLocLabelId } from "@/utils/locLabelRef";
import { resolveDisplayLabel } from "@/utils/displayLabel";
import { canRenameContainer } from "@/utils/ribbonProvenance";
import { titleTranslationTarget } from "@/utils/titleTranslation";
import type { RibbonLocation } from "@/types/ribbon";

const useStyles = makeStyles({
	body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
	muted: { color: tokens.colorNeutralForeground3 },
	row: { display: "flex", alignItems: "flex-end", gap: tokens.spacingHorizontalS },
	grow: { flex: 1, minWidth: 0 },
	addField: { flex: "0 1 320px", minWidth: 0 },
});

/**
 * A tab's or group's title in every language (#136), as a view of the editor drawer. The base
 * language is the title itself (a rename); the others are the titles of the label it's
 * published to: the label the loaded title refers to, or `{id}.Title` for a new one.
 */
export const TitleTranslationsView: React.FC<{
	location: RibbonLocation;
	container: "tab" | "group";
	tabId: string;
	id: string;
}> = ({ location, container, tabId, id }) => {
	const styles = useStyles();
	const editorBack = useUIStore((s) => s.editorBack);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const layers = useRibbonStore((s) => s.layers);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const baseLcid = useRibbonStore((s) => s.baseLanguageCode);
	const upsertLocLabel = useRibbonStore((s) => s.upsertLocLabel);
	const renameTab = useRibbonStore((s) => s.renameTab);
	const renameGroup = useRibbonStore((s) => s.renameGroup);
	const [added, setAdded] = useState<number[]>([]);
	const [adding, setAdding] = useState("");
	const [emptyTitle, setEmptyTitle] = useState(false);

	const tab = ribbons[location].tabs.find((t) => t.id === tabId);
	const found = container === "tab" ? tab : tab?.groups.find((g) => g.id === id);
	// Gone while shown (an undo of the step that added it): back to the view below.
	React.useEffect(() => {
		if (!found) editorBack();
	}, [found, editorBack]);
	if (!found) return null;

	const loadedTab = baseline[location].tabs.find((t) => t.id === tabId);
	const loaded = container === "tab" ? loadedTab : loadedTab?.groups.find((g) => g.id === id);
	const yours = canRenameContainer(
		container,
		id,
		baseline[location],
		scopeLayer({ layers }, location),
	);
	// The label the publish writes the title with, or why it can't be translated here.
	const target = titleTranslationTarget({
		container: found,
		loaded,
		yours,
		ribbons,
		locLabels,
		baseLcid,
	});
	const labelId = "labelId" in target ? target.labelId : null;
	// The title itself can be changed wherever a rename can be published.
	const canRename = yours && (loaded ? !!extractLocLabelId(loaded.label ?? "") : true);
	const label = locLabels.find((l) => l.id === labelId);
	// The label's own base title: a rename sets it at publish time (another control may use it).
	const labelBase = (text: string) =>
		label?.titles.find((t) => t.languageCode === baseLcid)?.description ?? text;
	const baseText = resolveDisplayLabel(found.label, locLabels, baseLcid);
	const textIn = (lcid: number) =>
		lcid === baseLcid
			? baseText
			: (label?.titles.find((t) => t.languageCode === lcid)?.description ?? "");

	const languages = [
		baseLcid,
		...new Set(
			[...(label?.titles ?? []).map((t) => t.languageCode), ...added].filter(
				(l) => l !== baseLcid,
			),
		),
	].sort((a, b) => (a === baseLcid ? -1 : b === baseLcid ? 1 : a - b));

	/** The label with `lcid` set to `text` (removed when empty), the base title being `base`. */
	const writeLabel = (lcid: number | null, text: string, base: string) => {
		if (!labelId) return;
		const others = new Map(
			(label?.titles ?? [])
				.filter((t) => t.languageCode !== baseLcid)
				.map((t) => [t.languageCode, t.description]),
		);
		if (lcid !== null && lcid !== baseLcid) {
			if (text) others.set(lcid, text);
			else others.delete(lcid);
		}
		// A new title's label is written by the publish; until it has another language, the
		// title alone is enough.
		if (!label && others.size === 0) return;
		upsertLocLabel({
			id: labelId,
			titles: [
				{ languageCode: baseLcid, description: labelBase(base) },
				...[...others].map(([languageCode, description]) => ({
					languageCode,
					description,
				})),
			],
		});
	};

	const change = (lcid: number, text: string) => {
		if (lcid !== baseLcid) return writeLabel(lcid, text, baseText);
		// A tab or group needs a title: an empty one isn't applied.
		setEmptyTitle(!text.trim());
		if (!text.trim()) return;
		if (container === "tab") renameTab(location, tabId, text);
		else renameGroup(location, tabId, id, text);
	};

	const removeLanguage = (lcid: number) => {
		if (label?.titles.some((t) => t.languageCode === lcid)) writeLabel(lcid, "", baseText);
		setAdded((a) => a.filter((l) => l !== lcid));
	};

	const addLanguage = (value: string) => {
		const lcid =
			Number(/\d+/.exec(value)?.[0]) ||
			Number(Object.entries(LANGUAGES).find(([, n]) => n === value)?.[0]);
		if (!lcid || languages.includes(lcid)) return;
		// Enter both picks the highlighted option and adds what's typed: add once
		setAdded((a) => (a.includes(lcid) ? a : [...a, lcid]));
		setAdding("");
	};

	// Only the languages matching what's typed, so Enter adds the one meant
	const typed = adding.trim().toLowerCase();
	const addable = Object.keys(LANGUAGES)
		.map(Number)
		.filter((l) => !languages.includes(l))
		.filter((l) => !typed || `${languageName(l)} (${l})`.toLowerCase().includes(typed));
	const kind = container === "tab" ? "tab" : "group";

	return (
		<div className={styles.body}>
			{labelId ? (
				<Text>
					{languageName(baseLcid)} is the organization&apos;s base language: its text is
					the {kind}&apos;s title. Other languages are published with it.
				</Text>
			) : (
				<MessageBar intent="info">
					<MessageBarBody>
						{"reason" in target && target.reason === "shared"
							? `This ${kind}'s title is a label other tabs, groups or buttons use too, so its translations aren't edited here: they'd change for all of them.`
							: "reason" in target && target.reason === "kept"
								? `This ${kind} keeps the title of the one it was copied or imported from (${target.token}). Change the title first: it then gets a label of its own to translate.`
								: `Only your own tabs and groups can be translated: this ${kind}'s title comes from Microsoft or another solution.`}
					</MessageBarBody>
				</MessageBar>
			)}
			{languages.map((lcid) => (
				<div key={lcid} className={styles.row}>
					<Field
						className={styles.grow}
						label={
							<>
								{languageName(lcid)}{" "}
								<Caption1 className={styles.muted}>
									{lcid}
									{lcid === baseLcid ? " · base language" : ""}
								</Caption1>
							</>
						}
						validationState={lcid === baseLcid && emptyTitle ? "error" : "none"}
						validationMessage={
							lcid === baseLcid && emptyTitle ? `A ${kind} needs a title.` : undefined
						}
					>
						<Input
							aria-label={`Title (${languageName(lcid)})`}
							value={lcid === baseLcid && emptyTitle ? "" : textIn(lcid)}
							readOnly={lcid === baseLcid ? !canRename : !labelId}
							onChange={(_, d) => change(lcid, d.value)}
						/>
					</Field>
					{lcid !== baseLcid && !!labelId && (
						<Tooltip content={`Remove ${languageName(lcid)}`} relationship="label">
							<Button
								appearance="subtle"
								icon={<DeleteRegular />}
								onClick={() => removeLanguage(lcid)}
							/>
						</Tooltip>
					)}
				</div>
			))}
			{!!labelId && (
				<div className={styles.row}>
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
		</div>
	);
};

export default TitleTranslationsView;
