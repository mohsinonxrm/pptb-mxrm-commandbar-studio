import React, { useState } from "react";
import {
	Button,
	InfoLabel,
	Radio,
	RadioGroup,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { AppDialog } from "@/components/shared/AppDialog";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { otherButtonsUsing } from "@/utils/ribbonMenu";

/**
 * Hiding a button that isn't yours (#187). Two ways, explained without jargon:
 * a HideCustomAction removes just this button; display rules on its command
 * hide every button that uses the command, and are easy to undo. Display rules
 * are the default only when nothing else uses the command (decided on #193).
 */

interface HideOobWarningModalProps {
	open: boolean;
	buttonLabel: string;
	/** The button itself, so it isn't listed among the others sharing its command. */
	buttonId?: string;
	/** The button's command; the display-rule option edits it. */
	commandId?: string;
	/** Set when Delete was pressed on a button that isn't yours (#17): why it can't be deleted. */
	deleteBlockedReason?: string;
	onConfirmHide: () => void;
	onConfirmDisplayRule: () => void;
	onCancel: () => void;
}

type HideWay = "button" | "rules";

const useStyles = makeStyles({
	body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
	options: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
	description: {
		display: "block",
		color: tokens.colorNeutralForeground2,
		paddingLeft: "32px",
		marginTop: `-${tokens.spacingVerticalXS}`,
	},
});

export const HideOobWarningModal: React.FC<HideOobWarningModalProps> = ({
	open,
	buttonLabel,
	buttonId,
	commandId,
	deleteBlockedReason,
	onConfirmHide,
	onConfirmDisplayRule,
	onCancel,
}) => {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const ribbons = useRibbonStore((s) => s.ribbons);
	const location = useSelectionStore((s) => s.location);

	// Other buttons with the same command disappear too with display rules.
	const others = commandId
		? otherButtonsUsing(
				ribbons,
				commandId,
				buttonId ?? "",
				(b) => captionOf(b.label, locLabels, undefined, b.source?.labelToken),
				location,
			)
		: [];

	const [way, setWay] = useState<HideWay>(commandId && others.length === 0 ? "rules" : "button");

	const othersText =
		others.length === 0
			? "No other button uses its command."
			: `Also hides ${others.length === 1 ? "1 other button" : `${others.length} other buttons`} that use${others.length === 1 ? "s" : ""} its command: ${others.slice(0, 4).join(", ")}${others.length > 4 ? ", …" : ""}.`;

	return (
		<AppDialog
			open={open}
			onOpenChange={(o) => !o && onCancel()}
			size="medium"
			title={deleteBlockedReason ? `Can't delete "${buttonLabel}"` : `Hide "${buttonLabel}"?`}
			actions={
				<>
					<Button appearance="secondary" onClick={onCancel}>
						Cancel
					</Button>
					<Button
						appearance="primary"
						onClick={way === "rules" ? onConfirmDisplayRule : onConfirmHide}
					>
						Hide button
					</Button>
				</>
			}
		>
			<div className={styles.body}>
				{deleteBlockedReason && (
					<Text>
						{deleteBlockedReason} Only buttons your solution adds can be deleted; you
						can hide this one instead.
					</Text>
				)}
				<RadioGroup
					className={styles.options}
					value={way}
					onChange={(_, d) => setWay(d.value as HideWay)}
					aria-label="How to hide it"
				>
					<div>
						<Radio value="button" label="Hide this button only" />
						<Text size={200} className={styles.description}>
							Removes it from this table&apos;s ribbon. Show it again under
							&ldquo;Hidden by customizations&rdquo; in Properties. Once a managed
							solution ships the hide, only a new version of that solution can bring
							it back.
						</Text>
					</div>
					<div>
						<Radio
							value="rules"
							disabled={!commandId}
							label="Hide it with display rules on its command"
						/>
						<Text size={200} className={styles.description}>
							{commandId
								? `Adds two display rules to the command so it never shows. Easy to undo: remove the rules. ${othersText}`
								: "Not available: this button has no command."}
						</Text>
					</div>
				</RadioGroup>
				<InfoLabel
					size="small"
					info={
						<>
							&ldquo;Hide this button only&rdquo; adds a HideCustomAction to your
							customizations. The display rules are Mscrm.HideOnModern and
							Mscrm.ShowOnlyOnModern, which are never both true.
						</>
					}
				>
					What each one writes
				</InfoLabel>
			</div>
		</AppDialog>
	);
};

export default HideOobWarningModal;
