import { useMemo } from "react";
import { Caption1, Link, Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
	CheckmarkCircleRegular,
	DismissCircleRegular,
	QuestionCircleRegular,
} from "@fluentui/react-icons";
import { useSelectionStore } from "@/store/selectionStore";
import { useSessionStore } from "@/store/sessionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useUIStore } from "@/store/uiStore";
import { useSimulatedPage } from "@/hooks/useSimulatedPage";
import {
	classicEntryVerdict,
	modernEntryVerdict,
	type EntryVerdict,
} from "@/services/uciPreview/bar";
import {
	evaluateStep,
	type Outcome,
	type RuleVerdict,
	type SimulationContext,
	type StepNote,
} from "@/services/uciPreview/rules";
import { summarizeStep } from "@/utils/ruleEngine";
import { commandCheckerUrl, describeContext } from "@/utils/simulation";
import type { RibbonButton, RuleStep } from "@/types/ribbon";
import type { ModernCommand } from "@/types/modernCommand";

/**
 * "Why it shows here" (#191 C4, #36): whether the selected command shows on the page the
 * simulation strip sets, and why: each display and enable rule, ✓ / ✗ / can't tell, with the
 * steps of the ones that don't pass. Rules CBS can't work out use Command Checker's recorded
 * outcomes, as Simulate's bar does; the rest can be checked live in Command Checker.
 */

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS, minWidth: 0 },
	status: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
	statusIcon: { fontSize: "20px", flexShrink: 0 },
	shown: { color: tokens.colorPaletteGreenForeground1 },
	hidden: { color: tokens.colorPaletteRedForeground1 },
	unknown: { color: tokens.colorNeutralForeground3 },
	muted: { color: tokens.colorNeutralForeground3 },
	list: {
		listStyleType: "none",
		margin: 0,
		padding: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	steps: {
		listStyleType: "none",
		margin: `${tokens.spacingVerticalXXS} 0 0`,
		padding: `0 0 0 ${tokens.spacingHorizontalXL}`,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
	},
	row: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalXS,
		minWidth: 0,
	},
	rowIcon: { flexShrink: 0, marginTop: "2px" },
	rowText: { display: "flex", flexDirection: "column", minWidth: 0 },
	ruleId: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		overflowWrap: "anywhere",
	},
	step: { fontSize: tokens.fontSizeBase200, overflowWrap: "anywhere" },
	decides: { fontWeight: tokens.fontWeightSemibold },
});

export type WhyTarget =
	| { kind: "classic"; button: RibbonButton; inMenu?: boolean }
	| { kind: "modern"; command: ModernCommand };

const STATUS: Record<string, string> = {
	true: "Shows here",
	false: "Hidden here",
	unknown: "Can't tell",
};

function OutcomeIcon({ outcome, className }: { outcome: Outcome; className?: string }) {
	const styles = useStyles();
	const props = {
		className: mergeClasses(
			outcome === true ? styles.shown : outcome === false ? styles.hidden : styles.unknown,
			className,
		),
		"aria-hidden": true as const,
	};
	return outcome === true ? (
		<CheckmarkCircleRegular {...props} />
	) : outcome === false ? (
		<DismissCircleRegular {...props} />
	) : (
		<QuestionCircleRegular {...props} />
	);
}

/** What CBS couldn't settle, assumed or took from a recording, in a few words. */
function noteText(note: StepNote): string {
	switch (note.basis) {
		case "assumed":
			return `Assumed: you're ${note.reason ?? "a System Administrator"}`;
		case "ignored":
			return "No ribbon defines it, so Unified Interface ignores it";
		case "recorded":
			return "Command Checker's outcome on a test org";
		default:
			return `CBS can't tell: it depends on ${note.reason ?? "something CBS doesn't model"}`;
	}
}

const outcomeWord = (o: Outcome) => (o === true ? "passes" : o === false ? "fails" : "can't tell");

