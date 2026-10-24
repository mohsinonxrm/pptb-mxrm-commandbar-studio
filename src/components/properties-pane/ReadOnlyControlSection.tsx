import { useState } from "react";
import { useDisplayText } from "@/hooks/useDisplayText";
import { Button, Caption1, makeStyles, Subtitle2, Text, tokens } from "@fluentui/react-components";
import { EyeOffRegular, EyeRegular, LockClosedRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { HideOobWarningModal } from "@/components/modals/HideOobWarningModal";
import { CONTROL_KIND_LABELS, CONTROL_TAG_BY_KIND } from "@/utils/controlKinds";
import type { RibbonButton, RibbonLocation } from "@/types/ribbon";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
	},
	title: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
	},
	field: {
		display: "flex",
		flexDirection: "column",
		gap: "2px",
		minWidth: 0,
	},
	mono: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		overflowWrap: "anywhere",
	},
	xml: {
		margin: 0,
		maxHeight: "240px",
		overflow: "auto",
		padding: tokens.spacingHorizontalS,
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground3,
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase100,
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere",
	},
});

interface Props {
	button: RibbonButton;
	location: RibbonLocation;
	tabId: string;
	groupId: string;
}

/**
 * A ToggleButton, Label, DropDown, MRUSplitButton, Spinner or GalleryButton
 * (#42): CBS shows it but doesn't edit it. It can be hidden or unhidden here,
 * and moved or deleted on the canvas when your customizations add it; its XML
 * is published as it was loaded.
 */
export function ReadOnlyControlSection({ button, location, tabId, groupId }: Props) {
	const styles = useStyles();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const hideOobButton = useRibbonStore((s) => s.hideOobButton);
	const hideWithDisplayRules = useRibbonStore((s) => s.hideWithDisplayRules);
	const [hideWarning, setHideWarning] = useState(false);
	// As on the canvas: an out-of-the-box global command bar control can't be
	// changed, and hiding another out-of-the-box control asks first.
	const globalOob = location === "Application" && tabId === "Mscrm.GlobalTab" && button.oob && !button.custom;
	const kind = CONTROL_KIND_LABELS[button.kind];
	const field = (label: string, value: string | undefined) =>
		value ? (
			<div className={styles.field}>
				<Caption1>{label}</Caption1>
				<Text className={styles.mono}>{value}</Text>
			</div>
		) : null;

	return (
		<section className={styles.root} aria-label={`${kind} (read-only)`}>
			<div className={styles.title}>
				<LockClosedRegular aria-hidden />
				<Subtitle2>{kind}</Subtitle2>
			</div>
			<Caption1>
				Command Bar Studio shows this &lt;{CONTROL_TAG_BY_KIND[button.kind]}&gt; but doesn&apos;t edit it. You can hide it,
				and move or delete it when your customizations add it; its XML is published as it was loaded.
			</Caption1>
			{field("Label", captionOf(button.label, locLabels, undefined, button.source?.labelToken))}
			{field("Id", button.id)}
			{field("Command", button.commandId || undefined)}
			<div>
				<Button
					size="small"
					disabled={globalOob}
					icon={button.hidden ? <EyeRegular /> : <EyeOffRegular />}
					onClick={() =>
						!button.hidden && button.oob
							? setHideWarning(true)
							: setButtonProp(location, tabId, groupId, button.id, { hidden: !button.hidden })
					}
				>
					{button.hidden ? "Unhide" : "Hide"}
				</Button>
			</div>
			{hideWarning && (
				<HideOobWarningModal
					open
					buttonLabel={captionOf(button.label, locLabels, undefined, button.source?.labelToken)}
					commandId={button.commandId}
					onConfirmHide={() => {
						hideOobButton(location, tabId, groupId, button.id);
						setHideWarning(false);
					}}
					onConfirmDisplayRule={() => {
						hideWithDisplayRules(button.commandId);
						setHideWarning(false);
					}}
					onCancel={() => setHideWarning(false)}
				/>
			)}
			{button.source?.xml && (
				<div className={styles.field}>
					<Caption1>XML</Caption1>
					<pre className={styles.xml}>{button.source.xml}</pre>
				</div>
			)}
		</section>
	);
}
