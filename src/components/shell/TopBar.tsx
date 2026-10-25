import { useMemo, useState } from "react";
import {
	makeStyles,
	tokens,
	Button,
	Text,
	Badge,
	Combobox,
	Option,
	Popover,
	PopoverTrigger,
	PopoverSurface,
	Field,
	InfoLabel,
	Menu,
	MenuTrigger,
	MenuPopover,
	MenuList,
	MenuItem,
	MenuItemRadio,
	MenuItemCheckbox,
	MenuGroup,
	MenuGroupHeader,
	MenuDivider,
	Overflow,
	OverflowItem,
	Toolbar,
	ToolbarButton,
	ToolbarDivider,
	Tooltip,
	useComboboxFilter,
	useIsOverflowItemVisible,
	useOverflowMenu,
	type MenuProps,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import type { Solution } from "@/types/solution";
import {
	ArrowUndoRegular,
	ArrowRedoRegular,
	QuestionCircleRegular,
	CloudArrowUpRegular,
	SearchRegular,
	DatabaseRegular,
	ChevronDownRegular,
	CodeRegular,
	OpenRegular,
	LayoutColumnTwoSplitRightRegular,
	MoreHorizontalRegular,
	WarningRegular,
} from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore, type RightPaneMode } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore } from "@/store/draftStore";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import { AppDialog } from "@/components/shared/AppDialog";
import { copyText } from "@/utils/hostIO";
import { usePublishState } from "@/hooks/usePublishState";

/**
 * The top bar (#179): brand, environment, solution, search, the tools (in an
 * overflow menu when the pane is narrow) and Publish, which is never hidden.
 * Replaces the old top bar plus the sub-header row.
 */

