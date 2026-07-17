import {
	makeStyles,
	tokens,
	Tab,
	TabList,
	Button,
	Text,
	Badge,
	Tooltip,
	Input,
} from "@fluentui/react-components";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore, type HistoryEntry } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
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
	SearchRegular,
} from "@fluentui/react-icons";
import { useMemo, useState } from "react";

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
		overflowY: "auto",
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalM}`,
	},
	toolbar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		paddingBottom: tokens.spacingHorizontalXS,
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
		marginBottom: tokens.spacingHorizontalXS,
	},
	table: {
		width: "100%",
		borderCollapse: "collapse" as const,
		fontSize: tokens.fontSizeBase200,
	},
	th: {
		textAlign: "left" as const,
		padding: `4px ${tokens.spacingHorizontalS}`,
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase100,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		whiteSpace: "nowrap" as const,
	},
	td: {
		padding: `4px ${tokens.spacingHorizontalS}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
		verticalAlign: "middle" as const,
	},
	mono: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		cursor: "pointer",
		color: tokens.colorBrandForeground1,
		":hover": { textDecoration: "underline" },
	},
	chip: {
		display: "inline-flex",
		alignItems: "center",
		padding: "1px 6px",
		borderRadius: tokens.borderRadiusMedium,
		fontSize: tokens.fontSizeBase100,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground3,
		marginRight: "3px",
		fontFamily: tokens.fontFamilyMonospace,
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
		fontSize: tokens.fontSizeBase100,
	},
});

