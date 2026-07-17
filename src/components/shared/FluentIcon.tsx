import React from "react";
import { tokens } from "@fluentui/react-components";
import {
	AddRegular,
	AddFilled,
	DeleteRegular,
	DeleteFilled,
	EditRegular,
	EditFilled,
	SaveRegular,
	SaveFilled,
	CopyRegular,
	CopyFilled,
	CutRegular,
	CutFilled,
	ClipboardPasteRegular,
	ClipboardPasteFilled,
	ShareRegular,
	ShareFilled,
	MailRegular,
	MailFilled,
	ChatRegular,
	ChatFilled,
	PhoneRegular,
	PhoneFilled,
	SearchRegular,
	SearchFilled,
	FilterRegular,
	FilterFilled,
	ArrowLeftRegular,
	ArrowLeftFilled,
	ArrowRightRegular,
	ArrowRightFilled,
	ArrowUpRegular,
	ArrowUpFilled,
	ArrowDownRegular,
	ArrowDownFilled,
	ChevronDownRegular,
	ChevronDownFilled,
	ChevronUpRegular,
	ChevronUpFilled,
	NavigationRegular,
	NavigationFilled,
	HomeRegular,
	HomeFilled,
	SettingsRegular,
	SettingsFilled,
	InfoRegular,
	InfoFilled,
	WarningRegular,
	WarningFilled,
	CheckmarkRegular,
	CheckmarkFilled,
	DismissRegular,
	DismissFilled,
	QuestionCircleRegular,
	QuestionCircleFilled,
	LockClosedRegular,
	LockClosedFilled,
	LockOpenRegular,
	LockOpenFilled,
	ShieldRegular,
	ShieldFilled,
	PersonRegular,
	PersonFilled,
	PeopleRegular,
	PeopleFilled,
	PersonAddRegular,
	PersonAddFilled,
	BuildingRegular,
	BuildingFilled,
	BriefcaseRegular,
	BriefcaseFilled,
	MoneyRegular,
	MoneyFilled,
	WalletCreditCardRegular,
	WalletCreditCardFilled,
	CartRegular,
	CartFilled,
	TagRegular,
	TagFilled,
	DocumentRegular,
	DocumentFilled,
	DocumentBulletListRegular,
	DocumentBulletListFilled,
	FolderRegular,
	FolderFilled,
	FolderOpenRegular,
	FolderOpenFilled,
	AttachRegular,
	AttachFilled,
	ArrowDownloadRegular,
	ArrowDownloadFilled,
	ArrowUploadRegular,
	ArrowUploadFilled,
	GlobeRegular,
	GlobeFilled,
	LinkRegular,
	LinkFilled,
	OpenRegular,
	OpenFilled,
	CalendarRegular,
	CalendarFilled,
	ClockRegular,
	ClockFilled,
	TimerRegular,
	TimerFilled,
	StarRegular,
	StarFilled,
	HeartRegular,
	HeartFilled,
	ThumbLikeRegular,
	ThumbLikeFilled,
	ThumbDislikeRegular,
	ThumbDislikeFilled,
	EyeRegular,
	EyeFilled,
	EyeOffRegular,
	EyeOffFilled,
	ZoomInRegular,
	ZoomInFilled,
	ZoomOutRegular,
	ZoomOutFilled,
	MaximizeRegular,
	MaximizeFilled,
	FullScreenMinimizeRegular,
	FullScreenMinimizeFilled,
	GridRegular,
	GridFilled,
	ListRegular,
	ListFilled,
	TableRegular,
	TableFilled,
	TableSimpleRegular,
	TableSimpleFilled,
	CodeRegular,
	CodeFilled,
	BugRegular,
	BugFilled,
	PlayRegular,
	PlayFilled,
	PauseRegular,
	PauseFilled,
	StopRegular,
	StopFilled,
	ArrowClockwiseRegular,
	ArrowClockwiseFilled,
	ArrowSyncRegular,
	ArrowSyncFilled,
	ArrowUndoRegular,
	ArrowUndoFilled,
	ArrowRedoRegular,
	ArrowRedoFilled,
	PrintRegular,
	PrintFilled,
	SendRegular,
	SendFilled,
	RocketRegular,
	RocketFilled,
	SparkleRegular,
	SparkleFilled,
	TrophyRegular,
	TrophyFilled,
	LightbulbRegular,
	LightbulbFilled,
	BotRegular,
	BotFilled,
	DataBarVerticalRegular,
	DataBarVerticalFilled,
	ChartMultipleRegular,
	ChartMultipleFilled,
	PollRegular,
	PollFilled,
	AppsAddInRegular,
	LayoutColumnTwoRegular,
	LayoutColumnTwoFilled,
	CodeBlockRegular,
	CodeBlockFilled,
	ArrowCounterclockwiseRegular,
	ArrowCounterclockwiseFilled,
} from "@fluentui/react-icons";

type IconVariant = "regular" | "filled";

type IconComponent = React.ComponentType<any>;