const useStyles = makeStyles({
	root: {
		height: "48px",
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `0 ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground3,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
		minWidth: 0,
	},
	brand: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		flexShrink: 0,
	},
	brandMark: {
		width: "24px",
		height: "24px",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorBrandBackground,
		color: tokens.colorNeutralForegroundOnBrand,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
	/** The brand's text gives way first in a narrow pane (#22). */
	brandTitle: {
		whiteSpace: "nowrap",
		"@media (max-width: 1100px)": { display: "none" },
	},
	divider: {
		width: "1px",
		alignSelf: "stretch",
		margin: `${tokens.spacingVerticalM} 0`,
		backgroundColor: tokens.colorNeutralStroke2,
		flexShrink: 0,
	},
	spacer: { flex: "1 1 0", minWidth: 0 },
	solutionTrigger: {
		minWidth: "120px",
		maxWidth: "260px",
		flexShrink: 1,
		justifyContent: "flex-start",
		"@media (max-width: 1200px)": { maxWidth: "200px" },
	},
	ellipsis: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	muted: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
	solutionPickerSurface: {
		padding: tokens.spacingHorizontalM,
		width: "380px",
		maxWidth: "calc(100vw - 32px)",
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	optionText: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 },
	search: {
		flexShrink: 0,
		color: tokens.colorNeutralForeground3,
		fontWeight: tokens.fontWeightRegular,
	},
	/** The search box's text goes before the tools overflow (#179). */
	searchText: {
		"@media (max-width: 1180px)": { display: "none" },
	},
	kbd: {
		marginLeft: tokens.spacingHorizontalS,
		padding: "0 4px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusSmall,
		fontSize: tokens.fontSizeBase100,
		"@media (max-width: 1180px)": { display: "none" },
	},
	toolsOverflow: {
		flex: "0 1 auto",
		minWidth: "40px",
		overflow: "hidden",
		display: "flex",
	},
	toolbar: { flexWrap: "nowrap", minWidth: 0 },
	publish: { flexShrink: 0 },
	helpBody: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		maxWidth: "320px",
	},
});

export function TopBar() {
	const styles = useStyles();
	const openBulkPublish = useUIStore((s) => s.openBulkPublish);
	const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
	const { count, canPublish } = usePublishState();
	const [helpOpen, setHelpOpen] = useState(false);

	const publishLabel = count > 0 ? `Publish ${count} change${count === 1 ? "" : "s"}` : "Publish";
	const publishButton = (
		<Button
			appearance="primary"
			icon={<CloudArrowUpRegular />}
			className={styles.publish}
			disabledFocusable={!canPublish}
			onClick={canPublish ? openBulkPublish : undefined}
		>
			{canPublish && count === 0 ? "Publish changes" : publishLabel}
		</Button>
	);

	return (
		<header className={styles.root}>
			<div className={styles.brand}>
				<div className={styles.brandMark} aria-hidden="true">
					<Text size={100} weight="bold">
						CBS
					</Text>
				</div>
				<Text weight="semibold" size={300} className={styles.brandTitle}>
					Command Bar Studio
				</Text>
			</div>

			<div className={styles.divider} />
			{/* The environment every write goes to (#121) */}
			<EnvironmentBadge compactBelow={1200} />
			<div className={styles.divider} />

			<SolutionPicker />

			<div className={styles.spacer} />

			<Tooltip content="Search buttons, commands, rules (Ctrl+K)" relationship="label">
				<Button
					appearance="outline"
					icon={<SearchRegular />}
					className={styles.search}
					onClick={() => setCommandPaletteOpen(true)}
				>
					<span className={styles.searchText}>Search</span>
					<span className={styles.kbd} aria-hidden="true">
						Ctrl K
					</span>
				</Button>
			</Tooltip>

			<Tools onHelp={() => setHelpOpen(true)} />

			{canPublish ? (
				publishButton
			) : (
				<Tooltip
					content="No unpublished changes on this table. Make a change and it shows here as Publish 1 change."
					relationship="description"
				>
					{publishButton}
				</Tooltip>
			)}

			<AppDialog
				open={helpOpen}
				onOpenChange={setHelpOpen}
				title="Command Bar Studio"
				size="small"
			>
				<HelpContent />
			</AppDialog>
		</header>
	);
}

// ── Solution picker ─────────────────────────────────────────────────────────

type ComboSolutionOption = {
	children: React.ReactNode;
	value: string;
	searchText: string;
	solution: Solution;
};

function isDefaultPublisher(solution: Solution): boolean {
	const prefix = solution.publisherPrefix || "new";
	return prefix === "new" || /^defaultpublisher/i.test(solution.publisherUniqueName ?? "");
}

function SolutionPicker() {
	const styles = useStyles();
	const solutions = useSessionStore((s) => s.solutions);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const requestSolutionSwitch = useDraftStore((s) => s.requestSolutionSwitch);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [query, setQuery] = useState("");

	// Managed solutions can never be modified by a tool: ribbon customizations
	// only flow through the user's unmanaged solution layer, so the list is
	// unmanaged only.
	const comboOptions: ComboSolutionOption[] = useMemo(
		() =>
			solutions
				.filter((s) => !s.isManaged)
				.map((sol) => ({
					value: sol.id,
					children: sol.friendlyName || sol.uniqueName,
					searchText: `${sol.friendlyName ?? ""} ${sol.uniqueName ?? ""}`.toLowerCase(),
					solution: sol,
				})),
		[solutions],
	);

	const filteredChildren = useComboboxFilter(query, comboOptions, {
		optionToText: (o) => o.searchText,
		filter: (optionText, q) => optionText.includes(q.toLowerCase()),
		optionToReactKey: (o) => o.value,
		renderOption: (o) => (
			<Option
				key={o.value}
				value={o.value}
				text={o.solution.friendlyName ?? o.solution.uniqueName}
			>
				<div className={styles.optionText}>
					<Text size={200} weight="semibold">
						{o.solution.friendlyName || o.solution.uniqueName}
					</Text>
					<Text size={100} className={styles.muted}>
						{o.solution.uniqueName} · v{o.solution.version}
						{o.solution.publisherName ? ` · ${o.solution.publisherName}` : ""}
					</Text>
				</div>
			</Option>
		),
		noOptionsMessage:
			solutions.length === 0 ? "Loading solutions…" : "No solutions match the filter.",
	});

	const handleOptionSelect: ComboboxProps["onOptionSelect"] = (_, data) => {
		const sol = solutions.find((s) => s.id === data.optionValue);
		if (sol) {
			// Asks first when there are unpublished changes (#16).
			requestSolutionSwitch(sol);
			setPickerOpen(false);
			setQuery("");
		}
	};

	const name = activeSolution ? activeSolution.friendlyName || activeSolution.uniqueName : "";
	const defaultPublisher = activeSolution ? isDefaultPublisher(activeSolution) : false;
	const prefix = activeSolution?.publisherPrefix || "new";

	return (
		<Popover
			open={pickerOpen}
			onOpenChange={(_, d) => setPickerOpen(d.open)}
			positioning="below-start"
			trapFocus
		>
			<PopoverTrigger disableButtonEnhancement>
				<Tooltip
					content={
						activeSolution ? name : "Choose the solution your changes are saved to"
					}
					relationship="description"
				>
					<Button
						appearance={activeSolution ? "subtle" : "primary"}
						icon={<DatabaseRegular />}
						aria-label={activeSolution ? `Solution: ${name}` : "Select solution"}
						className={styles.solutionTrigger}
					>
						{activeSolution ? (
							<>
								<span className={styles.ellipsis}>{name}</span>
								{defaultPublisher && (
									<WarningRegular
										aria-label="Default publisher"
										style={{
											color: tokens.colorPaletteDarkOrangeForeground1,
											flexShrink: 0,
										}}
									/>
								)}
							</>
						) : (
							"Choose solution"
						)}
						<ChevronDownRegular fontSize={12} className={styles.muted} />
					</Button>
				</Tooltip>
			</PopoverTrigger>
			<PopoverSurface className={styles.solutionPickerSurface}>
				<Field label="Solution your changes are saved to">
					<Combobox
						placeholder={
							solutions.length === 0
								? "Loading solutions…"
								: "Search by display name or unique name"
						}
						value={query}
						onChange={(ev) => setQuery(ev.target.value)}
						onOptionSelect={handleOptionSelect}
						freeform
						clearable
					>
						{filteredChildren}
					</Combobox>
				</Field>
				<Text size={100} className={styles.muted}>
					{comboOptions.length} unmanaged solution
					{comboOptions.length !== 1 ? "s" : ""} available
				</Text>
				{activeSolution && (
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<InfoLabel
							size="small"
							info={
								defaultPublisher
									? `New ids are prefixed "${prefix}_", the org's default publisher. To use your own prefix, create a solution in make.powerapps.com bound to your publisher.`
									: `New ids are prefixed "${prefix}_" (publisher ${activeSolution.publisherName || activeSolution.publisherUniqueName || prefix}).`
							}
						>
							Publisher prefix
						</InfoLabel>
						<Badge
							appearance="tint"
							color={defaultPublisher ? "warning" : "informative"}
							size="small"
						>
							{prefix}_
						</Badge>
					</div>
				)}
			</PopoverSurface>
		</Popover>
	);
}

