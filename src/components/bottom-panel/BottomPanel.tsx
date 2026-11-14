import {
	makeStyles,
	tokens,
	Tab,
	TabList,
	Button,
	Text,
	CounterBadge,
	SearchBox,
	mergeClasses,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore, type HistoryEntry } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore } from "@/store/draftStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { generateCommandId, generateRuleId } from "@/utils/idGenerator";
import {
	ChevronDownRegular,
	ChevronUpRegular,
	AddRegular,
	ArrowCounterclockwiseRegular,
	BranchCompareRegular,
	PersonRegular,
	CopyRegular,
} from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { ribbonUsage } from "@/utils/usage";
import { CommandsGrid, RulesGrid } from "./ElementGrids";
import { copyText } from "@/utils/hostIO";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground2,
		flexShrink: 0,
	},
	tabRow: {
		display: "flex",
		alignItems: "center",
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		gap: 0,
		paddingRight: tokens.spacingHorizontalS,
		flexShrink: 0,
	},
	content: {
		flex: 1,
		minHeight: 0,
		overflowY: "auto",
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalM}`,
	},
	// A grid scrolls its own rows: the panel doesn't scroll too.
	gridContent: { overflow: "hidden", display: "flex", flexDirection: "column" },
	tabCount: { marginLeft: tokens.spacingHorizontalXS },
	toolbar: {
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		paddingBottom: tokens.spacingHorizontalXS,
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
		marginBottom: tokens.spacingHorizontalXS,
	},
	historyRow: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingHorizontalXS} 0`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
	},
	historyAvatar: {
		width: "24px",
		height: "24px",
		borderRadius: "50%",
		backgroundColor: tokens.colorBrandBackground2,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		marginTop: "2px",
	},
	historyContent: {
		flex: 1,
		minWidth: 0,
	},
	consoleRow: {
		padding: "2px 0",
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		display: "flex",
		gap: tokens.spacingHorizontalS,
	},
	consoleTs: {
		color: tokens.colorNeutralForeground4,
		flexShrink: 0,
		fontSize: tokens.fontSizeBase200,
	},
});

/** While the ribbon loads, the grids don't claim there's nothing (#229). */
const NOT_LOADED = "Shown once the table's ribbon is loaded.";

