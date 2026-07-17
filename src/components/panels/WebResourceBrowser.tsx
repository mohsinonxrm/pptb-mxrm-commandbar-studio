import React, { useEffect, useMemo, useRef, useState } from "react";
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
	Text,
	Subtitle2,
	Checkbox,
	Select,
	MessageBar,
	MessageBarBody,
	DataGridHeaderCell,
	DataGridCell,
	createTableColumn,
	type TableColumnDefinition,
} from "@fluentui/react-components";
import {
	DataGrid,
	DataGridHeader,
	DataGridBody,
	DataGridRow,
} from "@fluentui-contrib/react-data-grid-react-window";
import {
	DismissRegular,
	SearchRegular,
	ArrowUploadRegular,
	DocumentRegular,
	CodeRegular,
	ImageRegular,
} from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import type { WebResource } from "@/types/webResource";
import { loadWebResources, saveWebResource } from "@/services/dataverse/webResourceService";
import { useSessionStore } from "@/store/sessionStore";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";

const useStyles = makeStyles({
	surface: {
		width: "780px",
		maxWidth: "95vw",
		height: "80vh",
		maxHeight: "80vh",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
		gap: tokens.spacingHorizontalS,
	},
	toolbar: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		flexShrink: 0,
	},
	grid: {
		flex: 1,
		overflow: "hidden",
	},
	gridWrap: {
		height: "100%",
	},
	gridRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		cursor: "pointer",
		borderRadius: tokens.borderRadiusMedium,
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	gridRowSelected: {
		backgroundColor: tokens.colorBrandBackground2,
	},
	gridHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	col1: { width: "24px", flexShrink: 0 },
	col2: { width: "32px", flexShrink: 0 },
	col3: { flex: 1, overflow: "hidden" },
	col4: { width: "60px", flexShrink: 0, textAlign: "right" },
	col5: { width: "100px", flexShrink: 0, color: tokens.colorNeutralForeground3 },
	nameCell: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	descCell: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
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

interface WebResourceBrowserProps {
	onSelect?: (wr: WebResource) => void;
}

export const WebResourceBrowser: React.FC<WebResourceBrowserProps> = ({ onSelect }) => {
	const styles = useStyles();
	const open = useUIStore((s) => s.webResourceBrowserOpen);
	const closeWebResourceBrowser = useUIStore((s) => s.closeWebResourceBrowser);
	const publisherPrefix = useSessionStore((s) => s.publisherPrefix);
	const uploadInputRef = useRef<HTMLInputElement>(null);
	const [webResources, setWebResources] = useState<WebResource[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState("all");
	const [customOnly, setCustomOnly] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);

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

	const columns: TableColumnDefinition<WebResource>[] = [
		createTableColumn<WebResource>({
			columnId: "type",
			renderHeaderCell: () => (
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					Type
				</Text>
			),
			renderCell: (wr) => {
				const ext = getExt(wr.name);
				const icon = TYPE_ICONS[ext] ?? <DocumentRegular />;
				return (
					<div className={styles.col2} style={{ color: tokens.colorNeutralForeground3 }}>
						{icon}
					</div>
				);
			},
		}),
		createTableColumn<WebResource>({
			columnId: "name",
			renderHeaderCell: () => (
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					Name
				</Text>
			),
			renderCell: (wr) => (
				<div className={styles.col3}>
					<div className={styles.nameCell}>
						<Text
							style={{
								fontFamily: tokens.fontFamilyMonospace,
								fontSize: tokens.fontSizeBase200,
							}}
						>
							{wr.name}
						</Text>
					</div>
					{wr.description && <div className={styles.descCell}>{wr.description}</div>}
				</div>
			),
		}),
		createTableColumn<WebResource>({
			columnId: "modified",
			renderHeaderCell: () => (
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					Modified
				</Text>
			),
			renderCell: (wr) => (
				<div className={styles.col5}>
					<Text size={100}>
						{wr.modifiedOn ? new Date(wr.modifiedOn).toLocaleDateString() : "—"}
					</Text>
				</div>
			),
		}),
	];

	useEffect(() => {
		if (!open) return;
		setLoading(true);
		setError(null);
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
		setUploading(true);
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
			await saveWebResource(inferWebResourceName(file), content, typeCode, file.name);
			await reloadResources();
		} finally {
			setUploading(false);
		}
	};

	const handleSelect = () => {
		if (selectedWr) {
			// Invoke any callback registered by the caller (e.g. IdentitySection,
			// CommandEditorPanel) before falling back to the optional onSelect prop.
			webResourceBrowserCallbackRegistry.invoke(selectedWr);
			onSelect?.(selectedWr);
			closeWebResourceBrowser();
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(_, d) => {
				if (!d.open) {
					webResourceBrowserCallbackRegistry.clear();
					closeWebResourceBrowser();
				}
			}}
		>
			<DialogSurface className={styles.surface}>
				<DialogBody style={{ height: "100%" }}>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<DismissRegular />}
								onClick={closeWebResourceBrowser}
								aria-label="Close"
							/>
						}
					>
						<Subtitle2>Web Resource Browser</Subtitle2>
					</DialogTitle>

					<DialogContent className={styles.body}>
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
							<Input
								contentBefore={<SearchRegular />}
								placeholder="Search by name…"
								value={search}
								onChange={(_, d) => setSearch(d.value)}
								size="small"
								style={{ flex: 1 }}
							/>
							<Select
								size="small"
								value={typeFilter}
								onChange={(_, d) => setTypeFilter(d.value)}
								style={{ width: "100px" }}
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

						<div className={styles.grid}>
							{loading && (
								<Text
									style={{
										color: tokens.colorNeutralForeground3,
										padding: tokens.spacingHorizontalM,
									}}
								>
									Loading web resources…
								</Text>
							)}
							{!loading && filtered.length === 0 && (
								<Text
									style={{
										color: tokens.colorNeutralForeground3,
										padding: tokens.spacingHorizontalM,
										textAlign: "center",
									}}
								>
									No web resources found.
								</Text>
							)}
							{!loading && filtered.length > 0 && (
								<DataGrid
									className={styles.gridWrap}
									items={filtered}
									columns={columns}
									getRowId={(item) => item.id}
									focusMode="composite"
									selectionMode="single"
									subtleSelection
									selectedItems={selectedId ? new Set([selectedId]) : new Set()}
									onSelectionChange={(_, data) => {
										const id = [...data.selectedItems][0] as string | undefined;
										setSelectedId(id ?? null);
									}}
								>
									<DataGridHeader>
										<DataGridRow>
											{({ renderHeaderCell }) => (
												<DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
											)}
										</DataGridRow>
									</DataGridHeader>
									<DataGridBody<WebResource>
										itemSize={56}
										height={360}
										listProps={{ width: "100%" }}
									>
										{({ item, rowId }, style) => (
											<DataGridRow<WebResource>
												key={rowId}
												style={style}
												className={`${styles.gridRow} ${item.id === selectedId ? styles.gridRowSelected : ""}`}
												onDoubleClick={() => {
													setSelectedId(item.id);
													webResourceBrowserCallbackRegistry.invoke(item);
													onSelect?.(item);
													closeWebResourceBrowser();
												}}
											>
												{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
											</DataGridRow>
										)}
									</DataGridBody>
								</DataGrid>
							)}
						</div>

						{selectedWr && (
							<div
								style={{
									padding: tokens.spacingHorizontalXS,
									backgroundColor: tokens.colorNeutralBackground3,
									borderRadius: tokens.borderRadiusMedium,
									flexShrink: 0,
								}}
							>
								<Text size={200} style={{ fontFamily: tokens.fontFamilyMonospace }}>
									$webresource:{selectedWr.name}
								</Text>
							</div>
						)}
					</DialogContent>

					<DialogActions>
						<Button
							appearance="subtle"
							icon={<ArrowUploadRegular />}
							disabled={uploading}
							onClick={() => uploadInputRef.current?.click()}
						>
							{uploading ? "Uploading…" : "Upload"}
						</Button>
						<div style={{ flex: 1 }} />
						<Button appearance="secondary" onClick={closeWebResourceBrowser}>
							Cancel
						</Button>
						<Button appearance="primary" disabled={!selectedWr} onClick={handleSelect}>
							Select
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default WebResourceBrowser;
