import {
	makeStyles,
	tokens,
	Field,
	Input,
	Textarea,
	Switch,
	SpinButton,
	Text,
	Button,
	Divider,
	Select,
	Link,
	Tooltip,
	TagGroup,
	InteractionTag,
	InteractionTagPrimary,
} from "@fluentui/react-components";
import { ImageRegular, AddRegular, LockClosedRegular } from "@fluentui/react-icons";
import { isLoadedControl, useRibbonStore } from "@/store/ribbonStore";
import { MENU_ITEM_KINDS } from "@/utils/ribbonMenu";
import { useUIStore } from "@/store/uiStore";
import FluentIcon from "@/components/shared/FluentIcon";
import { effectiveModernImage } from "@/services/xmlGenerator";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import { buttonTranslationLcids } from "@/utils/locLabelRef";
import { IdField } from "@/components/shared/IdField";
import { useDisplayText } from "@/hooks/useDisplayText";
import { CONTROL_KIND_LABELS } from "@/utils/controlKinds";
import type { RibbonButton, RibbonLocation } from "@/types/ribbon";

const BUTTON_KINDS: RibbonButton["kind"][] = [
	"button",
	"flyout",
	"splitButton",
	"textBox",
	"comboBox",
	"checkBox",
];

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
		minWidth: 0,
	},
	row: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
	},
	localeChips: {
		display: "flex",
		flexWrap: "wrap",
		gap: tokens.spacingHorizontalXS,
		alignItems: "center",
	},
	iconPreview: {
		width: "32px",
		height: "32px",
		borderRadius: "6px",
		backgroundColor: tokens.colorNeutralBackground4,
		color: tokens.colorNeutralForeground1,
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		flexShrink: 0,
	},
	lockedNote: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		color: tokens.colorNeutralForeground2,
	},
	webResLink: {
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		cursor: "pointer",
		color: tokens.colorBrandForeground1,
		textDecoration: "underline",
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		flex: 1,
		border: "none",
		background: "transparent",
		textAlign: "left",
	},
});

interface IdentitySectionProps {
	button: RibbonButton;
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	/**
	 * Which fields (#184): what the button looks like and its id; where it sits
	 * in its group; or the technical ones (kind, template alias).
	 */
	part: "appearance" | "position" | "advanced";
}