function normalizeName(name: string): string {
	const aliasMap: Record<string, string> = {
		columns: "layout_column_two",
		history: "clock_arrow_counterclockwise",
		window_dev_tools: "code_block",
	};
	const aliased = aliasMap[name.trim().toLowerCase()] ?? name;
	const base = aliased
		.trim()
		.replace(/_\d+_(regular|filled)$/i, "")
		.replace(/_?(regular|filled)$/i, "")
		.replace(/\d+(Regular|Filled)$/i, "")
		.replace(/(Regular|Filled)$/i, "");
	if (!base) return "apps_add_in";
	if (base.includes("_")) return base.toLowerCase();
	return base
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
		.toLowerCase();
}

const ICON_COMPONENTS: Record<string, { regular: IconComponent; filled: IconComponent }> = {
	add: { regular: AddRegular, filled: AddFilled },
	delete: { regular: DeleteRegular, filled: DeleteFilled },
	edit: { regular: EditRegular, filled: EditFilled },
	save: { regular: SaveRegular, filled: SaveFilled },
	copy: { regular: CopyRegular, filled: CopyFilled },
	cut: { regular: CutRegular, filled: CutFilled },
	clipboardpaste: { regular: ClipboardPasteRegular, filled: ClipboardPasteFilled },
	share: { regular: ShareRegular, filled: ShareFilled },
	mail: { regular: MailRegular, filled: MailFilled },
	chat: { regular: ChatRegular, filled: ChatFilled },
	phone: { regular: PhoneRegular, filled: PhoneFilled },
	search: { regular: SearchRegular, filled: SearchFilled },
	filter: { regular: FilterRegular, filled: FilterFilled },
	arrowleft: { regular: ArrowLeftRegular, filled: ArrowLeftFilled },
	arrowright: { regular: ArrowRightRegular, filled: ArrowRightFilled },
	arrowup: { regular: ArrowUpRegular, filled: ArrowUpFilled },
	arrowdown: { regular: ArrowDownRegular, filled: ArrowDownFilled },
	chevrondown: { regular: ChevronDownRegular, filled: ChevronDownFilled },
	chevronup: { regular: ChevronUpRegular, filled: ChevronUpFilled },
	navigation: { regular: NavigationRegular, filled: NavigationFilled },
	home: { regular: HomeRegular, filled: HomeFilled },
	settings: { regular: SettingsRegular, filled: SettingsFilled },
	info: { regular: InfoRegular, filled: InfoFilled },
	warning: { regular: WarningRegular, filled: WarningFilled },
	checkmark: { regular: CheckmarkRegular, filled: CheckmarkFilled },
	dismiss: { regular: DismissRegular, filled: DismissFilled },
	questioncircle: { regular: QuestionCircleRegular, filled: QuestionCircleFilled },
	lockclosed: { regular: LockClosedRegular, filled: LockClosedFilled },
	lockopen: { regular: LockOpenRegular, filled: LockOpenFilled },
	shield: { regular: ShieldRegular, filled: ShieldFilled },
	person: { regular: PersonRegular, filled: PersonFilled },
	people: { regular: PeopleRegular, filled: PeopleFilled },
	personadd: { regular: PersonAddRegular, filled: PersonAddFilled },
	building: { regular: BuildingRegular, filled: BuildingFilled },
	briefcase: { regular: BriefcaseRegular, filled: BriefcaseFilled },
	money: { regular: MoneyRegular, filled: MoneyFilled },
	creditcard: { regular: WalletCreditCardRegular, filled: WalletCreditCardFilled },
	cart: { regular: CartRegular, filled: CartFilled },
	tag: { regular: TagRegular, filled: TagFilled },
	document: { regular: DocumentRegular, filled: DocumentFilled },
	documentbulletlist: { regular: DocumentBulletListRegular, filled: DocumentBulletListFilled },
	folder: { regular: FolderRegular, filled: FolderFilled },
	folderopen: { regular: FolderOpenRegular, filled: FolderOpenFilled },
	attach: { regular: AttachRegular, filled: AttachFilled },
	arrowdownload: { regular: ArrowDownloadRegular, filled: ArrowDownloadFilled },
	arrowupload: { regular: ArrowUploadRegular, filled: ArrowUploadFilled },
	globe: { regular: GlobeRegular, filled: GlobeFilled },
	link: { regular: LinkRegular, filled: LinkFilled },
	open: { regular: OpenRegular, filled: OpenFilled },
	calendar: { regular: CalendarRegular, filled: CalendarFilled },
	clock: { regular: ClockRegular, filled: ClockFilled },
	timer: { regular: TimerRegular, filled: TimerFilled },
	star: { regular: StarRegular, filled: StarFilled },
	heart: { regular: HeartRegular, filled: HeartFilled },
	thumblike: { regular: ThumbLikeRegular, filled: ThumbLikeFilled },
	thumbdislike: { regular: ThumbDislikeRegular, filled: ThumbDislikeFilled },
	eye: { regular: EyeRegular, filled: EyeFilled },
	eyeoff: { regular: EyeOffRegular, filled: EyeOffFilled },
	zoomin: { regular: ZoomInRegular, filled: ZoomInFilled },
	zoomout: { regular: ZoomOutRegular, filled: ZoomOutFilled },
	maximize: { regular: MaximizeRegular, filled: MaximizeFilled },
	minimize: { regular: FullScreenMinimizeRegular, filled: FullScreenMinimizeFilled },
	grid: { regular: GridRegular, filled: GridFilled },
	list: { regular: ListRegular, filled: ListFilled },
	table: { regular: TableRegular, filled: TableFilled },
	tablesimple: { regular: TableSimpleRegular, filled: TableSimpleFilled },
	code: { regular: CodeRegular, filled: CodeFilled },
	bug: { regular: BugRegular, filled: BugFilled },
	play: { regular: PlayRegular, filled: PlayFilled },
	pause: { regular: PauseRegular, filled: PauseFilled },
	stop: { regular: StopRegular, filled: StopFilled },
	refresh: { regular: ArrowClockwiseRegular, filled: ArrowClockwiseFilled },
	arrowsync: { regular: ArrowSyncRegular, filled: ArrowSyncFilled },
	arrowundo: { regular: ArrowUndoRegular, filled: ArrowUndoFilled },
	arrowredo: { regular: ArrowRedoRegular, filled: ArrowRedoFilled },
	printer: { regular: PrintRegular, filled: PrintFilled },
	send: { regular: SendRegular, filled: SendFilled },
	rocket: { regular: RocketRegular, filled: RocketFilled },
	sparkle: { regular: SparkleRegular, filled: SparkleFilled },
	trophy: { regular: TrophyRegular, filled: TrophyFilled },
	lightbulb: { regular: LightbulbRegular, filled: LightbulbFilled },
	bot: { regular: BotRegular, filled: BotFilled },
	databar: { regular: DataBarVerticalRegular, filled: DataBarVerticalFilled },
	chartmultiple: { regular: ChartMultipleRegular, filled: ChartMultipleFilled },
	poll: { regular: PollRegular, filled: PollFilled },
	layoutcolumntwo: { regular: LayoutColumnTwoRegular, filled: LayoutColumnTwoFilled },
	codeblock: { regular: CodeBlockRegular, filled: CodeBlockFilled },
	clockarrowcounterclockwise: {
		regular: ArrowCounterclockwiseRegular,
		filled: ArrowCounterclockwiseFilled,
	},
};

