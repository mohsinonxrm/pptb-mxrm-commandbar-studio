import React, { useState, useEffect, useCallback, useRef } from "react";
import { makeStyles, tokens, Text, Badge } from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";

const useStyles = makeStyles({
	backdrop: {
		position: "fixed",
		inset: 0,
		backgroundColor: "rgba(0,0,0,0.5)",
		zIndex: 1000,
		display: "flex",
		alignItems: "flex-start",
		justifyContent: "center",
		paddingTop: "10vh",
	},
	palette: {
		width: "640px",
		maxWidth: "90vw",
		backgroundColor: tokens.colorNeutralBackground1,
		borderRadius: tokens.borderRadiusLarge,
		boxShadow: tokens.shadow64,
		overflow: "hidden",
	},
	searchRow: {
		display: "flex",
		alignItems: "center",
		padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		gap: tokens.spacingHorizontalS,
	},
	searchInput: {
		flex: 1,
		border: "none",
		outline: "none",
		fontSize: tokens.fontSizeBase400,
		backgroundColor: "transparent",
	},
	results: {
		maxHeight: "400px",
		overflowY: "auto",
	},
	group: {
		paddingTop: tokens.spacingVerticalXS,
	},
	groupLabel: {
		padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase100,
		fontWeight: tokens.fontWeightSemibold,
		textTransform: "uppercase",
		letterSpacing: "0.08em",
	},
	item: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		cursor: "pointer",
		"&:hover": {
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
	itemSelected: {
		backgroundColor: tokens.colorNeutralBackground1Hover,
	},
	itemLabel: {
		flex: 1,
	},
	itemSub: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase200,
	},
	footer: {
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase100,
		display: "flex",
		gap: tokens.spacingHorizontalL,
	},
});

interface PaletteItem {
	id: string;
	label: string;
	subtitle?: string;
	kind: "button" | "command" | "rule" | "entity" | "action";
	action: () => void;
}

