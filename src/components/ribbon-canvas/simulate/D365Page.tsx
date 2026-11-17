import {
	FluentProvider,
	makeStyles,
	mergeClasses,
	webLightTheme,
} from "@fluentui/react-components";
import {
	AddRegular,
	ChevronDownRegular,
	FilterRegular,
	GridDotsRegular,
	LightbulbRegular,
	NavigationRegular,
	SearchRegular,
	SettingsRegular,
} from "@fluentui/react-icons";
import type { UciLocation } from "@/services/uciPreview/rules";
import { D365CommandBar, type BarCommandProps } from "./D365CommandBar";
import { D365 } from "./d365Theme";

/**
 * The Dynamics 365 page Simulate draws the bar on (#191): the app header, the site map rail, and
 * the main grid, form, sub-grid on a form or associated view, in Unified Interface's colours and
 * sizes. Only the command bar is real; the rest is illustrative (no record data).
 */

export type SimulatedWidth = "desktop" | "tablet" | "phone";
const FRAME_WIDTH: Record<SimulatedWidth, string> = {
	desktop: "100%",
	tablet: "768px",
	phone: "390px",
};

const useStyles = makeStyles({
	provider: { backgroundColor: "transparent", display: "contents" },
	frame: {
		display: "flex",
		flexDirection: "column",
		maxWidth: "100%",
		minWidth: 0,
		overflow: "hidden",
		borderRadius: "8px",
		boxShadow: D365.frameShadow,
		backgroundColor: D365.page,
		fontFamily: D365.font,
		fontSize: "14px",
		lineHeight: "20px",
		color: D365.text,
	},
	header: {
		display: "flex",
		alignItems: "center",
		gap: "12px",
		height: "48px",
		flexShrink: 0,
		padding: "0 12px",
		backgroundColor: D365.header,
		color: D365.headerText,
	},
	product: { fontWeight: 600, whiteSpace: "nowrap" },
	app: {
		paddingLeft: "12px",
		borderLeft: "1px solid rgba(255,255,255,.4)",
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		minWidth: 0,
	},
	spacer: { flex: "1 1 0" },
	avatar: {
		width: "28px",
		height: "28px",
		borderRadius: "50%",
		border: "1px solid rgba(255,255,255,.7)",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "11px",
		fontWeight: 600,
		flexShrink: 0,
	},
	body: { display: "flex", minHeight: "420px", minWidth: 0 },
	rail: {
		width: "44px",
		flexShrink: 0,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		gap: "16px",
		paddingTop: "12px",
		backgroundColor: D365.surface,
		borderRight: `1px solid ${D365.divider}`,
		color: D365.secondaryText,
	},
	main: {
		flex: "1 1 0",
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: "8px",
		padding: "8px 16px 16px 8px",
	},
	card: {
		backgroundColor: D365.surface,
		borderRadius: "8px",
		boxShadow: D365.cardShadow,
		minWidth: 0,
	},
	viewHead: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: "8px",
		padding: "10px 16px",
		borderBottom: `1px solid ${D365.divider}`,
	},
	viewTitle: {
		display: "inline-flex",
		alignItems: "center",
		gap: "4px",
		fontSize: "20px",
		lineHeight: "28px",
		fontWeight: 600,
	},
	muted: { color: D365.secondaryText },
	filter: {
		display: "inline-flex",
		alignItems: "center",
		gap: "6px",
		height: "28px",
		width: "180px",
		maxWidth: "40%",
		padding: "0 8px",
		border: `1px solid ${D365.dashed}`,
		borderRadius: "4px",
		color: D365.secondaryText,
		fontSize: "13px",
	},
	row: {
		display: "grid",
		gridTemplateColumns: "40px minmax(120px, 2fr) minmax(80px, 1fr) minmax(80px, 1fr)",
		alignItems: "center",
		height: "40px",
		padding: "0 8px",
		borderBottom: `1px solid ${D365.rowDivider}`,
		minWidth: 0,
	},
	headRow: { height: "36px", fontSize: "12px", fontWeight: 600 },
	rowOn: { backgroundColor: D365.selectedBg },
	check: {
		width: "16px",
		height: "16px",
		borderRadius: "3px",
		border: `1px solid ${D365.secondaryText}`,
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: D365.surface,
		color: "#fff",
		fontSize: "11px",
	},
	checkOn: {
		backgroundColor: D365.brand,
		borderTopColor: D365.brand,
		borderRightColor: D365.brand,
		borderBottomColor: D365.brand,
		borderLeftColor: D365.brand,
	},
	link: {
		color: D365.link,
		textDecorationLine: "underline",
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
	},
	cell: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		color: D365.secondaryText,
	},
	formHead: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px" },
	formAvatar: {
		width: "40px",
		height: "40px",
		borderRadius: "50%",
		backgroundColor: "#C7E0F4",
		color: "#004578",
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		fontWeight: 600,
		flexShrink: 0,
	},
	formTitle: { fontSize: "16px", lineHeight: "22px", fontWeight: 600 },
	tabs: {
		display: "flex",
		gap: "16px",
		padding: "0 16px",
		borderTop: `1px solid ${D365.rowDivider}`,
	},
	tab: { padding: "8px 0", color: D365.secondaryText },
	tabOn: { color: D365.text, fontWeight: 600, boxShadow: `inset 0 -2px 0 ${D365.brand}` },
	notice: {
		padding: "8px 16px",
		backgroundColor: "#F5F5F5",
		borderBottom: `1px solid ${D365.divider}`,
		fontSize: "13px",
	},
	sections: {
		display: "grid",
		gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
		gap: "8px",
	},
	section: { padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" },
	sectionTitle: { fontSize: "14px", fontWeight: 600 },
	field: {
		display: "grid",
		gridTemplateColumns: "120px 1fr",
		gap: "8px",
		color: D365.secondaryText,
	},
	fieldValue: { color: D365.text },
	subHead: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 },
});

