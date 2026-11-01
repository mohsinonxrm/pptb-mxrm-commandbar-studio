import React, { useState } from "react";
import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
	CounterBadge,
	InfoLabel,
	makeStyles,
	tokens,
	type AccordionToggleEventHandler,
} from "@fluentui/react-components";
import { readPref, writePref } from "@/utils/localPrefs";

/**
 * Properties-pane sections (#190, #184): one heading style, padding and divider
 * for every section, collapsible, with the open sections remembered per pane.
 */

const useStyles = makeStyles({
	item: {
		borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
	},
	headerRow: {
		display: "flex",
		alignItems: "center",
		paddingRight: tokens.spacingHorizontalS,
	},
	header: {
		flex: 1,
		minWidth: 0,
		fontWeight: tokens.fontWeightSemibold,
	},
	count: { marginLeft: tokens.spacingHorizontalXS },
	panel: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
		margin: 0,
		padding: `0 ${tokens.spacingHorizontalL} ${tokens.spacingVerticalM}`,
		minWidth: 0,
	},
});

export interface PropertySectionsProps {
	/** Where the open sections are remembered, e.g. "properties.edit". */
	storageKey: string;
	/** Sections open the first time, before anything is remembered. */
	defaultOpen: string[];
	children: React.ReactNode;
}

export const PropertySections: React.FC<PropertySectionsProps> = ({
	storageKey,
	defaultOpen,
	children,
}) => {
	const [open, setOpen] = useState<string[]>(() =>
		readPref<string[]>(`sections.${storageKey}`, defaultOpen),
	);
	const onToggle: AccordionToggleEventHandler<string> = (_, data) => {
		const next = data.openItems.map(String);
		setOpen(next);
		writePref(`sections.${storageKey}`, next);
	};
	return (
		<Accordion multiple collapsible openItems={open} onToggle={onToggle}>
			{children}
		</Accordion>
	);
};

export interface PropertySectionProps {
	value: string;
	title: string;
	/** A short explanation, shown behind an info button next to the title. */
	info?: React.ReactNode;
	/** How many items the section holds, shown after the title (e.g. bound rules). */
	count?: number;
	children: React.ReactNode;
}

export const PropertySection: React.FC<PropertySectionProps> = ({
	value,
	title,
	info,
	count,
	children,
}) => {
	const styles = useStyles();
	return (
		<AccordionItem value={value} className={styles.item}>
			{/* The info button sits beside the header, not inside its button. */}
			<div className={styles.headerRow}>
				<AccordionHeader size="small" className={styles.header}>
					{title}
					{!!count && (
						<CounterBadge
							count={count}
							size="medium"
							appearance="ghost"
							color="informative"
							className={styles.count}
						/>
					)}
				</AccordionHeader>
				{info && <InfoLabel info={info} infoButton={{ "aria-label": `About ${title}` }} />}
			</div>
			<AccordionPanel className={styles.panel}>{children}</AccordionPanel>
		</AccordionItem>
	);
};

export default PropertySection;
