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
	Text,
	Divider,
	MessageBar,
	MessageBarBody,
	Popover,
	PopoverSurface,
	PopoverTrigger,
	Input,
} from "@fluentui/react-components";
import { AddRegular, DismissRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { useRibbonStore } from "@/store/ribbonStore";
import type { RuleStep, EnableRule, DisplayRule } from "@/types/ribbon";
import RuleStepEditor from "@/components/shared/RuleStepEditor";
import RuleStepPicker from "@/components/shared/RuleStepPicker";
import { summarizeRule } from "@/utils/ruleEngine";
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const useStyles = makeStyles({
	drawer: {
		width: "560px",
		maxWidth: "90vw",
	},
	body: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: tokens.spacingVerticalM,
		overflowY: "auto",
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	stepsList: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		listStyle: "none",
		padding: 0,
		margin: 0,
	},
	summary: {
		padding: tokens.spacingVerticalS,
		backgroundColor: tokens.colorNeutralBackground3,
		borderRadius: tokens.borderRadiusMedium,
		fontStyle: "italic",
		color: tokens.colorNeutralForeground2,
		fontSize: tokens.fontSizeBase200,
	},
	addRow: {
		display: "flex",
		gap: tokens.spacingHorizontalS,
	},
	pickerPopover: {
		maxHeight: "60vh",
		overflowY: "auto",
		minWidth: "320px",
		padding: tokens.spacingVerticalM,
	},
	usedBy: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase200,
	},
	ruleIdRow: {
		display: "flex",
		alignItems: "flex-end",
		gap: tokens.spacingHorizontalS,
	},
	ruleIdInput: {
		fontFamily: tokens.fontFamilyMonospace,
	},
	error: {
		color: tokens.colorPaletteRedForeground1,
		fontSize: tokens.fontSizeBase100,
	},
	sortableItem: {
		listStyle: "none",
	},
	sortableInner: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
	},
	dragHandle: {
		marginTop: tokens.spacingVerticalS,
		cursor: "grab",
	},
});

