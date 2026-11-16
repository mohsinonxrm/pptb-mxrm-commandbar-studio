import { forwardRef } from "react";
import {
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Overflow,
	OverflowItem,
	makeStyles,
	mergeClasses,
	useArrowNavigationGroup,
	useIsOverflowItemVisible,
	useOverflowMenu,
} from "@fluentui/react-components";
import { ChevronDownRegular, MoreVerticalRegular } from "@fluentui/react-icons";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import type { SimulatedEntry } from "@/services/uciPreview/bar";
import { D365 } from "./d365Theme";

/**
 * A Dynamics 365 command bar (#191): a white card 44 px high with 8 px corners, 32 px commands
 * (12 px side padding, 16 px icons, 14 px Segoe UI), and the commands that don't fit under a
 * ⋮ button as wide as the bar is high, as Unified Interface draws it (measured on CRM279420,
 * 2026-11-15). Commands keep the bar's order; the last ones go into ⋮ first.
 */

const useStyles = makeStyles({
	card: {
		display: "flex",
		alignItems: "center",
		minWidth: 0,
		height: "44px",
		padding: "0 6px",
		backgroundColor: D365.surface,
		borderRadius: "8px",
		boxShadow: D365.cardShadow,
		fontFamily: D365.font,
		fontSize: "14px",
		color: D365.text,
	},
	compact: {
		height: "32px",
		padding: 0,
		boxShadow: "none",
		backgroundColor: "transparent",
	},
	command: {
		display: "inline-flex",
		alignItems: "center",
		flexShrink: 0,
		gap: "8px",
		height: "32px",
		maxWidth: "240px",
		padding: "1px 12px",
		border: "1px solid transparent",
		borderRadius: "4px",
		backgroundColor: "transparent",
		color: D365.text,
		font: "inherit",
		lineHeight: "14px",
		whiteSpace: "nowrap",
		cursor: "pointer",
		position: "relative",
		":hover": { backgroundColor: D365.hover },
		":focus-visible": { outline: `2px solid ${D365.text}`, outlineOffset: "-2px" },
	},
	compactCommand: { height: "28px", padding: "0 8px", fontSize: "12px" },
	label: { overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 },
	icon: { display: "inline-flex", color: D365.icon, flexShrink: 0 },
	chevron: { color: D365.icon, flexShrink: 0, marginLeft: "-2px" },
	splitDivider: {
		alignSelf: "stretch",
		width: "1px",
		margin: "6px 0",
		backgroundColor: D365.divider,
	},
	/** The command chosen in CBS (Properties shows it). */
	selected: { backgroundColor: D365.selectedBg, border: `1px solid ${D365.brand}` },
	/** Yours: a dot in the corner, as on the artboard. */
	mine: {
		"::after": {
			content: '""',
			position: "absolute",
			top: "3px",
			right: "3px",
			width: "6px",
			height: "6px",
			borderRadius: "50%",
			backgroundColor: D365.brand,
		},
	},
	unknown: { border: `1px dashed ${D365.dashed}` },
	hidden: {
		color: D365.disabledText,
		textDecorationLine: "line-through",
		border: `1px dashed ${D365.dashed}`,
	},
	system: { cursor: "default" },
	more: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		width: "44px",
		height: "32px",
		border: "none",
		borderRadius: "4px",
		backgroundColor: "transparent",
		color: D365.text,
		cursor: "pointer",
		":hover": { backgroundColor: D365.hover },
		":focus-visible": { outline: `2px solid ${D365.text}`, outlineOffset: "-2px" },
	},
	compactMore: { width: "28px", height: "28px" },
	fill: { display: "flex", alignItems: "center", flex: "1 1 0", minWidth: 0, overflow: "hidden" },
});

export interface BarCommandProps {
	entry: SimulatedEntry;
	text: string;
	/** Why it isn't shown, or can't be told (its accessible description). */
	reason?: string;
	selected: boolean;
	mine: boolean;
	onChoose: () => void;
}

