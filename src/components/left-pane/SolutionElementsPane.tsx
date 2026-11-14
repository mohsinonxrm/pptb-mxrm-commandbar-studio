import React, { useMemo, useState } from "react";
import {
	Badge,
	Button,
	CounterBadge,
	Menu,
	MenuDivider,
	MenuGroupHeader,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	SearchBox,
	Text,
	Tooltip,
	Tree,
	TreeItem,
	TreeItemLayout,
	makeStyles,
	tokens,
	type TreeOpenChangeData,
} from "@fluentui/react-components";
import {
	AddRegular,
	AppsAddInRegular,
	CodeRegular,
	DocumentTableRegular,
	FilterRegular,
	MoreHorizontalRegular,
} from "@fluentui/react-icons";
import { bySequence, loadedLabelIdsOf, useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useDisplayText } from "@/hooks/useDisplayText";
import { LOCATION_INFO } from "@/constants/locationInfo";
import { generateCommandId, generateRuleId } from "@/utils/idGenerator";
import { groupControls } from "@/utils/ribbonMenu";
import { ribbonUsage } from "@/utils/usage";
import { reusedButton } from "@/utils/reuseButton";
import { distinguishingSegment } from "@/utils/idSegment";
import type { RibbonButton, RibbonLocation } from "@/types/ribbon";

/**
 * The left pane's Solution tab (#194): your buttons, the commands, the rules
 * and the templates, as one tree with a branch each and a count, searched
 * together. A row shows the distinguishing part of its id (the full id is its
 * description) and how much it's used. A button is reused in another group
 * with Add to group… (its menu) or by dragging it onto the Modern command bar.
 */

