import { useState } from "react";
import {
	Badge,
	Button,
	MessageBar,
	MessageBarActions,
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
import { ConfirmDialog } from "@/components/modals/ConfirmDialog";

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
	reloadRequired: "danger",
};

function whereText(info: CommandProvenanceInfo): string {
	if (info.scope === "application") return "the application ribbon's layer (every table)";
	return info.sharedWithApplication
		? "this table's layer only (the application ribbon keeps the original)"
		: "this table's layer";
}

/**
 * The command's provenance badge with its Customise / Uncustomise actions.
 * `compact` shows the badge and the action button only (properties pane);
 * `hideBadge` leaves the badge to a header that already shows one (#186).
 */
export function CommandProvenanceBar({
	commandId,
	compact = false,
	hideBadge = false,
}: {
	commandId: string;
	compact?: boolean;
	hideBadge?: boolean;
}) {
	const styles = useStyles();
	const info = useCommandProvenance(commandId);
	const customiseCommand = useRibbonStore((s) => s.customiseCommand);
	const uncustomiseCommand = useRibbonStore((s) => s.uncustomiseCommand);
	const discardCommandChanges = useRibbonStore((s) => s.discardCommandChanges);
	const edited = useRibbonStore((s) => {
		const current = s.commands.find((c) => c.id === commandId);
		const loaded = s.baselineCommands.find((c) => c.id === commandId);
		return !!current && !!loaded && JSON.stringify(current) !== JSON.stringify(loaded);
	});
	// The action waiting for the user to confirm dropping their edits (#18:
	// window.confirm doesn't work in PPTB).
	const [pending, setPending] = useState<{
		what: string;
		confirmLabel: string;
		run: () => void;
	} | null>(null);
	if (!info) return null;

	// Uncustomise and Discard drop this session's edits of the command: confirm first.
	const confirmDropEdits = (what: string, confirmLabel: string, run: () => void) => {
		if (edited) setPending({ what, confirmLabel, run });
		else run();
	};
	const confirmDialog = pending && (
		<ConfirmDialog
			open
			title="Discard unpublished changes?"
			confirmLabel={pending.confirmLabel}
			destructive
			onConfirm={() => {
				pending.run();
				setPending(null);
			}}
			onCancel={() => setPending(null)}
		>
			{pending.what} discards your unpublished changes to <code>{commandId}</code>.
		</ConfirmDialog>
	);

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
				onClick={() =>
					confirmDropEdits("Discarding the customisation", "Discard customisation", () =>
						discardCommandChanges(commandId),
					)
				}
			>
				Discard customisation
			</Button>
		) : provenance === "customised" ? (
			<Button
				size="small"
				appearance="subtle"
				onClick={() =>
					confirmDropEdits("Uncustomising", "Uncustomise", () =>
						uncustomiseCommand(commandId, info.scope),
					)
				}
			>
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
				{confirmDialog}
			</div>
		);
	}

	const message: Record<CommandProvenance, string> = {
		oob:
			"Out of the box or from another solution, so it's read-only. Customise it to copy it — actions, " +
			`parameters and rules — into ${whereText(info)} and change it there; its buttons keep using it.`,
		customising:
			`On publish, this command is copied into ${whereText(info)} and replaces the original there. ` +
			"Rules keep their ids; a rule you edit is written to the layer as well.",
		customised:
			`${whereText(info).replace(/^./, (c) => c.toUpperCase())} has a copy of this command that replaces the ` +
			"original. Uncustomise to remove the copy so the original applies again.",
		uncustomising:
			`On publish, the copy of this command in ${whereText(info)} is removed (with rules only it used) and ` +
			"the original applies again. Reload the table after publishing to see the original definition.",
		custom: "Your own command.",
		reloadRequired:
			"Your layer's copy of this command was removed, so the original applies. What is shown here is the " +
			"removed copy: reload the table to load the original before changing or customising it again.",
	};
	// Your own command needs no notice: its badge says it (#181).
	if (provenance === "custom")
		return hideBadge ? null : <div className={styles.row}>{badge}</div>;
	// The action sits in the bar's own actions area (#189), the confirm outside it.
	return (
		<>
			<MessageBar
				layout="multiline"
				intent={
					provenance === "uncustomising" || provenance === "reloadRequired"
						? "warning"
						: "info"
				}
			>
				<MessageBarBody>
					<div className={styles.row}>
						{!hideBadge && badge}
						<Text size={200}>{message[provenance]}</Text>
					</div>
				</MessageBarBody>
				{action && <MessageBarActions>{action}</MessageBarActions>}
			</MessageBar>
			{confirmDialog}
		</>
	);
}

export default CommandProvenanceBar;
