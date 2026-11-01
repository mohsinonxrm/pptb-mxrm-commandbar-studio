import { writeGuard } from "@/services/hostConnection";
import React, {
	createContext,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	makeStyles,
	mergeClasses,
	tokens,
	Button,
	SearchBox,
	Spinner,
	Text,
	Checkbox,
	Select,
	MessageBar,
	MessageBarBody,
	DataGridHeaderCell,
	DataGridCell,
	TableCellLayout,
	createTableColumn,
	useFocusableGroup,
	type TableColumnDefinition,
	type TableColumnSizingOptions,
} from "@fluentui/react-components";
import {
	DataGrid,
	DataGridHeader,
	DataGridBody,
	DataGridRow,
} from "@fluentui-contrib/react-data-grid-react-window";
import {
	ArrowUploadRegular,
	DocumentRegular,
	CodeRegular,
	ImageRegular,
} from "@fluentui/react-icons";
import { AppDialog } from "@/components/shared/AppDialog";
import { useUIStore } from "@/store/uiStore";
import type { WebResource } from "@/types/webResource";
import {
	loadWebResources,
	saveWebResource,
	WebResourceSaveCancelled,
} from "@/services/dataverse/webResourceService";
import { useReplaceWebResourceConfirm } from "@/hooks/useReplaceWebResourceConfirm";
import { useSessionStore } from "@/store/sessionStore";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";

/**
 * Choose a web resource (a script library, an icon), or upload one. It uses
 * the one dialog shell (#190); the list fills the dialog's height, measured,
 * so it neither leaves a gap nor runs past the actions at any window size
 * (#229).
 */

const useStyles = makeStyles({
	// A fixed height: the list fills what the toolbar and messages leave.
	content: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		height: "min(560px, calc(100vh - 220px))",
		minHeight: "240px",
		overflowY: "hidden",
	},
	toolbar: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalS,
		flexShrink: 0,
	},
	search: { flex: 1, minWidth: "200px" },
	box: { flex: 1, minHeight: 0, overflowX: "auto", overflowY: "hidden" },
	row: { cursor: "pointer" },
	muted: { color: tokens.colorNeutralForeground3 },
	state: { padding: tokens.spacingVerticalL, textAlign: "center" },
	reference: {
		flexShrink: 0,
		overflowWrap: "anywhere",
		fontFamily: tokens.fontFamilyMonospace,
	},
});

const TYPE_ICONS: Record<string, React.ReactElement> = {
	js: <CodeRegular />,
	ts: <CodeRegular />,
	css: <CodeRegular />,
	html: <CodeRegular />,
	svg: <ImageRegular />,
	png: <ImageRegular />,
	gif: <ImageRegular />,
	jpg: <ImageRegular />,
	xml: <DocumentRegular />,
	resx: <DocumentRegular />,
};

function getExt(name: string) {
	return name.split(".").pop()?.toLowerCase() ?? "";
}

const TYPE_OPTIONS: { label: string; value: string }[] = [
	{ label: "All types", value: "all" },
	{ label: ".js", value: "js" },
	{ label: ".html", value: "html" },
	{ label: ".svg", value: "svg" },
	{ label: ".png", value: "png" },
	{ label: ".css", value: "css" },
	{ label: ".xml", value: "xml" },
	{ label: ".resx", value: "resx" },
];

const columns: TableColumnDefinition<WebResource>[] = [
	createTableColumn<WebResource>({
		columnId: "name",
		renderHeaderCell: () => "Name",
		renderCell: (wr) => (
			<TableCellLayout
				truncate
				media={TYPE_ICONS[getExt(wr.name)] ?? <DocumentRegular />}
				description={wr.description || undefined}
			>
				{wr.name}
			</TableCellLayout>
		),
	}),
	createTableColumn<WebResource>({
		columnId: "modified",
		renderHeaderCell: () => "Modified",
		renderCell: (wr) => (
			<TableCellLayout truncate>
				{wr.modifiedOn ? new Date(wr.modifiedOn).toLocaleDateString() : "—"}
			</TableCellLayout>
		),
	}),
];

const SIZING: TableColumnSizingOptions = {
	name: { minWidth: 240, idealWidth: 720 },
	modified: { minWidth: 96, idealWidth: 120 },
};

const ROW_HEIGHT = 52;
/** The grid's header row is about this tall; the rows get the rest of the box. */
const HEADER_HEIGHT = 34;

/** What a row needs, by context: the body's renderer stays the same function (#242 review). */
const RowContext = createContext<{ choose: (wr: WebResource) => void }>({ choose: () => {} });

