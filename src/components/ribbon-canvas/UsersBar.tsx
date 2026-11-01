import { forwardRef } from "react";
import {
	Badge,
	Button,
	InfoLabel,
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Overflow,
	OverflowItem,
	Text,
	makeStyles,
	mergeClasses,
	tokens,
	useArrowNavigationGroup,
	useIsOverflowItemVisible,
	useOverflowMenu,
} from "@fluentui/react-components";
import { ChevronDownRegular, MoreVerticalRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useModernCanvas } from "@/hooks/useModernCommands";
import { useDisplayText } from "@/hooks/useDisplayText";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { isHiddenOnUnifiedInterface } from "@/utils/defaultTab";
import { usersBar, type UsersBarItem } from "@/utils/usersBar";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";

/**
 * "How users see it" (#194): the tab's commands laid out as the Unified
 * Interface command bar shows them, before any rule is applied, above the
 * group cards. What doesn't fit goes into a ⋮ menu with its count, as in
 * Unified Interface. Choosing a command selects it everywhere; the selected
 * one is kept in view. Simulate mode (#191) will evaluate the rules here.
 */

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		marginBottom: tokens.spacingVerticalM,
	},
	header: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
	},
	muted: { color: tokens.colorNeutralForeground3 },
	ellipsis: {
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	bar: {
		display: "flex",
		alignItems: "center",
		gap: "2px",
		minWidth: 0,
		height: "40px",
		padding: `0 ${tokens.spacingHorizontalXS}`,
		overflow: "hidden",
		backgroundColor: tokens.colorNeutralBackground1,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		borderRadius: tokens.borderRadiusMedium,
		boxShadow: tokens.shadow2,
	},
	command: { flexShrink: 0, fontWeight: tokens.fontWeightRegular, maxWidth: "220px" },
	selected: {
		backgroundColor: tokens.colorSubtleBackgroundSelected,
		outline: `1px solid ${tokens.colorBrandStroke1}`,
	},
	empty: { padding: `0 ${tokens.spacingHorizontalS}` },
});

export function UsersBar({ tab, location }: { tab: RibbonTab; location: RibbonLocation }) {
	const styles = useStyles();
	const captionOf = useDisplayText();
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const selectedModernId = useModernCommandStore((s) => s.selectedCommandId);
	const selectCommand = useModernCommandStore((s) => s.selectCommand);
	const modern = useModernCanvas(location, tab);
	const arrowKeys = useArrowNavigationGroup({ axis: "horizontal", memorizeCurrent: true });

	const items = usersBar(tab, modern.nodes, modern.overrides);
	const tabText = captionOf(tab.label, locLabels, lang, tab.source?.titleToken) || tab.id;
	const textOf = (item: UsersBarItem) =>
		item.kind === "modern"
			? item.command.label || item.command.uniqueName
			: item.replacedBy
				? item.replacedBy.label || item.replacedBy.uniqueName
				: captionOf(
						item.button.label,
						locLabels,
						undefined,
						item.button.source?.labelToken,
					) || item.button.id;
	// A migrated command selected from Properties marks the button it replaces (review).
	const isSelected = (item: UsersBarItem) =>
		item.kind === "classic"
			? item.id === selectedButtonId ||
				(!selectedButtonId && !!item.replacedBy && item.replacedBy.id === selectedModernId)
			: !selectedButtonId && item.command.id === selectedModernId;
	const choose = (item: UsersBarItem) =>
		item.kind === "classic"
			? selectButtonInContext(location, tab.id, item.groupId, item.button.id)
			: selectCommand(item.command.id);

	const hiddenTab = isHiddenOnUnifiedInterface(tab.id);

	return (
		<section className={styles.root} aria-label="How users see it">
			<div className={styles.header}>
				<Text weight="semibold" size={300}>
					How users see it
				</Text>
				<Text size={200} className={mergeClasses(styles.muted, styles.ellipsis)}>
					{tabText} · {items.length} command{items.length === 1 ? "" : "s"}
				</Text>
				<Badge appearance="outline" color="informative" size="small">
					Preview: rules not applied
				</Badge>
				<InfoLabel
					size="small"
					info="The tab's commands in the order Unified Interface lists them, without the ones hidden by your customizations or replaced by a modern command. Display and enable rules aren't evaluated, so some of these may not show, or be disabled, for users. What doesn't fit goes into the ⋮ menu."
					infoButton={{ "aria-label": "About this preview" }}
				/>
			</div>
			{hiddenTab ? (
				<Text size={200} className={mergeClasses(styles.bar, styles.empty, styles.muted)}>
					Unified Interface doesn&apos;t show this tab&apos;s commands.
				</Text>
			) : items.length === 0 ? (
				<Text size={200} className={mergeClasses(styles.bar, styles.empty, styles.muted)}>
					No commands on this tab are shown.
				</Text>
			) : (
				<Overflow padding={40}>
					<div
						className={styles.bar}
						role="toolbar"
						// One Tab stop; the arrow keys move between commands (review).
						{...arrowKeys}
						aria-label={`Command bar preview: ${tabText}`}
					>
						{items.map((item) => (
							// The selected command stays in view (#194).
							<OverflowItem
								key={item.id}
								id={item.id}
								priority={isSelected(item) ? 2 : 1}
							>
								<CommandButton
									item={item}
									text={textOf(item)}
									selected={isSelected(item)}
									onChoose={() => choose(item)}
								/>
							</OverflowItem>
						))}
						<OverflowMenu
							items={items}
							textOf={textOf}
							isSelected={isSelected}
							onChoose={choose}
						/>
					</div>
				</Overflow>
			)}
		</section>
	);
}