export function BottomPanel() {
	const styles = useStyles();
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
			(r) => r.id.toLowerCase().includes(q) || r.steps.some((s) => s.kind.toLowerCase().includes(q)),
		);
	}, [displayRules, displayRulesFilter]);

	const filteredEnableRules = useMemo(() => {
		const q = enableRulesFilter.toLowerCase().trim();
		if (!q) return enableRules;
		return enableRules.filter(
			(r) => r.id.toLowerCase().includes(q) || r.steps.some((s) => s.kind.toLowerCase().includes(q)),
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

	// Compute actual refs counts: how many buttons reference each command
	const commandRefs = useMemo(() => {
		const map: Record<string, number> = {};
		for (const ribbon of Object.values(ribbons)) {
			for (const tab of ribbon.tabs) {
				for (const group of tab.groups) {
					for (const btn of group.buttons) {
						if (btn.commandId) {
							map[btn.commandId] = (map[btn.commandId] ?? 0) + 1;
						}
					}
				}
			}
		}
		return map;
	}, [ribbons]);

	// Compute how many commands reference each rule
	const ruleRefs = useMemo(() => {
		const map: Record<string, number> = {};
		for (const cmd of commands) {
			for (const rId of [...cmd.enableRules, ...cmd.displayRules]) {
				map[rId] = (map[rId] ?? 0) + 1;
			}
		}
		return map;
	}, [commands]);

	const panelHeight = bottomPanelCollapsed ? 32 : bottomPanelHeight;

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
					onTabSelect={(_, d) =>
						setActiveBottomTab(
							d.value as "commands" | "displayRules" | "enableRules" | "history" | "console",
						)
					}
					size="small"
					style={{ flex: 1 }}
				>
					<Tab value="commands">Commands ({commands.length})</Tab>
					<Tab value="displayRules">Display rules ({displayRules.length})</Tab>
					<Tab value="enableRules">Enable rules ({enableRules.length})</Tab>
					<Tab value="history">History ({history.length})</Tab>
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
				<div className={styles.content}>
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
								<Input
									size="small"
									contentBefore={<SearchRegular />}
									placeholder={`Filter ${commands.length} command${commands.length !== 1 ? "s" : ""}…`}
									value={commandsFilter}
									onChange={(_, d) => setCommandsFilter(d.value)}
									style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
								/>
								{commandsFilter && (
									<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
										{filteredCommands.length} match{filteredCommands.length !== 1 ? "es" : ""}
									</Text>
								)}
							</div>
							<table className={styles.table}>
								<thead>
									<tr>
										<th className={styles.th}>Command</th>
										<th className={styles.th}>Actions</th>
										<th className={styles.th}>Enable rules</th>
										<th className={styles.th}>Display rules</th>
										<th className={styles.th}>Refs</th>
										<th className={styles.th}></th>
									</tr>
								</thead>
								<tbody>
									{filteredCommands.map((cmd) => (
										<tr key={cmd.id}>
											<td className={styles.td}>
												<span
													className={styles.mono}
													onClick={() => openCommandEditor(cmd.id)}
													role="button"
													tabIndex={0}
													onKeyDown={(e) => e.key === "Enter" && openCommandEditor(cmd.id)}
												>
													{cmd.id}
												</span>
											</td>
											<td className={styles.td}>
												{cmd.actions.map((a, i) => (
													<span key={i} className={styles.chip}>
														{a.kind === "javascript"
															? "JS"
															: a.kind === "url"
																? "URL"
																: a.kind === "powerFx"
																	? "Fx"
																	: "API"}
													</span>
												))}
												{cmd.actions.length === 0 && (
													<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
														—
													</Text>
												)}
											</td>
											<td className={styles.td}>
												{cmd.enableRules.map((r) => (
													<Tooltip key={r} content={r} relationship="label">
														<span
															className={styles.chip}
															style={{ cursor: "pointer", color: tokens.colorBrandForeground1 }}
															onClick={() => openRuleEditor(r, "enable")}
														>
															{r.split(".").pop()}
														</span>
													</Tooltip>
												))}
											</td>
											<td className={styles.td}>
												{cmd.displayRules.map((r) => (
													<Tooltip key={r} content={r} relationship="label">
														<span
															className={styles.chip}
															style={{ cursor: "pointer", color: tokens.colorBrandForeground1 }}
															onClick={() => openRuleEditor(r, "display")}
														>
															{r.split(".").pop()}
														</span>
													</Tooltip>
												))}
											</td>
											<td className={styles.td}>
												<Badge
													size="small"
													appearance="tint"
													color={commandRefs[cmd.id] ? "brand" : "informative"}
												>
													{commandRefs[cmd.id] ?? 0}
												</Badge>
											</td>
											<td className={styles.td}>
												<Button
													appearance="subtle"
													size="small"
													onClick={() => openCommandEditor(cmd.id)}
												>
													Edit
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
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
								<Input
									size="small"
									contentBefore={<SearchRegular />}
									placeholder={`Filter ${displayRules.length} display rule${displayRules.length !== 1 ? "s" : ""}…`}
									value={displayRulesFilter}
									onChange={(_, d) => setDisplayRulesFilter(d.value)}
									style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
								/>
								{displayRulesFilter && (
									<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
										{filteredDisplayRules.length} match
										{filteredDisplayRules.length !== 1 ? "es" : ""}
									</Text>
								)}
							</div>
							<RulesTable
								rules={filteredDisplayRules}
								kind="display"
								ruleRefs={ruleRefs}
								onEdit={(id) => openRuleEditor(id, "display")}
								styles={styles}
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
								<Input
									size="small"
									contentBefore={<SearchRegular />}
									placeholder={`Filter ${enableRules.length} enable rule${enableRules.length !== 1 ? "s" : ""}…`}
									value={enableRulesFilter}
									onChange={(_, d) => setEnableRulesFilter(d.value)}
									style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
								/>
								{enableRulesFilter && (
									<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
										{filteredEnableRules.length} match
										{filteredEnableRules.length !== 1 ? "es" : ""}
									</Text>
								)}
							</div>
							<RulesTable
								rules={filteredEnableRules}
								kind="enable"
								ruleRefs={ruleRefs}
								onEdit={(id) => openRuleEditor(id, "enable")}
								styles={styles}
							/>
						</>
					)}

					{/* ── History ── */}
					{activeBottomTab === "history" && (
						<>
							{history.length > 0 && (
								<div className={styles.toolbar}>
									<Input
										size="small"
										contentBefore={<SearchRegular />}
										placeholder={`Filter ${history.length} entr${history.length !== 1 ? "ies" : "y"}…`}
										value={historyFilter}
										onChange={(_, d) => setHistoryFilter(d.value)}
										style={{ minWidth: 0, flex: 1, maxWidth: 360 }}
									/>
									{historyFilter && (
										<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
											{filteredHistory.length} match{filteredHistory.length !== 1 ? "es" : ""}
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
														style={{ color: tokens.colorBrandForeground1 }}
													/>
												</div>
												<div className={styles.historyContent}>
													<div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
														<Text size={200} weight="semibold">
															{entry.op}
														</Text>
														<Text size={200}>
															— <strong>{entry.target}</strong>
														</Text>
														{entry.detail && (
															<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
																{entry.detail}
															</Text>
														)}
													</div>
													<div
														style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}
													>
														<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
															{resolveHistoryUserName(entry)} ·{" "}
															{new Date(entry.ts).toLocaleTimeString()}
														</Text>
														<Button
															appearance="subtle"
															size="small"
															icon={<BranchCompareRegular />}
															onClick={() => openDiffViewer("history")}
														>
															View diff
														</Button>
														{i < history.length - 1 && (
															<Button
																appearance="subtle"
																size="small"
																icon={<ArrowCounterclockwiseRegular />}
																onClick={() => restore(pastIndex)}
															>
																Revert to here
															</Button>
														)}
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
												const time = new Date(entry.ts).toLocaleTimeString();
												return `${entry.scope} ${time}\n[${entry.level.toUpperCase()}]\n${entry.message}`;
											})
											.join("\n\n");
										void window.toolboxAPI?.utils
											.copyToClipboard(text)
											.catch(() => {
												// Browser fallback when not running inside PPTB host.
												void navigator.clipboard?.writeText(text);
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
									<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
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

type StylesObj = ReturnType<ReturnType<typeof makeStyles>>;

interface RulesTableProps {
	rules: import("@/types/ribbon").EnableRule[] | import("@/types/ribbon").DisplayRule[];
	kind: "enable" | "display";
	ruleRefs: Record<string, number>;
	onEdit: (id: string) => void;
	styles: StylesObj;
}

function RulesTable({ rules, kind, ruleRefs, onEdit, styles }: RulesTableProps) {
	return (
		<table className={styles.table}>
			<thead>
				<tr>
					<th className={styles.th}>Rule</th>
					<th className={styles.th}>Steps</th>
					<th className={styles.th}>Used by</th>
					<th className={styles.th}>Type</th>
					<th className={styles.th}></th>
				</tr>
			</thead>
			<tbody>
				{rules.map((r) => (
					<tr key={r.id}>
						<td className={styles.td}>
							<span
								className={styles.mono}
								onClick={() => onEdit(r.id)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => e.key === "Enter" && onEdit(r.id)}
							>
								{r.id}
							</span>
						</td>
						<td className={styles.td}>
							{r.steps.slice(0, 3).map((s, i) => (
								<span key={i} className={styles.chip}>
									{s.kind.replace(/Rule$/, "")}
								</span>
							))}
							{r.steps.length > 3 && (
								<span className={styles.chip} style={{ color: tokens.colorNeutralForeground3 }}>
									+{r.steps.length - 3}
								</span>
							)}
							{r.steps.length === 0 && (
								<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
									—
								</Text>
							)}
						</td>
						<td className={styles.td}>
							<Badge
								size="small"
								appearance="tint"
								color={ruleRefs[r.id] ? "brand" : "informative"}
							>
								{ruleRefs[r.id] ?? 0} cmd{ruleRefs[r.id] !== 1 ? "s" : ""}
							</Badge>
						</td>
						<td className={styles.td}>
							<Badge
								size="small"
								appearance="outline"
								color={kind === "enable" ? "success" : "informative"}
							>
								{kind}
							</Badge>
						</td>
						<td className={styles.td}>
							<Button appearance="subtle" size="small" onClick={() => onEdit(r.id)}>
								Edit
							</Button>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

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
