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
	Badge,
	Select,
	MessageBar,
	MessageBarBody,
} from "@fluentui/react-components";
import { ImageRegular, AddRegular } from "@fluentui/react-icons";
import { canCustomiseButton, isLoadedControl, useRibbonStore } from "@/store/ribbonStore";
import { MENU_ITEM_KINDS } from "@/utils/ribbonMenu";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useUIStore } from "@/store/uiStore";
import FluentIcon from "@/components/shared/FluentIcon";
import { effectiveModernImage } from "@/services/xmlGenerator";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import { buttonTranslationLcids } from "@/utils/locLabelRef";
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
		padding: `${tokens.spacingHorizontalM}`,
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingHorizontalS,
	},
	sectionLabel: {
		color: tokens.colorNeutralForeground3,
		textTransform: "uppercase",
		letterSpacing: "0.5px",
		marginBottom: tokens.spacingHorizontalXS,
		marginTop: tokens.spacingHorizontalS,
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
}

export function IdentitySection({ button, location, tabId, groupId }: IdentitySectionProps) {
	const styles = useStyles();
	const setButtonProp = useRibbonStore((s) => s.setButtonProp);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const baseLanguageCode = useRibbonStore((s) => s.baseLanguageCode);
	const openIconPicker = useUIStore((s) => s.openIconPicker);
	const openLocalizationEditor = useUIStore((s) => s.openLocalizationEditor);
	const openWebResourceBrowser = useUIStore((s) => s.openWebResourceBrowser);
	const customizeOobButton = useRibbonStore((s) => s.customizeOobButton);
	const customiseButton = useRibbonStore((s) => s.customiseButton);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const sessionPrefix = useSessionStore((s) => s.publisherPrefix);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);

	// A menu item can be a button or a flyout; a loaded control keeps its kind (#154).
	const isMenuItem = useRibbonStore(
		(s) =>
			!s.ribbons[location].tabs
				.find((t) => t.id === tabId)
				?.groups.find((g) => g.id === groupId)
				?.buttons.some((b) => b.id === button.id),
	);
	const kindLocked = useRibbonStore((s) => isLoadedControl(s, location, button.id));
	const kindOptions = [...new Set([...(isMenuItem ? MENU_ITEM_KINDS : BUTTON_KINDS), button.kind])];

	function patch(update: Partial<RibbonButton>) {
		setButtonProp(location, tabId, groupId, button.id, update);
	}

	// Languages of the labels this button's text and tooltips use (exact ids:
	// a prefix match showed `Foo.Button2`'s translations on `Foo.Button`, #22).
	const activeLcids = buttonTranslationLcids(button, locLabels, baseLanguageCode);

	return (
		<div className={styles.root}>
			{/* Provenance callout — OOB platform vs managed solution. Unmanaged
			    (your own) buttons get no callout; they're directly editable. */}
			{(button.origin === "oob" || button.origin === "managed") && (
				<MessageBar intent="warning">
					<MessageBarBody>
						<Text size={200}>
							{button.origin === "oob" ? (
								<>
									This is an <strong>out-of-the-box</strong> (system) button. To change it, create
									an override.
								</>
							) : (
								<>
									This button comes from a <strong>managed solution</strong>
									{button.solutionName ? (
										<>
											{" "}
											(<strong>{button.solutionName}</strong>)
										</>
									) : null}
									{button.publisherName ? <> by {button.publisherName}</> : null}. You can't edit it
									directly — create an override to change it.
								</>
							)}{" "}
							<Button
								size="small"
								appearance="subtle"
								onClick={() => customizeOobButton(location, tabId, groupId, button.id)}
							>
								Create override
							</Button>
							{canCustomiseButton(location, tabId, button) && (
								<Button
									size="small"
									appearance="subtle"
									title="Copy the button into your solution and hide the original, so the copy can be changed and moved"
									onClick={() => {
										const prefix = activeSolution?.publisherPrefix?.trim() || sessionPrefix?.trim() || "new";
										const id = customiseButton(location, tabId, groupId, button.id, prefix);
										if (id) selectButtonInContext(location, tabId, groupId, id);
									}}
								>
									Customise button
								</Button>
							)}
						</Text>
					</MessageBarBody>
				</MessageBar>
			)}

			<Text size={100} weight="semibold" className={styles.sectionLabel}>
				Identity
			</Text>

			<Field label="Label">
				<Input value={button.label} onChange={(_, d) => patch({ label: d.value })} />
			</Field>

			{/* Locale chip row */}
			<Field label="Translations">
				<div className={styles.localeChips}>
					{activeLcids.map((lcid) => (
						<Badge
							key={lcid}
							appearance="filled"
							color="informative"
							style={{ cursor: "pointer" }}
							onClick={() => openLocalizationEditor(button.id)}
						>
							{lcid === 1033 ? "en-US" : String(lcid)}
						</Badge>
					))}
					{activeLcids.length === 0 && (
						<Badge appearance="outline" color="informative">
							en-US (default)
						</Badge>
					)}
					<Button
						size="small"
						appearance="subtle"
						icon={<AddRegular />}
						onClick={() => openLocalizationEditor(button.id)}
					>
						Add language…
					</Button>
				</div>
			</Field>

			<Field label="Tooltip title">
				<Input
					value={button.tooltipTitle ?? ""}
					onChange={(_, d) => patch({ tooltipTitle: d.value })}
				/>
			</Field>

			<Field label="Tooltip body">
				<Textarea
					value={button.tooltipBody ?? ""}
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
					<Button appearance="subtle" size="small" icon={<ImageRegular />} onClick={openIconPicker}>
						Change…
					</Button>
				</div>
			</Field>

			{button.icon && (
				<Field label="ModernImage (auto)">
					<Input
						// What Publish writes: a picked icon is referenced as its SVG web
						// resource (#51); an untouched icon keeps its loaded value.
						value={effectiveModernImage(button) ?? "(none)"}
						readOnly
						contentAfter={
							<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
								auto
							</Text>
						}
					/>
				</Field>
			)}

			{button.image16 && (
				<Field label="Image16">
					<div className={styles.row}>
						<button
							type="button"
							className={styles.webResLink}
							onClick={() => {
								webResourceBrowserCallbackRegistry.set((wr) => {
									patch({
										image16: `$webresource:${wr.name}`,
										icon: wr.name.split("/").pop()?.replace(/\..*$/, ""),
									});
								});
								openWebResourceBrowser();
							}}
							title={button.image16}
						>
							{button.image16}
						</button>
					</div>
				</Field>
			)}

			{button.image32 && (
				<Field label="Image32">
					<div className={styles.row}>
						<button
							type="button"
							className={styles.webResLink}
							onClick={() => {
								webResourceBrowserCallbackRegistry.set((wr) => {
									patch({ image32: `$webresource:${wr.name}` });
								});
								openWebResourceBrowser();
							}}
							title={button.image32}
						>
							{button.image32}
						</button>
					</div>
				</Field>
			)}

			<Divider />

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
							{k}
						</option>
					))}
				</Select>
			</Field>

			<div className={styles.row} style={{ justifyContent: "space-between" }}>
				<Text size={200}>Visible</Text>
				<Switch
					checked={!button.hidden}
					aria-label="Toggle button visibility"
					onChange={(_, d) => patch({ hidden: !d.checked })}
				/>
			</div>

			<Field label="Sequence">
				<SpinButton
					value={button.sequence}
					step={10}
					min={0}
					onChange={(_, d) => patch({ sequence: Number(d.value ?? button.sequence) })}
				/>
			</Field>

			<Field label="Template alias">
				<Input
					value={button.templateAlias}
					onChange={(_, d) => patch({ templateAlias: d.value })}
				/>
			</Field>
		</div>
	);
}
