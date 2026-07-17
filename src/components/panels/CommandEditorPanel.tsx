import React, { useEffect, useMemo, useState } from "react";
import {
	makeStyles,
	tokens,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Button,
	Badge,
	Tab,
	TabList,
	Text,
	Divider,
	Field,
	Input,
	Select,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import { DismissRegular, AddRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import type { CommandDefinition, RibbonAction } from "@/types/ribbon";
import CrmParameterEditor from "@/components/shared/CrmParameterEditor";
import { generateRuleId } from "@/utils/idGenerator";
import MonacoEditor from "@/components/shared/MonacoEditor";
import {
	loadWebResourceByName,
	loadWebResourceContent,
	saveWebResource,
} from "@/services/dataverse/webResourceService";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";

const useStyles = makeStyles({
	drawer: {
		width: "640px",
		maxWidth: "90vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: tokens.spacingVerticalM,
		overflowY: "auto",
	},
	actionCard: {
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		padding: tokens.spacingVerticalM,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	actionHeader: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
	},
	row: {
		display: "flex",
		gap: tokens.spacingHorizontalS,
		alignItems: "flex-end",
	},
	ruleRow: {
		display: "inline-flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	ruleRemoveBtn: {
		minWidth: "20px",
		width: "20px",
		height: "20px",
	},
	ruleChip: {
		cursor: "pointer",
	},
	rulePills: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalXS,
	},
	versionsList: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	versionRow: {
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		padding: tokens.spacingVerticalXS,
		display: "flex",
		justifyContent: "space-between",
		gap: tokens.spacingHorizontalS,
	},
	versionMeta: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
	},
	securityNote: {
		fontSize: tokens.fontSizeBase100,
	},
	codePanel: {
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		padding: tokens.spacingVerticalS,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
});

type ActionKind = "javascript" | "url" | "powerFx" | "customApi";

export const CommandEditorPanel: React.FC = () => {
	const styles = useStyles();
	const commandEditorOpen = useUIStore((s) => s.commandEditorOpen);
	const commandEditorId = useUIStore((s) => s.commandEditorId);
	const closeCommandEditor = useUIStore((s) => s.closeCommandEditor);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const openWebResourceBrowser = useUIStore((s) => s.openWebResourceBrowser);

	const commands = useRibbonStore((s) => s.commands);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const renameCommandId = useRibbonStore((s) => s.renameCommandId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const past = useRibbonStore((s) => s.past);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);

	const [activeTab, setActiveTab] = useState<string>("actions");
	const [draftCommandId, setDraftCommandId] = useState("");
	const [bindEnableRuleId, setBindEnableRuleId] = useState("");
	const [bindDisplayRuleId, setBindDisplayRuleId] = useState("");
	const [codeActionIndex, setCodeActionIndex] = useState<number | null>(null);
	const [codeEditable, setCodeEditable] = useState(false);
	const [codeLoading, setCodeLoading] = useState(false);
	const [codeError, setCodeError] = useState<string | null>(null);
	const [codeValue, setCodeValue] = useState("");
	const [codeDirty, setCodeDirty] = useState(false);
	const [codeWebResourceName, setCodeWebResourceName] = useState<string | null>(null);

	const command = commands.find((c) => c.id === commandEditorId);

	const parseWebResourceName = (library: string): string => {
		const trimmed = library.trim();
		if (trimmed.startsWith("$webresource:")) {
			return trimmed.slice("$webresource:".length).trim();
		}
		return trimmed;
	};

	const decodeBase64Utf8 = (base64: string): string => {
		if (!base64) return "";
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	};

	const encodeUtf8Base64 = (text: string): string => {
		const bytes = new TextEncoder().encode(text);
		let binary = "";
		for (let i = 0; i < bytes.length; i += 1) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	};

	const inferWebResourceTypeCode = (name: string): number => {
		const ext = name.split(".").pop()?.toLowerCase() ?? "";
		return (
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
			}[ext] ?? 3
		);
	};

	useEffect(() => {
		if (command) {
			setDraftCommandId(command.id);
		}
	}, [command]);

	const commandIdError = useMemo(() => {
		if (!command) return "";
		if (!draftCommandId.trim()) return "Command ID is required.";
		if (/\s/.test(draftCommandId)) return "Command ID cannot contain whitespace.";
		if (
			draftCommandId !== command.id &&
			commands.some((c) => c.id.toLowerCase() === draftCommandId.toLowerCase())
		) {
			return "A command with this ID already exists.";
		}
		return "";
	}, [draftCommandId, command, commands]);

	// Count references from buttons
	const references = useMemo(() => {
		return Object.entries(ribbons).flatMap(([location, ribbon]) =>
			ribbon.tabs.flatMap((tab) =>
				tab.groups.flatMap((group) =>
					group.buttons
						.filter((b) => b.commandId === commandEditorId)
						.map((button) => ({ location, tab, group, button })),
				),
			),
		);
	}, [ribbons, commandEditorId]);
	const refCount = references.length;

	if (!command) return null;

	const openCodePanel = async (index: number, editable: boolean) => {
		const action = command.actions[index];
		if (!action || action.kind !== "javascript") return;
		const wrName = parseWebResourceName(action.library);
		if (!wrName) {
			setCodeError("JavaScript library must be a valid $webresource path.");
			setCodeActionIndex(index);
			setCodeEditable(editable);
			setCodeValue("");
			setCodeWebResourceName(null);
			return;
		}

		setCodeActionIndex(index);
		setCodeEditable(editable);
		setCodeLoading(true);
		setCodeError(null);
		setCodeDirty(false);
		setCodeWebResourceName(wrName);

		try {
			// Targeted query by name — much faster than loading all resources.
			const target = await loadWebResourceByName(wrName);
			if (!target) {
				setCodeValue("");
				setCodeError(`Web resource not found: ${wrName}`);
				return;
			}

			// Use retrieve() under the hood — correct for single-record fetches.
			const contentBase64 = await loadWebResourceContent(target.id);
			setCodeValue(decodeBase64Utf8(contentBase64));
		} catch (error: unknown) {
			setCodeError(error instanceof Error ? error.message : "Failed to load web resource content.");
			setCodeValue("");
		} finally {
			setCodeLoading(false);
		}
	};

	const saveCodePanel = async () => {
		if (!codeEditable || codeActionIndex === null || !codeWebResourceName) return;
		setCodeLoading(true);
		setCodeError(null);
		try {
			await saveWebResource(
				codeWebResourceName,
				encodeUtf8Base64(codeValue),
				inferWebResourceTypeCode(codeWebResourceName),
				codeWebResourceName.split("/").pop(),
			);
			setCodeDirty(false);
		} catch (error: unknown) {
			setCodeError(error instanceof Error ? error.message : "Failed to save web resource content.");
		} finally {
			setCodeLoading(false);
		}
	};

	const updateCommand = (patch: Partial<CommandDefinition>) => {
		upsertCommand({ ...command, ...patch });
	};

	const updateAction = (index: number, updated: RibbonAction) => {
		const newActions = [...command.actions];
		newActions[index] = updated;
		updateCommand({ actions: newActions });
	};

	const removeAction = (index: number) => {
		updateCommand({ actions: command.actions.filter((_, i) => i !== index) });
	};

	const addAction = (kind: ActionKind) => {
		const newAction: RibbonAction =
			kind === "javascript"
				? { kind: "javascript", library: "$webresource:", functionName: "", params: [] }
				: kind === "url"
					? { kind: "url", address: "https://", passParams: false, params: [] }
					: kind === "powerFx"
						? { kind: "powerFx", expression: "" }
						: {
								kind: "customApi",
								actionName: "",
								boundParameter: "",
								inputParameters: [],
								outputParameters: [],
							};
		updateCommand({ actions: [...command.actions, newAction] });
	};

	const renderActionEditor = (action: RibbonAction, index: number) => {
		const showCodePanel = codeActionIndex === index;
		if (action.kind === "javascript") {
			return (
				<div key={index} className={styles.actionCard}>
					<div className={styles.actionHeader}>
						<Badge appearance="filled" color="success" size="small">
							JavaScript
						</Badge>
						<Button
							appearance="subtle"
							size="small"
							icon={<DismissRegular />}
							onClick={() => removeAction(index)}
							aria-label="Remove action"
						/>
					</div>
					<Field label="Library (Web Resource)">
						<div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
							<Input
								style={{ flex: 1 }}
								value={action.library}
								onChange={(_, d) => updateAction(index, { ...action, library: d.value })}
								placeholder="$webresource:publisher_/scripts/myfile.js"
							/>
							<Button
								appearance="subtle"
								size="small"
								onClick={() => {
									webResourceBrowserCallbackRegistry.set((wr) => {
										updateAction(index, {
											...action,
											library: `$webresource:${wr.name}`,
										});
									});
									openWebResourceBrowser();
								}}
							>
								Browse…
							</Button>
						</div>
					</Field>
					<Field label="Function name">
						<Input
							value={action.functionName}
							onChange={(_, d) => updateAction(index, { ...action, functionName: d.value })}
							placeholder="MyNamespace.myFunction"
						/>
					</Field>
					<MessageBar intent="info">
						<MessageBarBody>
							Read-only function preview and Monaco editing are available in the web resource
							browser integration path.
						</MessageBarBody>
					</MessageBar>
					<Divider>Parameters (positional)</Divider>
					<CrmParameterEditor
						params={action.params}
						onChange={(p) => updateAction(index, { ...action, params: p })}
						urlMode={false}
					/>
					<div className={styles.row}>
						<Button
							appearance="subtle"
							size="small"
							onClick={() => {
								void openCodePanel(index, false);
							}}
						>
							Function preview
						</Button>
						<Button
							appearance="subtle"
							size="small"
							onClick={() => {
								void openCodePanel(index, true);
							}}
						>
							Open in Monaco
						</Button>
					</div>
					{showCodePanel && (
						<div className={styles.codePanel}>
							<div className={styles.row}>
								<Text weight="semibold">{codeEditable ? "Monaco Editor" : "Function Preview"}</Text>
								{codeWebResourceName && (
									<Text size={200} style={{ fontFamily: tokens.fontFamilyMonospace }}>
										{codeWebResourceName}
									</Text>
								)}
							</div>
							{codeError && (
								<MessageBar intent="error">
									<MessageBarBody>{codeError}</MessageBarBody>
								</MessageBar>
							)}
							{codeLoading ? (
								<Text style={{ color: tokens.colorNeutralForeground3 }}>Loading source…</Text>
							) : (
								<div style={{ height: 240 }}>
									<MonacoEditor
										language="javascript"
										value={codeValue}
										readOnly={!codeEditable}
										onChange={(next) => {
											setCodeValue(next);
											setCodeDirty(true);
										}}
										options={{ wordWrap: "on" }}
									/>
								</div>
							)}
							<div className={styles.row}>
								<Button
									appearance="subtle"
									size="small"
									onClick={() => {
										setCodeActionIndex(null);
										setCodeError(null);
										setCodeDirty(false);
									}}
								>
									Close
								</Button>
								{codeEditable && (
									<Button
										appearance="primary"
										size="small"
										onClick={() => {
											void saveCodePanel();
										}}
										disabled={!codeDirty || codeLoading || !!codeError}
									>
										Save Web Resource
									</Button>
								)}
							</div>
						</div>
					)}
				</div>
			);
		}

		if (action.kind === "url") {
			const isHttpsAddress = action.address.trim().startsWith("https://");
			return (
				<div key={index} className={styles.actionCard}>
					<div className={styles.actionHeader}>
						<Badge appearance="filled" color="informative" size="small">
							URL
						</Badge>
						<Button
							appearance="subtle"
							size="small"
							icon={<DismissRegular />}
							onClick={() => removeAction(index)}
							aria-label="Remove action"
						/>
					</div>
					<MessageBar intent="warning">
						<MessageBarBody>
							<Text className={styles.securityNote}>
								⚠ Ampersands in URLs are automatically escaped as &amp; in the generated XML.
							</Text>
						</MessageBarBody>
					</MessageBar>
					<Field
						label="Address"
						validationState={isHttpsAddress ? "none" : "error"}
						validationMessage={isHttpsAddress ? undefined : "URL must start with https://"}
					>
						<Input
							value={action.address}
							onChange={(_, d) => updateAction(index, { ...action, address: d.value })}
							placeholder="https://..."
						/>
					</Field>
					<Field label="Open in (WinMode)">
						<Select
							value={String(action.winMode ?? 0)}
							onChange={(_, d) =>
								updateAction(index, { ...action, winMode: parseInt(d.value) as 0 | 1 | 2 })
							}
						>
							<option value="0">Navigate (0)</option>
							<option value="1">Dialog (1)</option>
							<option value="2">Popup (2)</option>
						</Select>
					</Field>
					<Field>
						<Button
							appearance={action.passParams ? "primary" : "subtle"}
							size="small"
							onClick={() => updateAction(index, { ...action, passParams: !action.passParams })}
						>
							{action.passParams ? "✓ PassParams ON" : "PassParams OFF"} — appends typename, type,
							id, orgname…
						</Button>
					</Field>
					<Divider>Parameters (named)</Divider>
					<CrmParameterEditor
						params={action.params}
						onChange={(p) => updateAction(index, { ...action, params: p })}
						urlMode={true}
					/>
				</div>
			);
		}

		if (action.kind === "powerFx") {
			return (
				<div key={index} className={styles.actionCard}>
					<div className={styles.actionHeader}>
						<Badge appearance="filled" color="brand" size="small">
							Power Fx
						</Badge>
						<Button
							appearance="subtle"
							size="small"
							icon={<DismissRegular />}
							onClick={() => removeAction(index)}
							aria-label="Remove action"
						/>
					</div>
					<Field label="Expression">
						<div
							style={{
								height: 120,
								border: `1px solid ${tokens.colorNeutralStroke1}`,
								borderRadius: tokens.borderRadiusMedium,
								overflow: "hidden",
							}}
						>
							<MonacoEditor
								language="javascript"
								value={action.expression}
								onChange={(v) => updateAction(index, { ...action, expression: v ?? "" })}
								options={{
									minimap: { enabled: false },
									lineNumbers: "off",
									fontSize: 13,
									scrollBeyondLastLine: false,
									wordWrap: "on",
									lineDecorationsWidth: 4,
									lineNumbersMinChars: 0,
									glyphMargin: false,
									folding: false,
									renderLineHighlight: "none",
								}}
							/>
						</div>
					</Field>
					<MessageBar intent="info">
						<MessageBarBody>
							Variables: <code>ThisRecord</code>, <code>Selection</code>, <code>Self</code>. Power
							Fx rules can return a Promise on Unified Interface (resolves false after 10 s if
							unresolved).
						</MessageBarBody>
					</MessageBar>
				</div>
			);
		}

		if (action.kind === "customApi") {
			return (
				<div key={index} className={styles.actionCard}>
					<div className={styles.actionHeader}>
						<Badge appearance="filled" color="warning" size="small">
							Custom API
						</Badge>
						<Button
							appearance="subtle"
							size="small"
							icon={<DismissRegular />}
							onClick={() => removeAction(index)}
							aria-label="Remove action"
						/>
					</div>
					<Field label="Action logical name">
						<Input
							value={action.actionName}
							onChange={(_, d) => updateAction(index, { ...action, actionName: d.value })}
							placeholder="new_ExecuteBusinessAction"
						/>
					</Field>
					<Field label="Bound parameter (optional)">
						<Input
							value={action.boundParameter ?? ""}
							onChange={(_, d) => updateAction(index, { ...action, boundParameter: d.value })}
							placeholder="Target"
						/>
					</Field>
					<Field label="Input parameters (name=value per line)">
						<Input
							value={action.inputParameters.map((p) => `${p.name}=${p.value}`).join("; ")}
							onChange={(_, d) => {
								const inputParameters = d.value
									.split(";")
									.map((part) => part.trim())
									.filter(Boolean)
									.map((part) => {
										const [name, ...valueParts] = part.split("=");
										return { name: (name ?? "").trim(), value: valueParts.join("=").trim() };
									})
									.filter((p) => p.name.length > 0);
								updateAction(index, { ...action, inputParameters });
							}}
							placeholder="ParamA=ValueA; ParamB=ValueB"
						/>
					</Field>
				</div>
			);
		}

		return null;
	};

	const renderActionsTab = () => (
		<>
			{command.actions.map((action, i) => renderActionEditor(action, i))}
			{command.actions.length === 0 && (
				<Text italic style={{ color: tokens.colorNeutralForeground3 }}>
					No actions defined — button will do nothing when clicked.
				</Text>
			)}
			<div className={styles.row}>
				<Field label="Action type" style={{ minWidth: "220px" }}>
					<Select
						onChange={(_, d) => {
							const kind = d.value as ActionKind;
							if (!kind) return;
							addAction(kind);
						}}
						value=""
					>
						<option value="">Add action...</option>
						<option value="javascript">JavaScript function</option>
						<option value="url">URL action</option>
						<option value="powerFx">Power Fx expression</option>
						<option value="customApi">Custom action / Web API</option>
					</Select>
				</Field>
				<Button
					icon={<AddRegular />}
					appearance="secondary"
					size="small"
					onClick={() => addAction("javascript")}
				>
					Add JavaScript function
				</Button>
				<Button
					icon={<AddRegular />}
					appearance="secondary"
					size="small"
					onClick={() => addAction("url")}
				>
					Add URL action
				</Button>
				<Button
					icon={<AddRegular />}
					appearance="secondary"
					size="small"
					onClick={() => addAction("powerFx")}
				>
					Add Power Fx action
				</Button>
				<Button
					icon={<AddRegular />}
					appearance="secondary"
					size="small"
					onClick={() => addAction("customApi")}
				>
					Add Custom API action
				</Button>
			</div>
		</>
	);

	const renderSettingsTab = () => (
		<>
			<Field label="Command ID">
				<Input
					value={draftCommandId}
					onChange={(_, d) => setDraftCommandId(d.value)}
					style={{ fontFamily: tokens.fontFamilyMonospace }}
				/>
			</Field>
			{commandIdError && (
				<Text
					style={{ color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase100 }}
				>
					{commandIdError}
				</Text>
			)}
			<Button
				appearance="secondary"
				size="small"
				disabled={!draftCommandId.trim() || !!commandIdError || draftCommandId === command.id}
				onClick={() => {
					if (!draftCommandId.trim() || commandIdError) return;
					const nextId = draftCommandId.trim();
					const success = renameCommandId(command.id, nextId);
					if (success) {
						openCommandEditor(nextId);
					}
				}}
			>
				Apply ID change
			</Button>
			<Text style={{ color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 }}>
				Naming convention: Publisher.EntityName.ButtonName.Command
			</Text>
			<MessageBar intent="warning">
				<MessageBarBody>
					<Text className={styles.securityNote}>
						⚠ <strong>Security:</strong> All command definitions are visible in browser source
						regardless of button visibility. Do not embed sensitive logic, credentials, or
						privileged information in command parameters or function names.
					</Text>
				</MessageBarBody>
			</MessageBar>
		</>
	);

	const renderRulesTab = (kind: "enable" | "display") => {
		const ruleIds = kind === "enable" ? command.enableRules : command.displayRules;
		const availableRules = (kind === "enable" ? enableRules : displayRules)
			.map((r) => r.id)
			.filter((id) => !ruleIds.includes(id));
		const selectedBindRuleId = kind === "enable" ? bindEnableRuleId : bindDisplayRuleId;
		const createRule = () => {
			const existingIds = new Set([
				...enableRules.map((r) => r.id),
				...displayRules.map((r) => r.id),
			]);
			const newId = generateRuleId("New", kind === "enable" ? "Enable" : "Display", existingIds);
			if (kind === "enable") {
				upsertEnableRule({ id: newId, steps: [] });
			} else {
				upsertDisplayRule({ id: newId, steps: [] });
			}
			openRuleEditor(newId, kind);
		};

		return (
			<>
				<div className={styles.rulePills}>
					{ruleIds.map((ruleId) => (
						<div key={ruleId} className={styles.ruleRow}>
							<Badge
								appearance="outline"
								size="medium"
								className={styles.ruleChip}
								onClick={() => openRuleEditor(ruleId, kind)}
								role="button"
								tabIndex={0}
							>
								{ruleId}
							</Badge>
							<Button
								appearance="subtle"
								size="small"
								className={styles.ruleRemoveBtn}
								icon={<DismissRegular />}
								aria-label={`Unbind ${ruleId}`}
								onClick={() => {
									if (kind === "enable") {
										updateCommand({
											enableRules: command.enableRules.filter((id) => id !== ruleId),
										});
									} else {
										updateCommand({
											displayRules: command.displayRules.filter((id) => id !== ruleId),
										});
									}
								}}
							/>
						</div>
					))}
					{ruleIds.length === 0 && (
						<Text italic style={{ color: tokens.colorNeutralForeground3 }}>
							No {kind} rules — always {kind === "enable" ? "enabled" : "visible"}.
						</Text>
					)}
				</div>
				<div className={styles.row}>
					<Field label={`Bind existing ${kind} rule`} style={{ minWidth: "260px" }}>
						<Select
							value={selectedBindRuleId}
							onChange={(_, d) =>
								kind === "enable" ? setBindEnableRuleId(d.value) : setBindDisplayRuleId(d.value)
							}
						>
							<option value="">Select a rule…</option>
							{availableRules.map((ruleId) => (
								<option key={ruleId} value={ruleId}>
									{ruleId}
								</option>
							))}
						</Select>
					</Field>
					<Button
						appearance="secondary"
						size="small"
						disabled={!selectedBindRuleId}
						onClick={() => {
							if (!selectedBindRuleId) return;
							if (kind === "enable") {
								updateCommand({ enableRules: [...command.enableRules, selectedBindRuleId] });
								setBindEnableRuleId("");
							} else {
								updateCommand({ displayRules: [...command.displayRules, selectedBindRuleId] });
								setBindDisplayRuleId("");
							}
						}}
					>
						Bind selected
					</Button>
					<Button appearance="subtle" size="small" onClick={createRule}>
						Create new {kind} rule
					</Button>
				</div>
				{kind === "enable" && (
					<MessageBar intent="info">
						<MessageBarBody>
							Disabled buttons are <strong>hidden</strong> in the modern command bar (Unified
							Interface). In the classic ribbon, disabled buttons remain visible but do not respond
							to clicks.
						</MessageBarBody>
					</MessageBar>
				)}
			</>
		);
	};

	const renderReferencesTab = () => (
		<>
			<Text>
				Referenced by <strong>{refCount}</strong> button(s).
			</Text>
			{references.length > 0 && (
				<div className={styles.versionsList}>
					{references.map((ref) => (
						<div
							key={`${ref.location}:${ref.tab.id}:${ref.group.id}:${ref.button.id}`}
							className={styles.versionRow}
						>
							<div>
								<Text weight="semibold" style={{ fontFamily: tokens.fontFamilyMonospace }}>
									{ref.button.id}
								</Text>
								<Text className={styles.versionMeta}>
									{ref.location} → {ref.tab.label} → {ref.group.label}
								</Text>
							</div>
						</div>
					))}
				</div>
			)}
		</>
	);

	const commandVersions = past
		.filter((entry) => entry.target === command.id || entry.detail.includes(command.id))
		.slice()
		.reverse();

	const renderVersionsTab = () => (
		<>
			{commandVersions.length === 0 ? (
				<Text style={{ color: tokens.colorNeutralForeground3 }}>
					No command-specific history entries yet.
				</Text>
			) : (
				<div className={styles.versionsList}>
					{commandVersions.map((entry, idx) => (
						<div key={`${entry.ts}-${idx}`} className={styles.versionRow}>
							<div>
								<Text weight="semibold">{entry.op}</Text>
								<Text className={styles.versionMeta}>{entry.detail}</Text>
							</div>
							<Text className={styles.versionMeta}>{new Date(entry.ts).toLocaleString()}</Text>
						</div>
					))}
				</div>
			)}
		</>
	);

	return (
		<OverlayDrawer
			position="end"
			open={commandEditorOpen}
			onOpenChange={() => closeCommandEditor()}
			className={styles.drawer}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeCommandEditor}
							aria-label="Close command editor"
						/>
					}
				>
					<Text size={400} weight="semibold" style={{ fontFamily: tokens.fontFamilyMonospace }}>
						{command.id}
					</Text>
				</DrawerHeaderTitle>
			</DrawerHeader>

			<DrawerBody className={styles.body}>
				<TabList selectedValue={activeTab} onTabSelect={(_, d) => setActiveTab(d.value as string)}>
					<Tab value="actions">Actions</Tab>
					<Tab value="enableRules">Enable rules</Tab>
					<Tab value="displayRules">Display rules</Tab>
					<Tab value="settings">Settings</Tab>
					<Tab value="references">References ({refCount})</Tab>
					<Tab value="versions">Versions</Tab>
				</TabList>

				<Divider />

				{activeTab === "actions" && renderActionsTab()}
				{activeTab === "enableRules" && renderRulesTab("enable")}
				{activeTab === "displayRules" && renderRulesTab("display")}
				{activeTab === "settings" && renderSettingsTab()}
				{activeTab === "references" && renderReferencesTab()}
				{activeTab === "versions" && renderVersionsTab()}
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default CommandEditorPanel;
