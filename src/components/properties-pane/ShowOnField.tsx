import { Field, Radio, RadioGroup, makeStyles, tokens } from "@fluentui/react-components";
import { useCommandProvenance } from "@/hooks/useCommandProvenance";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { otherButtonsUsing } from "@/utils/ribbonMenu";
import { filterOf, showOnOf, type ShowOn } from "@/utils/showOn";
import type { RibbonButton, RuleStep } from "@/types/ribbon";

/**
 * Where a button shows (#184): one choice instead of three "add a filter"
 * badges, showing what the command's display rules already say.
 * The rules it reads and writes are in utils/showOn.
 */

const useStyles = makeStyles({
	group: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS },
});

export function ShowOnField({ button }: { button: RibbonButton }) {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const location = useSelectionStore((s) => s.location);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const upsertCommand = useRibbonStore((s) => s.upsertCommand);
	const upsertDisplayRule = useRibbonStore((s) => s.upsertDisplayRule);
	const batch = useRibbonStore((s) => s.batch);
	const provenance = useCommandProvenance(button.commandId || undefined);

	const command = commands.find((c) => c.id === button.commandId);
	if (!command) {
		return (
			<Field
				label="Show on"
				hint="Bind a command first: where a button shows is set on its command."
			>
				<RadioGroup disabled value="all">
					<Radio value="all" label="All clients" />
				</RadioGroup>
			</Field>
		);
	}

	const current = showOnOf(command, displayRules);
	// Microsoft's or another solution's command: customise it first (#184).
	const editable =
		provenance?.provenance === "custom" ||
		provenance?.provenance === "customising" ||
		provenance?.provenance === "customised";

	// Other buttons with this command change too.
	const others = otherButtonsUsing(
		ribbons,
		command.id,
		button.id,
		(b) => captionOf(b.label, locLabels, undefined, b.source?.labelToken),
		location,
	);

	const apply = (choice: Exclude<ShowOn, "custom">) => {
		const kept = command.displayRules.filter(
			(id) =>
				filterOf(
					id,
					displayRules.find((r) => r.id === id),
				) === undefined,
		);
		if (choice === "all") {
			upsertCommand({ ...command, displayRules: kept });
			return;
		}
		const type = choice === "uci" ? "Modern" : "Refresh";
		// Reuse a plain rule of this type when there is one.
		const existing = displayRules.find(
			(r) =>
				r.steps.length === 1 &&
				r.steps[0].kind === "CommandClientTypeRule" &&
				r.steps[0].type === type &&
				!r.steps[0].invertResult &&
				r.steps[0].default === undefined,
		);
		let ruleId = existing?.id ?? `${command.id}.${type}.DisplayRule`;
		for (let n = 1; !existing && displayRules.some((r) => r.id === ruleId); n++)
			ruleId = `${command.id}.${type}.DisplayRule.${n}`;
		const step: RuleStep = { kind: "CommandClientTypeRule", type };
		// The rule and its binding are one undo step (#34).
		batch(() => {
			if (!existing) upsertDisplayRule({ id: ruleId, steps: [step] });
			upsertCommand({ ...command, displayRules: [...kept, ruleId] });
		});
	};

	const hint = !editable
		? "Customise the command to change where it shows."
		: others.length > 0
			? `Also changes ${others.length === 1 ? "1 other button" : `${others.length} other buttons`} that use${others.length === 1 ? "s" : ""} this command: ${others.slice(0, 3).join(", ")}${others.length > 3 ? ", …" : ""}.`
			: "Set by display rules on the button's command.";

	return (
		<Field label="Show on" hint={hint}>
			<RadioGroup
				className={styles.group}
				value={current}
				disabled={!editable}
				onChange={(_, d) =>
					d.value !== "custom" && apply(d.value as Exclude<ShowOn, "custom">)
				}
			>
				<Radio value="all" label="All clients" />
				<Radio value="uci" label="Unified Interface only" />
				<Radio
					value="classic"
					label="Classic web client only (not shown in Unified Interface)"
				/>
				{current === "custom" && (
					<Radio value="custom" label="Custom: see Display rules" disabled />
				)}
			</RadioGroup>
		</Field>
	);
}
