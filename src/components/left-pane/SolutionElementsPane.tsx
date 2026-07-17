import {
	makeStyles,
	tokens,
	Text,
	Tab,
	TabList,
	Button,
	Subtitle2,
	Badge,
	Tooltip,
} from "@fluentui/react-components";
import {
	AddRegular,
	CodeRegular,
	AppsAddInRegular,
	DocumentTableRegular,
} from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { useMemo, useState } from "react";
import type { RibbonLocation } from "@/types/ribbon";
import { generateCommandId, generateRuleId } from "@/utils/idGenerator";

const DRAG_SE_MIME = "application/x-rw-se";

const LOCATION_SHORT: Record<RibbonLocation, string> = {
	HomepageGrid: "Home",
	SubGrid: "Sub",
	Form: "Form",
	Application: "App",
};

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		height: "100%",
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground2,
	},
	header: {
		padding: `${tokens.spacingHorizontalS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	tabs: {
		flexShrink: 0,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	scrollArea: {
		flex: 1,
		overflowY: "auto",
		padding: tokens.spacingHorizontalXS,
	},
	item: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		cursor: "pointer",
		borderRadius: tokens.borderRadiusMedium,
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
	},
	draggableItem: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingHorizontalXS} ${tokens.spacingHorizontalS}`,
		cursor: "grab",
		borderRadius: tokens.borderRadiusMedium,
		userSelect: "none",
		":hover": { backgroundColor: tokens.colorNeutralBackground3 },
		":active": { cursor: "grabbing" },
	},
	itemName: {
		flex: 1,
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	gripHandle: {
		color: tokens.colorNeutralForeground4,
		fontSize: tokens.fontSizeBase200,
		flexShrink: 0,
		lineHeight: 1,
	},
});

type SubTab = "buttons" | "commands" | "rules" | "templates";