// ── Tools (overflow) ────────────────────────────────────────────────────────

/** Opens the table's list in Dynamics 365, in the connection's browser. */
async function openInApp(connectionUrl: string, logicalName: string) {
	const url =
		`${connectionUrl.replace(/\/$/, "")}/main.aspx?` +
		`pagetype=entitylist&etn=${encodeURIComponent(logicalName)}`;
	await window.toolboxAPI?.utils.openInConnectionBrowser(url, "primary");
}

function useTools() {
	const past = useRibbonStore((s) => s.past);
	const future = useRibbonStore((s) => s.future);
	const undo = useRibbonStore((s) => s.undo);
	const redo = useRibbonStore((s) => s.redo);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
	const openImportXml = useUIStore((s) => s.openImportXml);
	const openDiffViewer = useUIStore((s) => s.openDiffViewer);
	const rightPaneMode = useUIStore((s) => s.rightPaneMode);
	const setRightPaneMode = useUIStore((s) => s.setRightPaneMode);
	const bottomCollapsed = useUIStore((s) => s.bottomCollapsed);
	const setBottomCollapsed = useUIStore((s) => s.setBottomCollapsed);
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const logicalName = useSessionStore((s) => s.activeEntity?.logicalName);
	return {
		canUndo: past.length > 0,
		canRedo: future.length > 0,
		undo,
		redo,
		viewXml: openXmlDrawer,
		importXml: () => openImportXml(),
		compare: () => openDiffViewer("compare"),
		canOpenInApp: !!(connectionUrl && logicalName),
		openInApp: () =>
			connectionUrl && logicalName ? void openInApp(connectionUrl, logicalName) : undefined,
		rightPaneMode,
		setRightPaneMode,
		bottomCollapsed,
		setBottomCollapsed,
	};
}