export const RuleEditorPanel: React.FC = () => {
	const styles = useStyles();
	const ruleEditorOpen = useUIStore((s) => s.ruleEditorOpen);
	const ruleEditorId = useUIStore((s) => s.ruleEditorId);
	const ruleEditorKind = useUIStore((s) => s.ruleEditorKind);
	const closeRuleEditor = useUIStore((s) => s.closeRuleEditor);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const commands = useRibbonStore((s) => s.commands);
	const upsertEnableRule = useRibbonStore((s) => s.upsertEnableRule);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const renameEnableRuleId = useRibbonStore((s) => s.renameEnableRuleId);
	const renameDisplayRuleId = useRibbonStore((s) => s.renameDisplayRuleId);

	const [pickerOpen, setPickerOpen] = useState(false);
	const [draftRuleId, setDraftRuleId] = useState("");

	const isEnable = ruleEditorKind === "enable";

	const activeRule = isEnable
		? enableRules.find((r) => r.id === ruleEditorId)
		: displayRules.find((r) => r.id === ruleEditorId);

	useEffect(() => {
		if (activeRule) setDraftRuleId(activeRule.id);
	}, [activeRule]);

	const sortableIds = useMemo(() => activeRule?.steps.map((_, i) => `step-${i}`) ?? [], [activeRule]);

	const usedBy = commands.filter((c) =>
		isEnable
			? c.enableRules.includes(ruleEditorId ?? "")
			: c.displayRules.includes(ruleEditorId ?? ""),
	).length;

	const handleStepChange = (index: number, updated: RuleStep) => {
		if (!activeRule) return;
		const newSteps = [...activeRule.steps];
		newSteps[index] = updated;
		if (isEnable) {
			upsertEnableRule({ ...(activeRule as EnableRule), steps: newSteps });
		} else {
			upsertDisplayRule({ ...(activeRule as DisplayRule), steps: newSteps });
		}
	};

	const handleStepRemove = (index: number) => {
		if (!activeRule) return;
		const newSteps = activeRule.steps.filter((_, i) => i !== index);
		if (isEnable) {
			upsertEnableRule({ ...(activeRule as EnableRule), steps: newSteps });
		} else {
			upsertDisplayRule({ ...(activeRule as DisplayRule), steps: newSteps });
		}
	};

	const handleAddStep = (step: RuleStep) => {
		if (!activeRule) return;
		const newSteps = [...activeRule.steps, step];
		if (isEnable) {
			upsertEnableRule({ ...(activeRule as EnableRule), steps: newSteps });
		} else {
			upsertDisplayRule({ ...(activeRule as DisplayRule), steps: newSteps });
		}
		setPickerOpen(false);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		if (!activeRule || !event.over || event.active.id === event.over.id) return;
		const oldIndex = sortableIds.indexOf(String(event.active.id));
		const newIndex = sortableIds.indexOf(String(event.over.id));
		if (oldIndex < 0 || newIndex < 0) return;

		const newSteps = arrayMove(activeRule.steps, oldIndex, newIndex);
		if (isEnable) {
			upsertEnableRule({ ...(activeRule as EnableRule), steps: newSteps });
		} else {
			upsertDisplayRule({ ...(activeRule as DisplayRule), steps: newSteps });
		}
	};

	if (!activeRule) return null;

	const summary = summarizeRule(activeRule.steps);
	const idTaken = (isEnable ? enableRules : displayRules).some(
		(r) => r.id === draftRuleId.trim() && r.id !== activeRule.id,
	);
	const idError = !draftRuleId.trim()
		? "Rule ID is required."
		: /\s/.test(draftRuleId)
			? "Rule ID cannot contain whitespace."
			: idTaken
				? "A rule with this ID already exists."
				: "";

	return (
		<OverlayDrawer
			position="end"
			open={ruleEditorOpen}
			onOpenChange={() => closeRuleEditor()}
			className={styles.drawer}
		>
			<DrawerHeader>
				<DrawerHeaderTitle
					action={
						<Button
							appearance="subtle"
							icon={<DismissRegular />}
							onClick={closeRuleEditor}
							aria-label="Close rule editor"
						/>
					}
				>
					<div className={styles.header}>
						<Badge appearance="filled" color={isEnable ? "success" : "informative"} size="small">
							{isEnable ? "Enable" : "Display"}
						</Badge>
						<Text size={400} weight="semibold" style={{ fontFamily: tokens.fontFamilyMonospace }}>
							{activeRule.id}
						</Text>
					</div>
				</DrawerHeaderTitle>
			</DrawerHeader>

			<DrawerBody className={styles.body}>
				<Text className={styles.usedBy}>Used by {usedBy} command(s)</Text>
				<div className={styles.ruleIdRow}>
					<Input
						className={styles.ruleIdInput}
						value={draftRuleId}
						onChange={(_, d) => setDraftRuleId(d.value)}
						aria-label="Rule ID"
					/>
					<Button
						appearance="secondary"
						size="small"
						disabled={!draftRuleId.trim() || !!idError || draftRuleId === activeRule.id}
						onClick={() => {
							const nextId = draftRuleId.trim();
							const success = isEnable
								? renameEnableRuleId(activeRule.id, nextId)
								: renameDisplayRuleId(activeRule.id, nextId);
							if (success) {
								openRuleEditor(nextId, isEnable ? "enable" : "display");
							}
						}}
					>
						Apply ID change
					</Button>
				</div>
				{idError && <Text className={styles.error}>{idError}</Text>}

				{isEnable && (
					<MessageBar intent="warning">
						<MessageBarBody>
							Enable rules have a restricted set of allowed step types. Display-only rule kinds are
							disabled.
						</MessageBarBody>
					</MessageBar>
				)}

				<Divider>Steps (ALL must pass)</Divider>

				<DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
						<ol className={styles.stepsList} role="list" aria-label="Rule steps">
							{activeRule.steps.map((step, i) => (
								<SortableRuleStep
									key={sortableIds[i]}
									id={sortableIds[i]}
									styles={styles}
								>
									<RuleStepEditor
										step={step}
										onChange={(updated) => handleStepChange(i, updated)}
										onRemove={() => handleStepRemove(i)}
										disableEnableOnlyKinds={isEnable}
									/>
								</SortableRuleStep>
							))}
					{activeRule.steps.length === 0 && (
						<Text italic style={{ color: tokens.colorNeutralForeground3 }}>
							No steps yet — all buttons with this rule will be visible/enabled by default.
						</Text>
					)}
						</ol>
					</SortableContext>
				</DndContext>

				<Popover open={pickerOpen} onOpenChange={(_, d) => setPickerOpen(d.open)}>
					<PopoverTrigger>
						<Button
							icon={<AddRegular />}
							appearance="secondary"
							onClick={() => setPickerOpen(true)}
						>
							Add step
						</Button>
					</PopoverTrigger>
					<PopoverSurface className={styles.pickerPopover}>
						<RuleStepPicker onSelect={handleAddStep} disableEnableOnlyKinds={isEnable} />
					</PopoverSurface>
				</Popover>

				<Divider>Plain-English summary</Divider>
				<div className={styles.summary} role="note" aria-label="Rule summary">
					{summary}
				</div>
			</DrawerBody>
		</OverlayDrawer>
	);
};

export default RuleEditorPanel;

function SortableRuleStep({
	id,
	children,
	styles,
}: {
	id: string;
	children: React.ReactNode;
	styles: ReturnType<typeof useStyles>;
}) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
		id,
	});

	return (
		<li
			ref={setNodeRef}
			className={styles.sortableItem}
			style={{ transform: CSS.Transform.toString(transform), transition }}
		>
			<div className={styles.sortableInner}>
				<Button
					ref={setActivatorNodeRef}
					appearance="subtle"
					size="small"
					className={styles.dragHandle}
					{...attributes}
					{...listeners}
					aria-label="Drag to reorder step"
				>
					Drag
				</Button>
				<div style={{ flex: 1 }}>{children}</div>
			</div>
		</li>
	);
}
