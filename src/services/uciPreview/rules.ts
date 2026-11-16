import type {
	CommandDefinition,
	DisplayRule,
	EnableRule,
	EntityProperty,
	RuleStep,
} from "@/types/ribbon";

/**
 * The rule evaluator of the Unified Interface preview (#191, phase B1). It works out a command's
 * display and enable rules for one page context, the way Unified Interface does on the web.
 *
 * Every step is one of three things:
 * - **evaluated** from the context (selection, form state, client type, …);
 * - **recorded:** a rule CBS can't evaluate (custom JavaScript, an organization feature), taken
 *   from a real org's command bar instead (`recordedOutcomes.ts`);
 * - **can't simulate:** anything else. The command's outcome is then unknown, unless another
 *   rule already hides it.
 *
 * Checked against the recordings in `src/__fixtures__/uci-preview` (docs/uci-command-bar.md).
 */

/** The page a command bar is on, as Unified Interface's `EntityRule Context` names it. */
export type UciLocation = "HomePageGrid" | "Form" | "SubGridStandard" | "SubGridAssociated";

export type FormState = "Create" | "Existing" | "ReadOnly" | "Disabled" | "BulkEdit";

export interface SimulationContext {
	location: UciLocation;
	/** The bar's entity: the main grid's, the form's, or the sub-grid's records. */
	entity: string;
	/** On a sub-grid or associated view: the form's entity (`PrimaryEntity`). Defaults to `entity`. */
	primaryEntity?: string;
	/** Rows selected in the grid (`SelectedEntity`). 0 on a form. */
	selectedCount: number;
	/** On a form: Create (new record), Existing, Disabled (inactive), ReadOnly, BulkEdit. */
	formState?: FormState;
	/** On a form: its type. Defaults to Main. */
	formType?: string;
	/**
	 * The selected records' relationship to the form (`RelationshipTypeRule`). Defaults to
	 * NoRelationship on a main grid or form; can't be simulated on a sub-grid without it.
	 */
	relationshipType?: "OneToMany" | "ManyToMany" | "NoRelationship";
	/** "all": the user has every privilege (a System Administrator). Otherwise privilege rules can't be simulated. */
	privileges?: "all";
	/** Entity metadata flags (`EntityPropertyRule`), by entity logical name. */
	entityProperties?: Readonly<Record<string, Partial<Record<EntityProperty, boolean>>>>;
	/** Rule outcomes Command Checker reported on a real org (`recordedRules.ts`). */
	recorded?: RecordedRules;
}

/**
 * Display and enable rule outcomes as Command Checker reported them, by rule id, then by
 * context (`recordedContextKey`). A value is the same for every recorded entity, or given per
 * entity where they differed.
 */
export interface RecordedRules {
	/** Where and when they were recorded. */
	source: string;
	/** The entities recorded in each context. */
	contexts: Readonly<Record<string, readonly string[]>>;
	rules: Readonly<
		Record<string, Readonly<Record<string, boolean | Readonly<Record<string, boolean>>>>>
	>;
}

/** The context a recorded outcome applies to: the page, and the selection or form state. */
export function recordedContextKey(ctx: SimulationContext): string {
	if (ctx.location === "Form") return `Form.${ctx.formState ?? "Existing"}`;
	return `${ctx.location}.sel${Math.min(ctx.selectedCount, 2)}`;
}

export type Outcome = boolean | "unknown";

/** Why a step's outcome was assumed, recorded or couldn't be worked out. */
export interface StepNote {
	/**
	 * - `assumed`: a privilege, taken as held (the context's user is a System Administrator);
	 * - `ignored`: a rule no ribbon defines, which Unified Interface ignores;
	 * - `recorded`: the whole rule's outcome, from Command Checker on a real org;
	 * - `cannot-simulate`: CBS can't work it out.
	 */
	basis: "assumed" | "ignored" | "recorded" | "cannot-simulate";
	/** The step or rule, e.g. `CustomRule XrmCore.Rules.Enabled.enableImportForWeb`. */
	step: string;
	/** What CBS would need (e.g. "custom JavaScript"), or where a recording comes from. */
	reason?: string;
}

export interface Verdict {
	outcome: Outcome;
	notes: StepNote[];
}

