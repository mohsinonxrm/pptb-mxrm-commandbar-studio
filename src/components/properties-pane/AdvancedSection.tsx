import React from "react";
import {
	makeStyles,
	tokens,
	Text,
	Switch,
	Badge,
} from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import type { CommandDefinition, DisplayRule, RuleStep } from "@/types/ribbon";
import { useSessionStore } from "@/store/sessionStore";
import { findGroupControl } from "@/utils/ribbonMenu";
import {
	OPEN_RECORD_ITEM_COMMAND_ID,
	OPEN_RECORD_ITEM_LOCATIONS,
	isOpenRecordCarrier,
	openRecordCarrierOwnership,
	openRecordCarrierPlacement,
	openRecordCarriers,
	openRecordCommandUsers,
} from "@/utils/openRecordItem";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	note: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
	},
});

// Unified Interface evaluates CommandClientTypeRule as "Modern", on the web
// and in the mobile apps: Microsoft's Mscrm.HideOnModern (Type="Modern",
// InvertResult) hides buttons there. "Refresh" is the legacy updated web
// client (#152).
const CLIENT_TYPE_RULES = [
	{ label: "Show on Unified Interface (Modern)", value: "Modern" },
	{ label: "Show on legacy web client (Refresh)", value: "Refresh" },
	{ label: "Show on classic ribbon (Legacy)", value: "Legacy" },
];

