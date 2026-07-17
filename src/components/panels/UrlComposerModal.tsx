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
	Field,
	Input,
	Text,
	Subtitle2,
	Switch,
	Select,
} from "@fluentui/react-components";
import { DismissRegular, AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";

const useStyles = makeStyles({
	surface: {
		width: "720px",
		maxWidth: "95vw",
		maxHeight: "84vh",
		height: "84vh",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalM,
		overflowY: "auto",
	},
	paramRow: {
		display: "flex",
		alignItems: "flex-end",
		gap: tokens.spacingHorizontalS,
	},
	urlPreview: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		backgroundColor: tokens.colorNeutralBackground3,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		borderRadius: tokens.borderRadiusMedium,
		wordBreak: "break-all",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	passParamsTable: {
		display: "grid",
		gridTemplateColumns: "120px 1fr",
		gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		fontSize: tokens.fontSizeBase200,
	},
	warnNote: {
		backgroundColor: tokens.colorStatusWarningBackground1,
		borderRadius: tokens.borderRadiusMedium,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		fontSize: tokens.fontSizeBase100,
	},
});

const STANDARD_PARAMS = [
	{ key: "typename", desc: "Logical name of the table" },
	{ key: "type", desc: "Entity type code (integer — may vary between orgs)" },
	{ key: "id", desc: "GUID of the primary record" },
	{ key: "orgname", desc: "Unique organization name" },
	{ key: "userlcid", desc: "User's language LCID" },
	{ key: "orglcid", desc: "Organization's base language LCID" },
];

const OPEN_IN_OPTIONS = [
	{ label: "New tab (Navigate)", value: "0" },
	{ label: "Dialog", value: "1" },
	{ label: "Popup", value: "2" },
];

export const UrlComposerModal: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.urlComposerOpen);
	const closeUrlComposer = useUIStore((s) => s.closeUrlComposer);

	const [baseUrl, setBaseUrl] = useState("https://");
	const [passParams, setPassParams] = useState(false);
	const [winMode, setWinMode] = useState<"0" | "1" | "2">("0");
	const [params, setParams] = useState<{ key: string; value: string }[]>([]);

	const previewUrl = useMemo(() => {
		const parts = [...params]
			.filter((p) => p.key.trim())
			.map((p) => `${encodeURIComponent(p.key)}={${p.value || p.key}}`);
		if (passParams) {
			STANDARD_PARAMS.forEach((sp) => {
				parts.push(`${sp.key}={${sp.key}}`);
			});
		}
		return parts.length > 0 ? `${baseUrl}?${parts.join("&")}` : baseUrl;
	}, [baseUrl, passParams, params]);

	const xmlUrl = useMemo(() => {
		// Escape & → &amp; for XML
		return previewUrl.replace(/&/g, "&amp;");
	}, [previewUrl]);

	const addParam = () => {
		setParams((prev) => [...prev, { key: "", value: "" }]);
	};

	const removeParam = (i: number) => {
		setParams((prev) => prev.filter((_, idx) => idx !== i));
	};

	const updateParam = (i: number, field: "key" | "value", val: string) => {
		setParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)));
	};

	const isValidUrl = baseUrl.startsWith("https://");

	return (
		<Dialog open={open} onOpenChange={(_, d) => !d.open && closeUrlComposer()}>
			<DialogSurface className={styles.surface}>
				<DialogBody style={{ height: "100%" }}>
					<DialogTitle
						action={
							<Button
								appearance="subtle"
								icon={<DismissRegular />}
								onClick={closeUrlComposer}
								aria-label="Close"
							/>
						}
					>
						<Subtitle2>URL Action Composer</Subtitle2>
					</DialogTitle>

					<DialogContent className={styles.body}>
						<Field
							label="Base URL"
							required
							validationState={isValidUrl ? "none" : "error"}
							validationMessage={isValidUrl ? undefined : "URL must start with https://"}
						>
							<Input
								value={baseUrl}
								onChange={(_, d) => setBaseUrl(d.value)}
								placeholder="https://contoso.com/page"
							/>
						</Field>

						<div className={styles.warnNote}>
							⚠ Ampersands in URLs must be escaped as <code>&amp;amp;</code> in XML. CBS handles
							this automatically when generating XML.
						</div>

						<Switch
							label="PassParams — append standard record context parameters"
							checked={passParams}
							onChange={(_, d) => setPassParams(d.checked)}
						/>

						{passParams && (
							<div>
								<Text size={200} weight="semibold">
									Standard PassParams:
								</Text>
								<div className={styles.passParamsTable}>
									{STANDARD_PARAMS.map((sp) => (
										<React.Fragment key={sp.key}>
											<code
												style={{
													fontFamily: tokens.fontFamilyMonospace,
													fontSize: tokens.fontSizeBase200,
												}}
											>
												{sp.key}
											</code>
											<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
												{sp.desc}
											</Text>
										</React.Fragment>
									))}
								</div>
								<Text
									size={100}
									style={{
										color: tokens.colorStatusWarningForeground1,
										marginTop: tokens.spacingVerticalXS,
										display: "block",
									}}
								>
									Note: Use <code>typename</code> instead of <code>type</code> for reliability —
									type codes can differ between environments.
								</Text>
							</div>
						)}

						<div>
							<Text weight="semibold" size={200}>
								Custom query parameters
							</Text>
							<Text
								size={100}
								style={{
									color: tokens.colorNeutralForeground3,
									display: "block",
									marginBottom: tokens.spacingVerticalXS,
								}}
							>
								Each parameter becomes a querystring key=value pair. Use CRM tokens like{" "}
								<code>{"{id}"}</code>.
							</Text>
							{params.map((p, i) => (
								<div
									key={i}
									className={styles.paramRow}
									style={{ marginBottom: tokens.spacingHorizontalXS }}
								>
									<Field label="Key" style={{ flex: 1 }}>
										<Input
											size="small"
											value={p.key}
											onChange={(_, d) => updateParam(i, "key", d.value)}
											placeholder="paramName"
										/>
									</Field>
									<Field label="Value / token" style={{ flex: 1 }}>
										<Input
											size="small"
											value={p.value}
											onChange={(_, d) => updateParam(i, "value", d.value)}
											placeholder="static value or {id}"
										/>
									</Field>
									<Button
										appearance="subtle"
										size="small"
										icon={<DeleteRegular />}
										onClick={() => removeParam(i)}
										aria-label="Remove parameter"
										style={{ marginBottom: "4px" }}
									/>
								</div>
							))}
							<Button appearance="subtle" size="small" icon={<AddRegular />} onClick={addParam}>
								Add parameter
							</Button>
						</div>

						<Field label="Open in">
							<Select value={winMode} onChange={(_, d) => setWinMode(d.value as "0" | "1" | "2")}>
								{OPEN_IN_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</Select>
						</Field>

						<div>
							<Text size={200} weight="semibold" style={{ display: "block", marginBottom: "4px" }}>
								URL preview (tokens shown literally):
							</Text>
							<div className={styles.urlPreview}>{previewUrl}</div>
						</div>

						<div>
							<Text size={200} weight="semibold" style={{ display: "block", marginBottom: "4px" }}>
								XML-encoded URL (<code>&amp;</code> → <code>&amp;amp;</code>):
							</Text>
							<div className={styles.urlPreview}>{xmlUrl}</div>
						</div>
					</DialogContent>

					<DialogActions>
						<Button appearance="secondary" onClick={closeUrlComposer}>
							Cancel
						</Button>
						<Button appearance="primary" disabled={!isValidUrl} onClick={closeUrlComposer}>
							Apply URL
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);
};

export default UrlComposerModal;
