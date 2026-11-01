import React, { useEffect, useState } from "react";
import {
	makeStyles,
	tokens,
	Button,
	Caption1,
	Text,
	InfoLabel,
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Popover,
	PopoverSurface,
	PopoverTrigger,
} from "@fluentui/react-components";
import {
	AddRegular,
	ArrowDownRegular,
	ArrowUpRegular,
	MoreVerticalRegular,
	ReOrderDotsVerticalRegular,
} from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RuleStep, EnableRule, DisplayRule } from "@/types/ribbon";
import RuleStepEditor from "@/components/shared/RuleStepEditor";
import RuleStepPicker from "@/components/shared/RuleStepPicker";
import { summarizeRule } from "@/utils/ruleEngine";
import { useStableKeys } from "@/hooks/useStableKeys";
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
	arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const useStyles = makeStyles({
	// The editor drawer's body scrolls and pads it (#186).
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
		minWidth: 0,
	},
	stepsList: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		listStyle: "none",
		padding: 0,
		margin: 0,
	},
	muted: { color: tokens.colorNeutralForeground3 },
	summary: {
		padding: tokens.spacingVerticalS,
		backgroundColor: tokens.colorNeutralBackground3,
		borderRadius: tokens.borderRadiusMedium,
		color: tokens.colorNeutralForeground2,
		fontSize: tokens.fontSizeBase200,
	},
	pickerPopover: {
		maxHeight: "60vh",
		overflowY: "auto",
		minWidth: "320px",
		padding: tokens.spacingVerticalM,
	},
	sortableInner: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalXS,
		minWidth: 0,
	},
	dragHandle: {
		marginTop: tokens.spacingVerticalXS,
		cursor: "grab",
		touchAction: "none",
	},
	stepBody: { flex: 1, minWidth: 0 },
});

const NO_STEPS: RuleStep[] = [];

/**
 * A rule as a view of the editor drawer (#186): its steps in order, each one
 * a card with a drag handle and Move up / Move down. The header (RuleHeader)
 * shows the id, Rename and the commands that use it.
 */