/** One of a command's rules and how it came out. */
export interface RuleVerdict extends Verdict {
	ruleId: string;
	kind: "display" | "enable";
	/** No ribbon defines the rule: Unified Interface ignores it. */
	missing?: boolean;
}

export interface CommandVerdict {
	/** False if any display or enable rule is false; "unknown" if none is but one is unknown. */
	outcome: Outcome;
	rules: RuleVerdict[];
}

const yes = (outcome: Outcome, notes: StepNote[] = []): Verdict => ({ outcome, notes });

/** Three-valued AND: false wins, then unknown. */
export function allOf(verdicts: readonly Verdict[]): Verdict {
	const notes = verdicts.flatMap((v) => v.notes);
	if (verdicts.some((v) => v.outcome === false)) return yes(false, notes);
	if (verdicts.some((v) => v.outcome === "unknown")) return yes("unknown", notes);
	return yes(true, notes);
}

/** Three-valued OR: true wins, then unknown. */
function anyOf(verdicts: readonly Verdict[]): Verdict {
	const notes = verdicts.flatMap((v) => v.notes);
	if (verdicts.some((v) => v.outcome === true)) return yes(true, notes);
	if (verdicts.some((v) => v.outcome === "unknown")) return yes("unknown", notes);
	return yes(false, notes);
}

const primaryOf = (ctx: SimulationContext) => ctx.primaryEntity ?? ctx.entity;
/** The entity a rule's `AppliesTo` names: on a sub-grid, PrimaryEntity is the form's. */
const entityFor = (ctx: SimulationContext, appliesTo?: string) =>
	appliesTo === "PrimaryEntity" ? primaryOf(ctx) : ctx.entity;

function cannot(step: string, reason: string): Verdict {
	return yes("unknown", [{ basis: "cannot-simulate", step, reason }]);
}

/**
 * How far a rule's recording carries: to this page and selection or form state only, to any state
 * of this page (privileges don't depend on the selection), or to any page (an organization's
 * features and settings don't depend on it).
 */
export type RecordedScope = "context" | "page" | "anywhere";

/**
 * A rule's recorded outcome, if Command Checker reported one in the scope: the same on every
 * recorded entity, or this entity's. Outside this context, only when every recording agrees.
 */
export function recordedOutcome(
	ruleId: string,
	ctx: SimulationContext,
	scope: RecordedScope = "context",
): boolean | undefined {
	const byKey = ctx.recorded?.rules[ruleId];
	if (!byKey) return undefined;
	const valueOf = (key: string) => {
		const v = byKey[key];
		return typeof v === "boolean" ? v : v?.[ctx.entity];
	};
	const here = valueOf(recordedContextKey(ctx));
	if (here !== undefined || scope === "context") return here;
	const values = new Set(
		Object.keys(byKey)
			.filter((key) => scope === "anywhere" || key.startsWith(`${ctx.location}.`))
			.map(valueOf)
			.filter((v): v is boolean => v !== undefined),
	);
	return values.size === 1 ? [...values][0] : undefined;
}

/** What a rule's unsettled steps depend on, for how far a recording of it carries. */
function scopeOf(steps: readonly RuleStep[]): RecordedScope {
	// Only a rule none of whose steps depends on the page, selection or form state carries over:
	// a False recorded elsewhere may come from a step that's True here.
	const kinds = new Set<string>();
	const walk = (list: readonly RuleStep[]): void =>
		list.forEach((s) => (s.kind === "OrRule" ? s.groups.forEach(walk) : kinds.add(s.kind)));
	walk(steps);
	const anywhere = [...kinds].every((k) => STATE_FREE.has(k));
	if (anywhere) return [...kinds].some((k) => k.endsWith("PrivilegeRule")) ? "page" : "anywhere";
	return "context";
}

/** Rule kinds whose outcome doesn't change with the page, selection or form state. */
const STATE_FREE: ReadonlySet<string> = new Set([
	"FeatureControlRule",
	"OrganizationSettingRule",
	"EntityPrivilegeRule",
	"MiscellaneousPrivilegeRule",
	"CommandClientTypeRule",
	"CrmClientTypeRule",
	"CrmOfflineAccessStateRule",
	"DeviceTypeRule",
	"SkuRule",
	"PageRule",
	"HideForTabletExperienceRule",
	"CrmOutlookClientTypeRule",
	"CrmOutlookClientVersionRule",
	"OutlookRenderTypeRule",
	"OutlookVersionRule",
]);