export const AdvancedSection: React.FC = () => {
	const styles = useStyles();

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const selectedGroupId = useSelectionStore((s) => s.selectedGroupId);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const batch = useRibbonStore((s) => s.batch);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const setOpenRecordOverride = useRibbonStore((s) => s.setOpenRecordOverride);
	const clearSelection = useSelectionStore((s) => s.clearSelection);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const sessionPrefix = useSessionStore((s) => s.publisherPrefix);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const group = tab?.groups.find((g) => g.id === selectedGroupId);
	const button = findGroupControl(group, selectedButtonId);
	const showOpenRecordItemToggle = OPEN_RECORD_ITEM_LOCATIONS.includes(location);

	// The override is on for this location while the carrier the switch
	// created is here (see utils/openRecordItem) — that is also what comes
	// back from the layer on reload (#22).
	const openRecordCarrierList = openRecordCarriers(ribbon);
	const hasOpenRecordOverride = openRecordCarrierList.length > 0;
	const ownership = openRecordCarrierList.map((c) => openRecordCarrierOwnership(c));
	const openRecordTheirs = ownership.includes("theirs");
	// Provenance not resolved: wait rather than call it another solution's.
	const openRecordUnknown = !openRecordTheirs && ownership.includes("unknown");
	const openRecordNoGroup = !hasOpenRecordOverride && !openRecordCarrierPlacement(ribbon);
	// Other buttons (e.g. your own) using the command: turning off keeps them and the command.
	const otherOpenRecordUsers = openRecordCommandUsers(ribbon).filter((c) => !isOpenRecordCarrier(c.button));

	const handleOpenRecordToggle = (checked: boolean) => {
		const prefix = activeSolution?.publisherPrefix?.trim() || sessionPrefix?.trim() || "new";
		if (!checked && openRecordCarrierList.some((c) => c.button.id === selectedButtonId)) clearSelection();
		if (!setOpenRecordOverride(location, checked, prefix) || !checked) return;
		// Open the Command Editor immediately so the user can set the real
		// library path and function name.
		openCommandEditor(OPEN_RECORD_ITEM_COMMAND_ID);
	};

	const getSelectedCommand = (): CommandDefinition | undefined => {
		if (!button?.commandId) return undefined;
		return commands.find((c) => c.id === button.commandId);
	};

	const addClientTypeFilter = (type: "Refresh" | "Legacy" | "Modern") => {
		const selectedCommand = getSelectedCommand();
		if (!selectedCommand) return;

		// Only a plain rule of this type: Mscrm.HideOnModern is Type="Modern"
		// with InvertResult, the opposite filter (#152).
		const existingRule = displayRules.find(
			(r) =>
				r.steps.length === 1 &&
				r.steps[0].kind === "CommandClientTypeRule" &&
				r.steps[0].type === type &&
				!r.steps[0].invertResult &&
				r.steps[0].default === undefined,
		);

		let ruleId = existingRule?.id;
		let rule: DisplayRule | undefined;
		if (!ruleId) {
			const baseRuleId = `${selectedCommand.id}.${type}.DisplayRule`;
			ruleId = baseRuleId;
			let suffix = 1;
			while (displayRules.some((r) => r.id === ruleId)) {
				ruleId = `${baseRuleId}.${suffix}`;
				suffix += 1;
			}

			const step: RuleStep = {
				kind: "CommandClientTypeRule",
				type,
			};
			rule = {
				id: ruleId,
				steps: [step],
			};
		}

		// The new rule and its binding are one undo step (#34).
		const boundRuleId = ruleId;
		batch(() => {
			if (rule) upsertDisplayRule(rule);
			if (!selectedCommand.displayRules.includes(boundRuleId)) {
				upsertCommand({
					...selectedCommand,
					displayRules: [...selectedCommand.displayRules, boundRuleId],
				});
			}
		});
	};

	return (
		<div className={styles.section}>
			<Text size={200} weight="semibold">
				Advanced
			</Text>

			{button && (
				<div>
					<Text size={100} className={styles.note}>
						Tab: <code style={{ fontFamily: tokens.fontFamilyMonospace }}>{tabId}</code>
					</Text>
				</div>
			)}

			{showOpenRecordItemToggle && (
				<div>
					<Switch
						label={`Override default record open behavior on the ${location === "SubGrid" ? "sub-grid" : "home grid"} (Mscrm.OpenRecordItem)`}
						checked={hasOpenRecordOverride}
						disabled={openRecordTheirs || openRecordUnknown || openRecordNoGroup}
						onChange={(_, d) => handleOpenRecordToggle(d.checked)}
					/>
					<Text size={100} className={styles.note}>
						When enabled, the table gets a CommandDefinition with Id=&quot;Mscrm.OpenRecordItem&quot;
						whose action runs instead of opening the record when a user double-clicks a row of this
						table&apos;s {location === "SubGrid" ? "sub-grids (on any form)" : "home grid"}, selects
						its primary column link or presses Enter on it. As in Microsoft&apos;s recipe, an
						&quot;Open record&quot; button using the command is added to this location&apos;s
						command bar — the override only reaches a grid through a button there; don&apos;t
						hide that button. <strong>Unified Interface only.</strong> The Command Editor will open
						so you can set the real web resource and function name; Publish is blocked until you
						do. Turning it off removes that button, and the command once no button uses it.
					</Text>
					{openRecordTheirs && (
						<Text size={100} className={styles.note}>
							The &quot;Open record&quot; button here comes from another solution, so the override
							can&apos;t be turned off from your customizations.
						</Text>
					)}
					{openRecordUnknown && (
						<Text size={100} className={styles.note}>
							CBS doesn&apos;t know yet which solution the &quot;Open record&quot; button here comes
							from (its solution layers haven&apos;t loaded), so it isn&apos;t removed — reload the
							table if this doesn&apos;t clear.
						</Text>
					)}
					{otherOpenRecordUsers.length > 0 && (
						<Text size={100} className={styles.note}>
							Also using Mscrm.OpenRecordItem here:{" "}
							{otherOpenRecordUsers.map((c) => c.button.id).join(", ")}. Turning the override off
							keeps {otherOpenRecordUsers.length === 1 ? "it" : "them"} and the command.
						</Text>
					)}
					{openRecordNoGroup && (
						<Text size={100} className={styles.note}>
							This location has no group to put the button in.
						</Text>
					)}
				</div>
			)}

			{location === "Form" && (
				<Text size={100} className={styles.note}>
					Form command bar changes apply to every main form of this table
					(ImportExportXml/Entities/Entity/RibbonDiffXml). Form-specific ribbons
					(systemform/form/RibbonDiffXml) aren&apos;t supported on Unified Interface, so CBS
					doesn&apos;t write them (#14).
				</Text>
			)}

			<div>
				<Text size={100} weight="semibold" className={styles.note}>
					Client type filter (adds a CommandClientTypeRule):
				</Text>
				<Text size={100} className={styles.note}>
					<strong>Modern</strong> = Unified Interface (web, tablets and phones) |{" "}
					<strong>Refresh</strong> = legacy updated web client | <strong>Legacy</strong> = classic
					ribbon / Outlook
				</Text>
				<div className={styles.row} style={{ marginTop: "4px" }}>
					{CLIENT_TYPE_RULES.map((rule) => (
						<Badge
							key={rule.value}
							appearance="outline"
							style={{ cursor: "pointer" }}
							title={`Add CommandClientTypeRule: ${rule.value}`}
							onClick={() => addClientTypeFilter(rule.value as "Refresh" | "Legacy" | "Modern")}
						>
							{rule.label}
						</Badge>
					))}
				</div>
			</div>
		</div>
	);
};

export default AdvancedSection;