export function D365CommandBar({
	label,
	commands,
	compact,
}: {
	label: string;
	commands: BarCommandProps[];
	/** A sub-grid's bar: no card, smaller commands. */
	compact?: boolean;
}) {
	const styles = useStyles();
	const arrowKeys = useArrowNavigationGroup({ axis: "horizontal", memorizeCurrent: true });
	return (
		<div className={mergeClasses(styles.card, compact && styles.compact)}>
			<Overflow padding={compact ? 32 : 48}>
				<div className={styles.fill} role="toolbar" aria-label={label} {...arrowKeys}>
					{commands.map((c) => (
						<OverflowItem
							key={c.entry.id}
							id={c.entry.id}
							// The command chosen in CBS stays in view.
							priority={c.selected ? 2 : 1}
						>
							<BarCommand {...c} compact={compact} />
						</OverflowItem>
					))}
					<MoreCommands commands={commands} compact={compact} />
				</div>
			</Overflow>
		</div>
	);
}

/** One command, passing its ref on: Fluent's Overflow measures it. */
const BarCommand = forwardRef<HTMLButtonElement, BarCommandProps & { compact?: boolean }>(
	function BarCommand({ entry, text, reason, selected, mine, onChoose, compact }, ref) {
		const styles = useStyles();
		const v = entry.verdict.outcome;
		// A flyout or split button shows its chevron, menu filled when opened (Run Report) too.
		const menu =
			entry.kind === "classic" &&
			(!!entry.button.menu ||
				["flyout", "splitButton", "mruSplitButton"].includes(entry.button.kind));
		// A split button: its action and, apart, its menu's chevron (Email a Link with no rows).
		const split = entry.kind === "classic" && entry.button.kind === "splitButton";
		return (
			// eslint-disable-next-line no-restricted-syntax, jsx-a11y/role-supports-aria-props -- drawn as Dynamics 365 draws it; aria-description (ARIA 1.3) is read by Chromium
			<button
				ref={ref}
				type="button"
				data-simulated={entry.id}
				aria-disabled={entry.kind === "system" || undefined}
				aria-current={selected || undefined}
				aria-description={
					reason ?? (entry.kind === "system" ? "Added by Unified Interface" : undefined)
				}
				title={reason ? `${text}\n\n${reason}` : text}
				className={mergeClasses(
					styles.command,
					compact && styles.compactCommand,
					entry.kind === "system" && styles.system,
					v === "unknown" && styles.unknown,
					v === false && styles.hidden,
					mine && styles.mine,
					selected && styles.selected,
				)}
				onClick={entry.kind === "system" ? undefined : onChoose}
			>
				{entry.kind === "classic" && (
					<span className={styles.icon}>
						<RibbonButtonIcon button={entry.button} size={16} light />
					</span>
				)}
				<span className={styles.label}>{text}</span>
				{menu && split && <span className={styles.splitDivider} aria-hidden="true" />}
				{menu && <ChevronDownRegular fontSize={12} className={styles.chevron} />}
			</button>
		);
	},
);

/** ⋮: the commands that didn't fit, in the bar's order. */
function MoreCommands({ commands, compact }: { commands: BarCommandProps[]; compact?: boolean }) {
	const styles = useStyles();
	const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>();
	if (!isOverflowing) return null;
	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>
				{/* eslint-disable-next-line no-restricted-syntax -- drawn as Dynamics 365 draws it */}
				<button
					ref={ref}
					type="button"
					aria-haspopup="menu"
					aria-label={`More commands (${overflowCount})`}
					title="More commands"
					className={mergeClasses(styles.more, compact && styles.compactMore)}
				>
					<MoreVerticalRegular fontSize={compact ? 16 : 20} />
				</button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{commands.map((c) => (
						<MoreItem key={c.entry.id} {...c} />
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}

function MoreItem({ entry, text, reason, onChoose }: BarCommandProps) {
	const visible = useIsOverflowItemVisible(entry.id);
	if (visible) return null;
	return (
		<MenuItem
			data-simulated-overflow={entry.id}
			disabled={entry.kind === "system"}
			icon={
				entry.kind === "classic" ? (
					<RibbonButtonIcon button={entry.button} size={16} light />
				) : undefined
			}
			secondaryContent={entry.verdict.outcome === "unknown" ? "Can't tell" : undefined}
			aria-description={reason}
			onClick={entry.kind === "system" ? undefined : onChoose}
		>
			{text}
		</MenuItem>
	);
}