export function IdentitySection({ button, location, tabId, groupId, part }: IdentitySectionProps) {
	const styles = useStyles();
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const baseLanguageCode = useRibbonStore((s) => s.baseLanguageCode);
	const openIconPicker = useUIStore((s) => s.openIconPicker);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	const openWebResourceBrowser = useUIStore((s) => s.openWebResourceBrowser);

	// A menu item can be a button or a flyout; a loaded control keeps its kind (#154).
	const isMenuItem = useRibbonStore(
		(s) =>
			!s.ribbons[location].tabs
				.find((t) => t.id === tabId)
				?.groups.find((g) => g.id === groupId)
				?.buttons.some((b) => b.id === button.id),
	);
	const kindLocked = useRibbonStore((s) => isLoadedControl(s, location, button.id));
	const group = useRibbonStore((s) =>
		s.ribbons[location].tabs.find((t) => t.id === tabId)?.groups.find((g) => g.id === groupId),
	);
	const captionOf = useDisplayText();
	const kindOptions = [
		...new Set([...(isMenuItem ? MENU_ITEM_KINDS : BUTTON_KINDS), button.kind]),
	];

	function patch(update: Partial<RibbonButton>) {
		setButtonProp(location, tabId, groupId, button.id, update);
	}
	// Microsoft's or a managed solution's button is changed through Customise or
	// Create override (the notice above), not by editing its fields (#184).
	const locked = button.origin !== "unmanaged";

	// Languages of the labels this button's text and tooltips use (exact ids:
	// a prefix match showed `Foo.Button2`'s translations on `Foo.Button`, #22).
	const activeLcids = buttonTranslationLcids(button, locLabels, baseLanguageCode);

	if (part === "position") {
		return (
			<div className={styles.root}>
				<Field label="Group" hint="Use Move to in the button's menu to move it.">
					<Input
						readOnly
						appearance="filled-darker"
						value={
							group
								? captionOf(
										group.label,
										locLabels,
										baseLanguageCode,
										group.source?.titleToken,
									) || group.id
								: groupId
						}
					/>
				</Field>
				<Field
					label="Order"
					hint="Lower numbers show first within the group. Unified Interface merges the groups into one bar."
				>
					<SpinButton
						value={button.sequence}
						disabled={locked}
						step={10}
						min={0}
						onChange={(_, d) => patch({ sequence: Number(d.value ?? button.sequence) })}
					/>
				</Field>
			</div>
		);
	}

	if (part === "advanced") {
		return (
			<div className={styles.root}>
				<Field
					label="Kind"
					hint={
						kindLocked
							? "A loaded control's kind can't be changed: add a new control instead."
							: isMenuItem
								? "A menu holds buttons and flyouts."
								: undefined
					}
				>
					<Select
						value={button.kind}
						disabled={kindLocked}
						onChange={(_, d) => patch({ kind: d.value as RibbonButton["kind"] })}
					>
						{kindOptions.map((k) => (
							<option key={k} value={k}>
								{CONTROL_KIND_LABELS[k]}
							</option>
						))}
					</Select>
				</Field>
				<Field
					label="Template alias"
					hint="Which slot of the group's layout the button uses on the classic ribbon, for example o1."
				>
					<Input
						value={button.templateAlias}
						readOnly={locked}
						onChange={(_, d) => patch({ templateAlias: d.value })}
					/>
				</Field>
			</div>
		);
	}

	return (
		<div className={styles.root}>
			{locked && (
				<Text size={200} className={styles.lockedNote}>
					<LockClosedRegular aria-hidden /> Customise this button, or create an override,
					to edit these fields.
				</Text>
			)}
			<Field label="Label">
				<Input
					value={button.label}
					readOnly={locked}
					onChange={(_, d) => patch({ label: d.value })}
				/>
			</Field>

			{/* Locale chip row */}
			<Field label="Translations">
				<div className={styles.localeChips}>
					<TagGroup aria-label="Languages of this button's text" size="small">
						{(activeLcids.length ? activeLcids : [1033]).map((lcid) => (
							<InteractionTag key={lcid} value={String(lcid)} appearance="brand">
								<InteractionTagPrimary
									disabled={locked}
									onClick={() => openLocalizationEditor(button.id)}
								>
									{lcid === 1033 ? "en-US" : String(lcid)}
									{activeLcids.length === 0 ? " (default)" : ""}
								</InteractionTagPrimary>
							</InteractionTag>
						))}
					</TagGroup>
					<Button
						size="small"
						appearance="subtle"
						icon={<AddRegular />}
						disabled={locked}
						onClick={() => openLocalizationEditor(button.id)}
					>
						Add language…
					</Button>
				</div>
			</Field>

			<Field label="Tooltip title">
				<Input
					value={button.tooltipTitle ?? ""}
					readOnly={locked}
					onChange={(_, d) => patch({ tooltipTitle: d.value })}
				/>
			</Field>

			<Field label="Tooltip body">
				<Textarea
					value={button.tooltipBody ?? ""}
					readOnly={locked}
					onChange={(_, d) => patch({ tooltipBody: d.value })}
					resize="vertical"
				/>
			</Field>

			<Divider />

			<Field label="Icon">
				<div className={styles.row}>
					<div className={styles.iconPreview}>
						{button.icon ? (
							<FluentIcon name={button.icon} size={20} />
						) : (
							<ImageRegular style={{ color: tokens.colorNeutralForeground3 }} />
						)}
					</div>
					<Button
						appearance="subtle"
						size="small"
						icon={<ImageRegular />}
						disabled={locked}
						onClick={openIconPicker}
					>
						Change…
					</Button>
				</div>
			</Field>

			{button.icon && (
				<Field
					label="Modern image"
					hint="What Unified Interface shows. Set from the icon you pick."
				>
					<Input
						// What Publish writes: a picked icon is referenced as its SVG web
						// resource (#51); an untouched icon keeps its loaded value.
						value={effectiveModernImage(button) ?? "(none)"}
						readOnly
					/>
				</Field>
			)}

			{button.image16 && (
				<Field label="Image16">
					<div className={styles.row}>
						<Tooltip content={button.image16} relationship="description">
							<Link
								as="button"
								className={styles.webResLink}
								disabled={locked}
								onClick={() => {
									webResourceBrowserCallbackRegistry.set((wr) => {
										patch({
											image16: `$webresource:${wr.name}`,
											icon: wr.name.split("/").pop()?.replace(/\..*$/, ""),
										});
									});
									openWebResourceBrowser();
								}}
							>
								{button.image16}
							</Link>
						</Tooltip>
					</div>
				</Field>
			)}

			{button.image32 && (
				<Field label="Image32">
					<div className={styles.row}>
						<Tooltip content={button.image32} relationship="description">
							<Link
								as="button"
								className={styles.webResLink}
								disabled={locked}
								onClick={() => {
									webResourceBrowserCallbackRegistry.set((wr) => {
										patch({ image32: `$webresource:${wr.name}` });
									});
									openWebResourceBrowser();
								}}
							>
								{button.image32}
							</Link>
						</Tooltip>
					</div>
				</Field>
			)}

			<Switch
				label="Visible"
				checked={!button.hidden}
				onChange={(_, d) => patch({ hidden: !d.checked })}
			/>

			<IdField label="Button ID" value={button.id} />
		</div>
	);
}
