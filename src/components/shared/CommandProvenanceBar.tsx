import {
	Badge,
	Button,
	MessageBar,
	MessageBarBody,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import {
	COMMAND_PROVENANCE_LABEL,
	type CommandProvenance,
	type CommandProvenanceInfo,
} from "@/utils/commandProvenance";
import { useCommandProvenance } from "@/hooks/useCommandProvenance";

const useStyles = makeStyles({
	row: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalS,
	},
});

const BADGE_COLOR: Record<
	CommandProvenance,
	"informative" | "warning" | "brand" | "danger" | "success"
> = {
	oob: "informative",
	customising: "warning",
	customised: "brand",
	uncustomising: "danger",
	custom: "success",
};

function whereText(info: CommandProvenanceInfo): string {
	if (info.scope === "application") return "the application ribbon's layer (every table)";
	return info.sharedWithApplication
		? "this table's layer only (the application ribbon keeps the original)"
		: "this table's layer";
}

/**
 * The command's provenance badge with its Customise / Uncustomise actions.
 * `compact` shows the badge and the action button only (properties pane).
 */
export function CommandProvenanceBar({
	commandId,
	compact = false,
}: {
	commandId: string;
	compact?: boolean;
}) {
	const styles = useStyles();
	const info = useCommandProvenance(commandId);
	const customiseCommand = useRibbonStore((s) => s.customiseCommand);
	const uncustomiseCommand = useRibbonStore((s) => s.uncustomiseCommand);
	const discardCommandChanges = useRibbonStore((s) => s.discardCommandChanges);
	if (!info) return null;

	const { provenance } = info;
	const action =
		provenance === "oob" ? (
			<Button size="small" appearance="outline" onClick={() => customiseCommand(commandId)}>
				Customise command
			</Button>
		) : provenance === "customising" ? (
			<Button
				size="small"
				appearance="subtle"
				onClick={() => discardCommandChanges(commandId)}
			>
				Discard customisation
			</Button>
		) : provenance === "customised" ? (
			<Button size="small" appearance="subtle" onClick={() => uncustomiseCommand(commandId)}>
				Uncustomise
			</Button>
		) : provenance === "uncustomising" ? (
			<Button
				size="small"
				appearance="subtle"
				onClick={() => discardCommandChanges(commandId)}
			>
				Undo uncustomise
			</Button>
		) : null;
	const badge = (
		<Badge
			appearance={provenance === "oob" ? "outline" : "filled"}
			color={BADGE_COLOR[provenance]}
			size="small"
		>
			{COMMAND_PROVENANCE_LABEL[provenance]}
		</Badge>
	);

	if (compact) {
		return (
			<div className={styles.row}>
				{badge}
				{action}
			</div>
		);
	}

	const message: Record<CommandProvenance, string> = {
		oob:
			"Defined out of the box or by another solution. Customise it to copy the command — its actions, " +
			`parameters and rule references — into ${whereText(info)}, where you can change it without touching ` +
			"its buttons. Editing it customises it too.",
		customising:
			`On publish, this command is copied into ${whereText(info)} and replaces the original there. ` +
			"Rules keep their ids; a rule you edit is written to the layer as well.",
		customised:
			`${whereText(info).replace(/^./, (c) => c.toUpperCase())} has a copy of this command that replaces the ` +
			"original. Uncustomise to remove the copy so the original applies again.",
		uncustomising:
			"On publish, your layer's copy of this command is removed (with rules only it used) and the original " +
			"applies again. Reload the table after publishing to see the original definition.",
		custom: "Your own command.",
	};
	return (
		<MessageBar intent={provenance === "uncustomising" ? "warning" : "info"}>
			<MessageBarBody>
				<div className={styles.row}>
					{badge}
					<Text size={200}>{message[provenance]}</Text>
					{action}
				</div>
			</MessageBarBody>
		</MessageBar>
	);
}

export default CommandProvenanceBar;