function ResourceRow({ item, style }: { item: WebResource; style: React.CSSProperties }) {
	const styles = useStyles();
	const { choose } = useContext(RowContext);
	return (
		<DataGridRow<WebResource>
			style={style}
			className={styles.row}
			data-web-resource={item.name}
			onDoubleClick={() => choose(item)}
			onKeyDown={(e: React.KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					choose(item);
				}
			}}
		>
			{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
		</DataGridRow>
	);
}

const renderRow = ({ item }: { item: WebResource }, style: React.CSSProperties) => (
	<ResourceRow item={item} style={style} />
);

interface WebResourceBrowserProps {
	onSelect?: (wr: WebResource) => void;
}

export const WebResourceBrowser: React.FC<WebResourceBrowserProps> = ({ onSelect }) => {
	const styles = useStyles();
	// An upload never replaces an existing web resource without asking (#121).
	const replaceConfirm = useReplaceWebResourceConfirm();
	const open = useUIStore((s) => s.webResourceBrowserOpen);
	const closeWebResourceBrowser = useUIStore((s) => s.closeWebResourceBrowser);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const [webResources, setWebResources] = useState<WebResource[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [warning, setWarning] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState("all");
	const [customOnly, setCustomOnly] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// The list fills its box, measured whenever what's around it changes (the
	// box's height comes from the dialog, not from the list); a resize observer
	// alone doesn't report while the window is hidden. clientHeight, not the
	// bounding box: the dialog opens scaled, and a measure mid-animation left
	// the list short (review).
	const boxRef = useRef<HTMLDivElement>(null);
	const [boxHeight, setBoxHeight] = useState(0);
	const hasReference = selectedId !== null;
	useLayoutEffect(() => {
		setBoxHeight(boxRef.current?.clientHeight ?? 0);
	}, [open, loading, error, warning, hasReference]);
	useEffect(() => {
		const box = boxRef.current;
		if (!box || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) =>
			setBoxHeight(Math.floor(entry.contentRect.height)),
		);
		observer.observe(box);
		return () => observer.disconnect();
	}, [open]);
	// Enter chooses a row: the grid's focus manager would otherwise take it.
	const passEnter = useFocusableGroup({
		tabBehavior: "unlimited",
		ignoreDefaultKeydown: { Enter: true },
	});

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		return webResources.filter((wr) => {
			const ext = getExt(wr.name);
			const matchesSearch =
				q === "" ||
				wr.name.toLowerCase().includes(q) ||
				(wr.description ?? "").toLowerCase().includes(q);
			const matchesType = typeFilter === "all" || ext === typeFilter;
			const matchesCustom = !customOnly || wr.isCustom;
			return matchesSearch && matchesType && matchesCustom;
		});
	}, [webResources, search, typeFilter, customOnly]);

	const selectedWr = filtered.find((wr) => wr.id === selectedId) ?? null;

	useEffect(() => {
		if (!open) return;
		// Each opening starts with no choice: the last one may be another caller's (review).
		setSelectedId(null);
		setLoading(true);
		setError(null);
		setWarning(null);
		loadWebResources()
			.then((rows) => setWebResources(rows))
			.catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
			.finally(() => setLoading(false));
	}, [open]);

	const reloadResources = async () => {
		setLoading(true);
		setError(null);
		try {
			setWebResources(await loadWebResources());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	};

	const encodeFile = (file: File) =>
		new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
			reader.onload = () => {
				const value = String(reader.result ?? "");
				resolve(value.includes(",") ? (value.split(",")[1] ?? "") : value);
			};
			reader.readAsDataURL(file);
		});

	const inferWebResourceName = (file: File) => {
		const ext = getExt(file.name);
		const folder =
			ext === "js" || ext === "css" || ext === "html" || ext === "xml"
				? "scripts"
				: ext === "svg" || ext === "png"
					? "icons"
					: "webresources";
		return `${publisherPrefix || "new"}_/${folder}/${file.name}`;
	};

	const handleUpload = async (file: File) => {
		const guard = writeGuard(); // uploaded to the connection it was picked on (#120)
		setUploading(true);
		setWarning(null);
		try {
			const content = await encodeFile(file);
			const ext = getExt(file.name);
			const typeCode =
				{
					html: 1,
					css: 2,
					js: 3,
					xml: 4,
					png: 5,
					jpg: 6,
					gif: 7,
					xsl: 9,
					ico: 10,
					svg: 11,
					resx: 12,
				}[ext] ?? 4;
			const saved = await saveWebResource(inferWebResourceName(file), content, typeCode, {
				displayName: file.name,
				guard,
				onExisting: replaceConfirm.onExisting,
			});
			await reloadResources();
			setWarning(
				[saved.solutionWarning, saved.publishWarning].filter(Boolean).join(" ") || null,
			);
		} catch (err) {
			if (err instanceof WebResourceSaveCancelled) return;
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
			// Also logged: after a connection change (#120) the browser is closed.
			useRuntimeLogStore
				.getState()
				.logError("webresource", `Upload of ${file.name} failed: ${message}`);
		} finally {
			setUploading(false);
		}
	};

	/** Every way out clears the caller's callback: a choice not made is never delivered later. */
	const close = () => {
		webResourceBrowserCallbackRegistry.clear();
		closeWebResourceBrowser();
	};
	const choose = (wr: WebResource) => {
		// Invoke any callback registered by the caller (e.g. IdentitySection,
		// CommandEditorPanel) before falling back to the optional onSelect prop.
		webResourceBrowserCallbackRegistry.invoke(wr);
		onSelect?.(wr);
		closeWebResourceBrowser();
	};

	const bodyHeight = Math.max(ROW_HEIGHT, boxHeight - HEADER_HEIGHT);

	return (
		<>
			{replaceConfirm.dialog}
			<AppDialog
				open={open}
				onOpenChange={(next) => !next && close()}
				title="Choose a web resource"
				size="large"
				contentClassName={styles.content}
				startActions={
					<>
						<Button
							icon={<ArrowUploadRegular />}
							disabled={uploading}
							onClick={() => uploadInputRef.current?.click()}
						>
							{uploading ? "Uploading…" : "Upload…"}
						</Button>
						<EnvironmentBadge prefix="Uploads to" />
					</>
				}
				actions={
					<>
						<Button appearance="secondary" onClick={close}>
							Cancel
						</Button>
						<Button
							appearance="primary"
							disabled={!selectedWr}
							onClick={() => selectedWr && choose(selectedWr)}
						>
							Select
						</Button>
					</>
				}
			>
				<input
					ref={uploadInputRef}
					type="file"
					accept=".js,.html,.svg,.png,.css,.xml,.resx,.jpg,.gif,.ico,.xsl"
					style={{ display: "none" }}
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.currentTarget.value = "";
						if (file) void handleUpload(file);
					}}
				/>
				<div className={styles.toolbar}>
					<SearchBox
						aria-label="Search the web resources by name"
						placeholder="Search by name…"
						value={search}
						onChange={(_, d) => setSearch(d.value)}
						className={styles.search}
					/>
					<Select
						aria-label="Type"
						value={typeFilter}
						onChange={(_, d) => setTypeFilter(d.value)}
					>
						{TYPE_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</Select>
					<Checkbox
						label="Custom only"
						checked={customOnly}
						onChange={(_, d) => setCustomOnly(d.checked === true)}
					/>
				</div>

				{error && (
					<MessageBar intent="error">
						<MessageBarBody>{error}</MessageBarBody>
					</MessageBar>
				)}
				{warning && (
					<MessageBar intent="warning">
						<MessageBarBody>{warning}</MessageBarBody>
					</MessageBar>
				)}

				<div ref={boxRef} className={styles.box} {...passEnter}>
					{loading ? (
						<Spinner
							className={styles.state}
							size="small"
							label="Loading web resources…"
						/>
					) : filtered.length === 0 ? (
						<Text as="p" className={mergeClasses(styles.state, styles.muted)}>
							{webResources.length === 0
								? "No web resources in this environment."
								: "No web resources match."}
						</Text>
					) : (
						<RowContext.Provider value={{ choose }}>
							<DataGrid
								items={filtered}
								columns={columns}
								columnSizingOptions={SIZING}
								resizableColumns
								getRowId={(item) => item.id}
								focusMode="composite"
								selectionMode="single"
								subtleSelection
								aria-label="Web resources"
								selectedItems={selectedId ? new Set([selectedId]) : new Set()}
								onSelectionChange={(_, data) => {
									const id = [...data.selectedItems][0] as string | undefined;
									setSelectedId(id ?? null);
								}}
							>
								<DataGridHeader>
									<DataGridRow>
										{({ renderHeaderCell }) => (
											<DataGridHeaderCell>
												{renderHeaderCell()}
											</DataGridHeaderCell>
										)}
									</DataGridRow>
								</DataGridHeader>
								<DataGridBody<WebResource>
									itemSize={ROW_HEIGHT}
									height={bodyHeight}
									listProps={{ width: "100%" }}
								>
									{renderRow}
								</DataGridBody>
							</DataGrid>
						</RowContext.Provider>
					)}
				</div>

				{selectedWr && (
					<Text size={200} className={styles.reference}>
						<span className={styles.muted}>Reference: </span>$webresource:
						{selectedWr.name}
					</Text>
				)}
			</AppDialog>
		</>
	);
};

export default WebResourceBrowser;
