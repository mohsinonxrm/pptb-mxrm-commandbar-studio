import React, { useEffect, useMemo, useState } from "react";
import {
	makeStyles,
	tokens,
	Button,
	Caption1,
	Field,
	Input,
	Label,
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	MessageBar,
	MessageBarBody,
	Select,
	Switch,
	TagGroup,
	Text,
	Tooltip,
	InfoLabel,
} from "@fluentui/react-components";
import {
	AddRegular,
	ArrowDownRegular,
	ArrowUpRegular,
	CodeRegular,
	DeleteRegular,
	EditRegular,
	MoreVerticalRegular,
	ReOrderDotsVerticalRegular,
} from "@fluentui/react-icons";
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import type { CommandDefinition, RibbonAction } from "@/types/ribbon";
import CrmParameterEditor from "@/components/shared/CrmParameterEditor";
import { RuleTag } from "@/components/shared/RuleTag";
import { generateRuleId } from "@/utils/idGenerator";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import { buttonsUsing } from "@/utils/ribbonMenu";
import { LOCATION_INFO } from "@/constants/locationInfo";
import { useStableKeys } from "@/hooks/useStableKeys";
import { useDisplayText } from "@/hooks/useDisplayText";
import { CommandProvenanceBar } from "@/components/shared/CommandProvenanceBar";
import { isCommandReadOnly, useCommandProvenance } from "@/hooks/useCommandProvenance";

const useStyles = makeStyles({
	// The editor drawer's body scrolls and pads it (#186).
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	actionCard: {
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground1,
		padding: tokens.spacingVerticalM,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	actionHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		minWidth: 0,
	},
	actionTitle: { flex: 1, minWidth: 0 },
	dragHandle: { cursor: "grab", touchAction: "none" },
	row: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalS,
		alignItems: "flex-end",
	},
	library: {
		display: "flex",
		gap: tokens.spacingHorizontalXS,
		alignItems: "center",
	},
	grow: { flex: 1, minWidth: 0 },
	ruleTags: { flexWrap: "wrap" },
	muted: { color: tokens.colorNeutralForeground3 },
	usesList: {
		listStyleType: "none",
		margin: 0,
		padding: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
	},
	use: {
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
		display: "flex",
		flexDirection: "column",
		minWidth: 0,
	},
	fields: {
		border: "none",
		margin: 0,
		padding: 0,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		// Fluent styles a control as disabled only through its own prop: make the
		// fields of a read-only command look read-only, their values still legible.
		"&:disabled .fui-Input, &:disabled .fui-Select__select, &:disabled .fui-Dropdown, &:disabled .fui-Combobox":
			{
				backgroundColor: tokens.colorNeutralBackground3,
				borderTopColor: tokens.colorTransparentStroke,
				borderRightColor: tokens.colorTransparentStroke,
				borderBottomColor: tokens.colorTransparentStroke,
				borderLeftColor: tokens.colorTransparentStroke,
				color: tokens.colorNeutralForeground1,
				cursor: "default",
			},
		"&:disabled .fui-Input::after, &:disabled .fui-Dropdown::after, &:disabled .fui-Combobox::after":
			{ display: "none" },
		"&:disabled input, &:disabled .fui-Dropdown__button": {
			color: tokens.colorNeutralForeground1,
			cursor: "default",
		},
		"&:disabled .fui-Select__icon, &:disabled .fui-Dropdown__expandIcon, &:disabled .fui-Combobox__expandIcon":
			{ display: "none" },
		"&:disabled .fui-Button": {
			color: tokens.colorNeutralForegroundDisabled,
			borderTopColor: tokens.colorNeutralStrokeDisabled,
			borderRightColor: tokens.colorNeutralStrokeDisabled,
			borderBottomColor: tokens.colorNeutralStrokeDisabled,
			borderLeftColor: tokens.colorNeutralStrokeDisabled,
			cursor: "not-allowed",
		},
	},
});

/**
 * Action kinds that can be added. Classic ribbon commands have no Power Fx or
 * Custom API action (those exist only in modern commanding, `appaction`), so
 * they are not offered (#28).
 */
