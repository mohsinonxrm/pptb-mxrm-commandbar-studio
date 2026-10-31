import React from "react";
import {
	makeStyles,
	tokens,
	Button,
	Caption1,
	Field,
	Input,
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	MessageBar,
	MessageBarBody,
	Select,
	Text,
	Tooltip,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { ownContainerIds, useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { useStableKeys } from "@/hooks/useStableKeys";
import { useDisplayText } from "@/hooks/useDisplayText";
import type { RibbonLocation, TabDisplayRule, TabDisplayRuleStep } from "@/types/ribbon";

type EntityStep = Extract<TabDisplayRuleStep, { kind: "EntityRule" }>;

/**
 * A tab has one TabDisplayRule: the layer keeps one per TabCommand, so a
 * second one would replace the first (#155). Its steps are alternatives: the
 * tab shows where any of them matches.
 */
function stepsOf(rules: TabDisplayRule[] | undefined): TabDisplayRuleStep[] {
	return (rules ?? []).flatMap((r) => r.rules);
}

const NO_STEPS: TabDisplayRuleStep[] = [];

const entityStep = (): TabDisplayRuleStep => ({
	kind: "EntityRule",
	appliesTo: "PrimaryEntity",
	context: "HomePageGrid",
});
const pageStep = (): TabDisplayRuleStep => ({ kind: "PageRule", address: "" });

const useStyles = makeStyles({
	// The editor drawer's body scrolls and pads it (#186).
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
	},
	muted: { color: tokens.colorNeutralForeground3 },
	steps: {
		listStyleType: "none",
		margin: 0,
		padding: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	step: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: tokens.spacingVerticalM,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
	},
	stepHeader: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: tokens.spacingHorizontalS,
	},
	fields: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
	},
});

/**
 * A tab's display rule as a view of the editor drawer (#186): it applies as
 * you edit, like every editor there, so Done or Undo replaces Save / Cancel.
 */
