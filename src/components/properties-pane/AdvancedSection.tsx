import React from "react";
import { makeStyles, tokens, Text, Switch, InfoLabel } from "@fluentui/react-components";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import { useSessionStore } from "@/store/sessionStore";
import {
	OPEN_RECORD_ITEM_COMMAND_ID,
	OPEN_RECORD_ITEM_LOCATIONS,
	isOpenRecordCarrier,
	openRecordCarrierOwnership,
	openRecordCarrierPlacement,
	openRecordCarriers,
	openRecordCommandUsers,
} from "@/utils/openRecordItem";

const useStyles = makeStyles({
	section: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalXS,
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	note: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
	},
});

export const AdvancedSection: React.FC = () => {
	const styles = useStyles();

	const location = useSelectionStore((s) => s.location);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);

	const ribbons = useRibbonStore((s) => s.ribbons);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const setOpenRecordOverride = useRibbonStore((s) => s.setOpenRecordOverride);
	const clearSelection = useSelectionStore((s) => s.clearSelection);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const sessionPrefix = useSessionStore((s) => s.publisherPrefix);

	const ribbon = ribbons[location];
	const showOpenRecordItemToggle = OPEN_RECORD_ITEM_LOCATIONS.includes(location);

	// The override is on for this location while the carrier the switch
	// created is here (see utils/openRecordItem) — that is also what comes
	// back from the layer on reload (#22).
	const openRecordCarrierList = openRecordCarriers(ribbon);
	const hasOpenRecordOverride = openRecordCarrierList.length > 0;
	const ownership = openRecordCarrierList.map((c) => openRecordCarrierOwnership(c));
	const openRecordTheirs = ownership.includes("theirs");
	// Provenance not resolved: wait rather than call it another solution's.
	const openRecordUnknown = !openRecordTheirs && ownership.includes("unknown");
	const openRecordNoGroup = !hasOpenRecordOverride && !openRecordCarrierPlacement(ribbon);
	// Other buttons (e.g. your own) using the command: turning off keeps them and the command.
	const otherOpenRecordUsers = openRecordCommandUsers(ribbon).filter(
		(c) => !isOpenRecordCarrier(c.button),
	);

	const handleOpenRecordToggle = (checked: boolean) => {
		const prefix = activeSolution?.publisherPrefix?.trim() || sessionPrefix?.trim() || "new";
		if (!checked && openRecordCarrierList.some((c) => c.button.id === selectedButtonId))
			clearSelection();
		if (!setOpenRecordOverride(location, checked, prefix) || !checked) return;
		// Open the Command Editor immediately so the user can set the real
		// library path and function name.
		openCommandEditor(OPEN_RECORD_ITEM_COMMAND_ID);
	};

	return (
		<div className={styles.section}>
			{showOpenRecordItemToggle && (
				<div>
					<Switch
						label={
							<InfoLabel
								info={
									<>
										When on, double-clicking a row of this table&apos;s{" "}
										{location === "SubGrid"
											? "sub-grids (on any form)"
											: "home grid"}
										, selecting its primary column link or pressing Enter runs
										your command instead of opening the record. Unified
										Interface only. As Microsoft&apos;s recipe requires, an
										&ldquo;Open record&rdquo; button using the command is added
										here: don&apos;t hide it. The Command Editor opens so you
										can set the script; Publish waits until you do. Turning it
										off removes that button.
									</>
								}
							>
								{`Override opening a record from the ${location === "SubGrid" ? "sub-grid" : "home grid"}`}
							</InfoLabel>
						}
						checked={hasOpenRecordOverride}
						disabled={openRecordTheirs || openRecordUnknown || openRecordNoGroup}
						onChange={(_, d) => handleOpenRecordToggle(d.checked)}
					/>
					{openRecordTheirs && (
						<Text size={100} className={styles.note}>
							The &quot;Open record&quot; button here comes from another solution, so
							the override can&apos;t be turned off from your customizations.
						</Text>
					)}
					{openRecordUnknown && (
						<Text size={100} className={styles.note}>
							CBS doesn&apos;t know yet which solution the &quot;Open record&quot;
							button here comes from (its solution layers haven&apos;t loaded), so it
							isn&apos;t removed — reload the table if this doesn&apos;t clear.
						</Text>
					)}
					{otherOpenRecordUsers.length > 0 && (
						<Text size={100} className={styles.note}>
							Also using Mscrm.OpenRecordItem here:{" "}
							{otherOpenRecordUsers.map((c) => c.button.id).join(", ")}. Turning the
							override off keeps {otherOpenRecordUsers.length === 1 ? "it" : "them"}{" "}
							and the command.
						</Text>
					)}
					{openRecordNoGroup && (
						<Text size={100} className={styles.note}>
							This location has no group to put the button in.
						</Text>
					)}
				</div>
			)}

			{location === "Form" && (
				<Text size={200} className={styles.note}>
					Changes apply to every main form of this table.{" "}
					<InfoLabel
						size="small"
						info="Unified Interface doesn't support a ribbon for one form only, so Command Bar Studio changes the table's form ribbon, which all its main forms use."
						infoButton={{ "aria-label": "Why every form" }}
					/>
				</Text>
			)}
		</div>
	);
};

export default AdvancedSection;