interface CommandButtonProps {
	item: UsersBarItem;
	text: string;
	selected: boolean;
	onChoose: () => void;
}

/** A command on the strip. It passes its ref on: Fluent's Overflow measures and hides it by it. */
const CommandButton = forwardRef<HTMLButtonElement, CommandButtonProps>(function CommandButton(
	{ item, text, selected, onChoose },
	ref,
) {
	const styles = useStyles();
	const menu = item.kind === "classic" && !!item.button.menu;
	// No Tooltip: it wouldn't pass the ref on. The id is in Properties once it's chosen.
	return (
		<Button
			ref={ref}
			appearance="subtle"
			size="small"
			className={mergeClasses(styles.command, selected && styles.selected)}
			aria-current={selected || undefined}
			data-users-bar={item.id}
			aria-description={
				item.kind === "modern"
					? "Modern command"
					: item.replacedBy
						? "Modern command, migrated from this button"
						: item.id
			}
			icon={
				item.kind === "classic" ? (
					<RibbonButtonIcon button={item.button} size={16} />
				) : undefined
			}
			onClick={onChoose}
		>
			<span className={styles.ellipsis}>{text}</span>
			{menu && <ChevronDownRegular fontSize={12} aria-label="Has a menu" />}
		</Button>
	);
});

/** The commands that didn't fit, as Unified Interface's ⋮ overflow, with their count. */
function OverflowMenu({
	items,
	textOf,
	isSelected,
	onChoose,
}: {
	items: UsersBarItem[];
	textOf: (item: UsersBarItem) => string;
	isSelected: (item: UsersBarItem) => boolean;
	onChoose: (item: UsersBarItem) => void;
}) {
	const { ref, isOverflowing, overflowCount } = useOverflowMenu<HTMLButtonElement>();
	if (!isOverflowing) return null;
	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>
				<Button
					ref={ref}
					appearance="subtle"
					size="small"
					icon={<MoreVerticalRegular />}
					aria-label={`${overflowCount} more commands`}
				>
					{overflowCount}
				</Button>
			</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{items.map((item) => (
						<OverflowMenuItem
							key={item.id}
							item={item}
							text={textOf(item)}
							selected={isSelected(item)}
							onChoose={() => onChoose(item)}
						/>
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}

function OverflowMenuItem({
	item,
	text,
	selected,
	onChoose,
}: {
	item: UsersBarItem;
	text: string;
	selected: boolean;
	onChoose: () => void;
}) {
	const visible = useIsOverflowItemVisible(item.id);
	if (visible) return null;
	return (
		<MenuItem
			icon={
				item.kind === "classic" ? (
					<RibbonButtonIcon button={item.button} size={16} />
				) : undefined
			}
			secondaryContent={selected ? "Selected" : item.kind === "modern" ? "Modern" : undefined}
			onClick={onChoose}
		>
			{text}
		</MenuItem>
	);
}