export const TabDisplayRulesPanel: React.FC<{ location: RibbonLocation; tabId: string }> = ({
	location,
	tabId,
}) => {
	const styles = useStyles();
	const editorBack = useUIStore((s) => s.editorBack);
	const ribbon = useRibbonStore((s) => s.ribbons[location]);
	const setTabDisplayRules = useRibbonStore((s) => s.setTabDisplayRules);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const captionOf = useDisplayText();
	const tab = ribbon.tabs.find((t) => t.id === tabId);
	const isApplication = location === "Application";
	const isNewTab = useRibbonStore((s) => !s.baseline[location]?.tabs.some((t) => t.id === tabId));
	// Rules of a tab another solution adds can't be changed (the publish
	// reports it); when the layer couldn't be read, the publish decides.
	const ownTabs = useRibbonStore((s) => ownContainerIds(s, location));
	const readOnly = Boolean(tab) && !isNewTab && ownTabs !== undefined && !ownTabs.includes(tabId);

	const steps = React.useMemo(() => stepsOf(tab?.tabDisplayRules), [tab?.tabDisplayRules]);
	const keys = useStableKeys(`tabRules:${location}:${tabId}`, tab ? steps : NO_STEPS);

	// The tab went away while it was shown (an undo of the step that added it).
	const gone = !tab;
	React.useEffect(() => {
		if (gone) editorBack();
	}, [gone, editorBack]);
	if (!tab) return null;

	// A new tab's rule without a TabCommand is bound to the tab's Command when it's published.
	const write = (next: TabDisplayRuleStep[]) =>
		setTabDisplayRules(
			location,
			tabId,
			next.length > 0 ? [{ tabCommand: tab.commandId ?? "", rules: next }] : [],
		);
	const update = (index: number, step: TabDisplayRuleStep) => {
		write(steps.map((s, i) => (i === index ? step : s)));
		keys.update();
	};
	const add = (step: TabDisplayRuleStep) => {
		write([...steps, step]);
		keys.add();
	};
	const remove = (index: number) => {
		write(steps.filter((_, i) => i !== index));
		keys.remove(index);
	};

	// A table's tab is already limited to that table: it, or any.
	const tableOptions = (step: EntityStep) => [
		...new Set(
			[ribbon.entityLogicalName, step.entityName].filter((n): n is string => Boolean(n)),
		),
	];

	const tabName = captionOf(tab.label, locLabels, lang, tab.source?.titleToken) || tab.id;

	return (
		<div className={styles.body}>
			<Text>
				Tabs are hidden unless their display rule matches. <strong>{tabName}</strong> shows
				where <strong>any</strong> step below matches.
			</Text>
			{readOnly && (
				<MessageBar intent="info">
					<MessageBarBody>
						Another solution adds this tab, so its display rule can&apos;t be changed
						here.
					</MessageBarBody>
				</MessageBar>
			)}

			{steps.length > 0 ? (
				<ol className={styles.steps} aria-label="Display rule steps">
					{steps.map((step, si) => (
						<li key={keys.keys[si]} className={styles.step}>
							<div className={styles.stepHeader}>
								<Text weight="semibold">
									{si + 1}. {step.kind === "PageRule" ? "Page" : "Table"}
								</Text>
								{!readOnly && (
									<Tooltip content="Remove step" relationship="label">
										<Button
											appearance="subtle"
											size="small"
											icon={<DeleteRegular />}
											onClick={() => remove(si)}
										/>
									</Tooltip>
								)}
							</div>
							{step.kind === "EntityRule" && (
								<div className={styles.fields}>
									<Field label="Applies to">
										<Select
											value={step.appliesTo ?? ""}
											disabled={readOnly}
											onChange={(_, d) =>
												update(si, {
													...step,
													appliesTo: (d.value ||
														undefined) as EntityStep["appliesTo"],
												})
											}
										>
											<option value="">Any</option>
											<option value="PrimaryEntity">Primary entity</option>
											<option value="SelectedEntity">Selected entity</option>
										</Select>
									</Field>
									<Field label="Context">
										<Select
											value={step.context ?? ""}
											disabled={readOnly}
											onChange={(_, d) =>
												update(si, {
													...step,
													context: (d.value ||
														undefined) as EntityStep["context"],
												})
											}
										>
											<option value="">Any</option>
											<option value="Form">Form</option>
											<option value="HomePageGrid">Home Page Grid</option>
											<option value="SubGridStandard">
												SubGrid Standard
											</option>
											<option value="SubGridAssociated">
												SubGrid Associated
											</option>
										</Select>
									</Field>
									{isApplication ? (
										<Field label="Table" hint="Leave empty for any table.">
											<Input
												value={step.entityName ?? ""}
												disabled={readOnly}
												onChange={(_, d) =>
													update(si, {
														...step,
														entityName: d.value || undefined,
													})
												}
											/>
										</Field>
									) : (
										<Field label="Table">
											<Select
												value={step.entityName ?? ""}
												disabled={readOnly}
												onChange={(_, d) =>
													update(si, {
														...step,
														entityName: d.value || undefined,
													})
												}
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
								</div>
							)}
							{step.kind === "PageRule" && (
								<Field
									label="Address pattern"
									validationState={step.address.trim() ? "none" : "error"}
									validationMessage={
										step.address.trim() ? undefined : "Enter the page address."
									}
								>
									<Input
										value={step.address}
										disabled={readOnly}
										onChange={(_, d) =>
											update(si, { ...step, address: d.value })
										}
										placeholder="https://…"
									/>
								</Field>
							)}
						</li>
					))}
				</ol>
			) : (
				<Text className={styles.muted}>
					{readOnly
						? "This tab has no display rule of its own."
						: isNewTab && !isApplication
							? "No steps: when you publish, this new tab gets the default rule for its location (this table, where the tab is)."
							: "No steps: this tab will be hidden."}
				</Text>
			)}

			{!readOnly &&
				(isApplication ? (
					<div>
						<Menu>
							<MenuTrigger disableButtonEnhancement>
								<Button icon={<AddRegular />}>Add step</Button>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>
									<MenuItem onClick={() => add(entityStep())}>Table</MenuItem>
									<MenuItem onClick={() => add(pageStep())}>Page</MenuItem>
								</MenuList>
							</MenuPopover>
						</Menu>
					</div>
				) : (
					<div>
						<Button icon={<AddRegular />} onClick={() => add(entityStep())}>
							Add step
						</Button>
					</div>
				))}
			<Caption1 className={styles.muted}>
				{isApplication
					? "Application ribbon tabs take table and page steps."
					: "A table's tabs take table steps only."}
			</Caption1>
		</div>
	);
};

export default TabDisplayRulesPanel;
