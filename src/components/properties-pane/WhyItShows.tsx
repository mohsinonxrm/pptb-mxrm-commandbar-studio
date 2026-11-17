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
import { useRibbonStore } from "@/store/ribbonStore";
import { useDisplayText } from "@/hooks/useDisplayText";
import {
	classicEntryVerdict,
	classicOffBar,
	modernEntryVerdict,
	modernOffBar,
	type EntryVerdict,
	type OffBar,
} from "@/services/uciPreview/bar";
import {
	allOf,
	evaluateStep,
	recordedOutcome,
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
	srOnly: {
		position: "absolute",
		width: "1px",
		height: "1px",
		overflow: "hidden",
		clipPath: "inset(50%)",
		whiteSpace: "nowrap",
	},
});

export type WhyTarget =
	/** A classic control, on its tab; a menu item with its menu's button. */
	| { kind: "classic"; button: RibbonButton; tabId: string; parent?: RibbonButton }
	/** A modern command; a flyout's item with its flyout. */
	| { kind: "modern"; command: ModernCommand; parent?: ModernCommand };

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
		<li className={styles.row} data-step={text} data-outcome={outcomeWord(v.outcome)}>
			<OutcomeIcon outcome={v.outcome} className={styles.rowIcon} />
			<span className={styles.rowText}>
				<Text className={styles.step}>
					<span className={styles.srOnly}>{outcomeWord(v.outcome)}: </span>
					{text}
				</Text>
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
	const recorded = rule.notes.some((n) => n.basis === "recorded");
	const kind = rule.kind === "display" ? "Display rule" : "Enable rule";
	// What CBS works out from the steps alone, where a recording overrides it (an administrator's
	// privilege step CBS assumes, recorded False).
	const fromSteps =
		recorded && steps ? allOf(steps.map((s) => evaluateStep(s, ctx))).outcome : undefined;
	return (
		<li className={styles.row} data-rule={rule.ruleId}>
			<OutcomeIcon outcome={rule.outcome} className={styles.rowIcon} />
			<span className={styles.rowText}>
				<Text className={mergeClasses(styles.ruleId, decides && styles.decides)}>
					<span className={styles.srOnly}>{outcomeWord(rule.outcome)}: </span>
					{rule.ruleId}
				</Text>
				<Caption1 className={styles.muted}>
					{kind} · {outcomeWord(rule.outcome)}
					{decides ? " · hides it" : ""}
				</Caption1>
				{rule.missing && (
					<Caption1 className={styles.muted}>{noteText(rule.notes[0])}</Caption1>
				)}
				{recorded && (
					<Caption1 className={styles.muted}>
						{recordedOutcome(rule.ruleId, ctx) === undefined
							? "Command Checker's outcome on a test org, recorded on another page or selection: this rule doesn't depend on them"
							: "Command Checker's outcome on a test org, for this page"}
						{fromSteps !== undefined &&
						fromSteps !== "unknown" &&
						fromSteps !== rule.outcome
							? `. It overrides the steps, which ${fromSteps ? "pass" : "fail"} as CBS works them out.`
							: ""}
					</Caption1>
				)}
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

const OFF_BAR: Record<OffBar, string> = {
	hidden: "A HideCustomAction hides it, so it isn't on the bar.",
	hiddenByModern: "A migrated modern command hides it in every app, so it isn't on the bar.",
	contextualTab:
		"It's on the chart designer's tab, which Unified Interface shows while a chart is edited, not on the page's bar.",
	unrendered: "Unified Interface doesn't draw this kind of control.",
	modernHidden: "It's hidden in the command designer, so it isn't on the bar.",
	modernDisabled: "It's switched off, so it isn't on the bar.",
};

/** Why the verdict is what it is, before the rules: the cases no single rule explains first. */
function headline(verdict: EntryVerdict, standIn?: ModernCommand): string[] {
	const out: string[] = [];
	if (standIn)
		out.push(
			`The modern command “${standIn.label || standIn.uniqueName}” takes its place on the bar, so its rules decide.`,
		);
	const special = verdict.offBar
		? OFF_BAR[verdict.offBar]
		: verdict.hiddenBySelection
			? "Records are selected, and its command doesn't count them (no SelectionCountRule), so Unified Interface hides it."
			: verdict.noCommand
				? "Its command isn't in the ribbon, so Unified Interface leaves it out."
				: verdict.replacedByPlatform
					? `Unified Interface doesn't draw the ribbon's ${verdict.replacedByPlatform}. It draws its own, first on the bar, where the view has more than one control.`
					: verdict.formula
						? "Its visibility is a Power Fx formula, which CBS can't evaluate."
						: undefined;
	if (special) return [...out, special];
	if (verdict.rules.length === 0)
		return verdict.outcome === true
			? [...out, "It has no display or enable rules, so it shows wherever its location does."]
			: out;
	if (verdict.outcome === true) return [...out, "All its rules pass."];
	if (verdict.outcome === false) {
		const failing = verdict.rules.filter((r) => r.outcome === false);
		return [
			...out,
			failing.length === 1
				? `${failing[0].ruleId} fails, so Unified Interface hides it.`
				: `${failing.length} of its rules fail; the first, ${failing[0].ruleId}, is enough to hide it.`,
		];
	}
	return [...out, "None of its rules fails, but CBS can't work out all of them."];
}

interface Judged {
	verdict: EntryVerdict;
	standIn?: ModernCommand;
}

/** A menu item shows only when its menu's button does: the two outcomes together. */
function withParent(own: Outcome, parent: Outcome | undefined): Outcome {
	if (parent === undefined) return own;
	if (own === false || parent === false) return false;
	return own === "unknown" || parent === "unknown" ? "unknown" : true;
}

export function WhyItShows({ target }: { target: WhyTarget }) {
	const styles = useStyles();
	const location = useSelectionStore((s) => s.location);
	const { simulation, page, context, rules, entries, overrides } = useSimulatedPage(location);
	const connectionUrl = useSessionStore((s) => s.connectionUrl);
	const entityLabel = useSessionStore((s) => s.activeEntity?.displayName);
	const isActivity = useSessionStore((s) => !!s.activeEntity?.isActivity);
	const appFilter = useModernCommandStore((s) => s.appFilter);
	const canvasMode = useUIStore((s) => s.canvasMode);
	const setCanvasMode = useUIStore((s) => s.setCanvasMode);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();

	// The bar's own entry, where the command is on it (a migrated command may stand in for a
	// classic button); one the bar leaves out says why; a menu item is judged on its own, and
	// with its menu's button.
	const judged = useMemo(() => {
		if (!context) return undefined;
		const classic = (button: RibbonButton, tabId: string): Judged => {
			const entry = entries.find((e) => e.kind === "classic" && e.button.id === button.id);
			if (entry?.kind === "classic")
				return { verdict: entry.verdict, standIn: entry.replacedBy };
			const off = classicOffBar(button, tabId, overrides.get(button.id));
			if (off) return { verdict: { outcome: false, rules: [], offBar: off } };
			return { verdict: classicEntryVerdict(button, rules, context).verdict };
		};
		const modern = (command: ModernCommand): Judged => {
			const entry = entries.find((e) => e.kind === "modern" && e.command.id === command.id);
			if (entry) return { verdict: entry.verdict };
			const off = modernOffBar(command);
			if (off) return { verdict: { outcome: false, rules: [], offBar: off } };
			return { verdict: modernEntryVerdict(command, rules, context) };
		};
		if (target.kind === "classic")
			return {
				own: classic(target.button, target.tabId),
				parent: target.parent && classic(target.parent, target.tabId),
			};
		return {
			own: modern(target.command),
			parent: target.parent && modern(target.parent),
		};
	}, [target, entries, rules, context, overrides]);

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

	const { own, parent } = judged;
	const { verdict, standIn } = own;
	const outcome = withParent(verdict.outcome, parent?.verdict.outcome);
	const firstFalse = verdict.rules.find((r) => r.outcome === false);
	const parentName =
		target.kind === "classic"
			? target.parent &&
				(captionOf(
					target.parent.label,
					locLabels,
					undefined,
					target.parent.source?.labelToken,
				) ||
					target.parent.id)
			: target.parent && (target.parent.label || target.parent.uniqueName);
	const why = [
		...(parent
			? [
					parent.verdict.outcome === false
						? `Its menu's button, “${parentName}”, is hidden here, so the menu with this item doesn't open.`
						: parent.verdict.outcome === "unknown"
							? `It's an item of “${parentName}”'s menu, and CBS can't tell whether that shows here.`
							: `It's an item of “${parentName}”'s menu, which shows here.`,
				]
			: []),
		...headline(verdict, standIn),
	];
	const stepsOf = (r: RuleVerdict) =>
		(r.kind === "display" ? rules.displayRules : rules.enableRules).get(r.ruleId)?.steps;
	// PPTB opens it in the connection's browser; without PPTB (tests, the VS Code host) there's no link.
	const canOpen = typeof window.toolboxAPI?.utils?.openInConnectionBrowser === "function";
	const url =
		connectionUrl && canOpen
			? commandCheckerUrl(
					connectionUrl,
					context.entity,
					page,
					simulation,
					appFilter === "all" ? undefined : appFilter,
				)
			: undefined;
	// Only a main grid and a new form open as the page simulated; the rest are reached from the list.
	const direct =
		page === "HomePageGrid" || (page === "Form" && simulation.formState === "Create");

	return (
		<div className={styles.root} data-why-it-shows>
			<div className={styles.status} role="status">
				<OutcomeIcon outcome={outcome} className={styles.statusIcon} />
				<Text weight="semibold">{STATUS[String(outcome)]}</Text>
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
			{why.map((line) => (
				<Text key={line} size={200}>
					{line}
				</Text>
			))}
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
						onClick={() => {
							window.toolboxAPI.utils
								.openInConnectionBrowser(url, "primary")
								.catch(() => undefined);
						}}
					>
						{page === "Form" && direct
							? "open a new form in Dynamics 365 with Command Checker"
							: "open the list in Dynamics 365 with Command Checker"}
					</Link>
					{direct
						? ", then choose Command checker on the command bar."
						: ", go from there to the page simulated, then choose Command checker on its command bar."}
				</Caption1>
			)}
		</div>
	);
}