const DRAG_SE_MIME = "application/x-rw-se";

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS}`,
		flexShrink: 0,
	},
	search: { flex: 1, minWidth: 0 },
	body: { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" },
	name: {
		display: "block",
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	muted: { color: tokens.colorNeutralForeground3, whiteSpace: "nowrap" },
	meta: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
	empty: {
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		color: tokens.colorNeutralForeground3,
	},
});

type Branch = "buttons" | "commands" | "rules" | "templates";

interface ButtonRow {
	button: RibbonButton;
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	isNew: boolean;
}

/** A button's menu: Go to it, or add a copy of it to a group of the tab that's open. */
interface ButtonMenuState {
	row: ButtonRow;
	anchor: HTMLElement;
}

/** Rows a branch shows at first, and adds with "Show more". */
const PAGE = 100;

const isMenuKey = (e: React.KeyboardEvent) =>
	e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");

export function SolutionElementsPane() {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const templates = useRibbonStore((s) => s.templates);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const createButton = useRibbonStore((s) => s.createButton);
	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const announce = useUIStore((s) => s.announce);
	const noteStructureChoice = useUIStore((s) => s.noteStructureChoice);

	const [query, setQuery] = useState("");
	const [openItems, setOpenItems] = useState<Set<string>>(() => new Set(["buttons"]));
	const [buttonMenu, setButtonMenu] = useState<ButtonMenuState | null>(null);
	// How many rows each branch shows; "Show more" adds a page.
	const [shownLimit, setShownLimit] = useState<Partial<Record<Branch, number>>>({});

	// Your buttons on every ribbon, menu items too (#27).
	const buttons = useMemo(() => {
		const rows: ButtonRow[] = [];
		for (const loc of Object.keys(ribbons) as RibbonLocation[]) {
			const loaded = new Set(
				baseline[loc].tabs
					.flatMap((t) => t.groups.flatMap((g) => groupControls(g)))
					.map((b) => b.id),
			);
			for (const tab of ribbons[loc].tabs)
				for (const group of tab.groups)
					for (const button of groupControls(group))
						if (button.custom)
							rows.push({
								button,
								location: loc,
								tabId: tab.id,
								groupId: group.id,
								isNew: !loaded.has(button.id),
							});
		}
		return rows;
	}, [ribbons, baseline]);

	// How many controls use each command, and how many commands each rule.
	// How much each command and rule is used, as the bottom panel counts it.
	const usage = useMemo(() => ribbonUsage(ribbons, commands), [ribbons, commands]);

	const buttonText = (b: RibbonButton) =>
		captionOf(b.label, locLabels, undefined, b.source?.labelToken) || b.id;

	const q = query.trim().toLowerCase();
	const hit = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q));
	const shownButtons = buttons.filter((r) => hit(buttonText(r.button), r.button.id));
	const shownCommands = commands.filter((c) => hit(c.id));
	const rules = [
		...enableRules.map((r) => ({ id: r.id, kind: "enable" as const })),
		...displayRules.map((r) => ({ id: r.id, kind: "display" as const })),
	];
	const shownRules = rules.filter((r) => hit(r.id));
	const shownTemplates = templates.filter((t) => hit(t.id));
	// Searching opens every branch with a match; while searching, branches are
	// toggled in a set of the search's own, so the open state from before comes back.
	const matchOpen = q
		? new Set(
				(
					[
						["buttons", shownButtons],
						["commands", shownCommands],
						["rules", shownRules],
						["templates", shownTemplates],
					] as const
				)
					.filter(([, list]) => list.length > 0)
					.map(([b]) => b as string),
			)
		: null;
	const [searchOpen, setSearchOpen] = useState<{ q: string; open: Set<string> } | null>(null);
	const effectiveOpen = matchOpen
		? searchOpen?.q === q
			? searchOpen.open
			: matchOpen
		: openItems;

	const createAndOpenCommand = () => {
		const newId = generateCommandId("New", "Command", new Set(commands.map((c) => c.id)));
		upsertCommand({ id: newId, enableRules: [], displayRules: [], actions: [] });
		openCommandEditor(newId);
	};
	// An enable rule or a display rule, as chosen (#185).
	const createAndOpenRule = (kind: "enable" | "display") => {
		const newId = generateRuleId(
			"New",
			kind === "enable" ? "Enable" : "Display",
			new Set([...enableRules.map((r) => r.id), ...displayRules.map((r) => r.id)]),
		);
		if (kind === "enable") upsertEnableRule({ id: newId, steps: [] });
		else upsertDisplayRule({ id: newId, steps: [] });
		openRuleEditor(newId, kind);
	};

	/** Selects a button where it is; in the narrow drawer that closes it and opens Properties (#194). */
	const goTo = (row: ButtonRow) => {
		selectButtonInContext(row.location, row.tabId, row.groupId, row.button.id);
		noteStructureChoice();
	};

	// The groups a button can be added to: the open tab's, in the order shown.
	const tab = ribbons[location].tabs.find((t) => t.id === tabId);
	const targetGroups = tab ? bySequence(tab.groups) : [];
	const crossScope =
		!!buttonMenu &&
		(buttonMenu.row.location === "Application") !== (location === "Application");
	const addToGroup = (row: ButtonRow, groupId: string, groupLabel: string) => {
		if (!tab) return;
		createButton({
			location,
			tabId: tab.id,
			groupId,
			button: reusedButton(row.button, loadedLabelIdsOf(useRibbonStore.getState())),
		});
		announce(`A copy of ${buttonText(row.button)} was added to ${groupLabel}.`);
	};

	const leaf = (
		key: string,
		content: React.ReactNode,
		aside: React.ReactElement | null,
		description: string,
		onChoose: () => void,
		extra: Partial<React.ComponentProps<typeof TreeItem>> = {},
		actions?: React.ReactElement,
	) => (
		<TreeItem
			key={key}
			itemType="leaf"
			value={key}
			aria-description={description}
			onClick={onChoose}
			{...extra}
		>
			{/* No Tooltip per row: hundreds of them made a branch slow to open. */}
			<TreeItemLayout aside={aside} actions={actions}>
				<span className={styles.name} title={description}>
					{content}
				</span>
			</TreeItemLayout>
		</TreeItem>
	);

	/**
	 * A branch renders its rows only while it's open, PAGE at a time: a table has
	 * hundreds of commands and rules, and rendering them all made every open slow.
	 */
	const branch = <T,>(
		value: Branch,
		label: string,
		items: readonly T[],
		row: (item: T) => React.ReactElement,
		emptyText: string,
	) => {
		const open = effectiveOpen.has(value);
		const limit = shownLimit[value] ?? PAGE;
		return (
			<TreeItem key={value} itemType="branch" value={value}>
				<TreeItemLayout
					aside={
						<CounterBadge
							size="medium"
							appearance="ghost"
							color="informative"
							count={items.length}
							showZero
						/>
					}
				>
					{label}
				</TreeItemLayout>
				<Tree>
					{open &&
						(items.length === 0
							? none(emptyText)
							: [
									...items.slice(0, limit).map((item) =>
										React.cloneElement(row(item), {
											"data-branch-row": value,
										}),
									),
									...(items.length > limit
										? [
												<TreeItem
													key={`more:${value}`}
													itemType="leaf"
													value={`more:${value}`}
													onClick={() => {
														// The row clicked goes away: focus the first new one.
														setTimeout(() => {
															const rows =
																document.querySelectorAll<HTMLElement>(
																	`[data-branch-row="${value}"]`,
																);
															rows[limit]?.focus();
														});
														setShownLimit((m) => ({
															...m,
															[value]: limit + PAGE,
														}));
													}}
												>
													<TreeItemLayout>
														<span className={styles.muted}>
															Show{" "}
															{Math.min(PAGE, items.length - limit)}{" "}
															more of {items.length - limit}
														</span>
													</TreeItemLayout>
												</TreeItem>,
											]
										: []),
								])}
				</Tree>
			</TreeItem>
		);
	};

	const used = (n: number | undefined) => (n ? `used ${n}×` : "not used");
	const none = (text: string) => (
		<TreeItem itemType="leaf" value={`none:${text}`} aria-disabled>
			<TreeItemLayout>
				<span className={styles.muted}>{text}</span>
			</TreeItemLayout>
		</TreeItem>
	);

	const buttonRow = (row: ButtonRow) => {
		const key = `button:${row.location}:${row.button.id}`;
		const openMenu = (anchor: HTMLElement) => setButtonMenu({ row, anchor });
		return leaf(
			key,
			buttonText(row.button),
			<span className={styles.meta}>
				<Badge size="medium" appearance="outline">
					{LOCATION_INFO[row.location].label}
				</Badge>
				{row.isNew && (
					<Badge size="medium" color="brand" appearance="tint">
						New
					</Badge>
				)}
			</span>,
			`${row.button.id} · ${LOCATION_INFO[row.location].label}`,
			() => goTo(row),
			{
				draggable: true,
				onDragStart: (e: React.DragEvent) => {
					// The whole button: a copy keeps its icon, images and command (#60).
					e.dataTransfer.setData(DRAG_SE_MIME, JSON.stringify({ button: row.button }));
					e.dataTransfer.effectAllowed = "copy";
				},
				onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
					e.preventDefault();
					openMenu(e.currentTarget);
				},
				onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
					if (e.target === e.currentTarget && isMenuKey(e)) {
						e.preventDefault();
						openMenu(e.currentTarget);
					}
				},
			},
			<Button
				appearance="subtle"
				size="small"
				icon={<MoreHorizontalRegular />}
				aria-label={`Actions for ${buttonText(row.button)}`}
				onClick={(e) => openMenu(e.currentTarget)}
			/>,
		);
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<SearchBox
					size="small"
					className={styles.search}
					placeholder="Search buttons, commands, rules"
					aria-label="Search the solution's elements"
					contentBefore={<FilterRegular />}
					value={query}
					onChange={(_, d) => setQuery(d.value)}
				/>
				<Menu>
					<MenuTrigger disableButtonEnhancement>
						<Tooltip content="New command or rule" relationship="label">
							<Button appearance="subtle" size="small" icon={<AddRegular />} />
						</Tooltip>
					</MenuTrigger>
					<MenuPopover>
						<MenuList>
							<MenuItem icon={<CodeRegular />} onClick={createAndOpenCommand}>
								New command
							</MenuItem>
							<MenuItem
								icon={<AppsAddInRegular />}
								onClick={() => createAndOpenRule("enable")}
							>
								New enable rule
							</MenuItem>
							<MenuItem
								icon={<AppsAddInRegular />}
								onClick={() => createAndOpenRule("display")}
							>
								New display rule
							</MenuItem>
						</MenuList>
					</MenuPopover>
				</Menu>
			</div>
			<div className={styles.body}>
				<Tree
					size="small"
					aria-label="Solution elements"
					openItems={effectiveOpen}
					onOpenChange={(_, d: TreeOpenChangeData) => {
						const next = new Set(effectiveOpen);
						if (d.open) next.add(String(d.value));
						else next.delete(String(d.value));
						if (q) setSearchOpen({ q, open: next });
						else setOpenItems(next);
					}}
				>
					{branch(
						"buttons",
						"Buttons",
						shownButtons,
						buttonRow,
						q ? "No buttons match." : "None of your buttons yet.",
					)}
					{branch(
						"commands",
						"Commands",
						shownCommands,
						(c) =>
							leaf(
								`command:${c.id}`,
								distinguishingSegment(c.id),
								<Text size={200} className={styles.muted}>
									{used(usage.byCommand.get(c.id))}
								</Text>,
								c.id,
								() => openCommandEditor(c.id),
							),
						q ? "No commands match." : "No commands.",
					)}
					{branch(
						"rules",
						"Rules",
						shownRules,
						(r) =>
							leaf(
								`rule:${r.kind}:${r.id}`,
								distinguishingSegment(r.id),
								<span className={styles.meta}>
									<Text size={200} className={styles.muted}>
										{used(
											(r.kind === "enable"
												? usage.byEnable
												: usage.byDisplay
											).get(r.id),
										)}
									</Text>
									<Badge
										size="medium"
										appearance="tint"
										color={r.kind === "enable" ? "success" : "informative"}
									>
										{r.kind === "enable" ? "Enable" : "Display"}
									</Badge>
								</span>,
								r.id,
								() => openRuleEditor(r.id, r.kind),
							),
						q ? "No rules match." : "No rules.",
					)}
					{branch(
						"templates",
						"Templates",
						shownTemplates,
						// Plain rows: nothing happens on a template yet (#185).
						(t) => (
							<TreeItem
								key={`template:${t.id}`}
								itemType="leaf"
								value={`template:${t.id}`}
								aria-description={t.id}
							>
								<TreeItemLayout iconBefore={<DocumentTableRegular />}>
									<span className={styles.name} title={t.id}>
										{distinguishingSegment(t.id)}
									</span>
								</TreeItemLayout>
							</TreeItem>
						),
						q ? "No templates match." : "No templates.",
					)}
				</Tree>
			</div>

			{buttonMenu && (
				<Menu
					key={`${buttonMenu.row.location}:${buttonMenu.row.button.id}`}
					open
					onOpenChange={(_, d) => !d.open && setButtonMenu(null)}
					positioning={{ target: buttonMenu.anchor, position: "below", align: "start" }}
				>
					<MenuTrigger disableButtonEnhancement>
						<span hidden />
					</MenuTrigger>
					<MenuPopover>
						<MenuList aria-label={`Actions for ${buttonText(buttonMenu.row.button)}`}>
							<MenuItem onClick={() => goTo(buttonMenu.row)}>Go to button</MenuItem>
							<MenuDivider />
							<MenuGroupHeader>Add a copy to a group of this tab</MenuGroupHeader>
							{crossScope && (
								<MenuGroupHeader>
									{location === "Application"
										? "A table's button can't go on the application ribbon."
										: "An application ribbon button can't go on a table's ribbon."}
								</MenuGroupHeader>
							)}
							{targetGroups.length === 0 ? (
								<MenuItem disabled>No groups on this tab</MenuItem>
							) : (
								targetGroups.map((g) => {
									const label =
										captionOf(g.label, locLabels, lang, g.source?.titleToken) ||
										g.id;
									return (
										<MenuItem
											key={g.id}
											// A table's command isn't published with the application
											// ribbon, nor the other way round (review).
											disabled={crossScope}
											onClick={() => addToGroup(buttonMenu.row, g.id, label)}
										>
											Add to {label}
										</MenuItem>
									);
								})
							)}
						</MenuList>
					</MenuPopover>
				</Menu>
			)}
		</div>
	);
}