export const CommandPalette: React.FC = () => {
	const styles = useStyles();
	const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
	const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
	const openBulkPublish = useUIStore((s) => s.openBulkPublish);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
	const openImportXml = useUIStore((s) => s.openImportXml);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const openNewGroup = useUIStore((s) => s.openNewGroup);
	const openNewButton = useUIStore((s) => s.openNewButton);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	const themeMode = useUIStore((s) => s.themeMode);
	const setThemeMode = useUIStore((s) => s.setThemeMode);
	const undo = useRibbonStore((s) => s.undo);
	const redo = useRibbonStore((s) => s.redo);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const entities = useSessionStore((s) => s.entities);
	const setActiveEntity = useSessionStore((s) => s.setActiveEntity);
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);

	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const close = useCallback(() => {
		setCommandPaletteOpen(false);
		setQuery("");
		setSelectedIndex(0);
	}, [setCommandPaletteOpen]);

	useEffect(() => {
		if (commandPaletteOpen) {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [commandPaletteOpen]);

	const buildItems = (): PaletteItem[] => {
		const items: PaletteItem[] = [];
		const activeTab = ribbons[location].tabs.find((t) => t.id === tabId);
		const fallbackGroupId = activeTab?.groups[0]?.id ?? null;
		const targetGroupId = selectedGroupId ?? fallbackGroupId;

		// Actions
		const actions: PaletteItem[] = [
			{
				id: "publish",
				label: "Publish all",
				subtitle: "Save and publish changes to Dataverse",
				kind: "action",
				action: () => {
					openBulkPublish();
					close();
				},
			},
			{
				id: "view-xml",
				label: "View RibbonDiffXml",
				subtitle: "Open XML drawer",
				kind: "action",
				action: () => {
					openXmlDrawer();
					close();
				},
			},
			{
				id: "import-xml",
				label: "Import XML",
				subtitle: "Import RibbonDiffXml from clipboard",
				kind: "action",
				action: () => {
					openImportXml();
					close();
				},
			},
			{
				id: "new-group",
				label: "New group",
				subtitle: "Create a new ribbon group in current tab",
				kind: "action",
				action: () => {
					openNewGroup();
					close();
				},
			},
			{
				id: "new-button",
				label: "New button",
				subtitle: targetGroupId
					? "Create a new button in selected/current group"
					: "Select a tab/group with at least one group first",
				kind: "action",
				action: () => {
					if (!targetGroupId) return;
					openNewButton(targetGroupId);
					close();
				},
			},
			{
				id: "edit-labels",
				label: "Edit localized labels",
				subtitle: selectedButtonId
					? "Open localization editor for selected button"
					: "Select a button first",
				kind: "action",
				action: () => {
					if (!selectedButtonId) return;
					openLocalizationEditor(selectedButtonId);
					close();
				},
			},
			{
				id: "toggle-theme",
				label: `Toggle theme (${themeMode === "dark" ? "Dark" : "Light"})`,
				subtitle: "Switch between light and dark",
				kind: "action",
				action: () => {
					setThemeMode(themeMode === "dark" ? "light" : "dark");
					close();
				},
			},
			{
				id: "undo",
				label: "Undo",
				subtitle: "Ctrl+Z",
				kind: "action",
				action: () => {
					undo();
					close();
				},
			},
			{
				id: "redo",
				label: "Redo",
				subtitle: "Ctrl+Shift+Z",
				kind: "action",
				action: () => {
					redo();
					close();
				},
			},
		];
		items.push(...actions);

		// Buttons (from all locations)
		if (!query.startsWith("@") && !query.startsWith("/")) {
			const allButtons = Object.entries(ribbons).flatMap(([loc, r]) =>
				r.tabs.flatMap((t) =>
					t.groups.flatMap((g) =>
						g.buttons.map((b) => ({
							id: `btn-${b.id}`,
							label: b.label || b.id,
							subtitle: `${loc} → ${t.label} → ${g.label}`,
							kind: "button" as const,
							action: () => {
								close();
							},
						})),
					),
				),
			);
			items.push(...allButtons.slice(0, 20));
		}

		// Commands
		commands.forEach((c) => {
			items.push({
				id: `cmd-${c.id}`,
				label: c.id,
				subtitle: `${c.actions.length} action(s)`,
				kind: "command",
				action: () => {
					openCommandEditor(c.id);
					close();
				},
			});
		});

		// Rules
		displayRules.forEach((r) => {
			items.push({
				id: `dr-${r.id}`,
				label: r.id,
				subtitle: `Display rule — ${r.steps.length} step(s)`,
				kind: "rule",
				action: () => {
					openRuleEditor(r.id, "display");
					close();
				},
			});
		});
		enableRules.forEach((r) => {
			items.push({
				id: `er-${r.id}`,
				label: r.id,
				subtitle: `Enable rule — ${r.steps.length} step(s)`,
				kind: "rule",
				action: () => {
					openRuleEditor(r.id, "enable");
					close();
				},
			});
		});

		// Entities (@ prefix)
		if (query.startsWith("@") || !query) {
			entities.slice(0, 30).forEach((e) => {
				items.push({
					id: `ent-${e.logicalName}`,
					label: e.displayName,
					subtitle: e.logicalName,
					kind: "entity",
					action: () => {
						setActiveEntity(e);
						close();
					},
				});
			});
		}

		return items;
	};

	const rawQuery = query.startsWith("@")
		? query.slice(1)
		: query.startsWith("/")
			? query.slice(1)
			: query;
	const allItems = buildItems();
	const filtered = rawQuery
		? allItems.filter(
				(item) =>
					item.label.toLowerCase().includes(rawQuery.toLowerCase()) ||
					(item.subtitle ?? "").toLowerCase().includes(rawQuery.toLowerCase()),
			)
		: allItems;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === "Enter") {
			filtered[selectedIndex]?.action();
		} else if (e.key === "Escape") {
			close();
		}
	};

	if (!commandPaletteOpen) return null;

	return (
		<div className={styles.backdrop} onClick={close} role="presentation">
			<div
				className={styles.palette}
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-label="Command palette"
			>
				<div className={styles.searchRow}>
					<SearchRegular style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }} />
					<input
						ref={inputRef}
						className={styles.searchInput}
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setSelectedIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder="Search commands, buttons, entities…  Use @ for entities, / for actions"
						aria-label="Command palette search"
					/>
				</div>
				<div className={styles.results} role="listbox">
					{filtered.map((item, i) => (
						<div
							key={item.id}
							className={`${styles.item} ${i === selectedIndex ? styles.itemSelected : ""}`}
							onClick={item.action}
							role="option"
							aria-selected={i === selectedIndex}
							onMouseEnter={() => setSelectedIndex(i)}
						>
							<Badge appearance="outline" size="small">
								{item.kind}
							</Badge>
							<div className={styles.itemLabel}>
								<Text>{item.label}</Text>
								{item.subtitle && (
									<Text className={styles.itemSub} block>
										{item.subtitle}
									</Text>
								)}
							</div>
						</div>
					))}
					{filtered.length === 0 && (
						<div className={styles.item}>
							<Text style={{ color: tokens.colorNeutralForeground3 }}>No results</Text>
						</div>
					)}
				</div>
				<div className={styles.footer}>
					<span>↑↓ navigate</span>
					<span>↵ select</span>
					<span>Esc close</span>
					<span>@ entities</span>
					<span>/ actions</span>
				</div>
			</div>
		</div>
	);
};

export default CommandPalette;
