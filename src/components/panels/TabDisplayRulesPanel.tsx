import React, { useState } from "react";
import {
	makeStyles,
	tokens,
	DrawerBody,
	DrawerHeader,
	DrawerHeaderTitle,
	OverlayDrawer,
	Button,
	Field,
	Input,
	Text,
	Badge,
	Subtitle2,
	MessageBar,
	MessageBarBody,
	Select,
} from "@fluentui/react-components";
import { DismissRegular, AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { TabDisplayRule, TabDisplayRuleStep } from "@/types/ribbon";

function createEntityStep(): TabDisplayRuleStep {
	return {
		kind: "EntityRule",
		appliesTo: "PrimaryEntity",
		context: "HomePageGrid",
	};
}

function createPageStep(): TabDisplayRuleStep {
	return {
		kind: "PageRule",
		address: "",
	};
}

const useStyles = makeStyles({
	drawer: {
		width: "560px",
		maxWidth: "95vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalM,
		padding: tokens.spacingHorizontalM,
		overflowY: "auto",
	},
	ruleRow: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
		padding: tokens.spacingHorizontalS,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	ruleHeader: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	stepFields: {
		display: "flex",
		gap: tokens.spacingHorizontalS,
		alignItems: "flex-end",
		flexWrap: "wrap",
	},
});

export const TabDisplayRulesPanel: React.FC = () => {
	const styles = useStyles();
	const open = useUIStore((s) => s.tabDisplayRulesOpen);
	const closeTabDisplayRules = useUIStore((s) => s.closeTabDisplayRules);

	const location = useSelectionStore((s) => s.location);
	const tabId = useSelectionStore((s) => s.tabId);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const setTabDisplayRules = useRibbonStore((s) => s.setTabDisplayRules);

	const ribbon = ribbons[location];
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const isApplication = location === "Application";
	const tabCommandLocked = Boolean(tab?.commandId);

	const [rules, setRules] = useState<TabDisplayRule[]>(() => tab?.tabDisplayRules ?? []);
	const [validationError, setValidationError] = useState<string | null>(null);

	React.useEffect(() => {
		if (open) {
			setValidationError(null);
			setRules(tab?.tabDisplayRules ?? []);
		}
	}, [open, tab]);

	const addRule = () => {
		setRules((prev) => [
			...prev,
			{
				tabCommand: tab?.commandId ?? "",
				rules: [createEntityStep()],
			},
		]);
	};

	const removeRule = (index: number) => {
		setRules((prev) => prev.filter((_, i) => i !== index));
	};

	const updateRuleTabCommand = (index: number, value: string) => {
		if (tabCommandLocked) return;
		setRules((prev) => prev.map((r, i) => (i === index ? { ...r, tabCommand: value } : r)));
	};

	const updateStep = (ruleIndex: number, stepIndex: number, nextStep: TabDisplayRuleStep) => {
		setRules((prev) =>
			prev.map((rule, ri) =>
				ri === ruleIndex
					? {
							...rule,
							rules: rule.rules.map((step, si) => (si === stepIndex ? nextStep : step)),
						}
					: rule,
			),
		);
	};

	const addStep = (ruleIndex: number) => {
		setRules((prev) =>
			prev.map((rule, ri) =>
				ri === ruleIndex
					? {
							...rule,
							rules: [...rule.rules, isApplication ? createPageStep() : createEntityStep()],
						}
					: rule,
			),
		);
	};

	const removeStep = (ruleIndex: number, stepIndex: number) => {
		setRules((prev) =>
			prev.map((rule, ri) =>
				ri === ruleIndex
					? { ...rule, rules: rule.rules.filter((_, si) => si !== stepIndex) }
					: rule,
			),
		);
	};

	const handleSave = () => {
		if (!tab) {
			setValidationError("No active tab selected.");
			return;
		}

		for (const [index, rule] of rules.entries()) {
			if (!rule.tabCommand.trim()) {
				setValidationError(`Rule ${index + 1}: tabCommand is required.`);
				return;
			}
			if (tab.commandId && rule.tabCommand !== tab.commandId) {
				setValidationError(
					`Rule ${index + 1}: tabCommand must match the tab command ID (${tab.commandId}).`,
				);
				return;
			}
			if (!isApplication && rule.rules.some((step) => step.kind === "PageRule")) {
				setValidationError(
					`Rule ${index + 1}: PageRule is only valid for Application ribbon tabs.`,
				);
				return;
			}
		}

		setValidationError(null);
		setTabDisplayRules(location, tabId, rules);
		closeTabDisplayRules();
	};

	return (
		<OverlayDrawer
			className={styles.drawer}
			open={open}
			position="end"
			onOpenChange={(_, d) => !d.open && closeTabDisplayRules()}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeTabDisplayRules}
							aria-label="Close"
						/>
					}
				>
					<Subtitle2>Tab Display Rules</Subtitle2>
				</DrawerHeaderTitle>
			</DrawerHeader>

			<DrawerBody>
				<div className={styles.body}>
					{validationError && (
						<MessageBar intent="error">
							<MessageBarBody>{validationError}</MessageBarBody>
						</MessageBar>
					)}
					<MessageBar intent="info">
						<MessageBarBody>
							<Text size={200}>
								Tabs are <strong>hidden by default</strong>. Each Tab Display Rule defines when this
								tab is shown. The tabCommand must match the tab's Command ID.
							</Text>
						</MessageBarBody>
					</MessageBar>

					{tab && (
						<div>
							<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
								Tab: <strong>{tab.label}</strong> ({tab.id})
							</Text>
							{tab.commandId && (
								<Text
									size={200}
									style={{ color: tokens.colorNeutralForeground3, display: "block" }}
								>
									Command ID:{" "}
									<code style={{ fontFamily: tokens.fontFamilyMonospace }}>{tab.commandId}</code>
								</Text>
							)}
						</div>
					)}

					{rules.length === 0 && (
						<Text style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
							No display rules — this tab will be hidden.
						</Text>
					)}

					{rules.map((rule, ri) => (
						<div key={ri} className={styles.ruleRow}>
							<div className={styles.ruleHeader}>
								<Badge appearance="outline" size="small">
									Rule {ri + 1}
								</Badge>
								<div style={{ flex: 1 }} />
								<Button
									appearance="subtle"
									size="small"
									icon={<DeleteRegular />}
									onClick={() => removeRule(ri)}
									aria-label="Remove rule"
								/>
							</div>

							<Field label="Tab command ID" hint="Must match Tab.commandId">
								<Input
									value={rule.tabCommand}
									onChange={(_, d) => updateRuleTabCommand(ri, d.value)}
									disabled={tabCommandLocked}
									size="small"
									style={{ fontFamily: tokens.fontFamilyMonospace }}
								/>
							</Field>

							<Text size={100} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
								Steps
							</Text>

							{rule.rules.map((step, si) => (
								<div key={si} className={styles.stepFields}>
									<Field label="Type" style={{ minWidth: "140px" }}>
										<Select
											size="small"
											value={step.kind}
											onChange={(_, d) => {
												if (d.value === "PageRule") {
													updateStep(ri, si, createPageStep());
												} else {
													updateStep(ri, si, createEntityStep());
												}
											}}
										>
											<option value="EntityRule">Entity Rule</option>
											{isApplication && <option value="PageRule">Page Rule</option>}
										</Select>
									</Field>

									{step.kind === "EntityRule" && (
										<>
											<Field label="Applies to" style={{ minWidth: "130px" }}>
												<Select
													size="small"
													value={step.appliesTo ?? "PrimaryEntity"}
													onChange={(_, d) =>
														updateStep(ri, si, {
															...step,
															appliesTo: d.value as "PrimaryEntity" | "SelectedEntity",
														})
													}
												>
													<option value="PrimaryEntity">Primary entity</option>
													<option value="SelectedEntity">Selected entity</option>
												</Select>
											</Field>
											<Field label="Context" style={{ minWidth: "160px" }}>
												<Select
													size="small"
													value={step.context ?? "HomePageGrid"}
													onChange={(_, d) =>
														updateStep(ri, si, {
															...step,
															context: d.value as
																| "Form"
																| "HomePageGrid"
																| "SubGridStandard"
																| "SubGridAssociated",
														})
													}
												>
													<option value="Form">Form</option>
													<option value="HomePageGrid">Home Page Grid</option>
													<option value="SubGridStandard">SubGrid Standard</option>
													<option value="SubGridAssociated">SubGrid Associated</option>
												</Select>
											</Field>
											<Field label="Entity (optional)">
												<Input
													size="small"
													value={step.entityName ?? ""}
													onChange={(_, d) =>
														updateStep(ri, si, { ...step, entityName: d.value || undefined })
													}
													placeholder="any"
												/>
											</Field>
										</>
									)}

									{step.kind === "PageRule" && (
										<Field label="Address pattern" style={{ flex: 1 }}>
											<Input
												size="small"
												value={step.address}
												onChange={(_, d) => updateStep(ri, si, { ...step, address: d.value })}
												placeholder="https://…"
											/>
										</Field>
									)}

									<Button
										appearance="subtle"
										size="small"
										icon={<DeleteRegular />}
										onClick={() => removeStep(ri, si)}
										aria-label="Remove step"
									/>
								</div>
							))}

							<Button
								appearance="subtle"
								size="small"
								icon={<AddRegular />}
								onClick={() => addStep(ri)}
							>
								Add step
							</Button>

							<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
								Info: EntityRule is valid for entity-scoped tabs. Use PageRule only for
								globally-scoped application ribbon tabs.
							</Text>
						</div>
					))}

					<Button appearance="subtle" icon={<AddRegular />} onClick={addRule}>
						Add display rule
					</Button>

					<div
						style={{
							display: "flex",
							justifyContent: "flex-end",
							gap: tokens.spacingHorizontalS,
							paddingTop: tokens.spacingHorizontalS,
						}}
					>
						<Button appearance="secondary" onClick={closeTabDisplayRules}>
							Cancel
						</Button>
						<Button appearance="primary" onClick={handleSave}>
							Save rules
						</Button>
					</div>
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default TabDisplayRulesPanel;