type Tools = ReturnType<typeof useTools>;

const XML_ITEMS = (t: Tools) => (
	<>
		<MenuItem onClick={t.viewXml}>View XML</MenuItem>
		<MenuItem onClick={t.importXml}>Import XML…</MenuItem>
		<MenuItem onClick={t.compare}>Compare with published</MenuItem>
	</>
);

function viewMenuProps(t: Tools): Pick<MenuProps, "checkedValues" | "onCheckedValueChange"> {
	return {
		checkedValues: {
			properties: [t.rightPaneMode],
			bottom: t.bottomCollapsed ? [] : ["show"],
		},
		onCheckedValueChange: (_, d) => {
			if (d.name === "properties") t.setRightPaneMode(d.checkedItems[0] as RightPaneMode);
			if (d.name === "bottom") t.setBottomCollapsed(!d.checkedItems.includes("show"));
		},
	};
}

const VIEW_ITEMS = (
	<>
		<MenuGroup>
			<MenuGroupHeader>Properties pane</MenuGroupHeader>
			<MenuItemRadio name="properties" value="docked">
				Docked
			</MenuItemRadio>
			<MenuItemRadio name="properties" value="floating">
				Floating
			</MenuItemRadio>
			<MenuItemRadio name="properties" value="hidden">
				Hidden
			</MenuItemRadio>
		</MenuGroup>
		<MenuDivider />
		<MenuItemCheckbox name="bottom" value="show">
			Show the bottom panel
		</MenuItemCheckbox>
	</>
);

type ToolId = "undo" | "redo" | "xml" | "open" | "view" | "help";

function Tools({ onHelp }: { onHelp: () => void }) {
	const styles = useStyles();
	const t = useTools();
	return (
		<Overflow padding={40}>
			<div className={styles.toolsOverflow}>
				<Toolbar aria-label="Tools" size="small" className={styles.toolbar}>
					<OverflowItem id="undo" groupId="history">
						<Tooltip content="Undo (Ctrl+Z)" relationship="label">
							<ToolbarButton
								icon={<ArrowUndoRegular />}
								disabled={!t.canUndo}
								onClick={t.undo}
							/>
						</Tooltip>
					</OverflowItem>
					<OverflowItem id="redo" groupId="history">
						<Tooltip content="Redo (Ctrl+Y)" relationship="label">
							<ToolbarButton
								icon={<ArrowRedoRegular />}
								disabled={!t.canRedo}
								onClick={t.redo}
							/>
						</Tooltip>
					</OverflowItem>
					<ToolbarDivider />
					<OverflowItem id="xml">
						<Menu>
							<MenuTrigger disableButtonEnhancement>
								<ToolbarButton icon={<CodeRegular />}>
									XML <ChevronDownRegular fontSize={12} />
								</ToolbarButton>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>{XML_ITEMS(t)}</MenuList>
							</MenuPopover>
						</Menu>
					</OverflowItem>
					<OverflowItem id="open">
						<Tooltip content="Open this table in Dynamics 365" relationship="label">
							<ToolbarButton
								icon={<OpenRegular />}
								disabled={!t.canOpenInApp}
								onClick={t.openInApp}
							/>
						</Tooltip>
					</OverflowItem>
					<OverflowItem id="view">
						<Menu {...viewMenuProps(t)}>
							<MenuTrigger disableButtonEnhancement>
								<Tooltip content="View" relationship="label">
									<ToolbarButton icon={<LayoutColumnTwoSplitRightRegular />} />
								</Tooltip>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>{VIEW_ITEMS}</MenuList>
							</MenuPopover>
						</Menu>
					</OverflowItem>
					<OverflowItem id="help">
						<HelpButton />
					</OverflowItem>
					<ToolsOverflowMenu tools={t} onHelp={onHelp} />
				</Toolbar>
			</div>
		</Overflow>
	);
}