/** One rule step, before `InvertResult`. */
function evaluateBare(step: RuleStep, ctx: SimulationContext): Verdict {
	switch (step.kind) {
		case "OrRule":
			return anyOf(step.groups.map((group) => allOf(group.map((s) => evaluateStep(s, ctx)))));
		case "SelectionCountRule": {
			// PrimaryEntity is the main grid itself, or the form's record: on a form or a sub-grid
			// that's one record (none on a new form).
			const count =
				step.appliesTo !== "PrimaryEntity" || ctx.location === "HomePageGrid"
					? ctx.selectedCount
					: ctx.location === "Form" && ctx.formState === "Create"
						? 0
						: 1;
			return yes(count >= (step.minimum ?? 0) && count <= (step.maximum ?? Infinity));
		}
		case "EntityRule": {
			const entityOk = !step.entityName || step.entityName === entityFor(ctx, step.appliesTo);
			const contextOk = !step.context || step.context === ctx.location;
			return yes(entityOk && contextOk);
		}
		case "FormEntityContextRule": {
			// The form the bar is on: none on a main grid; a sub-grid's form is its parent's.
			const formEntity =
				ctx.location === "Form"
					? ctx.entity
					: ctx.location === "HomePageGrid"
						? undefined
						: primaryOf(ctx);
			return yes(formEntity === step.entityName);
		}
		case "FormStateRule":
			return yes(ctx.location === "Form" && ctx.formState === step.state);
		case "FormTypeRule":
			return yes(ctx.location === "Form" && (ctx.formType ?? "Main") === step.type);
		case "CommandClientTypeRule":
			return yes(step.type === "Modern");
		case "CrmClientTypeRule":
			return yes(step.type === "Web");
		case "CrmOfflineAccessStateRule":
			return yes(step.state === "Online");
		case "DeviceTypeRule":
			// InteractionCentric (the old Interactive Service Hub) isn't simply false: Command
			// Checker listed Mscrm.ShowOnInteractionCentricHideOnModern, true only through it, as
			// True on contact's form (2026-11-15).
			return step.type === "InteractionCentric"
				? cannot("DeviceTypeRule InteractionCentric", "the device type")
				: yes(step.type === "Web");
		case "HideForTabletExperienceRule":
			// True everywhere but the tablet app: it hides there.
			return yes(true);
		case "SkuRule":
			return yes(step.sku === "Online");
		case "PageRule":
			// The legacy web client's pages; Unified Interface isn't one of them.
			return yes(false);
		case "OutlookRenderTypeRule":
			// The page renders as the web client's, not inside Outlook.
			return yes(step.type === "Web");
		case "CrmOutlookClientTypeRule":
		case "CrmOutlookClientVersionRule":
		case "OutlookItemTrackingRule":
		case "OutlookVersionRule":
			return yes(false);
		case "RelationshipTypeRule": {
			const type =
				ctx.relationshipType ??
				(ctx.location === "HomePageGrid" || ctx.location === "Form"
					? "NoRelationship"
					: undefined);
			if (!step.relationshipType) return yes(true);
			if (!type)
				return cannot(
					`RelationshipTypeRule ${step.relationshipType}`,
					"the sub-grid's relationship",
				);
			return yes(type === step.relationshipType);
		}
		case "RecordPrivilegeRule":
			// The record's own access: an inactive record denies Write even to an administrator.
			return cannot(`RecordPrivilegeRule ${step.privilegeType}`, "the record's access");
		case "EntityPrivilegeRule":
		case "MiscellaneousPrivilegeRule": {
			const name =
				step.kind === "MiscellaneousPrivilegeRule"
					? step.privilegeName
					: `${step.privilegeType}${step.kind === "EntityPrivilegeRule" && step.entityName ? ` ${step.entityName}` : ""}`;
			return ctx.privileges === "all"
				? yes(true, [
						{
							basis: "assumed",
							step: `${step.kind} ${name}`,
							reason: "a System Administrator",
						},
					])
				: cannot(`${step.kind} ${name}`, "the user's security roles");
		}
		case "EntityPropertyRule": {
			const entity = step.entityName ?? entityFor(ctx, step.appliesTo);
			const value = ctx.entityProperties?.[entity]?.[step.propertyName];
			return value === undefined
				? cannot(
						`EntityPropertyRule ${step.propertyName} (${entity})`,
						"the entity's metadata",
					)
				: yes(value === step.propertyValue);
		}
		case "CustomRule":
			return cannot(`CustomRule ${step.functionName}`, "custom JavaScript");
		case "FeatureControlRule":
			return cannot(
				`FeatureControlRule ${step.featureControlBit}`,
				"the organization's features",
			);
		case "OrganizationSettingRule":
			return cannot(`OrganizationSettingRule ${step.setting}`, "the organization's settings");
		case "ValueRule":
			return cannot(`ValueRule ${step.field}`, "the record's data");
		case "OptionSetRule":
			return cannot(`OptionSetRule ${step.optionSet}`, "the record's data");
		case "ReferencingAttributeRequiredRule":
			return cannot("ReferencingAttributeRequiredRule", "the sub-grid's relationship");
		case "RawRule":
			return cannot(step.tagName, "a rule CBS doesn't model");
		default:
			return cannot("Unknown rule step", "a rule CBS doesn't model");
	}
}

