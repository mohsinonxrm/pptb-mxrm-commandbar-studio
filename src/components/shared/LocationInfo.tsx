import React from "react";
import {
	Button,
	Popover,
	PopoverSurface,
	PopoverTrigger,
	Text,
	Tooltip,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import type { RibbonLocation } from "@/types/ribbon";
import { LOCATION_INFO, locationRibbonId } from "@/constants/locationInfo";

/**
 * "About this location" (#180, #181): the explanation of a ribbon location
 * behind a button next to the location tabs, instead of a permanent banner.
 */

const useStyles = makeStyles({
	surface: {
		maxWidth: "380px",
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
	},
	ribbonId: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground3,
		overflowWrap: "anywhere",
	},
});

export interface LocationInfoProps {
	location: RibbonLocation;
	/** The open table's logical name, for the ribbon id. */
	table?: string;
	/** Icon only (narrow layouts); the label moves to the tooltip. */
	compact?: boolean;
}

export const LocationInfo: React.FC<LocationInfoProps> = ({ location, table, compact }) => {
	const styles = useStyles();
	const info = LOCATION_INFO[location];
	const trigger = compact ? (
		<Tooltip content="About this location" relationship="label">
			<Button appearance="subtle" size="small" icon={<InfoRegular />} />
		</Tooltip>
	) : (
		<Button appearance="subtle" size="small" icon={<InfoRegular />}>
			About this location
		</Button>
	);
	return (
		<Popover withArrow positioning="below-start">
			<PopoverTrigger disableButtonEnhancement>{trigger}</PopoverTrigger>
			<PopoverSurface className={styles.surface} aria-label={`About ${info.title}`}>
				<Text weight="semibold">{info.title}</Text>
				<Text>{info.body}</Text>
				<span className={styles.ribbonId}>{locationRibbonId(location, table)}</span>
			</PopoverSurface>
		</Popover>
	);
};

export default LocationInfo;
