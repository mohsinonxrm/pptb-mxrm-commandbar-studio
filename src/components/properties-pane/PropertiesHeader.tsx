import { useContext } from "react";
import { Badge, Button, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { RibbonButtonIcon } from "@/components/shared/RibbonButtonIcon";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { CONTROL_KIND_LABELS } from "@/utils/controlKinds";
import type { RibbonButton } from "@/types/ribbon";
import { PropertiesHostContext } from "./propertiesHost";

/**
 * The top of Properties (#184): what is selected, whose it is and what kind,
 * always in view while the sections scroll.
 */

const useStyles = makeStyles({
	header: {
		position: "sticky",
		top: 0,
		zIndex: 1,
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		minHeight: "52px",
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground2,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	tile: {
		width: "36px",
		height: "36px",
		flexShrink: 0,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: tokens.borderRadiusMedium,
		backgroundColor: tokens.colorNeutralBackground1,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
	},
	text: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXXS,
	},
	label: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	badges: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalXS,
	},
	badge: { flexShrink: 0, maxWidth: "100%" },
	badgeText: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

/** Who a button belongs to, in the words the header uses. */
function ownerOf(button: RibbonButton): { text: string; color: "brand" | "informative" } {
	if (button.origin === "unmanaged") return { text: "Yours", color: "brand" };
	if (button.origin === "managed")
		return {
			text: button.solutionName ? `Managed · ${button.solutionName}` : "Managed",
			color: "informative",
		};
	return { text: "Out of the box", color: "informative" };
}

export function PropertiesHeader({ button }: { button?: RibbonButton }) {
	const styles = useStyles();
	const { onClose } = useContext(PropertiesHostContext);
	const clearSelection = useSelectionStore((s) => s.clearSelection);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const captionOf = useDisplayText();

	// In a drawer the button closes it; docked, it clears the selection.
	const close = onClose
		? { label: "Close properties", run: onClose }
		: button
			? { label: "Clear selection", run: clearSelection }
			: undefined;
	const closeButton = close && (
		<Tooltip content={close.label} relationship="label">
			<Button appearance="subtle" icon={<DismissRegular />} onClick={close.run} />
		</Tooltip>
	);

	if (!button) {
		return (
			<div className={styles.header}>
				<Text size={400} weight="semibold" className={styles.text}>
					Properties
				</Text>
				{closeButton}
			</div>
		);
	}

	const label =
		captionOf(button.label, locLabels, undefined, button.source?.labelToken) || button.id;
	const owner = ownerOf(button);
	return (
		<div className={styles.header}>
			<div className={styles.tile} aria-hidden>
				<RibbonButtonIcon button={button} size={20} />
			</div>
			<div className={styles.text}>
				<Tooltip content={label} relationship="description">
					<Text
						as="h2"
						size={400}
						weight="semibold"
						className={styles.label}
						tabIndex={0}
					>
						{label}
					</Text>
				</Tooltip>
				<div className={styles.badges}>
					<Badge
						size="medium"
						appearance="tint"
						color={owner.color}
						className={styles.badge}
					>
						<span className={styles.badgeText}>{owner.text}</span>
					</Badge>
					<Badge
						size="medium"
						appearance="outline"
						color="informative"
						className={styles.badge}
					>
						{CONTROL_KIND_LABELS[button.kind]}
					</Badge>
				</div>
			</div>
			{closeButton}
		</div>
	);
}