/** A step and how it came out here; an OR's groups beneath it. */
function StepRow({ step, ctx }: { step: RuleStep; ctx: SimulationContext }) {
	const styles = useStyles();
	const v = evaluateStep(step, ctx);
	const own = step.kind === "OrRule" ? [] : v.notes.filter((n) => n.basis !== "recorded");
	const text = step.kind === "OrRule" ? "Any of these" : summarizeStep(step);
	return (
		<li className={styles.row} aria-label={`${text}: ${outcomeWord(v.outcome)}`}>
			<OutcomeIcon outcome={v.outcome} className={styles.rowIcon} />
			<span className={styles.rowText}>
				<Text className={styles.step}>{text}</Text>
				{own.map((n, i) => (
					<Caption1 key={i} className={styles.muted}>
						{noteText(n)}
					</Caption1>
				))}
				{step.kind === "OrRule" && (
					<ul className={styles.steps}>
						{step.groups.map((group, i) =>
							group.length === 1 ? (
								<StepRow key={i} step={group[0]} ctx={ctx} />
							) : (
								<li key={i}>
									<Caption1 className={styles.muted}>All of these</Caption1>
									<ul className={styles.steps}>
										{group.map((s, j) => (
											<StepRow key={j} step={s} ctx={ctx} />
										))}
									</ul>
								</li>
							),
						)}
					</ul>
				)}
			</span>
		</li>
	);
}

function RuleRow({
	rule,
	steps,
	ctx,
	decides,
}: {
	rule: RuleVerdict;
	steps: readonly RuleStep[] | undefined;
	ctx: SimulationContext;
	decides: boolean;
}) {
	const styles = useStyles();
	const recorded = rule.notes.find((n) => n.basis === "recorded");
	const kind = rule.kind === "display" ? "Display rule" : "Enable rule";
	return (
		<li className={styles.row}>
			<OutcomeIcon outcome={rule.outcome} className={styles.rowIcon} />
			<span className={styles.rowText}>
				<Text className={mergeClasses(styles.ruleId, decides && styles.decides)}>
					{rule.ruleId}
				</Text>
				<Caption1 className={styles.muted}>
					{kind} · {outcomeWord(rule.outcome)}
					{decides ? " · hides it" : ""}
				</Caption1>
				{rule.missing && (
					<Caption1 className={styles.muted}>{noteText(rule.notes[0])}</Caption1>
				)}
				{recorded && <Caption1 className={styles.muted}>{noteText(recorded)}</Caption1>}
				{/* The steps of a rule that doesn't pass: where it went wrong, or what CBS can't tell. */}
				{rule.outcome !== true && steps && steps.length > 0 && (
					<ul className={styles.steps} aria-label={`Steps of ${rule.ruleId}`}>
						{steps.map((s, i) => (
							<StepRow key={i} step={s} ctx={ctx} />
						))}
					</ul>
				)}
			</span>
		</li>
	);
}

/** Why the verdict is what it is, before the rules: the cases no single rule explains. */
function headline(verdict: EntryVerdict, standIn?: ModernCommand): string | undefined {
	if (standIn)
		return `The modern command “${standIn.label || standIn.uniqueName}” takes its place on the bar, so its rules decide.`;
	if (verdict.hiddenBySelection)
		return "Records are selected, and its command doesn't count them (no SelectionCountRule), so Unified Interface hides it.";
	if (verdict.noCommand)
		return "Its command isn't in the ribbon, so Unified Interface leaves it out.";
	if (verdict.replacedByPlatform)
		return `Unified Interface doesn't draw the ribbon's ${verdict.replacedByPlatform}. It draws its own, first on the bar, where the view has more than one control.`;
	if (verdict.formula) return "Its visibility is a Power Fx formula, which CBS can't evaluate.";
	if (verdict.rules.length === 0)
		return verdict.outcome === true
			? "It has no display or enable rules, so it shows wherever its location does."
			: undefined;
	if (verdict.outcome === true) return "All its rules pass.";
	if (verdict.outcome === false) {
		const failing = verdict.rules.filter((r) => r.outcome === false);
		return failing.length === 1
			? `${failing[0].ruleId} fails, so Unified Interface hides it.`
			: `${failing.length} of its rules fail; the first, ${failing[0].ruleId}, is enough to hide it.`;
	}
	return "None of its rules fails, but CBS can't work out all of them.";
}

