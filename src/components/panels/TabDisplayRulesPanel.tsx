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
import { ownContainerIds, useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import type { TabDisplayRule, TabDisplayRuleStep } from "@/types/ribbon";

type EntityStep = Extract<TabDisplayRuleStep, { kind: "EntityRule" }>;

/**
 * A tab has one TabDisplayRule: the layer keeps one per TabCommand, so a
 * second one would replace the first (#155). Its steps are alternatives: the
 * tab shows where any of them matches.
 */
function stepsOf(rules: TabDisplayRule[] | undefined): TabDisplayRuleStep[] {
	return (rules ?? []).flatMap((r) => r.rules);
}

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
	const isNewTab = useRibbonStore((s) => !s.baseline[location]?.tabs.some((t) => t.id === tabId));
	// Rules of a tab another solution adds can't be changed (the publish
	// reports it); when the layer couldn't be read, the publish decides.
	const ownTabs = useRibbonStore((s) => ownContainerIds(s, location));
	const readOnly = Boolean(tab) && !isNewTab && ownTabs !== undefined && !ownTabs.includes(tabId);

	const [steps, setSteps] = useState<TabDisplayRuleStep[]>(() => stepsOf(tab?.tabDisplayRules));
	const [validationError, setValidationError] = useState<string | null>(null);

	React.useEffect(() => {
		if (open) {
			setValidationError(null);
			setSteps(stepsOf(tab?.tabDisplayRules));
		}
	}, [open, tab]);

	const updateStep = (index: number, nextStep: TabDisplayRuleStep) => {
		setSteps((prev) => prev.map((step, i) => (i === index ? nextStep : step)));
	};

	const addStep = () => {
		setSteps((prev) => [...prev, isApplication ? createPageStep() : createEntityStep()]);
	};

	const removeStep = (index: number) => {
		setSteps((prev) => prev.filter((_, i) => i !== index));
	};

	const handleSave = () => {
		if (!tab) {
			setValidationError("No active tab selected.");
			return;
		}
		for (const [index, step] of steps.entries()) {
			if (step.kind === "PageRule" && !isApplication) {
				setValidationError(`Step ${index + 1}: a page rule is only valid on application ribbon tabs.`);
				return;
			}
			if (step.kind === "PageRule" && !step.address.trim()) {
				setValidationError(`Step ${index + 1}: enter the page address.`);
				return;
			}
		}

		setValidationError(null);
		// A new tab's rule without a TabCommand is bound to the tab's Command when it's published.
		setTabDisplayRules(location, tabId, steps.length > 0 ? [{ tabCommand: tab.commandId ?? "", rules: steps }] : []);
		closeTabDisplayRules();
	};

	// A table's tab is already limited to that table: it, or any.
	const tableOptions = (step: EntityStep) => [
		...new Set([ribbon.entityLogicalName, step.entityName].filter((n): n is string => Boolean(n))),
	];

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
								Tabs are <strong>hidden by default</strong>. A tab&apos;s display rule says where it&apos;s
								shown, and is bound to the tab&apos;s Command.
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

					{readOnly && (
						<MessageBar intent="warning">
							<MessageBarBody>
								<Text size={200}>
									This tab isn&apos;t added by your customizations, so its display rule can&apos;t be
									changed here.
								</Text>
							</MessageBarBody>
						</MessageBar>
					)}

					{steps.length === 0 && (
						<Text style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
							{isNewTab && !isApplication
								? "No steps: when you publish, this new tab gets the default rule for its location (this table, where the tab is)."
								: "No steps: this tab will be hidden."}
						</Text>
					)}

					{steps.length > 0 && (
						<div className={styles.ruleRow}>
							<div className={styles.ruleHeader}>
								<Badge appearance="outline" size="small">
									Display rule
								</Badge>
								<Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
									The tab shows where any step matches.
								</Text>
							</div>

							{steps.map((step, si) => (
								<div key={si} className={styles.stepFields}>
									<Field label="Type" style={{ minWidth: "140px" }}>
										<Select
											size="small"
											value={step.kind}
											disabled={readOnly}
											onChange={(_, d) => {
												if (d.value === "PageRule") {
													updateStep(si, createPageStep());
												} else {
													updateStep(si, createEntityStep());
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
													value={step.appliesTo ?? ""}
													disabled={readOnly}
													onChange={(_, d) =>
														updateStep(si, {
															...step,
															appliesTo: (d.value || undefined) as EntityStep["appliesTo"],
														})
													}
												>
													<option value="">Any</option>
													<option value="PrimaryEntity">Primary entity</option>
													<option value="SelectedEntity">Selected entity</option>
												</Select>
											</Field>
											<Field label="Context" style={{ minWidth: "160px" }}>
												<Select
													size="small"
													value={step.context ?? ""}
													disabled={readOnly}
													onChange={(_, d) =>
														updateStep(si, {
															...step,
															context: (d.value || undefined) as EntityStep["context"],
														})
													}
												>
													<option value="">Any</option>
													<option value="Form">Form</option>
													<option value="HomePageGrid">Home Page Grid</option>
													<option value="SubGridStandard">SubGrid Standard</option>
													<option value="SubGridAssociated">SubGrid Associated</option>
												</Select>
											</Field>
											{isApplication ? (
												<Field label="Table (optional)">
													<Input
														size="small"
														value={step.entityName ?? ""}
														disabled={readOnly}
														onChange={(_, d) => updateStep(si, { ...step, entityName: d.value || undefined })}
														placeholder="any"
													/>
												</Field>
											) : (
												<Field label="Table">
													<Select
														size="small"
														value={step.entityName ?? ""}
														disabled={readOnly}
														onChange={(_, d) => updateStep(si, { ...step, entityName: d.value || undefined })}
													>
														<option value="">Any</option>
														{tableOptions(step).map((name) => (
															<option key={name} value={name}>
																{name}
															</option>
														))}
													</Select>
												</Field>
											)}
										</>
									)}

									{step.kind === "PageRule" && (
										<Field label="Address pattern" style={{ flex: 1 }}>
											<Input
												size="small"
												value={step.address}
												disabled={readOnly}
												onChange={(_, d) => updateStep(si, { ...step, address: d.value })}
												placeholder="https://…"
											/>
										</Field>
									)}

									<Button
										appearance="subtle"
										size="small"
										icon={<DeleteRegular />}
										disabled={readOnly}
										onClick={() => removeStep(si)}
										aria-label="Remove step"
									/>
								</div>
							))}
						</div>
					)}

					<Button appearance="subtle" icon={<AddRegular />} onClick={addStep} disabled={readOnly || !tab}>
						Add step
					</Button>

					<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
						{isApplication
							? "Entity rules and page rules are both valid on application ribbon tabs."
							: "A table's tabs take entity rules only."}
					</Text>

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
						<Button appearance="primary" onClick={handleSave} disabled={readOnly}>
							Save rules
						</Button>
					</div>
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default TabDisplayRulesPanel;