type ActionKind = "javascript" | "url";

const NO_ACTIONS: RibbonAction[] = [];

const parseWebResourceName = (library: string): string => {
	const trimmed = library.trim();
	return trimmed.startsWith("$webresource:")
		? trimmed.slice("$webresource:".length).trim()
		: trimmed;
};

function actionTitle(action: RibbonAction): string {
	switch (action.kind) {
		case "javascript":
			return "Run JavaScript";
		case "url":
			return "Open a URL";
		case "powerFx":
			return "Power Fx (not supported)";
		case "customApi":
			return "Custom API (not supported)";
		case "outlookCommand":
			return "Outlook command";
		case "raw":
			return action.tagName;
		default:
			return "Action";
	}
}

interface ActionCardProps {
	id: string;
	index: number;
	count: number;
	title: string;
	readOnly: boolean;
	onMove: (from: number, to: number) => void;
	onRemove: () => void;
	children: React.ReactNode;
}

/** One action: drag handle, what it does, ⋮ (move up / down) and Remove. */
function ActionCard({
	id,
	index,
	count,
	title,
	readOnly,
	onMove,
	onRemove,
	children,
}: ActionCardProps) {
	const styles = useStyles();
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
		useSortable({ id, disabled: readOnly });
	return (
		<section
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={styles.actionCard}
			aria-label={`Action ${index + 1}: ${title}`}
		>
			<div className={styles.actionHeader}>
				{!readOnly && count > 1 && (
					<Button
						ref={setActivatorNodeRef}
						appearance="subtle"
						size="small"
						className={styles.dragHandle}
						icon={<ReOrderDotsVerticalRegular />}
						aria-label="Drag to reorder action"
						{...attributes}
						{...listeners}
					/>
				)}
				<Text weight="semibold" className={styles.actionTitle} truncate wrap={false}>
					{title}
				</Text>
				{!readOnly && count > 1 && (
					<Menu>
						<MenuTrigger disableButtonEnhancement>
							<Button
								appearance="subtle"
								size="small"
								icon={<MoreVerticalRegular />}
								aria-label="More for this action"
							/>
						</MenuTrigger>
						<MenuPopover>
							<MenuList>
								<MenuItem
									icon={<ArrowUpRegular />}
									disabled={index === 0}
									onClick={() => onMove(index, index - 1)}
								>
									Move up
								</MenuItem>
								<MenuItem
									icon={<ArrowDownRegular />}
									disabled={index === count - 1}
									onClick={() => onMove(index, index + 1)}
								>
									Move down
								</MenuItem>
							</MenuList>
						</MenuPopover>
					</Menu>
				)}
				{!readOnly && (
					<Tooltip content="Remove action" relationship="label">
						<Button
							appearance="subtle"
							size="small"
							icon={<DeleteRegular />}
							onClick={onRemove}
						/>
					</Tooltip>
				)}
			</div>
			{children}
		</section>
	);
}

