import React, { useState, useMemo } from "react";
import {
	makeStyles,
	tokens,
	Dialog,
	DialogSurface,
	DialogBody,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button,
	Input,
	Tab,
	TabList,
	Text,
	Badge,
	Subtitle2,
	Switch,
	Combobox,
	Option,
} from "@fluentui/react-components";
import { DismissRegular, SearchRegular, CloudArrowUpRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import FluentIcon, { fluentIconToSvg } from "@/components/shared/FluentIcon";
import {
	addExistingWebResourceToActiveSolution,
	loadWebResources,
	saveWebResource,
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
	surface: {
		width: "720px",
		maxWidth: "95vw",
		height: "min(580px, 90vh)",
		maxHeight: "90vh",
		overflow: "hidden",
	},
	dialogBody: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		minHeight: 0,
	},
	body: {
		display: "flex",
		flexDirection: "column",
		flex: 1,
		minHeight: 0,
		overflow: "hidden",
		gap: tokens.spacingHorizontalS,
	},
	toolbar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		flexWrap: "wrap",
		flexShrink: 0,
	},
	categoryPicker: {
		minWidth: "180px",
		maxWidth: "220px",
	},
	iconGrid: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
		gap: tokens.spacingHorizontalXS,
		overflowY: "auto",
		flex: 1,
		minHeight: 0,
		padding: tokens.spacingHorizontalXS,
	},
	iconTile: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: "4px",
		padding: tokens.spacingHorizontalXS,
		borderRadius: tokens.borderRadiusMedium,
		border: "1px solid transparent",
		cursor: "pointer",
		minHeight: "64px",
		":hover": {
			backgroundColor: tokens.colorNeutralBackground3,
			border: `1px solid ${tokens.colorNeutralStroke1}`,
		},
	},
	iconTileSelected: {
		backgroundColor: tokens.colorBrandBackground2,
		border: `1px solid ${tokens.colorBrandStroke1}`,
	},
	iconLabel: {
		fontSize: tokens.fontSizeBase100,
		textAlign: "center",
		lineHeight: 1.2,
		wordBreak: "break-word",
		color: tokens.colorNeutralForeground2,
	},
	webResourceList: {
		flex: 1,
		overflowY: "auto",
	},
	webResourceRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		cursor: "pointer",
		borderRadius: tokens.borderRadiusMedium,
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	uploadArea: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: tokens.spacingHorizontalM,
		border: `2px dashed ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		color: tokens.colorNeutralForeground3,
	},
});

type IconPickerTab = "fluent" | "webresource" | "upload";

interface IconPickerModalProps {
	onSelect?: (icon: string, image16: string, image32: string) => void;
}

export const IconPickerModal: React.FC<IconPickerModalProps> = () => {
	const styles = useStyles();
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
		const logs = useRuntimeLogStore.getState();
		setIconError(null);

		// A Fluent icon is a CBS-UI-only React component; a classic ribbon's
		// ModernImage only resolves platform icon names and web resources (#51).
		// So the icon is serialized to SVG and uploaded as a web resource in the
		// active solution (reused if it already exists), and the button points
		// at that. `icon` keeps the Fluent name for the CBS canvas preview only.
		if (!activeSolution || activeSolution.isManaged) {
			setIconError("Select an unmanaged solution first — the icon is added to it as an SVG web resource.");
			return;
		}
		setUploading(true);
		try {
			const wr = await ensureFluentIconWebResource(selectedIcon, variant, publisherPrefix, fluentIconToSvg, {
				busy: { onProgress: (msg) => logs.logInfo("webresource", msg) },
			});
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
			logs.logError("webresource", `Fluent icon "${selectedIcon}" could not be added as a web resource: ${message}`);
			setIconError(`Could not add the icon as a web resource: ${message}`);
		} finally {
			setUploading(false);
		}
	};

	const handleSelectWebResource = async () => {
		if (!webResourcePath || !selectedButtonId || !selectedGroupId) return;
		const logs = useRuntimeLogStore.getState();
		setIconError(null);
		setIconNote(null);
		// An existing web resource must also be in the active solution, or a
		// solution export misses the icon the ribbon references (#61).
		const name = webResourcePath.startsWith("$webresource:")
			? webResourcePath.slice("$webresource:".length).trim()
			: null;
		let note: string | null = null;
		if (name) {
			setUploading(true);
			try {
				const known = webResources.find((wr) => wr.name === name);
				const added = await addExistingWebResourceToActiveSolution(name, known);
				if (added.solutionUniqueName) {
					logs.logInfo("webresource", `Added web resource ${name} to solution ${added.solutionUniqueName}.`);
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
			image16: webResourcePath,
			image32: webResourcePath,
		});
		if (note) {
			// Keep the dialog open so the note is seen; the icon is already applied.
			setIconNote(note);
			return;
		}
		closeIconPicker();
	};

	const handleUploadSvg = async (file: File) => {
		// Same rule as the Fluent tab: the SVG must land in an unmanaged solution,
		// or a ribbon referencing it fails to import elsewhere (#19).
		if (!activeSolution || activeSolution.isManaged) {
			setIconError("Select an unmanaged solution first — the SVG is added to it as a web resource.");
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
			await saveWebResource(name, content, 11, { displayName: file.name });
			setWebResourcePath(`$webresource:${name}`);
			setActiveTab("webresource");
			const rows = await loadWebResources("svg");
			setWebResources(rows);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			useRuntimeLogStore.getState().logError("webresource", `SVG upload failed: ${message}`);
			setIconError(`Upload failed: ${message}`);
		} finally {
			setUploading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(_, d) => !d.open && closeIconPicker()}>
			<DialogSurface className={styles.surface}>
				<DialogBody className={styles.dialogBody}>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<DismissRegular />}
								onClick={closeIconPicker}
								aria-label="Close"
							/>
						}
					>
						<Subtitle2>Choose Icon</Subtitle2>
					</DialogTitle>

					<DialogContent className={styles.body}>
						<TabList
							selectedValue={activeTab}
							onTabSelect={(_, d) => setActiveTab(d.value as IconPickerTab)}
							size="small"
						>
							<Tab value="fluent">Fluent icons</Tab>
							<Tab value="webresource">Web resources</Tab>
							<Tab value="upload">Upload SVG</Tab>
						</TabList>

						{activeTab === "fluent" && (
							<>
								<div className={styles.toolbar}>
									<Input
										contentBefore={<SearchRegular />}
										placeholder="Search icons…"
										value={search}
										onChange={(_, d) => setSearch(d.value)}
										size="small"
										style={{ flex: 1 }}
									/>
									<Combobox
										className={styles.categoryPicker}
										placeholder="Category"
										value={category}
										onOptionSelect={(_, data) => setCategory(String(data.optionValue ?? "All"))}
									>
										{ALL_CATEGORIES.map((cat) => (
											<Option key={cat} value={cat} text={cat}>
												{cat}
											</Option>
										))}
									</Combobox>
									<Switch
										label={variant === "regular" ? "Regular" : "Filled"}
										checked={variant === "filled"}
										onChange={(_, d) => setVariant(d.checked ? "filled" : "regular")}
									/>
								</div>
								<div className={styles.iconGrid}>
									{filteredIcons.map((icon) => {
										return (
											<div
												key={icon.name}
												className={`${styles.iconTile} ${selectedIcon === icon.name ? styles.iconTileSelected : ""}`}
												onClick={() => setSelectedIcon(icon.name)}
												role="option"
												aria-selected={selectedIcon === icon.name}
												title={`${icon.name} — ${icon.category}`}
											>
												<FluentIcon name={toSnakeCase(icon.name)} size={24} variant={variant} />
												<span className={styles.iconLabel}>{icon.name}</span>
											</div>
										);
									})}
								</div>
								{selectedIcon && (
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: tokens.spacingHorizontalS,
											padding: tokens.spacingHorizontalXS,
											backgroundColor: tokens.colorNeutralBackground3,
											borderRadius: tokens.borderRadiusMedium,
											flexShrink: 0,
										}}
									>
										<Text size={200} style={{ fontFamily: tokens.fontFamilyMonospace }}>
											ModernImage=&quot;$webresource:
											{fluentIconWebResourceName(publisherPrefix || "new", selectedIcon, variant)}&quot;
										</Text>
										<Badge appearance="tint" color="success">
											Selected
										</Badge>
									</div>
								)}
							</>
						)}

						{activeTab === "webresource" && (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: tokens.spacingHorizontalS,
									flex: 1,
								}}
							>
								<Input
									contentBefore={<SearchRegular />}
									placeholder="Search SVG web resources..."
									value={iconSearch}
									onChange={(_, d) => setIconSearch(d.value)}
									size="small"
								/>
								<div className={styles.webResourceList}>
									{loadingWebResources && (
										<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
											Loading web resources...
										</Text>
									)}
									{!loadingWebResources &&
										visibleWebResources.slice(0, 200).map((wr) => {
											const path = `$webresource:${wr.name}`;
											const selected = webResourcePath === path;
											return (
												<div
													key={wr.id}
													className={styles.webResourceRow}
													onClick={() => setWebResourcePath(path)}
													style={{
														backgroundColor: selected ? tokens.colorBrandBackground2 : undefined,
													}}
												>
													<Text size={200} style={{ fontFamily: tokens.fontFamilyMonospace }}>
														{path}
													</Text>
												</div>
											);
										})}
								</div>
								<Input
									placeholder="$webresource:publisher_/icons/…"
									value={webResourcePath}
									onChange={(_, d) => setWebResourcePath(d.value)}
								/>
								<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
									Both image16 and image32 will be set to this path. Use SVG for best results across
									all DPI levels.
								</Text>
							</div>
						)}

						{activeTab === "upload" && (
							<div className={styles.uploadArea}>
								<CloudArrowUpRegular fontSize={48} style={{ opacity: 0.4 }} />
								<Text>Drag an SVG file here, or click to browse</Text>
								<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
									The file will be uploaded as a web resource in the active solution.
								</Text>
								<input
									type="file"
									accept=".svg"
									style={{ display: "none" }}
									id="icon-upload-input"
									onChange={(e) => {
										const file = e.target.files?.[0];
										if (!file) return;
										void handleUploadSvg(file);
									}}
								/>
								<label
									htmlFor="icon-upload-input"
									style={{
										display: "inline-block",
										cursor: "pointer",
										padding: "6px 12px",
										background: tokens.colorBrandBackground,
										color: tokens.colorNeutralForegroundOnBrand,
										borderRadius: tokens.borderRadiusMedium,
										fontSize: tokens.fontSizeBase300,
									}}
								>
									{uploading ? "Uploading..." : "Browse for SVG"}
								</label>
							</div>
						)}
						{iconError && (
							<Text role="alert" size={200} style={{ color: tokens.colorPaletteRedForeground1, flexShrink: 0 }}>
								{iconError}
							</Text>
						)}
						{iconNote && (
							<Text role="status" size={200} style={{ color: tokens.colorPaletteMarigoldForeground1, flexShrink: 0 }}>
								Icon applied. {iconNote}
							</Text>
						)}
					</DialogContent>

					<DialogActions>
						<Button appearance="secondary" onClick={closeIconPicker}>
							Cancel
						</Button>
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
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default IconPickerModal;
