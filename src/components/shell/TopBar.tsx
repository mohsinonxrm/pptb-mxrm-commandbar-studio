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
	useComboboxFilter,
} from "@fluentui/react-components";
import type { ComboboxProps } from "@fluentui/react-components";
import type { Solution } from "@/types/solution";
import {
	ArrowUndoRegular,
	ArrowRedoRegular,
	ArrowSwapRegular,
	QuestionCircleRegular,
	CloudArrowUpRegular,
	SearchRegular,
	DatabaseRegular,
	ChevronDownRegular,
} from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore } from "@/store/draftStore";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import { copyText } from "@/utils/hostIO";

const useStyles = makeStyles({
	root: {
		height: "40px",
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `0 ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground3,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	brand: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		marginRight: tokens.spacingHorizontalS,
	},
	brandMark: {
		width: "24px",
		height: "24px",
		borderRadius: "4px",
		backgroundColor: tokens.colorBrandBackground,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
	},
	spacer: {
		flex: 1,
	},
	sep: {
		width: "1px",
		height: "20px",
		backgroundColor: tokens.colorNeutralStroke2,
		margin: `0 ${tokens.spacingHorizontalXS}`,
	},
	paletteButton: {
		height: "28px",
		minWidth: "260px",
		"@media (max-width: 1100px)": { minWidth: "120px" },
		overflow: "hidden",
		whiteSpace: "nowrap",
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `0 ${tokens.spacingHorizontalS}`,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground1,
		cursor: "pointer",
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase200,
		"&:hover": {
			border: `1px solid ${tokens.colorNeutralStroke1Hover}`,
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
	kbd: {
		padding: "1px 4px",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: "3px",
		fontSize: tokens.fontSizeBase100,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	/** The brand's text gives way first in a narrow pane (#22). */
	brandTitle: {
		whiteSpace: "nowrap",
		"@media (max-width: 1100px)": { display: "none" },
	},
	solutionTrigger: {
		minWidth: 0,
		flexShrink: 1,
		whiteSpace: "nowrap",
		overflow: "hidden",
	},
	ellipsis: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	solutionPickerSurface: {
		padding: tokens.spacingHorizontalM,
		minWidth: "360px",
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	solutionPickerHint: {
		color: tokens.colorNeutralForeground3,
	},
});

export function TopBar() {
	const styles = useStyles();
	const past = useRibbonStore((s) => s.past);
	const future = useRibbonStore((s) => s.future);
	const undo = useRibbonStore((s) => s.undo);
	const redo = useRibbonStore((s) => s.redo);
	const solutions = useSessionStore((s) => s.solutions);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const requestSolutionSwitch = useDraftStore((s) => s.requestSolutionSwitch);
	const openBulkPublish = useUIStore((s) => s.openBulkPublish);
	const openXmlDrawer = useUIStore((s) => s.openXmlDrawer);
	const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

	// Solution-picker UI state
	const [pickerOpen, setPickerOpen] = useState(false);
	const [query, setQuery] = useState("");

	// Managed solutions can never be modified by a tool — ribbon customizations
	// can only flow through the user's *unmanaged* solution layer at publish
	// time. So we hard-filter to unmanaged here and don't surface the option.
	type ComboSolutionOption = {
		children: React.ReactNode;
		value: string;
		searchText: string;
		solution: Solution;
	};

	const comboOptions: ComboSolutionOption[] = useMemo(() => {
		return solutions
			.filter((s) => !s.isManaged)
			.map((sol) => ({
				value: sol.id,
				// `children` is what useComboboxFilter renders when it has no
				// `renderOption`; we provide a renderOption below so this
				// fallback is only used by screen readers / option text.
				children: sol.friendlyName || sol.uniqueName,
				// Custom search text — friendly + unique names both searchable.
				searchText: `${sol.friendlyName ?? ""} ${sol.uniqueName ?? ""}`.toLowerCase(),
				solution: sol,
			}));
	}, [solutions]);

	const filteredChildren = useComboboxFilter(query, comboOptions, {
		// Search across friendly + unique name (case-insensitive contains).
		optionToText: (o) => o.searchText,
		filter: (optionText, q) => optionText.includes(q.toLowerCase()),
		optionToReactKey: (o) => o.value,
		renderOption: (o) => (
			<Option
				key={o.value}
				value={o.value}
				text={o.solution.friendlyName ?? o.solution.uniqueName}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
					<Text size={200} weight="semibold">
						{o.solution.friendlyName || o.solution.uniqueName}
					</Text>
					<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
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

	return (
		<header className={styles.root}>
			<div className={styles.brand}>
				<div className={styles.brandMark}>
					<Text size={100} weight="bold" style={{ color: "white", lineHeight: 1 }}>
						CBS
					</Text>
				</div>
				<Text weight="semibold" size={300} className={styles.brandTitle}>
					Command Bar Studio
				</Text>
			</div>

			<div className={styles.sep} />

			{/* The environment every write goes to (#121) */}
			<EnvironmentBadge />

			<div className={styles.sep} />

			{/* Solution picker */}
			<Popover
				open={pickerOpen}
				onOpenChange={(_, d) => setPickerOpen(d.open)}
				positioning="below-start"
				trapFocus
			>
				<PopoverTrigger disableButtonEnhancement>
					<Button
						appearance={activeSolution ? "subtle" : "primary"}
						size="small"
						icon={<DatabaseRegular />}
						iconPosition="before"
						aria-label="Select solution"
						className={styles.solutionTrigger}
						title={activeSolution?.friendlyName}
					>
						<Text size={200}>Solution:&nbsp;</Text>
						<Text size={200} weight="semibold" className={styles.ellipsis}>
							{activeSolution?.friendlyName ?? "Select solution…"}
						</Text>
						{activeSolution && (
							<>
								<Badge
									appearance="tint"
									color={activeSolution.isManaged ? "informative" : "success"}
									size="small"
									style={{
										marginLeft: tokens.spacingHorizontalXS,
										flexShrink: 0,
									}}
								>
									{activeSolution.isManaged ? "Managed" : "Unmanaged"}
								</Badge>
								{/* Publisher-prefix chip — exposes what publisher this
								    solution imports under, so the user sees at a glance
								    whether it's their custom publisher or the org's
								    default. Highlighted yellow when the default
								    publisher is in use (i.e. their IDs will be prefixed
								    "new_" rather than their custom prefix). */}
								{(() => {
									const prefix = activeSolution.publisherPrefix || "new";
									const isDefault =
										prefix === "new" ||
										/^defaultpublisher/i.test(
											activeSolution.publisherUniqueName ?? "",
										);
									return (
										<Badge
											appearance="tint"
											color={isDefault ? "warning" : "informative"}
											size="small"
											title={
												isDefault
													? `Imports will land under the org's default publisher "${prefix}". To use your own publisher, create a new solution in maker.powerapps.com bound to it.`
													: `Publisher: ${activeSolution.publisherName || activeSolution.publisherUniqueName || prefix}`
											}
											style={{
												marginLeft: tokens.spacingHorizontalXS,
												flexShrink: 0,
											}}
										>
											{prefix}_
										</Badge>
									);
								})()}
							</>
						)}
						<ChevronDownRegular
							fontSize={12}
							style={{
								marginLeft: tokens.spacingHorizontalXS,
								color: tokens.colorNeutralForeground3,
							}}
						/>
					</Button>
				</PopoverTrigger>
				<PopoverSurface className={styles.solutionPickerSurface}>
					<Text size={200} weight="semibold">
						Select an unmanaged solution
					</Text>
					<Field label="Solution">
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
					<Text size={100} className={styles.solutionPickerHint}>
						{comboOptions.length} unmanaged solution
						{comboOptions.length !== 1 ? "s" : ""} available
					</Text>
				</PopoverSurface>
			</Popover>

			<div className={styles.spacer} />

			{/* Command palette trigger */}
			<button
				type="button"
				className={styles.paletteButton}
				onClick={() => setCommandPaletteOpen(true)}
				aria-label="Search buttons, commands, rules (Ctrl+K)"
			>
				<SearchRegular fontSize={14} />
				<span className={styles.ellipsis} style={{ flex: 1, textAlign: "left" }}>
					Search buttons, commands, rules…
				</span>
				<kbd className={styles.kbd}>Ctrl</kbd>
				<kbd className={styles.kbd}>K</kbd>
			</button>

			<div className={styles.sep} />

			{/* Undo / Redo */}
			<Button
				appearance="subtle"
				size="small"
				icon={<ArrowUndoRegular />}
				disabled={past.length === 0}
				onClick={undo}
				title="Undo (Ctrl+Z)"
				aria-label="Undo"
			/>
			<Button
				appearance="subtle"
				size="small"
				icon={<ArrowRedoRegular />}
				disabled={future.length === 0}
				onClick={redo}
				title="Redo (Ctrl+Shift+Z)"
				aria-label="Redo"
			/>

			<div className={styles.sep} />

			{/* Import/Export */}
			<Button
				appearance="subtle"
				size="small"
				icon={<ArrowSwapRegular />}
				onClick={() => {
					openXmlDrawer();
				}}
				title="Import / Export RibbonDiffXml"
				aria-label="Import/Export"
			/>
			<HelpButton />

			<div className={styles.sep} />

			<Button
				appearance="primary"
				size="small"
				icon={<CloudArrowUpRegular />}
				onClick={openBulkPublish}
			>
				Publish All
			</Button>
		</header>
	);
}

