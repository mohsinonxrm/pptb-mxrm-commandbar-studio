import {
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	MenuDivider,
} from "@fluentui/react-components";
import { ArrowMoveRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { moveTargets } from "@/utils/moveTargets";
import { useDisplayText } from "@/hooks/useDisplayText";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";

interface MoveToFlyoutProps {
	trigger: React.ReactElement;
	currentGroupId: string;
	/** The button being moved, so its own group is never offered. */
	buttonId?: string;
	tab: RibbonTab;
	location: RibbonLocation;
	onMove: (targetGroupId: string) => void;
}

export function MoveToFlyout({
	trigger,
	currentGroupId,
	buttonId,
	tab,
	onMove,
}: MoveToFlyoutProps) {
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const captionOf = useDisplayText();
	const otherGroups = moveTargets(tab, currentGroupId, buttonId, locLabels, lang, captionOf);

	if (otherGroups.length === 0) {
		return null;
	}

	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>{trigger}</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{otherGroups.map((g) => (
						<MenuItem
							key={g.groupId}
							icon={<ArrowMoveRegular />}
							onClick={() => onMove(g.groupId)}
						>
							{g.text}
						</MenuItem>
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}

// Standalone flyout that can be used in a MenuItem context (nested sub-menu)
interface MoveToSubMenuProps {
	currentGroupId: string;
	/** The button being moved, so its own group is never offered. */
	buttonId?: string;
	tab: RibbonTab;
	onMove: (targetGroupId: string) => void;
}

export function MoveToSubMenuItems({ currentGroupId, buttonId, tab, onMove }: MoveToSubMenuProps) {
	const locLabels = useRibbonStore((s) => s.locLabels);
	const lang = useRibbonStore((s) => s.baseLanguageCode);
	const captionOf = useDisplayText();
	const otherGroups = moveTargets(tab, currentGroupId, buttonId, locLabels, lang, captionOf);
	if (otherGroups.length === 0) {
		return <MenuItem disabled>No other groups</MenuItem>;
	}
	return (
		<>
			<MenuDivider />
			{otherGroups.map((g) => (
				<MenuItem
					key={g.groupId}
					icon={<ArrowMoveRegular />}
					onClick={() => onMove(g.groupId)}
				>
					Move to: {g.text}
				</MenuItem>
			))}
		</>
	);
}