export interface D365PageProps {
	page: UciLocation;
	width: SimulatedWidth;
	appName?: string;
	/** The bar's entity, as Unified Interface names it ("Contact"). */
	entityLabel: string;
	selectedCount: number;
	formState: "Create" | "Existing" | "Disabled";
	commands: BarCommandProps[];
}

export function D365Page(props: D365PageProps) {
	const styles = useStyles();
	const { page, width } = props;
	// Dynamics 365 is light: icons, the ⋮ menu and focus rings take its theme, not CBS's.
	return (
		<FluentProvider theme={webLightTheme} className={styles.provider}>
			<div
				className={styles.frame}
				style={{ width: FRAME_WIDTH[width] }}
				role="region"
				aria-label={`Dynamics 365 page (simulated): ${pageName(page)}`}
			>
				<div className={styles.header} aria-hidden="true">
					<GridDotsRegular fontSize={20} />
					<span className={styles.product}>Dynamics 365</span>
					{props.appName && width !== "phone" && (
						<span className={styles.app}>{props.appName}</span>
					)}
					<span className={styles.spacer} />
					{width !== "phone" && <SearchRegular fontSize={20} />}
					{width === "desktop" && <LightbulbRegular fontSize={20} />}
					<AddRegular fontSize={20} />
					{width !== "phone" && <SettingsRegular fontSize={20} />}
					<span className={styles.avatar}>AB</span>
				</div>
				<div className={styles.body}>
					{width !== "phone" && (
						<nav className={styles.rail} aria-hidden="true">
							<NavigationRegular fontSize={20} />
						</nav>
					)}
					<div className={styles.main}>
						{page === "HomePageGrid" && <GridPage {...props} />}
						{page === "Form" && <FormPage {...props} />}
						{page === "SubGridStandard" && <SubGridPage {...props} />}
						{page === "SubGridAssociated" && <AssociatedPage {...props} />}
					</div>
				</div>
			</div>
		</FluentProvider>
	);
}

const pageName = (page: UciLocation) =>
	page === "HomePageGrid"
		? "main grid"
		: page === "Form"
			? "main form"
			: page === "SubGridStandard"
				? "sub-grid on a form"
				: "associated view";

const barLabel = (props: D365PageProps) => `${props.entityLabel} Commands`;

function GridPage(props: D365PageProps) {
	const styles = useStyles();
	return (
		<>
			<D365CommandBar label={barLabel(props)} commands={props.commands} />
			<div className={styles.card}>
				<ViewHead title={`Active ${props.entityLabel} records`} />
				<Grid selected={props.selectedCount} entityLabel={props.entityLabel} />
			</div>
		</>
	);
}