export function SolutionElementsPane() {
	const styles = useStyles();
	const [subTab, setSubTab] = useState<SubTab>("commands");
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const templates = useRibbonStore((s) => s.templates);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const baseline = useRibbonStore((s) => s.baseline);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);

	// Collect all custom buttons across all locations
	const customButtons = useMemo(() => {
		const result: {
			button: import("@/types/ribbon").RibbonButton;
			location: RibbonLocation;
			tabId: string;
			groupId: string;
			isNew: boolean;
		}[] = [];

		for (const loc of Object.keys(ribbons) as RibbonLocation[]) {
			const ribbon = ribbons[loc];
			const baseRibbon = baseline[loc];
			for (const tab of ribbon.tabs) {
				for (const group of tab.groups) {
					for (const btn of group.buttons) {
						if (!btn.custom) continue;
						// Check if button was in baseline (not new)
						const inBaseline = baseRibbon.tabs
							.flatMap((t) => t.groups)
							.flatMap((g) => g.buttons)
							.some((b) => b.id === btn.id);
						result.push({
							button: btn,
							location: loc,
							tabId: tab.id,
							groupId: group.id,
							isNew: !inBaseline,
						});
					}
				}
			}
		}
		return result;
	}, [ribbons, baseline]);

	const createAndOpenCommand = () => {
		const existingIds = new Set(commands.map((c) => c.id));
		const newId = generateCommandId("New", "Command", existingIds);
		upsertCommand({ id: newId, enableRules: [], displayRules: [], actions: [] });
		openCommandEditor(newId);
	};

	const createAndOpenRule = () => {
		const existingIds = new Set([
			...enableRules.map((r) => r.id),
			...displayRules.map((r) => r.id),
		]);
		const newId = generateRuleId("New", "Enable", existingIds);
		upsertEnableRule({ id: newId, steps: [] });
		openRuleEditor(newId, "enable");
	};

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				<Subtitle2>Solution Elements</Subtitle2>
			</div>
			<TabList
				className={styles.tabs}
				selectedValue={subTab}
				onTabSelect={(_, d) => setSubTab(d.value as SubTab)}
				size="small"
			>
				<Tab value="buttons">Buttons ({customButtons.length})</Tab>
				<Tab value="commands">Commands ({commands.length})</Tab>
				<Tab value="rules">Rules ({enableRules.length + displayRules.length})</Tab>
				<Tab value="templates">Templates ({templates.length})</Tab>
			</TabList>

			<div className={styles.scrollArea}>
				{/* ── Buttons ── */}
				{subTab === "buttons" && (
					<>
						<Text
							size={100}
							style={{
								color: tokens.colorNeutralForeground3,
								padding: `4px ${tokens.spacingHorizontalS}`,
								display: "block",
							}}
						>
							Drag onto the ribbon canvas to add a button
						</Text>
						{customButtons.map(({ button, location, isNew }) => (
							<Tooltip
								key={`${location}::${button.id}`}
								content={`${button.id} · ${LOCATION_SHORT[location]} ribbon`}
								relationship="label"
							>
								<div
									className={styles.draggableItem}
									draggable
									onDragStart={(e) => {
										e.dataTransfer.setData(
											DRAG_SE_MIME,
											JSON.stringify({
												button: {
													id: button.id,
													label: button.label,
													icon: button.icon,
													kind: button.kind,
												},
											}),
										);
										e.dataTransfer.effectAllowed = "copy";
									}}
									title="Drag onto a ribbon group to add this button"
								>
									<span className={styles.gripHandle}>⋮⋮</span>
									<AppsAddInRegular
										fontSize={14}
										style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }}
									/>
									<Text className={styles.itemName}>{button.label || button.id}</Text>
									<Badge size="small" appearance="outline">
										{LOCATION_SHORT[location]}
									</Badge>
									{isNew && (
										<Badge size="small" color="brand" appearance="tint">
											NEW
										</Badge>
									)}
								</div>
							</Tooltip>
						))}
						{customButtons.length === 0 && (
							<Text
								size={200}
								style={{
									color: tokens.colorNeutralForeground3,
									padding: 8,
									display: "block",
								}}
							>
								No custom buttons yet. Add one from the ribbon canvas — in{" "}
								<strong>Modern command bar</strong> use the <strong>+ Add</strong> button at the
								end of the bar; in <strong>Classic ribbon</strong> use the <strong>+</strong>{" "}
								inside any group.
							</Text>
						)}
					</>
				)}

				{/* ── Commands ── */}
				{subTab === "commands" && (
					<>
						<Button
							appearance="subtle"
							size="small"
							icon={<AddRegular />}
							onClick={createAndOpenCommand}
							style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }}
						>
							New command
						</Button>
						{commands.map((cmd) => (
							<div
								key={cmd.id}
								className={styles.item}
								onClick={() => openCommandEditor(cmd.id)}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => e.key === "Enter" && openCommandEditor(cmd.id)}
							>
								<CodeRegular fontSize={14} style={{ color: tokens.colorNeutralForeground3 }} />
								<Text className={styles.itemName}>{cmd.id}</Text>
								<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
									{cmd.actions.length} action{cmd.actions.length !== 1 ? "s" : ""}
								</Text>
							</div>
						))}
						{commands.length === 0 && (
							<Text
								size={200}
								style={{ color: tokens.colorNeutralForeground3, padding: 8, display: "block" }}
							>
								No commands yet
							</Text>
						)}
					</>
				)}

				{/* ── Rules ── */}
				{subTab === "rules" && (
					<>
						<Button
							appearance="subtle"
							size="small"
							icon={<AddRegular />}
							onClick={createAndOpenRule}
							style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }}
						>
							New rule
						</Button>
						{enableRules.map((r) => (
							<div
								key={r.id}
								className={styles.item}
								onClick={() => openRuleEditor(r.id, "enable")}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => e.key === "Enter" && openRuleEditor(r.id, "enable")}
							>
								<Text className={styles.itemName}>{r.id}</Text>
								<Badge size="small" color="success" appearance="tint">
									Enable
								</Badge>
							</div>
						))}
						{displayRules.map((r) => (
							<div
								key={r.id}
								className={styles.item}
								onClick={() => openRuleEditor(r.id, "display")}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => e.key === "Enter" && openRuleEditor(r.id, "display")}
							>
								<Text className={styles.itemName}>{r.id}</Text>
								<Badge size="small" color="informative" appearance="tint">
									Display
								</Badge>
							</div>
						))}
						{enableRules.length === 0 && displayRules.length === 0 && (
							<Text
								size={200}
								style={{ color: tokens.colorNeutralForeground3, padding: 8, display: "block" }}
							>
								No rules yet
							</Text>
						)}
					</>
				)}

				{/* ── Templates ── */}
				{subTab === "templates" && (
					<>
						{templates.map((t) => (
							<div key={t.id} className={styles.item}>
								<DocumentTableRegular
									fontSize={14}
									style={{ color: tokens.colorNeutralForeground3 }}
								/>
								<Text className={styles.itemName}>{t.id}</Text>
							</div>
						))}
						{templates.length === 0 && (
							<Text
								size={200}
								style={{ color: tokens.colorNeutralForeground3, padding: 8, display: "block" }}
							>
								No templates defined
							</Text>
						)}
					</>
				)}
			</div>
		</div>
	);
}