export const CommandEditorPanel: React.FC = () => {
	const styles = useStyles();
	const commandEditorOpen = useUIStore((s) => s.commandEditorOpen);
	const commandEditorId = useUIStore((s) => s.commandEditorId);
	const closeCommandEditor = useUIStore((s) => s.closeCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const openScriptView = useUIStore((s) => s.openScriptView);
	const openWebResourceBrowser = useUIStore((s) => s.openWebResourceBrowser);
	const tab = useUIStore((s) => s.commandEditorTab);

	const commands = useRibbonStore((s) => s.commands);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const captionOf = useDisplayText();

	const [bindEnableRuleId, setBindEnableRuleId] = useState("");
	const [bindDisplayRuleId, setBindDisplayRuleId] = useState("");

	const command = commands.find((c) => c.id === commandEditorId);
	// Action cards keep their key when another action is removed (#22): an index
	// key handed a card's local state (a half-typed number, …) to the next one.
	const actionKeys = useStableKeys(
		`actions:${command?.id ?? ""}`,
		command?.actions ?? NO_ACTIONS,
	);
	// Out-of-the-box commands are read-only until customised (#186); one being
	// uncustomised (#31) or needing a reload isn't editable either.
	const readOnly = isCommandReadOnly(useCommandProvenance(command?.id));

	// The command went away while the editor was open (an undo of the step that
	// added it, #22 review): close the editor instead of leaving it open on
	// nothing (a redo would otherwise pop it up again).
	useEffect(() => {
		if (commandEditorOpen && commandEditorId && !command) closeCommandEditor();
	}, [commandEditorOpen, commandEditorId, command, closeCommandEditor]);

	const uses = useMemo(
		() => (commandEditorId ? buttonsUsing(ribbons, commandEditorId) : []),
		[ribbons, commandEditorId],
	);

	if (!command) return null;

	const updateCommand = (patch: Partial<CommandDefinition>) => {
		upsertCommand({ ...command, ...patch });
	};

	const updateAction = (index: number, updated: RibbonAction) => {
		const newActions = [...command.actions];
		newActions[index] = updated;
		updateCommand({ actions: newActions });
		actionKeys.update();
	};

	const removeAction = (index: number) => {
		updateCommand({ actions: command.actions.filter((_, i) => i !== index) });
		actionKeys.remove(index);
	};

	const moveAction = (from: number, to: number) => {
		if (to < 0 || to >= command.actions.length || from === to) return;
		updateCommand({ actions: arrayMove(command.actions, from, to) });
		actionKeys.move(from, to);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		if (!event.over) return;
		moveAction(
			actionKeys.keys.indexOf(String(event.active.id)),
			actionKeys.keys.indexOf(String(event.over.id)),
		);
	};

	const addAction = (kind: ActionKind) => {
		const newAction: RibbonAction =
			kind === "javascript"
				? { kind: "javascript", library: "", functionName: "", params: [] }
				: { kind: "url", address: "https://", params: [] };
		updateCommand({ actions: [...command.actions, newAction] });
		actionKeys.add();
	};

	const renderActionBody = (action: RibbonAction, index: number) => {
		if (action.kind === "javascript") {
			const scriptName = parseWebResourceName(action.library);
			return (
				<>
					<fieldset disabled={readOnly} className={styles.fields}>
						<Field
							label="Library"
							hint="A JavaScript web resource, like $webresource:publisher_/scripts/file.js."
						>
							<div className={styles.library}>
								<Input
									className={styles.grow}
									value={action.library}
									onChange={(_, d) =>
										updateAction(index, {
											...action,
											// Collapse a repeated `$webresource:` prefix (pasting a full
											// reference into a pre-filled field produced
											// `$webresource:$webresource:…`, which never resolves).
											library: d.value.replace(
												/^(\s*\$webresource:\s*)+/i,
												"$webresource:",
											),
										})
									}
									placeholder="$webresource:publisher_/scripts/file.js"
								/>
								<Button
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
						<Field
							label="Function"
							hint="The function's full name, including its namespace."
						>
							<Input
								value={action.functionName}
								onChange={(_, d) =>
									updateAction(index, { ...action, functionName: d.value })
								}
								placeholder="Contoso.Account.approve"
							/>
						</Field>
						<Label weight="semibold">Parameters, in order</Label>
						<CrmParameterEditor
							params={action.params}
							onChange={(p) => updateAction(index, { ...action, params: p })}
							urlMode={false}
						/>
					</fieldset>
					{/* Reading the script doesn't change the command: allowed when read-only. */}
					<div className={styles.row}>
						<Button
							size="small"
							icon={<CodeRegular />}
							disabled={!scriptName}
							onClick={() => openScriptView(scriptName, false)}
						>
							View script
						</Button>
						{!readOnly && (
							<Button
								size="small"
								icon={<EditRegular />}
								disabled={!scriptName}
								onClick={() => openScriptView(scriptName, true)}
							>
								Edit script
							</Button>
						)}
					</div>
				</>
			);
		}

		if (action.kind === "url") {
			const isHttpsAddress = action.address.trim().startsWith("https://");
			return (
				<fieldset disabled={readOnly} className={styles.fields}>
					<Field
						label="Address"
						validationState={isHttpsAddress ? "none" : "error"}
						validationMessage={
							isHttpsAddress ? undefined : "The address must start with https://"
						}
					>
						<Input
							value={action.address}
							onChange={(_, d) =>
								updateAction(index, { ...action, address: d.value })
							}
							placeholder="https://"
						/>
					</Field>
					<Field label="Open in">
						<Select
							value={String(action.winMode ?? 0)}
							onChange={(_, d) =>
								updateAction(index, {
									...action,
									winMode: parseInt(d.value) as 0 | 1 | 2,
								})
							}
						>
							<option value="0">Navigate (0)</option>
							<option value="1">Dialog (1)</option>
							<option value="2">Popup (2)</option>
						</Select>
					</Field>
					<Field hint="Adds the record's details to the address: typename, type, id, orgname and the user's languages.">
						<Switch
							label="Pass parameters"
							checked={!!action.passParams}
							onChange={(_, d) =>
								updateAction(index, {
									...action,
									passParams: d.checked ? true : undefined,
								})
							}
						/>
					</Field>
					<Label weight="semibold">Query string parameters</Label>
					<CrmParameterEditor
						params={action.params}
						onChange={(p) => updateAction(index, { ...action, params: p })}
						urlMode={true}
					/>
				</fieldset>
			);
		}

		if (action.kind === "powerFx" || action.kind === "customApi") {
			// Can't be added any more (#28); only reachable from a session saved by an
			// older version. Publishing is blocked while the command has one.
			return (
				<MessageBar intent="error">
					<MessageBarBody>
						Classic ribbon commands can't run{" "}
						{action.kind === "powerFx" ? "Power Fx" : "Custom API"} actions, so this
						command can't be published while it has one. Remove it and use a JavaScript
						function instead (for example, call the API with{" "}
						<code>Xrm.WebApi.online.execute</code>), or build the command with modern
						commanding in the app designer.
					</MessageBarBody>
				</MessageBar>
			);
		}

		if (action.kind === "outlookCommand" || action.kind === "raw") {
			// Not editable in CBS; kept exactly as loaded when the command is re-emitted.
			return (
				<Text size={200} className={styles.muted}>
					{action.kind === "outlookCommand"
						? `ActionType="${action.actionType}"${action.data ? ` Data="${action.data}"` : ""}`
						: action.xml}
				</Text>
			);
		}

		return null;
	};

	const renderActionsTab = () => (
		<>
			<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={actionKeys.keys} strategy={verticalListSortingStrategy}>
					{command.actions.map((action, i) => (
						<ActionCard
							key={actionKeys.keys[i]}
							id={actionKeys.keys[i]}
							index={i}
							count={command.actions.length}
							title={actionTitle(action)}
							readOnly={readOnly}
							onMove={moveAction}
							onRemove={() => removeAction(i)}
						>
							{renderActionBody(action, i)}
						</ActionCard>
					))}
				</SortableContext>
			</DndContext>
			{command.actions.length === 0 && (
				<Text className={styles.muted}>
					No actions yet. The button does nothing when it's clicked.
				</Text>
			)}
			{!readOnly && (
				<div>
					<Menu>
						<MenuTrigger disableButtonEnhancement>
							<Button icon={<AddRegular />}>Add action</Button>
						</MenuTrigger>
						<MenuPopover>
							<MenuList>
								<MenuItem onClick={() => addAction("javascript")}>
									Run JavaScript
								</MenuItem>
								<MenuItem onClick={() => addAction("url")}>Open a URL</MenuItem>
							</MenuList>
						</MenuPopover>
					</Menu>
				</div>
			)}
			<Caption1 className={styles.muted}>
				Every user's browser gets the command's definition, even when the button is hidden.
				Don't put secrets in function names or parameters.
			</Caption1>
		</>
	);

	const renderRulesTab = (kind: "enable" | "display") => {
		const ruleIds = kind === "enable" ? command.enableRules : command.displayRules;
		const availableRules = (kind === "enable" ? enableRules : displayRules)
			.map((r) => r.id)
			.filter((id) => !ruleIds.includes(id));
		const selectedBindRuleId = kind === "enable" ? bindEnableRuleId : bindDisplayRuleId;
		const setRules = (ids: string[]) =>
			updateCommand(kind === "enable" ? { enableRules: ids } : { displayRules: ids });
		const createRule = () => {
			const existingIds = new Set([
				...enableRules.map((r) => r.id),
				...displayRules.map((r) => r.id),
			]);
			const newId = generateRuleId(
				"New",
				kind === "enable" ? "Enable" : "Display",
				existingIds,
			);
			if (kind === "enable") {
				upsertEnableRule({ id: newId, steps: [] });
			} else {
				upsertDisplayRule({ id: newId, steps: [] });
			}
			setRules([...ruleIds, newId]);
			openRuleEditor(newId, kind);
		};

		return (
			<>
				{ruleIds.length > 0 ? (
					<TagGroup
						className={styles.ruleTags}
						aria-label={kind === "enable" ? "Enable rules" : "Display rules"}
					>
						{ruleIds.map((ruleId) => (
							<RuleTag
								key={ruleId}
								ruleId={ruleId}
								kind={kind}
								onOpen={() => openRuleEditor(ruleId, kind)}
								onRemove={
									readOnly
										? undefined
										: () => setRules(ruleIds.filter((id) => id !== ruleId))
								}
							/>
						))}
					</TagGroup>
				) : (
					<Text className={styles.muted}>
						No {kind} rules, so the button is always{" "}
						{kind === "enable" ? "enabled" : "shown"}.
					</Text>
				)}
				{!readOnly && (
					<div className={styles.row}>
						<Field
							label={`Add an existing ${kind} rule`}
							style={{ flex: "1 1 260px", minWidth: 0 }}
						>
							<Select
								// The longest rule id would size it past its field (#186).
								style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
								value={selectedBindRuleId}
								onChange={(_, d) =>
									kind === "enable"
										? setBindEnableRuleId(d.value)
										: setBindDisplayRuleId(d.value)
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
							disabled={!selectedBindRuleId}
							onClick={() => {
								if (!selectedBindRuleId) return;
								setRules([...ruleIds, selectedBindRuleId]);
								if (kind === "enable") setBindEnableRuleId("");
								else setBindDisplayRuleId("");
							}}
						>
							Add
						</Button>
						<Button appearance="subtle" icon={<AddRegular />} onClick={createRule}>
							New {kind} rule
						</Button>
					</div>
				)}
				{kind === "enable" && (
					<InfoLabel
						size="small"
						info="Disabled buttons are hidden in the modern command bar (Unified Interface). In the classic ribbon, they stay visible but do nothing when clicked."
					>
						What a failing enable rule does
					</InfoLabel>
				)}
			</>
		);
	};

	const renderUsedByTab = () =>
		uses.length === 0 ? (
			<Text className={styles.muted}>No button uses this command.</Text>
		) : (
			<ul className={styles.usesList} aria-label="Buttons using this command">
				{uses.map(({ location, tab: t, group, button }) => (
					<li key={`${location}:${t.id}:${group.id}:${button.id}`} className={styles.use}>
						<Text weight="semibold" truncate wrap={false}>
							{captionOf(
								button.label,
								locLabels,
								undefined,
								button.source?.labelToken,
							) || button.id}
						</Text>
						<Caption1 className={styles.muted}>
							{[
								LOCATION_INFO[location].label,
								captionOf(t.label, locLabels) || t.id,
								captionOf(group.label, locLabels) || group.id,
							].join(" › ")}
						</Caption1>
					</li>
				))}
			</ul>
		);

	// A view of the editor drawer (#186): the header shows the id and the tabs.
	return (
		<div className={styles.body}>
			<CommandProvenanceBar commandId={command.id} hideBadge />
			{tab === "actions" && renderActionsTab()}
			{tab === "enable" && renderRulesTab("enable")}
			{tab === "display" && renderRulesTab("display")}
			{tab === "usedBy" && renderUsedByTab()}
		</div>
	);
};

export default CommandEditorPanel;
