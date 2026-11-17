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
	/**
	 * Sections added after open sections may have been remembered: open the first time each is
	 * seen, then remembered like the rest.
	 */
	introduced?: string[];
	children: React.ReactNode;
}

export const PropertySections: React.FC<PropertySectionsProps> = ({
	storageKey,
	defaultOpen,
	introduced = [],
	children,
}) => {
	const [open, setOpen] = useState<string[]>(() => {
		// Stored values are checked: anything but a list counts as nothing remembered.
		const list = (v: unknown, fallback: string[]) =>
			Array.isArray(v) ? v.map(String) : fallback;
		const remembered = list(
			readPref<unknown>(`sections.${storageKey}`, defaultOpen),
			defaultOpen,
		);
		const seen = list(readPref<unknown>(`sections.${storageKey}.introduced`, []), []);
		const fresh = introduced.filter((v) => !seen.includes(v));
		if (fresh.length === 0) return remembered;
		// Remembered open, as if they had opened it: the next mount reads it back.
		const opened = [...new Set([...remembered, ...fresh])];
		writePref(`sections.${storageKey}`, opened);
		writePref(`sections.${storageKey}.introduced`, [...seen, ...fresh]);
		return opened;
	});
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