interface FluentIconProps {
	name: string;
	size?: number;
	variant?: IconVariant;
	style?: React.CSSProperties;
	className?: string;
	"aria-hidden"?: boolean;
}

export const FluentIcon: React.FC<FluentIconProps> = ({
	name,
	size = 20,
	variant = "regular",
	style,
	className,
	"aria-hidden": ariaHidden = true,
}) => {
	const normalized = normalizeName(name).replace(/_/g, "");
	const resolved = ICON_COMPONENTS[normalized];
	const IconComponent =
		variant === "filled"
			? (resolved?.filled ?? resolved?.regular ?? AppsAddInRegular)
			: (resolved?.regular ?? AppsAddInRegular);

	return (
		<IconComponent
			fontSize={size}
			aria-hidden={ariaHidden}
			className={className}
			style={{
				display: "inline-block",
				verticalAlign: "middle",
				flexShrink: 0,
				color: tokens.colorNeutralForeground1,
				...style,
			}}
		/>
	);
};

export default FluentIcon;

/**
 * Serializes a Fluent icon to standalone SVG markup so it can be uploaded as a
 * Dataverse web resource. Fluent icons render with `fill="currentColor"`, so the
 * uploaded icon themes correctly with the command bar.
 *
 * Returns `null` if the name doesn't resolve to a known icon (caller should fall
 * back to preview-only). Uses a lazy import of `react-dom/server` so it doesn't
 * weigh down the main bundle.
 */
export async function fluentIconToSvg(
	name: string,
	size = 32,
	variant: IconVariant = "regular",
): Promise<string | null> {
	const normalized = normalizeName(name).replace(/_/g, "");
	const resolved = ICON_COMPONENTS[normalized];
	const IconComponent =
		variant === "filled" ? (resolved?.filled ?? resolved?.regular) : resolved?.regular;
	if (!IconComponent) return null;

	const { renderToStaticMarkup } = await import("react-dom/server");
	let markup = renderToStaticMarkup(React.createElement(IconComponent, { fontSize: size }));
	if (!markup.includes("<svg")) return null;

	// Make the file standalone & concretely sized (Fluent renders width/height as
	// "1em", which has no font-size context inside a web-resource file).
	if (!markup.includes("xmlns")) {
		markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
	}
	markup = markup.replace(/width="1em"/, `width="${size}"`).replace(/height="1em"/, `height="${size}"`);
	return markup;
}