export function WhyItShows({ target }: { target: WhyTarget }) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const { simulation, page, context, rules, entries } = useSimulatedPage(location);
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const entityLabel = useSessionStore((s) => s.activeEntity?.displayName);
	const isActivity = useSessionStore((s) => !!s.activeEntity?.isActivity);
	const appFilter = useModernCommandStore((s) => s.appFilter);
	const canvasMode = useUIStore((s) => s.canvasMode);
	const setCanvasMode = useUIStore((s) => s.setCanvasMode);

	// The bar's own entry, where the command is on it (a migrated command may stand in for a
	// classic button); a menu item or a command off the bar is judged on its own.
	const judged = useMemo(() => {
		if (!context) return undefined;
		if (target.kind === "classic") {
			const entry = entries.find(
				(e) => e.kind === "classic" && e.button.id === target.button.id,
			);
			if (entry?.kind === "classic")
				return { verdict: entry.verdict, standIn: entry.replacedBy };
			return { verdict: classicEntryVerdict(target.button, rules, context).verdict };
		}
		const entry = entries.find(
			(e) => e.kind === "modern" && e.command.id === target.command.id,
		);
		return { verdict: entry?.verdict ?? modernEntryVerdict(target.command, rules, context) };
	}, [target, entries, rules, context]);

	if (!page || !context || !judged)
		return (
			<Text className={styles.muted} size={200}>
				Simulate covers the main grid, the main form and sub-grids. Choose one of those
				locations to see whether this command shows there.
			</Text>
		);
	if (location === "HomepageGrid" && isActivity && context.entity !== "activitypointer")
		return (
			<Text className={styles.muted} size={200}>
				Unified Interface lists {entityLabel || "this activity"} on the Activities grid,
				with the Activity entity&apos;s command bar. Open the Activity entity
				(activitypointer) to see why a command shows there.
			</Text>
		);

	const { verdict, standIn } = judged;
	const firstFalse = verdict.rules.find((r) => r.outcome === false);
	const why = headline(verdict, standIn);
	const stepsOf = (r: RuleVerdict) =>
		(r.kind === "display" ? rules.displayRules : rules.enableRules).get(r.ruleId)?.steps;
	const url = connectionUrl
		? commandCheckerUrl(
				connectionUrl,
				context.entity,
				page,
				simulation,
				appFilter === "all" ? undefined : appFilter,
			)
		: undefined;

	return (
		<div className={styles.root} data-why-it-shows>
			<div className={styles.status} role="status">
				<OutcomeIcon outcome={verdict.outcome} className={styles.statusIcon} />
				<Text weight="semibold">{STATUS[String(verdict.outcome)]}</Text>
			</div>
			<Caption1 className={styles.muted}>
				{describeContext(page, simulation)}, as a System Administrator in Unified Interface.
				{canvasMode === "edit" && (
					<>
						{" "}
						<Link inline onClick={() => setCanvasMode("simulate")}>
							Change in Simulate
						</Link>
					</>
				)}
			</Caption1>
			{target.kind === "classic" && target.inMenu && (
				<Caption1 className={styles.muted}>
					A menu item: it shows when its menu opens, and only if the menu&apos;s own
					button shows.
				</Caption1>
			)}
			{why && <Text size={200}>{why}</Text>}
			{verdict.rules.length > 0 && !verdict.hiddenBySelection && (
				<ul className={styles.list} aria-label="Rules">
					{verdict.rules.map((r) => (
						<RuleRow
							key={`${r.kind}:${r.ruleId}`}
							rule={r}
							steps={stepsOf(r)}
							ctx={context}
							decides={r === firstFalse}
						/>
					))}
				</ul>
			)}
			{url && (
				<Caption1 className={styles.muted}>
					To check it on a real page,{" "}
					<Link
						inline
						onClick={() =>
							void window.toolboxAPI?.utils.openInConnectionBrowser(url, "primary")
						}
					>
						open it in Dynamics 365 with Command Checker
					</Link>
					, then choose Command checker on the command bar.
				</Caption1>
			)}
		</div>
	);
}