export function BottomPanel() {
	const styles = useStyles();
	const loaded = useDraftStore((s) => s.target !== null);
	const activeBottomTab = useUIStore((s) => s.activeBottomTab);
	const setActiveBottomTab = useUIStore((s) => s.setActiveBottomTab);
	const bottomPanelHeight = useUIStore((s) => s.bottomPanelHeight);
	const bottomPanelCollapsed = useUIStore((s) => s.bottomCollapsed);
	const setBottomPanelCollapsed = useUIStore((s) => s.setBottomCollapsed);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const history = useRibbonStore((s) => s.past);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const restore = useRibbonStore((s) => s.restore);
	const currentUserName = useSessionStore((s) => s.currentUserName);
	const runtimeEntries = useRuntimeLogStore((s) => s.entries);
	const clearRuntimeLogs = useRuntimeLogStore((s) => s.clear);
	const logWarn = useRuntimeLogStore((s) => s.logWarn);

	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const openDiffViewer = useUIStore((s) => s.openDiffViewer);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);

	// Per-tab search filters. Independent per tab so switching tabs doesn't
	// surprise the user by losing their filter context.
	const [commandsFilter, setCommandsFilter] = useState("");
	const [displayRulesFilter, setDisplayRulesFilter] = useState("");
	const [enableRulesFilter, setEnableRulesFilter] = useState("");
	const [historyFilter, setHistoryFilter] = useState("");

	const filteredCommands = useMemo(() => {
		const q = commandsFilter.toLowerCase().trim();
		if (!q) return commands;
		return commands.filter(
			(c) =>
				c.id.toLowerCase().includes(q) ||
				c.enableRules.some((r) => r.toLowerCase().includes(q)) ||
				c.displayRules.some((r) => r.toLowerCase().includes(q)),
		);
	}, [commands, commandsFilter]);

	const filteredDisplayRules = useMemo(() => {
		const q = displayRulesFilter.toLowerCase().trim();
		if (!q) return displayRules;
		return displayRules.filter(
			(r) =>
				r.id.toLowerCase().includes(q) ||
				r.steps.some((s) => s.kind.toLowerCase().includes(q)),
		);
	}, [displayRules, displayRulesFilter]);

	const filteredEnableRules = useMemo(() => {
		const q = enableRulesFilter.toLowerCase().trim();
		if (!q) return enableRules;
		return enableRules.filter(
			(r) =>
				r.id.toLowerCase().includes(q) ||
				r.steps.some((s) => s.kind.toLowerCase().includes(q)),
		);
	}, [enableRules, enableRulesFilter]);

	const filteredHistory = useMemo(() => {
		const q = historyFilter.toLowerCase().trim();
		if (!q) return history;
		return history.filter(
			(h) =>
				h.op.toLowerCase().includes(q) ||
				h.target.toLowerCase().includes(q) ||
				h.detail.toLowerCase().includes(q) ||
				h.userName.toLowerCase().includes(q),
		);
	}, [history, historyFilter]);

	const handleNewCommand = () => {
		const existingIds = new Set(commands.map((c) => c.id));
		const newId = generateCommandId("New", "Command", existingIds);
		upsertCommand({ id: newId, enableRules: [], displayRules: [], actions: [] });
		openCommandEditor(newId);
	};

	const handleNewEnableRule = () => {
		const existingIds = new Set(enableRules.map((r) => r.id));
		const newId = generateRuleId("New", "Enable", existingIds);
		upsertEnableRule({ id: newId, steps: [] });
		openRuleEditor(newId, "enable");
	};

	const handleNewDisplayRule = () => {
		const existingIds = new Set(displayRules.map((r) => r.id));
		const newId = generateRuleId("New", "Display", existingIds);
		upsertDisplayRule({ id: newId, steps: [] });
		openRuleEditor(newId, "display");
	};

	// How much each command and rule is used, as the Solution tab counts it.
	const usage = useMemo(() => ribbonUsage(ribbons, commands), [ribbons, commands]);

	const panelHeight = bottomPanelCollapsed ? 32 : bottomPanelHeight;
	// The grids' rows scroll inside them, under a header that stays put. The
	// grid measures the space it has; this estimate (the panel less its tabs,
	// toolbar, grid header and padding) is used until it has (#185).
	const gridHeight = Math.max(36, bottomPanelHeight - 116);
	const gridTab =
		activeBottomTab === "commands" ||
		activeBottomTab === "displayRules" ||
		activeBottomTab === "enableRules";

	function resolveHistoryUserName(entry: HistoryEntry): string {
		if (entry.userName && entry.userName !== "You") return entry.userName;
		if (currentUserName) return currentUserName;
		return "You";
	}

	return (
		<div className={styles.root} style={{ height: panelHeight }}>
			<div className={styles.tabRow}>
				<TabList
					selectedValue={activeBottomTab}
					onTabSelect={(_, d) => {
						setActiveBottomTab(
							d.value as
								"commands" | "displayRules" | "enableRules" | "history" | "console",
						);
						// Choosing a tab of a collapsed panel opens it (#179).
						if (bottomPanelCollapsed) setBottomPanelCollapsed(false);
					}}
					size="small"
					style={{ flex: 1 }}
				>
					<Tab value="commands">
						Commands
						<CounterBadge
							className={styles.tabCount}
							size="medium"
							appearance="ghost"
							color="informative"
							count={commands.length}
							showZero
							overflowCount={9999}
						/>
					</Tab>
					<Tab value="displayRules">
						Display rules
						<CounterBadge
							className={styles.tabCount}
							size="medium"
							appearance="ghost"
							color="informative"
							count={displayRules.length}
							showZero
							overflowCount={9999}
						/>
					</Tab>
					<Tab value="enableRules">
						Enable rules
						<CounterBadge
							className={styles.tabCount}
							size="medium"
							appearance="ghost"
							color="informative"
							count={enableRules.length}
							showZero
							overflowCount={9999}
						/>
					</Tab>
					<Tab value="history">
						History
						<CounterBadge
							className={styles.tabCount}
							size="medium"
							appearance="ghost"
							color="informative"
							count={history.length}
							showZero
							overflowCount={9999}
						/>
					</Tab>
					<Tab value="console">Console</Tab>
				</TabList>
				<Button
					appearance="subtle"
					size="small"
					icon={bottomPanelCollapsed ? <ChevronUpRegular /> : <ChevronDownRegular />}
					onClick={() => setBottomPanelCollapsed(!bottomPanelCollapsed as boolean)}
					aria-label={bottomPanelCollapsed ? "Expand panel" : "Collapse panel"}
				/>
			</div>

			{!bottomPanelCollapsed && (
				<div className={mergeClasses(styles.content, gridTab && styles.gridContent)}>
					{/* ── Commands ── */}
					{activeBottomTab === "commands" && (
						<>
							<div className={styles.toolbar}>
								<Button
									appearance="subtle"
									size="small"
									icon={<AddRegular />}
									onClick={handleNewCommand}
								>
									New command
								</Button>
								<SearchBox
									size="small"
									placeholder={`Filter ${commands.length} command${commands.length !== 1 ? "s" : ""}…`}
									value={commandsFilter}
									aria-label="Filter the commands"
									onChange={(_, d) => setCommandsFilter(d.value)}
									style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
								/>
								{commandsFilter && (
									<Text
										size={200}
										style={{ color: tokens.colorNeutralForeground3 }}
									>
										{filteredCommands.length} match
										{filteredCommands.length !== 1 ? "es" : ""}
									</Text>
								)}
							</div>
							<CommandsGrid
								commands={filteredCommands}
								usage={usage.byCommand}
								height={gridHeight}
								onOpen={openCommandEditor}
								onOpenRule={openRuleEditor}
								emptyText={
									!loaded
										? NOT_LOADED
										: commandsFilter
											? "No commands match."
											: "No commands."
								}
							/>
						</>
					)}

					{/* ── Display rules ── */}
					{activeBottomTab === "displayRules" && (
						<>
							<div className={styles.toolbar}>
								<Button
									appearance="subtle"
									size="small"
									icon={<AddRegular />}
									onClick={handleNewDisplayRule}
								>
									New display rule
								</Button>
								<SearchBox
									size="small"
									placeholder={`Filter ${displayRules.length} display rule${displayRules.length !== 1 ? "s" : ""}…`}
									value={displayRulesFilter}
									aria-label="Filter the display rules"
									onChange={(_, d) => setDisplayRulesFilter(d.value)}
									style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
								/>
								{displayRulesFilter && (
									<Text
										size={200}
										style={{ color: tokens.colorNeutralForeground3 }}
									>
										{filteredDisplayRules.length} match
										{filteredDisplayRules.length !== 1 ? "es" : ""}
									</Text>
								)}
							</div>
							<RulesGrid
								rules={filteredDisplayRules}
								kind="display"
								usage={usage.byDisplay}
								height={gridHeight}
								onOpen={(id) => openRuleEditor(id, "display")}
								emptyText={
									!loaded
										? NOT_LOADED
										: displayRulesFilter
											? "No display rules match."
											: "No display rules."
								}
							/>
						</>
					)}

					{/* ── Enable rules ── */}
					{activeBottomTab === "enableRules" && (
						<>
							<div className={styles.toolbar}>
								<Button
									appearance="subtle"
									size="small"
									icon={<AddRegular />}
									onClick={handleNewEnableRule}
								>
									New enable rule
								</Button>
								<SearchBox
									size="small"
									placeholder={`Filter ${enableRules.length} enable rule${enableRules.length !== 1 ? "s" : ""}…`}
									value={enableRulesFilter}
									aria-label="Filter the enable rules"
									onChange={(_, d) => setEnableRulesFilter(d.value)}
									style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
								/>
								{enableRulesFilter && (
									<Text
										size={200}
										style={{ color: tokens.colorNeutralForeground3 }}
									>
										{filteredEnableRules.length} match
										{filteredEnableRules.length !== 1 ? "es" : ""}
									</Text>
								)}
							</div>
							<RulesGrid
								rules={filteredEnableRules}
								kind="enable"
								usage={usage.byEnable}
								height={gridHeight}
								onOpen={(id) => openRuleEditor(id, "enable")}
								emptyText={
									!loaded
										? NOT_LOADED
										: enableRulesFilter
											? "No enable rules match."
											: "No enable rules."
								}
							/>
						</>
					)}

					{/* ── History ── */}
					{activeBottomTab === "history" && (
						<>
							{history.length > 0 && (
								<div className={styles.toolbar}>
									<SearchBox
										size="small"
										placeholder={`Filter ${history.length} entr${history.length !== 1 ? "ies" : "y"}…`}
										value={historyFilter}
										aria-label="Filter the history"
										onChange={(_, d) => setHistoryFilter(d.value)}
										style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
									/>
									{historyFilter && (
										<Text
											size={200}
											style={{ color: tokens.colorNeutralForeground3 }}
										>
											{filteredHistory.length} match
											{filteredHistory.length !== 1 ? "es" : ""}
										</Text>
									)}
								</div>
							)}
							{history.length === 0 ? (
								<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
									No history yet — make a change to see it here.
								</Text>
							) : (
								filteredHistory
									.slice()
									.reverse()
									.map((entry: HistoryEntry, i: number) => {
										// Convert reversed index to original past index of the
										// UNFILTERED history array — `restore(index)` operates
										// on the full past stack so the index has to map back
										// to the source.
										const pastIndex = history.indexOf(entry);
										return (
											<div key={i} className={styles.historyRow}>
												<div className={styles.historyAvatar} aria-hidden>
													<PersonRegular
														fontSize={12}
														style={{
															color: tokens.colorBrandForeground1,
														}}
													/>
												</div>
												<div className={styles.historyContent}>
													<div
														style={{
															display: "flex",
															alignItems: "baseline",
															gap: 6,
														}}
													>
														<Text size={200} weight="semibold">
															{entry.op}
														</Text>
														<Text size={200}>
															— <strong>{entry.target}</strong>
														</Text>
														{entry.detail && (
															<Text
																size={200}
																style={{
																	color: tokens.colorNeutralForeground3,
																}}
															>
																{entry.detail}
															</Text>
														)}
													</div>
													<div
														style={{
															display: "flex",
															alignItems: "center",
															gap: 8,
															marginTop: 2,
														}}
													>
														<Text
															size={200}
															style={{
																color: tokens.colorNeutralForeground3,
															}}
														>
															{resolveHistoryUserName(entry)} ·{" "}
															{new Date(
																entry.ts,
															).toLocaleTimeString()}
														</Text>
														<Button
															appearance="subtle"
															size="small"
															icon={<BranchCompareRegular />}
															onClick={() =>
																openDiffViewer("history", pastIndex)
															}
														>
															View diff
														</Button>
														{/* restore(i) undoes entry i and every later one, so
														    the oldest entry goes back to the loaded state (#34). */}
														<Button
															appearance="subtle"
															size="small"
															icon={<ArrowCounterclockwiseRegular />}
															title="Undo this change and every later one (redo brings them back)"
															onClick={() => restore(pastIndex)}
														>
															Undo from here
														</Button>
													</div>
												</div>
											</div>
										);
									})
							)}
						</>
					)}

					{/* ── Console ── */}
					{activeBottomTab === "console" && (
						<>
							<div className={styles.toolbar}>
								<Button
									appearance="subtle"
									size="small"
									icon={<CopyRegular />}
									disabled={runtimeEntries.length === 0}
									onClick={() => {
										// Newest first to match the on-screen ordering.
										const text = runtimeEntries
											.slice()
											.reverse()
											.map((entry) => {
												const time = new Date(
													entry.ts,
												).toLocaleTimeString();
												return `${entry.scope} ${time}\n[${entry.level.toUpperCase()}]\n${entry.message}`;
											})
											.join("\n\n");
										// Host first, browser fallback; a failure is logged (#122).
										void copyText(text).then((r) => {
											if (!r.ok)
												logWarn("ui", `Couldn't copy the log: ${r.error}.`);
										});
									}}
									title="Copy all log entries to clipboard"
								>
									Copy log
								</Button>
								<Button appearance="subtle" size="small" onClick={clearRuntimeLogs}>
									Clear log
								</Button>
							</div>
							<div>
								{runtimeEntries.length === 0 ? (
									<Text
										size={200}
										style={{ color: tokens.colorNeutralForeground3 }}
									>
										No runtime diagnostics yet.
									</Text>
								) : (
									runtimeEntries
										.slice()
										.reverse()
										.map((entry) => (
											<ConsoleRow
												key={entry.id}
												ts={`${entry.scope} ${new Date(entry.ts).toLocaleTimeString()}`}
												level={entry.level}
												message={entry.message}
											/>
										))
								)}
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

// ── Sub-components ────────────────────────────────────────────

function ConsoleRow({
	ts,
	level,
	message,
}: {
	ts: string;
	level: "info" | "warn" | "error";
	message: string;
}) {
	const styles = useStyles();
	const color =
		level === "error"
			? tokens.colorStatusDangerForeground1
			: level === "warn"
				? tokens.colorStatusWarningForeground1
				: tokens.colorNeutralForeground3;
	return (
		<div className={styles.consoleRow}>
			<span className={styles.consoleTs}>{ts}</span>
			<span style={{ color }}>[{level.toUpperCase()}]</span>
			<span style={{ color: tokens.colorNeutralForeground1 }}>{message}</span>
		</div>
	);
}
