import { useReplaceWebResourceConfirm } from "@/hooks/useReplaceWebResourceConfirm";
import { webResourceRef } from "@/services/xmlGenerator";
import { writeGuard } from "@/services/hostConnection";
import React, { useState, useMemo, useRef } from "react";
import {
	makeStyles,
	mergeClasses,
	tokens,
	Button,
	Caption1,
	Dropdown,
	Field,
	Input,
	MessageBar,
	MessageBarBody,
	Option,
	SearchBox,
	Spinner,
	Tab,
	TabList,
	Text,
	ToggleButton,
	Tooltip,
	useArrowNavigationGroup,
} from "@fluentui/react-components";
import { CloudArrowUpRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import FluentIcon, { fluentIconToSvg } from "@/components/shared/FluentIcon";
import { AppDialog } from "@/components/shared/AppDialog";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import {
	addExistingWebResourceToActiveSolution,
	loadWebResources,
	saveWebResource,
	WebResourceSaveCancelled,
} from "@/services/dataverse/webResourceService";
import { ensureFluentIconWebResource } from "@/services/iconWebResource";
import { fluentIconWebResourceName, toSnakeCase } from "@/utils/iconWebResourceName";
import type { WebResource } from "@/types/webResource";

const CATEGORY_HINTS: Array<{ category: string; keywords: string[] }> = [
	{
		category: "Actions",
		keywords: [
			"Add",
			"Delete",
			"Edit",
			"Save",
			"Copy",
			"Paste",
			"Undo",
			"Redo",
			"Send",
			"Print",
			"Refresh",
		],
	},
	{ category: "Communication", keywords: ["Mail", "Chat", "Phone", "Call", "Message"] },
	{
		category: "Navigation",
		keywords: ["Arrow", "Chevron", "Navigation", "Home", "Back", "Forward"],
	},
	{
		category: "System",
		keywords: ["Settings", "Info", "Warning", "Dismiss", "Question", "Checkmark", "Error"],
	},
	{ category: "Security", keywords: ["Lock", "Shield", "Key", "Fingerprint"] },
	{ category: "People", keywords: ["Person", "People", "Contact", "User"] },
	{
		category: "Business",
		keywords: ["Building", "Briefcase", "Money", "Credit", "Cart", "Tag", "Receipt"],
	},
	{ category: "Files", keywords: ["Document", "Folder", "Attach", "Upload", "Download", "File"] },
	{ category: "Web", keywords: ["Globe", "Link", "Open", "Browser", "World"] },
	{ category: "Time", keywords: ["Calendar", "Clock", "Timer", "History"] },
	{ category: "Rating", keywords: ["Star", "Heart", "Thumb"] },
	{ category: "View", keywords: ["Eye", "Zoom", "View", "Window", "Preview"] },
	{ category: "Layout", keywords: ["Grid", "List", "Table", "Panel", "Column", "Row"] },
	{ category: "Development", keywords: ["Code", "Bug", "Branch", "Wrench", "Tool", "Terminal"] },
	{ category: "Media", keywords: ["Play", "Pause", "Stop", "Video", "Audio", "Camera"] },
	{ category: "Analytics", keywords: ["Chart", "Data", "Poll", "Graph", "Trend"] },
];

const FLUENT_ICON_NAMES = [
	"Add",
	"Delete",
	"Edit",
	"Save",
	"Copy",
	"Cut",
	"ClipboardPaste",
	"Share",
	"Mail",
	"Chat",
	"Phone",
	"Search",
	"Filter",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
	"ChevronDown",
	"ChevronUp",
	"Navigation",
	"Home",
	"Settings",
	"Info",
	"Warning",
	"Checkmark",
	"Dismiss",
	"QuestionCircle",
	"LockClosed",
	"LockOpen",
	"Shield",
	"Person",
	"People",
	"PersonAdd",
	"Building",
	"Briefcase",
	"Money",
	"CreditCard",
	"Cart",
	"Tag",
	"Document",
	"DocumentBulletList",
	"Folder",
	"FolderOpen",
	"Attach",
	"ArrowDownload",
	"ArrowUpload",
	"Globe",
	"Link",
	"Open",
	"Calendar",
	"Clock",
	"Timer",
	"Star",
	"Heart",
	"ThumbLike",
	"ThumbDislike",
	"Eye",
	"EyeOff",
	"ZoomIn",
	"ZoomOut",
	"Maximize",
	"Minimize",
	"Grid",
	"List",
	"Table",
	"TableSimple",
	"Code",
	"Bug",
	"Play",
	"Pause",
	"Stop",
	"Refresh",
	"ArrowSync",
	"ArrowUndo",
	"ArrowRedo",
	"Printer",
	"Send",
	"Rocket",
	"Sparkle",
	"Trophy",
	"Lightbulb",
	"Bot",
	"DataBar",
	"ChartMultiple",
	"Poll",
] as const;

function classifyIconCategory(name: string): string {
	for (const hint of CATEGORY_HINTS) {
		if (hint.keywords.some((keyword) => name.includes(keyword))) {
			return hint.category;
		}
	}
	return "General";
}

const FLUENT_ICON_CATALOGUE: { name: string; category: string }[] = FLUENT_ICON_NAMES.map(
	(name) => ({
		name,
		category: classifyIconCategory(name),
	}),
);

const ALL_CATEGORIES = [
	"All",
	...Array.from(new Set(FLUENT_ICON_CATALOGUE.map((i) => i.category))).sort(),
];

const useStyles = makeStyles({
	// The dialog's content is one column the active tab fills (#187).
	content: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		height: "min(560px, calc(100vh - 240px))",
		minHeight: "320px",
		overflowY: "hidden",
	},
	toolbar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		flexWrap: "wrap",
		flexShrink: 0,
	},
	search: { flex: "1 1 220px", minWidth: 0 },
	category: { minWidth: "160px" },
	variant: { display: "flex", gap: tokens.spacingHorizontalXS },
	iconGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
		gap: tokens.spacingHorizontalXS,
		overflowY: "auto",
		flex: 1,
		minHeight: 0,
		padding: tokens.spacingHorizontalXXS,
	},
	iconTile: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: tokens.spacingVerticalXS,
		minHeight: "72px",
		height: "auto",
		padding: tokens.spacingVerticalS,
		fontWeight: tokens.fontWeightRegular,
	},
	iconTileSelected: {
		backgroundColor: tokens.colorBrandBackground2,
		border: `1px solid ${tokens.colorBrandStroke1}`,
	},
	iconLabel: {
		fontSize: tokens.fontSizeBase200,
		textAlign: "center",
		lineHeight: tokens.lineHeightBase200,
		overflowWrap: "anywhere",
	},
	muted: { color: tokens.colorNeutralForeground3 },
	selection: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		backgroundColor: tokens.colorNeutralBackground3,
		borderRadius: tokens.borderRadiusMedium,
		flexShrink: 0,
		minWidth: 0,
	},
	selectionText: { minWidth: 0, display: "flex", flexDirection: "column" },
	resourceList: {
		listStyleType: "none",
		margin: 0,
		padding: tokens.spacingHorizontalXXS,
		flex: 1,
		minHeight: 0,
		overflowY: "auto",
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
	},
	resourceRow: {
		width: "100%",
		justifyContent: "flex-start",
		fontFamily: tokens.fontFamilyMonospace,
		fontWeight: tokens.fontWeightRegular,
		fontSize: tokens.fontSizeBase200,
		textAlign: "start",
		overflowWrap: "anywhere",
	},
	dropZone: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: tokens.spacingVerticalM,
		padding: tokens.spacingVerticalL,
		textAlign: "center",
		border: `2px dashed ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		color: tokens.colorNeutralForeground3,
	},
	dropZoneActive: {
		border: `2px dashed ${tokens.colorBrandStroke1}`,
		backgroundColor: tokens.colorBrandBackground2,
	},
});

type IconPickerTab = "fluent" | "webresource" | "upload";

/** Web resource rows shown at once; the count says when search should narrow it (#187). */
const VISIBLE_WEB_RESOURCES = 300;

/**
 * Choose an icon for the selected button (#187): a Fluent icon (uploaded as an
 * SVG web resource), an SVG web resource, or an uploaded SVG. Using an icon
 * writes to Dataverse, so it's an explicit choice, not applied as you click.
 */
export const IconPickerModal: React.FC = () => {
	const styles = useStyles();
	// An SVG upload never replaces an existing web resource without asking (#121).
	const replaceConfirm = useReplaceWebResourceConfirm();
	const open = useUIStore((s) => s.iconPickerOpen);
	const closeIconPicker = useUIStore((s) => s.closeIconPicker);
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const tabId = useSelectionStore((s) => s.tabId);
	const location = useSelectionStore((s) => s.location);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const [iconError, setIconError] = useState<string | null>(null);
	/** Non-blocking note shown after the icon was applied (e.g. not added to a solution). */
	const [iconNote, setIconNote] = useState<string | null>(null);

	const [activeTab, setActiveTab] = useState<IconPickerTab>("fluent");
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("All");
	const [variant, setVariant] = useState<"regular" | "filled">("regular");
	const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
	const [webResourcePath, setWebResourcePath] = useState("");
	const [webResources, setWebResources] = useState<WebResource[]>([]);
	const [loadingWebResources, setLoadingWebResources] = useState(false);
	const [iconSearch, setIconSearch] = useState("");
	const [uploading, setUploading] = useState(false);
	const [dragging, setDragging] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	// Arrow keys move between the icons and the rows (#187): Tab enters and leaves once.
	const gridNavigation = useArrowNavigationGroup({ axis: "grid-linear" });
	const listNavigation = useArrowNavigationGroup({ axis: "vertical" });

	React.useEffect(() => {
		if (!open) {
			setIconError(null);
			setIconNote(null);
		}
	}, [open]);

	React.useEffect(() => {
		if (!open || activeTab !== "webresource") return;
		setLoadingWebResources(true);
		void loadWebResources("svg")
			.then((rows) => setWebResources(rows))
			.catch(() => setWebResources([]))
			.finally(() => setLoadingWebResources(false));
	}, [open, activeTab]);

	const visibleWebResources = useMemo(() => {
		const q = iconSearch.toLowerCase();
		return webResources.filter((wr) => !q || wr.name.toLowerCase().includes(q));
	}, [iconSearch, webResources]);

	const filteredIcons = useMemo(() => {
		const q = search.toLowerCase();
		return FLUENT_ICON_CATALOGUE.filter(
			(icon) =>
				(category === "All" || icon.category === category) &&
				(q === "" || icon.name.toLowerCase().includes(q)),
		);
	}, [search, category]);

	const handleSelectFluentIcon = async () => {
		if (!selectedIcon || !selectedButtonId || !selectedGroupId) return;
		// Bound now (#120): the icon is saved to the connection it was picked on.
		const guard = writeGuard();
		const logs = useRuntimeLogStore.getState();
		setIconError(null);

		// A Fluent icon is a CBS-UI-only React component; a classic ribbon's
		// ModernImage only resolves platform icon names and web resources (#51).
		// So the icon is serialized to SVG and uploaded as a web resource in the
		// active solution (reused if it already exists), and the button points
		// at that. `icon` keeps the Fluent name for the CBS canvas preview only.
		if (!activeSolution || activeSolution.isManaged) {
			setIconError(
				"Select an unmanaged solution first — the icon is added to it as an SVG web resource.",
			);
			return;
		}
		setUploading(true);
		try {
			const wr = await ensureFluentIconWebResource(
				selectedIcon,
				variant,
				publisherPrefix,
				fluentIconToSvg,
				{
					busy: { onProgress: (msg) => logs.logInfo("webresource", msg) },
					guard,
				},
			);
			if (wr.publishError) {
				logs.logWarn(
					"webresource",
					`Publishing icon web resource ${wr.name} failed: ${wr.publishError}. Pick the icon again or publish customizations before using the button.`,
				);
			}
			setButtonProp(location, tabId, selectedGroupId, selectedButtonId, {
				icon: toSnakeCase(selectedIcon),
				image16: `$webresource:${wr.name}`,
				image32: `$webresource:${wr.name}`,
			});
			logs.logInfo(
				"webresource",
				`${wr.created ? "Uploaded" : "Reusing"} icon web resource ${wr.name} (solution ${activeSolution.uniqueName}).`,
			);
			closeIconPicker();
		} catch (err) {
			// Leave the button unchanged: a Fluent name alone would never be
			// published (the classic ribbon can't resolve it).
			const message = err instanceof Error ? err.message : String(err);
			logs.logError(
				"webresource",
				`Fluent icon "${selectedIcon}" could not be added as a web resource: ${message}`,
			);
			setIconError(`Could not add the icon as a web resource: ${message}`);
		} finally {
			setUploading(false);
		}
	};

	const handleSelectWebResource = async () => {
		if (!webResourcePath || !selectedButtonId || !selectedGroupId) return;
		// Always with the `$webresource:` directive (#158): a typed bare name or
		// /WebResources/ path made no solution dependency and lost the icon.
		const path = webResourceRef(webResourcePath);
		const guard = writeGuard();
		const logs = useRuntimeLogStore.getState();
		setIconError(null);
		setIconNote(null);
		// An existing web resource must also be in the active solution, or a
		// solution export misses the icon the ribbon references (#61).
		const name = path.startsWith("$webresource:")
			? path.slice("$webresource:".length).trim()
			: null;
		let note: string | null = null;
		if (name) {
			setUploading(true);
			try {
				const known = webResources.find((wr) => wr.name === name);
				const added = await addExistingWebResourceToActiveSolution(name, known, guard);
				if (added.solutionUniqueName) {
					logs.logInfo(
						"webresource",
						`Added web resource ${name} to solution ${added.solutionUniqueName}.`,
					);
				}
				note = added.solutionWarning ?? null;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (/^No web resource named /.test(message)) {
					// A typo: the ribbon would reference a web resource that doesn't exist.
					setIconError(message);
					return;
				}
				// The icon is still valid; only the solution membership failed.
				note = `The icon was set, but ${name} could not be added to the solution: ${message}`;
				logs.logError("webresource", note);
			} finally {
				setUploading(false);
			}
		}
		setButtonProp(location, tabId, selectedGroupId, selectedButtonId, {
			image16: path,
			image32: path,
		});
		if (note) {
			// Keep the dialog open so the note is seen; the icon is already applied.
			setIconNote(note);
			return;
		}
		closeIconPicker();
	};

	const handleUploadSvg = async (file: File) => {
		const guard = writeGuard();
		// Same rule as the Fluent tab: the SVG must land in an unmanaged solution,
		// or a ribbon referencing it fails to import elsewhere (#19).
		if (!activeSolution || activeSolution.isManaged) {
			setIconError(
				"Select an unmanaged solution first — the SVG is added to it as a web resource.",
			);
			return;
		}
		setIconError(null);
		setUploading(true);
		try {
			const content = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(reader.error ?? new Error("Failed to read SVG"));
				reader.onload = () => {
					const val = String(reader.result ?? "");
					resolve(val.includes(",") ? (val.split(",")[1] ?? "") : val);
				};
				reader.readAsDataURL(file);
			});
			const name = `${publisherPrefix || "new"}_/icons/${file.name}`;
			const saved = await saveWebResource(name, content, 11, {
				displayName: file.name,
				guard,
				onExisting: replaceConfirm.onExisting,
			});
			// Shown here too, not only in the Console (#156 review).
			setIconNote(
				[saved.solutionWarning, saved.publishWarning].filter(Boolean).join(" ") || null,
			);
			setWebResourcePath(`$webresource:${name}`);
			setActiveTab("webresource");
			const rows = await loadWebResources("svg");
			setWebResources(rows);
		} catch (err) {
			if (err instanceof WebResourceSaveCancelled) return;
			const message = err instanceof Error ? err.message : String(err);
			useRuntimeLogStore.getState().logError("webresource", `SVG upload failed: ${message}`);
			setIconError(`Upload failed: ${message}`);
		} finally {
			setUploading(false);
		}
	};

	const uploadFile = (file: File | undefined) => {
		if (!file) return;
		if (!/\.svg$/i.test(file.name)) {
			setIconError(`${file.name} isn't an SVG file.`);
			return;
		}
		void handleUploadSvg(file);
	};

	const selectedWebResource = webResourcePath.startsWith("$webresource:")
		? webResourcePath.slice("$webresource:".length)
		: webResourcePath;

	return (
		<>
			{replaceConfirm.dialog}
			<AppDialog
				open={open}
				onOpenChange={(o) => !o && closeIconPicker()}
				title="Choose an icon"
				size="large"
				contentClassName={styles.content}
				startActions={<EnvironmentBadge prefix="Saves to" />}
				actions={
					<>
						<Button onClick={closeIconPicker}>Cancel</Button>
						{activeTab === "fluent" && (
							<Button
								appearance="primary"
								disabled={!selectedIcon || uploading}
								onClick={() => void handleSelectFluentIcon()}
							>
								{uploading ? "Adding icon…" : `Use ${selectedIcon ?? "icon"}`}
							</Button>
						)}
						{activeTab === "webresource" && (
							<Button
								appearance="primary"
								disabled={!webResourcePath || uploading}
								onClick={() => void handleSelectWebResource()}
							>
								{uploading ? "Adding icon…" : "Use web resource"}
							</Button>
						)}
					</>
				}
			>
				<TabList
					selectedValue={activeTab}
					onTabSelect={(_, d) => setActiveTab(d.value as IconPickerTab)}
				>
					<Tab value="fluent">Fluent icons</Tab>
					<Tab value="webresource">Web resources</Tab>
					<Tab value="upload">Upload SVG</Tab>
				</TabList>

				{iconError && (
					<MessageBar intent="error">
						<MessageBarBody>{iconError}</MessageBarBody>
					</MessageBar>
				)}
				{iconNote && (
					<MessageBar intent="warning">
						<MessageBarBody>Icon applied. {iconNote}</MessageBarBody>
					</MessageBar>
				)}

				{activeTab === "fluent" && (
					<>
						<div className={styles.toolbar}>
							<SearchBox
								className={styles.search}
								placeholder="Search icons"
								aria-label="Search icons"
								value={search}
								onChange={(_, d) => setSearch(d.value)}
							/>
							<Dropdown
								className={styles.category}
								aria-label="Category"
								value={category === "All" ? "All categories" : category}
								selectedOptions={[category]}
								onOptionSelect={(_, d) =>
									setCategory(String(d.optionValue ?? "All"))
								}
							>
								{ALL_CATEGORIES.map((cat) => (
									<Option
										key={cat}
										value={cat}
										text={cat === "All" ? "All categories" : cat}
									>
										{cat === "All" ? "All categories" : cat}
									</Option>
								))}
							</Dropdown>
							{/* Two toggles, so the labels don't change with the state (#187). */}
							<div className={styles.variant} role="group" aria-label="Icon style">
								<ToggleButton
									checked={variant === "regular"}
									onClick={() => setVariant("regular")}
								>
									Regular
								</ToggleButton>
								<ToggleButton
									checked={variant === "filled"}
									onClick={() => setVariant("filled")}
								>
									Filled
								</ToggleButton>
							</div>
						</div>
						<div
							className={styles.iconGrid}
							role="group"
							aria-label={`${filteredIcons.length} icons`}
							{...gridNavigation}
						>
							{filteredIcons.map((icon) => {
								const selected = selectedIcon === icon.name;
								return (
									<Tooltip
										key={icon.name}
										content={`${icon.name} · ${icon.category}`}
										relationship="description"
									>
										<Button
											appearance="subtle"
											aria-pressed={selected}
											className={mergeClasses(
												styles.iconTile,
												selected && styles.iconTileSelected,
											)}
											onClick={() => setSelectedIcon(icon.name)}
										>
											<FluentIcon
												name={toSnakeCase(icon.name)}
												size={24}
												variant={variant}
											/>
											<span className={styles.iconLabel}>{icon.name}</span>
										</Button>
									</Tooltip>
								);
							})}
							{filteredIcons.length === 0 && (
								<Text className={styles.muted}>No icon matches.</Text>
							)}
						</div>
						{selectedIcon && (
							<div className={styles.selection} role="status">
								<FluentIcon
									name={toSnakeCase(selectedIcon)}
									size={24}
									variant={variant}
								/>
								<span className={styles.selectionText}>
									<Text weight="semibold">
										{selectedIcon} ·{" "}
										{variant === "regular" ? "Regular" : "Filled"}
									</Text>
									<Caption1 className={styles.muted}>
										Added to your solution as{" "}
										{fluentIconWebResourceName(
											publisherPrefix || "new",
											selectedIcon,
											variant,
										)}
									</Caption1>
								</span>
							</div>
						)}
					</>
				)}

				{activeTab === "webresource" && (
					<>
						<SearchBox
							placeholder="Search SVG web resources"
							aria-label="Search SVG web resources"
							value={iconSearch}
							onChange={(_, d) => setIconSearch(d.value)}
						/>
						{loadingWebResources ? (
							<Spinner size="small" label="Loading web resources…" />
						) : (
							<>
								<Caption1 className={styles.muted} role="status">
									{visibleWebResources.length > VISIBLE_WEB_RESOURCES
										? `Showing ${VISIBLE_WEB_RESOURCES} of ${visibleWebResources.length.toLocaleString()} SVG web resources. Search to find others.`
										: visibleWebResources.length === webResources.length
											? `${webResources.length.toLocaleString()} SVG web resources`
											: `${visibleWebResources.length} of ${webResources.length.toLocaleString()} SVG web resources`}
								</Caption1>
								<ul
									className={styles.resourceList}
									aria-label="SVG web resources"
									{...listNavigation}
								>
									{visibleWebResources
										.slice(0, VISIBLE_WEB_RESOURCES)
										.map((wr) => {
											const path = `$webresource:${wr.name}`;
											const selected = webResourcePath === path;
											return (
												<li key={wr.id}>
													<Button
														appearance="subtle"
														aria-pressed={selected}
														className={mergeClasses(
															styles.resourceRow,
															selected && styles.iconTileSelected,
														)}
														onClick={() => setWebResourcePath(path)}
													>
														{wr.name}
													</Button>
												</li>
											);
										})}
								</ul>
							</>
						)}
						<Field
							label="Web resource"
							hint="Image16 and Image32 are both set to it. SVG works at every size."
						>
							<Input
								placeholder="publisher_/icons/icon.svg"
								value={selectedWebResource}
								onChange={(_, d) =>
									setWebResourcePath(d.value ? webResourceRef(d.value) : "")
								}
							/>
						</Field>
					</>
				)}

				{activeTab === "upload" && (
					<div
						className={mergeClasses(styles.dropZone, dragging && styles.dropZoneActive)}
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={(e) => {
							e.preventDefault();
							setDragging(false);
							uploadFile(e.dataTransfer.files?.[0]);
						}}
					>
						<CloudArrowUpRegular fontSize={48} />
						<Text>Drop an SVG file here</Text>
						<Caption1>
							It&apos;s uploaded as a web resource in your solution, then listed under
							Web resources to use.
						</Caption1>
						<input
							ref={fileInput}
							type="file"
							accept=".svg"
							hidden
							disabled={uploading}
							onChange={(e) => {
								const file = e.target.files?.[0];
								// The same file can be picked again (e.g. after Cancel).
								e.target.value = "";
								uploadFile(file);
							}}
						/>
						<Button
							appearance="primary"
							disabled={uploading}
							onClick={() => fileInput.current?.click()}
						>
							{uploading ? "Uploading…" : "Choose SVG…"}
						</Button>
					</div>
				)}
			</AppDialog>
		</>
	);
};

export default IconPickerModal;
