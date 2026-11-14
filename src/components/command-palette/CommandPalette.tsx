import React, { useState, useEffect, useMemo, useRef } from "react";
import { useDisplayText } from "@/hooks/useDisplayText";
import {
	makeStyles,
	mergeClasses,
	tokens,
	Badge,
	Caption1,
	Dialog,
	DialogSurface,
	SearchBox,
	Text,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore } from "@/store/draftStore";
import { useSelectionStore } from "@/store/selectionStore";
import { findGroupControl, groupControls } from "@/utils/ribbonMenu";
import { isReadOnlyControlKind } from "@/utils/controlKinds";
import { LOCATION_INFO } from "@/constants/locationInfo";
import type { RibbonLocation } from "@/types/ribbon";

const useStyles = makeStyles({
	// A real dialog (#189): focus stays in it, Escape and the backdrop close it.
	surface: {
		width: "calc(100vw - 32px)",
		maxWidth: "640px",
		padding: 0,
		alignSelf: "flex-start",
		marginTop: "10vh",
		overflow: "hidden",
		display: "flex",
		flexDirection: "column",
		maxHeight: "calc(80vh)",
	},
	search: {
		padding: tokens.spacingVerticalM,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	searchBox: { width: "100%", maxWidth: "none" },
	results: {
		overflowY: "auto",
		padding: `${tokens.spacingVerticalXS} 0`,
		minHeight: 0,
		flex: 1,
	},
	groupLabel: {
		display: "block",
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXXS}`,
		color: tokens.colorNeutralForeground3,
		fontWeight: tokens.fontWeightSemibold,
	},
	item: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		cursor: "pointer",
		minWidth: 0,
	},
	itemActive: {
		backgroundColor: tokens.colorNeutralBackground1Selected,
		boxShadow: `inset 2px 0 0 ${tokens.colorBrandStroke1}`,
	},
	kind: { flexShrink: 0, minWidth: "72px", justifyContent: "center" },
	itemText: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
	itemLabel: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
	itemSub: {
		color: tokens.colorNeutralForeground3,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	more: {
		display: "block",
		padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
		color: tokens.colorNeutralForeground3,
	},
	empty: {
		display: "block",
		padding: tokens.spacingVerticalL,
		textAlign: "center",
		color: tokens.colorNeutralForeground3,
	},
	footer: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalL,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
		color: tokens.colorNeutralForeground3,
	},
});

type Kind = "action" | "button" | "command" | "enable" | "display" | "table";

const KIND_LABEL: Record<Kind, string> = {
	action: "Action",
	button: "Button",
	command: "Command",
	enable: "Enable rule",
	display: "Display rule",
	table: "Table",
};

const GROUPS: { kinds: Kind[]; title: string; limit: number }[] = [
	{ kinds: ["action"], title: "Actions", limit: Infinity },
	{ kinds: ["button"], title: "Buttons", limit: 20 },
	{ kinds: ["command"], title: "Commands", limit: 30 },
	{ kinds: ["enable", "display"], title: "Rules", limit: 30 },
	{ kinds: ["table"], title: "Tables", limit: 30 },
];

interface PaletteItem {
	id: string;
	label: string;
	subtitle?: string;
	/** Also searched: what the label is as loaded, when the canvas shows a caption for it (#6). */
	keywords?: string;
	kind: Kind;
	run: () => void;
}

const optionId = (id: string) => `palette-${id.replace(/[^\w-]/g, "_")}`;

/**
 * Search everything and run actions (#189). `/` limits it to actions, `@` to
 * tables. Choosing a button selects it on the canvas; a command or rule opens
 * its editor. Only actions that can run now are offered.
 */
export const CommandPalette: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.commandPaletteOpen);
	const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
	const openBulkPublish = useUIStore((s) => s.openBulkPublish);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
	const openImportXml = useUIStore((s) => s.openImportXml);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	const openNewButton = useUIStore((s) => s.openNewButton);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	const undo = useRibbonStore((s) => s.undo);
	const redo = useRibbonStore((s) => s.redo);
	const canUndo = useRibbonStore((s) => s.past.length > 0);
	const canRedo = useRibbonStore((s) => s.future.length > 0);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	const entities = useSessionStore((s) => s.entities);
	const requestEntitySwitch = useDraftStore((s) => s.requestEntitySwitch);
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);

	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const listRef = useRef<HTMLDivElement>(null);

	const close = () => {
		setCommandPaletteOpen(false);
		setQuery("");
		setActive(0);
	};

	const mode: "all" | "actions" | "tables" = query.startsWith("/")
		? "actions"
		: query.startsWith("@")
			? "tables"
			: "all";
	const text = (mode === "all" ? query : query.slice(1)).trim().toLowerCase();

	const items = useMemo((): PaletteItem[] => {
		if (!open) return [];
		const out: PaletteItem[] = [];
		const activeTab = ribbons[location].tabs.find((t) => t.id === tabId);
		const targetGroupId = selectedGroupId ?? activeTab?.groups[0]?.id ?? null;
		const selected = findGroupControl(
			activeTab?.groups.find((g) => g.id === selectedGroupId),
			selectedButtonId,
		);
		// Only what can run now (#189): no "Select a button first" entries.
		const action = (id: string, label: string, subtitle: string, run: () => void) =>
			out.push({ id: `act-${id}`, label, subtitle, kind: "action", run });
		action("publish", "Publish…", "Review and publish your changes", openBulkPublish);
		action("view-xml", "View XML", "The XML of your changes", () => openXmlDrawer(location));
		action("import-xml", "Import XML…", "Import RibbonDiffXml from the clipboard", () => {
			// Opens with the clipboard's XML; empty, and saying why, when it
			// can't be read (PPTB has no clipboard read, #122).
			const refused =
				"Couldn't read the clipboard here: paste the XML into the editor (Ctrl+V).";
			const read = navigator.clipboard?.readText?.();
			if (!read) return openImportXml("", refused);
			read.then(
				(t) =>
					t.trim().startsWith("<")
						? openImportXml(t)
						: openImportXml(
								"",
								"The clipboard doesn't hold XML: paste the XML into the editor.",
							),
				() => openImportXml("", refused),
			);
		});
		if (activeTab) action("new-group", "New group…", "In the current tab", openNewGroup);
		if (targetGroupId)
			action("new-button", "New button…", "In the selected or first group", () =>
				openNewButton(targetGroupId),
			);
		// ToggleButton, Label, DropDown, …: their labels aren't edited (#42); nor
		// another solution's button until it's customised.
		if (
			selected &&
			!isReadOnlyControlKind(selected.kind) &&
			(selected.origin === undefined || selected.origin === "unmanaged")
		)
			action("translations", "Translations…", "The selected button's text", () =>
				openLocalizationEditor(selected.id),
			);
		if (canUndo) action("undo", "Undo", "Ctrl+Z", undo);
		if (canRedo) action("redo", "Redo", "Ctrl+Y", redo);

		for (const [loc, r] of Object.entries(ribbons) as [
			RibbonLocation,
			(typeof ribbons)[RibbonLocation],
		][])
			for (const t of r.tabs)
				for (const g of t.groups)
					for (const b of groupControls(g))
						out.push({
							id: `btn-${loc}-${b.id}`,
							// As the canvas shows them (#6); the loaded label and id are searched too.
							label:
								captionOf(b.label, locLabels, undefined, b.source?.labelToken) ||
								b.id,
							subtitle: [
								LOCATION_INFO[loc].label,
								captionOf(t.label, locLabels, undefined, t.source?.titleToken) ||
									t.id,
								captionOf(g.label, locLabels, undefined, g.source?.titleToken) ||
									g.id,
							].join(" › "),
							keywords: `${b.label} ${b.id}`,
							kind: "button",
							run: () => selectButtonInContext(loc, t.id, g.id, b.id),
						});

		for (const c of commands)
			out.push({
				id: `cmd-${c.id}`,
				label: c.id,
				subtitle: `${c.actions.length} action${c.actions.length === 1 ? "" : "s"}`,
				kind: "command",
				run: () => openCommandEditor(c.id),
			});
		for (const [rules, kind] of [
			[enableRules, "enable"],
			[displayRules, "display"],
		] as const)
			for (const r of rules)
				out.push({
					id: `${kind}-${r.id}`,
					label: r.id,
					subtitle: `${r.steps.length} step${r.steps.length === 1 ? "" : "s"}`,
					kind,
					run: () => openRuleEditor(r.id, kind),
				});
		for (const e of entities)
			out.push({
				id: `ent-${e.logicalName}`,
				label: e.displayName,
				subtitle: e.logicalName,
				kind: "table",
				run: () => requestEntitySwitch(e),
			});
		return out;
	}, [
		open,
		ribbons,
		location,
		tabId,
		selectedGroupId,
		selectedButtonId,
		canUndo,
		canRedo,
		commands,
		enableRules,
		displayRules,
		entities,
		locLabels,
		captionOf,
		openBulkPublish,
		openXmlDrawer,
		openImportXml,
		openNewGroup,
		openNewButton,
		openLocalizationEditor,
		openCommandEditor,
		openRuleEditor,
		undo,
		redo,
		selectButtonInContext,
		requestEntitySwitch,
	]);

	// Groups in order, each cut to its limit; what's cut is counted, not hidden.
	const groups = useMemo(() => {
		const matches = (item: PaletteItem) =>
			!text ||
			[item.label, item.subtitle ?? "", item.keywords ?? ""].some((s) =>
				s.toLowerCase().includes(text),
			);
		return GROUPS.filter(
			(g) =>
				mode === "all" ||
				(mode === "actions" && g.kinds.includes("action")) ||
				(mode === "tables" && g.kinds.includes("table")),
		)
			.map((g) => {
				const all = items.filter((i) => g.kinds.includes(i.kind) && matches(i));
				return {
					...g,
					shown: all.slice(0, g.limit),
					more: Math.max(0, all.length - g.limit),
				};
			})
			.filter((g) => g.shown.length > 0);
	}, [items, text, mode]);
	const flat = groups.flatMap((g) => g.shown);
	const current = flat[Math.min(active, flat.length - 1)];

	// The active option stays in view as the arrow keys move it (#189).
	useEffect(() => {
		if (!current) return;
		listRef.current
			?.querySelector(`#${optionId(current.id)}`)
			?.scrollIntoView?.({ block: "nearest" });
	}, [current]);

	const choose = (item: PaletteItem | undefined) => {
		if (!item) return;
		close();
		item.run();
	};

	const onKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive((i) => Math.min(i + 1, flat.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive((i) => Math.max(i - 1, 0));
		} else if (e.key === "Home") {
			e.preventDefault();
			setActive(0);
		} else if (e.key === "End") {
			e.preventDefault();
			setActive(flat.length - 1);
		} else if (e.key === "Enter") {
			e.preventDefault();
			choose(current);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
			<DialogSurface className={styles.surface} aria-label="Command palette">
				<div className={styles.search}>
					<SearchBox
						className={styles.searchBox}
						size="large"
						// eslint-disable-next-line jsx-a11y/no-autofocus -- the palette is a search dialog: typing starts at once
						autoFocus
						placeholder="Search buttons, commands, rules and tables"
						value={query}
						onChange={(_, d) => {
							setQuery(d.value);
							setActive(0);
						}}
						input={{
							role: "combobox",
							"aria-label": "Search",
							"aria-expanded": true,
							"aria-controls": "palette-results",
							"aria-activedescendant": current ? optionId(current.id) : undefined,
							"aria-autocomplete": "list",
							onKeyDown,
						}}
					/>
				</div>
				<div
					ref={listRef}
					id="palette-results"
					role="listbox"
					aria-label="Results"
					className={styles.results}
				>
					{groups.map((g) => (
						<div key={g.title} role="group" aria-label={g.title}>
							<Caption1 className={styles.groupLabel} role="presentation">
								{g.title}
							</Caption1>
							{g.shown.map((item) => {
								const isActive = item === current;
								return (
									// The search box's aria-activedescendant drives the options from the
									// keyboard, so they take mouse clicks only (#189)
									// eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
									<div
										key={item.id}
										id={optionId(item.id)}
										role="option"
										aria-selected={isActive}
										className={mergeClasses(
											styles.item,
											isActive && styles.itemActive,
										)}
										onClick={() => choose(item)}
										onMouseMove={() => setActive(flat.indexOf(item))}
									>
										<Badge
											className={styles.kind}
											appearance="tint"
											size="medium"
											color={item.kind === "action" ? "brand" : "informative"}
										>
											{KIND_LABEL[item.kind]}
										</Badge>
										<span className={styles.itemText}>
											<Text className={styles.itemLabel}>{item.label}</Text>
											{item.subtitle && (
												<Caption1 className={styles.itemSub}>
													{item.subtitle}
												</Caption1>
											)}
										</span>
									</div>
								);
							})}
							{g.more > 0 && (
								<Caption1 className={styles.more} role="presentation">
									{g.more} more: keep typing to narrow it down.
								</Caption1>
							)}
						</div>
					))}
					{groups.length === 0 && (
						<Text className={styles.empty} role="presentation">
							Nothing matches “{query}”.
						</Text>
					)}
				</div>
				<div className={styles.footer} aria-hidden="true">
					<Caption1>↑ ↓ move</Caption1>
					<Caption1>Enter choose</Caption1>
					<Caption1>Esc close</Caption1>
					<Caption1>/ actions only</Caption1>
					<Caption1>@ tables only</Caption1>
				</div>
			</DialogSurface>
		</Dialog>
	);
};

export default CommandPalette;
