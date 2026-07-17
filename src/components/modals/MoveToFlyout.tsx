import {
	Menu,
	MenuItem,
	MenuList,
	MenuPopover,
	MenuTrigger,
	MenuDivider,
} from "@fluentui/react-components";
import { ArrowMoveRegular } from "@fluentui/react-icons";
import type { RibbonLocation, RibbonTab } from "@/types/ribbon";

interface MoveToFlyoutProps {
	trigger: React.ReactElement;
	currentGroupId: string;
	tab: RibbonTab;
	location: RibbonLocation;
	onMove: (targetGroupId: string) => void;
}

export function MoveToFlyout({ trigger, currentGroupId, tab, onMove }: MoveToFlyoutProps) {
	const otherGroups = tab.groups.filter((g) => g.id !== currentGroupId);

	if (otherGroups.length === 0) {
		return null;
	}

	return (
		<Menu>
			<MenuTrigger disableButtonEnhancement>{trigger}</MenuTrigger>
			<MenuPopover>
				<MenuList>
					{otherGroups.map((g) => (
						<MenuItem key={g.id} icon={<ArrowMoveRegular />} onClick={() => onMove(g.id)}>
							{g.label}
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
	tab: RibbonTab;
	onMove: (targetGroupId: string) => void;
}

export function MoveToSubMenuItems({ currentGroupId, tab, onMove }: MoveToSubMenuProps) {
	const otherGroups = tab.groups.filter((g) => g.id !== currentGroupId);
	if (otherGroups.length === 0) {
		return <MenuItem disabled>No other groups</MenuItem>;
	}
	return (
		<>
			<MenuDivider />
			{otherGroups.map((g) => (
				<MenuItem key={g.id} icon={<ArrowMoveRegular />} onClick={() => onMove(g.id)}>
					Move to: {g.label}
				</MenuItem>
			))}
		</>
	);
}