/** The tools that didn't fit, as menu items (#179). */
function ToolsOverflowMenu({ tools: t, onHelp }: { tools: Tools; onHelp: () => void }) {
	const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>();
	if (!isOverflowing) return null;
	return (
		<Menu {...viewMenuProps(t)}>
			<MenuTrigger disableButtonEnhancement>
				<Tooltip content={`More tools (${overflowCount})`} relationship="label">
					<ToolbarButton ref={ref} icon={<MoreHorizontalRegular />} />
				</Tooltip>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					<OverflowMenuEntry id="undo">
						<MenuItem
							icon={<ArrowUndoRegular />}
							disabled={!t.canUndo}
							onClick={t.undo}
							secondaryContent="Ctrl+Z"
						>
							Undo
						</MenuItem>
					</OverflowMenuEntry>
					<OverflowMenuEntry id="redo">
						<MenuItem
							icon={<ArrowRedoRegular />}
							disabled={!t.canRedo}
							onClick={t.redo}
							secondaryContent="Ctrl+Y"
						>
							Redo
						</MenuItem>
					</OverflowMenuEntry>
					<OverflowMenuEntry id="xml">
						<Menu>
							<MenuTrigger disableButtonEnhancement>
								<MenuItem icon={<CodeRegular />}>XML</MenuItem>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>{XML_ITEMS(t)}</MenuList>
							</MenuPopover>
						</Menu>
					</OverflowMenuEntry>
					<OverflowMenuEntry id="open">
						<MenuItem
							icon={<OpenRegular />}
							disabled={!t.canOpenInApp}
							onClick={t.openInApp}
						>
							Open in Dynamics 365
						</MenuItem>
					</OverflowMenuEntry>
					<OverflowMenuEntry id="view">
						<Menu {...viewMenuProps(t)}>
							<MenuTrigger disableButtonEnhancement>
								<MenuItem icon={<LayoutColumnTwoSplitRightRegular />}>
									View
								</MenuItem>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>{VIEW_ITEMS}</MenuList>
							</MenuPopover>
						</Menu>
					</OverflowMenuEntry>
					<OverflowMenuEntry id="help">
						<MenuItem icon={<QuestionCircleRegular />} onClick={onHelp}>
							Help
						</MenuItem>
					</OverflowMenuEntry>
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}

function OverflowMenuEntry({ id, children }: { id: ToolId; children: React.ReactElement }) {
	const visible = useIsOverflowItemVisible(id);
	return visible ? null : children;
}

// ── Help ────────────────────────────────────────────────────────────────────

const DOCS_URL = "https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio#readme";

/**
 * Help (#22): what the old Save / Settings buttons promised and didn't do.
 * Changes are kept as a draft automatically (#16); PPTB has no way to open a
 * link in the browser, so the documentation link is copied.
 */
function HelpContent() {
	const styles = useStyles();
	const [copied, setCopied] = useState<"" | "yes" | "no">("");
	return (
		<div className={styles.helpBody}>
			<Text size={200}>
				Your changes are kept as a draft for each table automatically, until you publish or
				discard them.
			</Text>
			<Text size={200}>
				<strong>Ctrl+K</strong> search · <strong>Ctrl+S</strong> publish ·{" "}
				<strong>Ctrl+Z</strong> / <strong>Ctrl+Y</strong> undo / redo ·{" "}
				<strong>Ctrl+D</strong> duplicate · <strong>Ctrl+X</strong> /{" "}
				<strong>Ctrl+V</strong> move a button
			</Text>
			<Button
				size="small"
				onClick={async () => setCopied((await copyText(DOCS_URL)).ok ? "yes" : "no")}
			>
				Copy documentation link
			</Button>
			{copied === "yes" && <Text size={200}>Copied: paste it into your browser.</Text>}
			{copied === "no" && <Text size={200}>Couldn&apos;t copy. The link is {DOCS_URL}</Text>}
		</div>
	);
}

function HelpButton() {
	return (
		<Popover withArrow>
			<PopoverTrigger disableButtonEnhancement>
				<Tooltip content="Help" relationship="label">
					<ToolbarButton icon={<QuestionCircleRegular />} />
				</Tooltip>
			</PopoverTrigger>
			<PopoverSurface aria-label="Help">
				<Text weight="semibold">Command Bar Studio</Text>
				<HelpContent />
			</PopoverSurface>
		</Popover>
	);
}