/** One rule step, `InvertResult` applied (an unknown stays unknown). */
export function evaluateStep(step: RuleStep, ctx: SimulationContext): Verdict {
	const v = evaluateBare(step, ctx);
	const invert = "invertResult" in step && step.invertResult === true;
	return invert && v.outcome !== "unknown" ? yes(!v.outcome, v.notes) : v;
}

/**
 * A display or enable rule: all its steps must hold. Where CBS can't work it out, or assumed a
 * privilege, Command Checker's recorded outcome for the rule wins (an administrator's
 * privilege rule on relationship roles was False on the account grid).
 */
export function evaluateRule(rule: DisplayRule | EnableRule, ctx: SimulationContext): Verdict {
	// Settled without assuming a privilege: an evaluated False holds whatever was recorded.
	const strict = allOf(rule.steps.map((s) => evaluateStep(s, { ...ctx, privileges: undefined })));
	if (strict.outcome !== "unknown" || ctx.privileges !== "all") return strict;
	const v = allOf(rule.steps.map((s) => evaluateStep(s, ctx)));
	const outcome = recordedOutcome(rule.id, ctx, scopeOf(rule.steps));
	return outcome === undefined
		? v
		: yes(outcome, [{ basis: "recorded", step: rule.id, reason: ctx.recorded?.source }]);
}

export interface RuleSet {
	displayRules: ReadonlyMap<string, DisplayRule>;
	enableRules: ReadonlyMap<string, EnableRule>;
}

/**
 * A command's display and enable rules. Unified Interface hides a command that's disabled, so
 * both decide whether it shows.
 */
export function evaluateCommand(
	command: CommandDefinition,
	rules: RuleSet,
	ctx: SimulationContext,
): CommandVerdict {
	const one = (ruleId: string, kind: "display" | "enable"): RuleVerdict => {
		const rule = (kind === "display" ? rules.displayRules : rules.enableRules).get(ruleId);
		// Unified Interface ignores a rule no ribbon defines: Word Templates shows on the grid
		// although its Mscrm.IsFolderNotSelected isn't defined (2026-11-15).
		if (!rule)
			return {
				ruleId,
				kind,
				missing: true,
				...yes(true, [{ basis: "ignored", step: ruleId, reason: "no ribbon defines it" }]),
			};
		return { ruleId, kind, ...evaluateRule(rule, ctx) };
	};
	const verdicts = [
		...command.displayRules.map((id) => one(id, "display")),
		...command.enableRules.map((id) => one(id, "enable")),
	];
	return { outcome: allOf(verdicts).outcome, rules: verdicts };
}

/** Whether any of the command's enable rules counts the selection (at any depth). */
export function countsSelection(command: CommandDefinition, rules: RuleSet): boolean {
	const has = (steps: readonly RuleStep[]): boolean =>
		steps.some(
			(s) =>
				s.kind === "SelectionCountRule" ||
				(s.kind === "OrRule" && s.groups.some((g) => has(g))),
		);
	return command.enableRules.some((id) => has(rules.enableRules.get(id)?.steps ?? []));
}