const DOCS_URL = "https://github.com/mohsinonxrm/pptb-mxrm-commandbar-studio#readme";

/**
 * Help (#22): what the old Save / Settings buttons promised and didn't do.
 * Changes are kept as a draft automatically (#16); PPTB has no way to open a
 * link in the browser, so the documentation link is copied.
 */
function HelpButton() {
	const [copied, setCopied] = useState<"" | "yes" | "no">("");
	return (
		<Popover withArrow onOpenChange={() => setCopied("")}>
			<PopoverTrigger disableButtonEnhancement>
				<Button
					appearance="subtle"
					size="small"
					icon={<QuestionCircleRegular />}
					title="Help"
					aria-label="Help"
				/>
			</PopoverTrigger>
			<PopoverSurface aria-label="Help">
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: tokens.spacingVerticalS,
						maxWidth: 320,
					}}
				>
					<Text weight="semibold">Command Bar Studio</Text>
					<Text size={200}>
						Your changes are kept as a draft for each table automatically, until you
						publish or discard them.
					</Text>
					<Text size={200}>
						<strong>Ctrl+K</strong> search · <strong>Ctrl+S</strong> publish ·{" "}
						<strong>Ctrl+Z</strong> / <strong>Ctrl+Y</strong> undo / redo ·{" "}
						<strong>Ctrl+D</strong> duplicate · <strong>Ctrl+X</strong> /{" "}
						<strong>Ctrl+V</strong> move a button
					</Text>
					<Button
						size="small"
						onClick={async () =>
							setCopied((await copyText(DOCS_URL)).ok ? "yes" : "no")
						}
					>
						Copy documentation link
					</Button>
					{copied === "yes" && (
						<Text size={200}>Copied: paste it into your browser.</Text>
					)}
					{copied === "no" && (
						<Text size={200}>Couldn&apos;t copy. The link is {DOCS_URL}</Text>
					)}
				</div>
			</PopoverSurface>
		</Popover>
	);
}