export const RuleEditorPanel: React.FC = () => {
	const styles = useStyles();
	const ruleEditorOpen = useUIStore((s) => s.ruleEditorOpen);
	const ruleEditorId = useUIStore((s) => s.ruleEditorId);
	const ruleEditorKind = useUIStore((s) => s.ruleEditorKind);
	const closeRuleEditor = useUIStore((s) => s.closeRuleEditor);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);

	const [pickerOpen, setPickerOpen] = useState(false);

	const isEnable = ruleEditorKind === "enable";

	const activeRule = isEnable
		? enableRules.find((r) => r.id === ruleEditorId)
		: displayRules.find((r) => r.id === ruleEditorId);

	// The rule went away while it was shown (an undo of the step that added it):
	// back to the view below instead of an empty drawer (#186).
	useEffect(() => {
		if (ruleEditorOpen && ruleEditorId && !activeRule) closeRuleEditor();
	}, [ruleEditorOpen, ruleEditorId, activeRule, closeRuleEditor]);

	// Steps have no id: keys that stay with a step when another one is removed
	// or moved, so its inputs and local state don't jump to a neighbour (#22).
	// Steps changed from elsewhere (undo / redo) get new keys.
	const stepKeys = useStableKeys(
		`${ruleEditorKind}:${activeRule?.id ?? ""}`,
		activeRule?.steps ?? NO_STEPS,
	);
	const sortableIds = stepKeys.keys;

	if (!activeRule) return null;

	const setSteps = (steps: RuleStep[]) => {
		if (isEnable) upsertEnableRule({ ...(activeRule as EnableRule), steps });
		else upsertDisplayRule({ ...(activeRule as DisplayRule), steps });
	};

	const handleStepChange = (index: number, updated: RuleStep) => {
		const newSteps = [...activeRule.steps];
		newSteps[index] = updated;
		stepKeys.update();
		setSteps(newSteps);
	};

	const handleStepRemove = (index: number) => {
		stepKeys.remove(index);
		setSteps(activeRule.steps.filter((_, i) => i !== index));
	};

	const handleAddStep = (step: RuleStep) => {
		stepKeys.add();
		setSteps([...activeRule.steps, step]);
		setPickerOpen(false);
	};

	const moveStep = (from: number, to: number) => {
		if (from === to || from < 0 || to < 0 || to >= activeRule.steps.length) return;
		stepKeys.move(from, to);
		setSteps(arrayMove(activeRule.steps, from, to));
	};

	const handleDragEnd = (event: DragEndEvent) => {
		if (!event.over) return;
		moveStep(
			sortableIds.indexOf(String(event.active.id)),
			sortableIds.indexOf(String(event.over.id)),
		);
	};

	const count = activeRule.steps.length;
	const container = isEnable ? "enable" : "display";

	return (
		<div className={styles.body}>
			{isEnable ? (
				<InfoLabel info="Enable rules take fewer kinds of step than display rules; Add step only offers the ones they take.">
					Passes when every step below is true.
				</InfoLabel>
			) : (
				<Text>Passes when every step below is true.</Text>
			)}

			{count > 0 ? (
				<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
						<ol className={styles.stepsList} aria-label="Rule steps">
							{activeRule.steps.map((step, i) => (
								<SortableRuleStep
									key={sortableIds[i]}
									id={sortableIds[i]}
									draggable={count > 1}
								>
									<RuleStepEditor
										step={step}
										number={i + 1}
										menu={
											count > 1 && (
												<Menu>
													<MenuTrigger disableButtonEnhancement>
														<Button
															appearance="subtle"
															size="small"
															icon={<MoreVerticalRegular />}
															aria-label={`More for step ${i + 1}`}
														/>
													</MenuTrigger>
													<MenuPopover>
														<MenuList>
															<MenuItem
																icon={<ArrowUpRegular />}
																disabled={i === 0}
																onClick={() => moveStep(i, i - 1)}
															>
																Move up
															</MenuItem>
															<MenuItem
																icon={<ArrowDownRegular />}
																disabled={i === count - 1}
																onClick={() => moveStep(i, i + 1)}
															>
																Move down
															</MenuItem>
														</MenuList>
													</MenuPopover>
												</Menu>
											)
										}
										onChange={(updated) => handleStepChange(i, updated)}
										onRemove={() => handleStepRemove(i)}
										container={container}
									/>
								</SortableRuleStep>
							))}
						</ol>
					</SortableContext>
				</DndContext>
			) : (
				<Text className={styles.muted}>
					No steps yet. A rule needs at least one step: add one before you publish, or
					remove the rule from its commands.
				</Text>
			)}

			<div>
				{/* Opens from the button's start: centred, it ran out of the drawer (#229). */}
				<Popover
					open={pickerOpen}
					onOpenChange={(_, d) => setPickerOpen(d.open)}
					positioning="below-start"
				>
					<PopoverTrigger>
						<Button icon={<AddRegular />} onClick={() => setPickerOpen(true)}>
							Add step
						</Button>
					</PopoverTrigger>
					<PopoverSurface className={styles.pickerPopover}>
						<RuleStepPicker onSelect={handleAddStep} container={container} />
					</PopoverSurface>
				</Popover>
			</div>

			{count > 0 && (
				<>
					<Caption1 className={styles.muted}>In words</Caption1>
					<div className={styles.summary} role="note" aria-label="Rule summary">
						{summarizeRule(activeRule.steps)}
					</div>
				</>
			)}
		</div>
	);
};

export default RuleEditorPanel;

function SortableRuleStep({
	id,
	draggable,
	children,
}: {
	id: string;
	draggable: boolean;
	children: React.ReactNode;
}) {
	const styles = useStyles();
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } =
		useSortable({ id, disabled: !draggable });

	return (
		<li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
			<div className={styles.sortableInner}>
				{draggable && (
					<Button
						ref={setActivatorNodeRef}
						appearance="subtle"
						size="small"
						className={styles.dragHandle}
						icon={<ReOrderDotsVerticalRegular />}
						{...attributes}
						{...listeners}
						aria-label="Drag to reorder step"
					/>
				)}
				<div className={styles.stepBody}>{children}</div>
			</div>
		</li>
	);
}