function FormPage(props: D365PageProps) {
	const styles = useStyles();
	const isNew = props.formState === "Create";
	return (
		<>
			<D365CommandBar label="Commands" commands={props.commands} />
			<div className={styles.card}>
				{props.formState === "Disabled" && (
					<div className={styles.notice}>
						Read-only: This record&apos;s status: Inactive
					</div>
				)}
				<FormHead
					title={isNew ? `New ${props.entityLabel}` : `${props.entityLabel} record`}
					subtitle={`${props.entityLabel} · Main form`}
				/>
				<div className={styles.tabs} aria-hidden="true">
					<span className={mergeClasses(styles.tab, styles.tabOn)}>Summary</span>
					<span className={styles.tab}>Details</span>
					{!isNew && <span className={styles.tab}>Related</span>}
				</div>
			</div>
			<div className={styles.sections} aria-hidden="true">
				<Section title="General" />
				<Section title="Details" />
			</div>
		</>
	);
}

function SubGridPage(props: D365PageProps) {
	const styles = useStyles();
	return (
		<>
			<div className={styles.card}>
				<FormHead
					title="Parent record"
					subtitle="Another entity's form, with this sub-grid on it"
				/>
			</div>
			<div className={styles.sections}>
				<Section title="General" />
				<div className={mergeClasses(styles.card, styles.section)}>
					<div className={styles.subHead}>
						<span className={styles.sectionTitle}>{props.entityLabel} records</span>
						<span className={styles.spacer} />
					</div>
					<D365CommandBar label={barLabel(props)} commands={props.commands} compact />
					<Grid selected={props.selectedCount} entityLabel={props.entityLabel} rows={3} />
				</div>
			</div>
		</>
	);
}

function AssociatedPage(props: D365PageProps) {
	const styles = useStyles();
	return (
		<>
			<div className={styles.card}>
				<FormHead title="Parent record" subtitle="Another entity's form" />
				<div className={styles.tabs} aria-hidden="true">
					<span className={styles.tab}>Summary</span>
					<span className={mergeClasses(styles.tab, styles.tabOn)}>
						{props.entityLabel} records
					</span>
					<span className={styles.tab}>Related</span>
				</div>
			</div>
			<D365CommandBar label={barLabel(props)} commands={props.commands} />
			<div className={styles.card}>
				<ViewHead title={`${props.entityLabel} Associated View`} />
				<Grid selected={props.selectedCount} entityLabel={props.entityLabel} />
			</div>
		</>
	);
}

function ViewHead({ title }: { title: string }) {
	const styles = useStyles();
	return (
		<div className={styles.viewHead} aria-hidden="true">
			<span className={styles.viewTitle}>
				{title}
				<ChevronDownRegular fontSize={16} />
			</span>
			<span className={styles.spacer} />
			<span className={styles.muted}>
				<FilterRegular fontSize={16} /> Edit filters
			</span>
			<span className={styles.filter}>
				<SearchRegular fontSize={14} />
				Filter by keyword
			</span>
		</div>
	);
}

/** Rows ticked to match the simulated selection; no record data. */
function Grid({
	selected,
	entityLabel,
	rows = 4,
}: {
	selected: number;
	entityLabel: string;
	rows?: number;
}) {
	const styles = useStyles();
	const ticked = (i: number) => i < (selected >= 2 ? 2 : selected);
	return (
		<div role="presentation" aria-hidden="true">
			<div className={mergeClasses(styles.row, styles.headRow)}>
				<span className={styles.check} />
				<span>Name</span>
				<span>Modified on</span>
				<span>Owner</span>
			</div>
			{Array.from({ length: rows }, (_, i) => (
				<div key={i} className={mergeClasses(styles.row, ticked(i) && styles.rowOn)}>
					<span className={mergeClasses(styles.check, ticked(i) && styles.checkOn)}>
						{ticked(i) ? "✓" : ""}
					</span>
					<span className={styles.link}>
						{entityLabel} {i + 1}
					</span>
					<span className={styles.cell}>—</span>
					<span className={styles.cell}>—</span>
				</div>
			))}
		</div>
	);
}

function FormHead({ title, subtitle }: { title: string; subtitle: string }) {
	const styles = useStyles();
	const initials = title
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");
	return (
		<div className={styles.formHead} aria-hidden="true">
			<span className={styles.formAvatar}>{initials}</span>
			<div style={{ minWidth: 0 }}>
				<div className={styles.formTitle}>{title}</div>
				<div className={styles.muted}>{subtitle}</div>
			</div>
		</div>
	);
}

function Section({ title }: { title: string }) {
	const styles = useStyles();
	return (
		<div className={mergeClasses(styles.card, styles.section)} aria-hidden="true">
			<span className={styles.sectionTitle}>{title}</span>
			{[1, 2, 3].map((i) => (
				<div key={i} className={styles.field}>
					<span>Field {i}</span>
					<span className={styles.fieldValue}>—</span>
				</div>
			))}
		</div>
	);
}
