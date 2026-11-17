import { useMemo } from "react";
import { InfoLabel, Switch, Text, Button, makeStyles, tokens } from "@fluentui/react-components";
import { DesktopRegular, PhoneRegular, TabletRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSessionStore } from "@/store/sessionStore";
import { DEFAULT_SIMULATION, useUIStore } from "@/store/uiStore";
import { useModernLocation } from "@/hooks/useModernCommands";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useEntityProperties } from "@/hooks/useEntityProperties";
import { ribbonRules, simulateBar, type SimulatedEntry } from "@/services/uciPreview/bar";
import { entryReason, simulationContext, uciLocation } from "@/utils/simulation";
import { uciLabel } from "@/services/uciPreview/labels";
import { D365Page } from "./simulate/D365Page";
import { radioGroupKeys, radioTabIndex } from "@/components/shared/radioGroupKeys";
import type { BarCommandProps } from "./simulate/D365CommandBar";
import type { RibbonButton, RibbonLocation } from "@/types/ribbon";
import { resolveDisplayLabel } from "@/utils/displayLabel";

/**
 * Simulate mode (#191): the location's command bar as users get it in Dynamics 365, on the page
 * it appears on, for the selection or form state and width chosen in the simulation strip (the
 * "Chosen" artboard's variant A). The bar comes from the preview model (`services/uciPreview`):
 * rules CBS can't work out use outcomes recorded on a test org, or show dashed, "can't tell".
 * Choosing a command selects it, as in Edit.
 */

const useStyles = makeStyles({
	root: { display: "flex", flexDirection: "column", minWidth: 0, flex: "1 1 auto", minHeight: 0 },
	strip: {
		display: "flex",
		flexWrap: "wrap",
		alignItems: "center",
		columnGap: tokens.spacingHorizontalL,
		rowGap: tokens.spacingVerticalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground3,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
	},
	field: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalS },
	segment: {
		display: "inline-flex",
		borderRadius: tokens.borderRadiusMedium,
		border: `1px solid ${tokens.colorNeutralStroke1}`,
		overflow: "hidden",
	},
	segmentButton: {
		borderRadius: 0,
		borderTopWidth: 0,
		borderBottomWidth: 0,
		borderLeftWidth: 0,
		minWidth: "auto",
	},
	spacer: { flex: "1 1 0" },
	legend: { display: "inline-flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
	dot: {
		width: "6px",
		height: "6px",
		borderRadius: "50%",
		backgroundColor: tokens.colorBrandBackground,
	},
	stage: {
		flex: "1 1 auto",
		minHeight: 0,
		overflow: "auto",
		display: "flex",
		justifyContent: "center",
		alignItems: "flex-start",
		padding: tokens.spacingHorizontalL,
		backgroundColor: tokens.colorNeutralBackground4,
	},
	empty: { padding: tokens.spacingHorizontalL, color: tokens.colorNeutralForeground3 },
});

type Option<T> = { value: T; label: string; icon?: React.ReactElement };

/** A row of buttons where one is on, a radio group: the artboard's segmented control. */
function Segmented<T extends string | number>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: Option<T>[];
	onChange: (value: T) => void;
}) {
	const styles = useStyles();
	return (
		<span className={styles.field}>
			{label}
			<span
				className={styles.segment}
				role="radiogroup"
				aria-label={label}
				onKeyDown={radioGroupKeys(
					options.map((o) => o.value),
					value,
					onChange,
				)}
			>
				{options.map((o) => (
					<Button
						key={String(o.value)}
						size="small"
						appearance={o.value === value ? "primary" : "subtle"}
						role="radio"
						aria-checked={o.value === value}
						tabIndex={radioTabIndex(o.value === value)}
						icon={o.icon}
						className={styles.segmentButton}
						onClick={() => onChange(o.value)}
					>
						{o.label}
					</Button>
				))}
			</span>
		</span>
	);
}

export function SimulateCanvas({ location }: { location: RibbonLocation }) {
	const styles = useStyles();
	const stored = useUIStore((s) => s.simulation);
	// A simulation remembered before a setting existed gets its default.
	const simulation = useMemo(
		() => ({
			...DEFAULT_SIMULATION,
			...Object.fromEntries(Object.entries(stored ?? {}).filter(([, v]) => v !== undefined)),
		}),
		[stored],
	);
	const setSimulation = useUIStore((s) => s.setSimulation);
	const ribbon = useRibbonStore((s) => s.ribbons[location]);
	const commands = useRibbonStore((s) => s.commands);
	const displayRules = useRibbonStore((s) => s.displayRules);
	const enableRules = useRibbonStore((s) => s.enableRules);
	const locLabels = useRibbonStore((s) => s.locLabels);
	const entityLabel = useSessionStore((s) => s.activeEntity?.displayName) ?? "";
	const isActivity = useSessionStore((s) => !!s.activeEntity?.isActivity);
	const apps = useModernCommandStore((s) => s.apps);
	const appFilter = useModernCommandStore((s) => s.appFilter);
	const selectedButtonId = useSelectionStore((s) => s.selectedButtonId);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const selectedModernId = useModernCommandStore((s) => s.selectedCommandId);
	const selectCommand = useModernCommandStore((s) => s.selectCommand);
	const captionOf = useDisplayText();
	const modern = useModernLocation(location);
	const page = uciLocation(location, simulation);
	const properties = useEntityProperties(ribbon?.entityLogicalName || undefined);

	const entries = useMemo(() => {
		if (!page || !ribbon) return [];
		return simulateBar(
			{
				tabs: ribbon.tabs,
				modern: modern.nodes.map((n) => n.command),
				overrides: modern.overrides,
			},
			ribbonRules({ commands, displayRules, enableRules }),
			simulationContext(page, ribbon.entityLogicalName, simulation, properties),
			{
				focusedView: simulation.viewSwitch === "focusedView",
				showAs: simulation.viewSwitch === "showAs",
			},
		);
	}, [page, ribbon, modern, commands, displayRules, enableRules, simulation, properties]);

	if (!page)
		return (
			<section className={styles.root} aria-label="Simulate">
				<Text className={styles.empty}>
					Simulate shows an entity&apos;s pages. Choose Main grid, Main form or Sub-grid.
				</Text>
			</section>
		);
	// Every activity's list is the Activities grid, with the Activity entity's bar (checked on
	// email, task, phone call and appointment in Sales Hub, 2026-11-16).
	if (
		location === "HomepageGrid" &&
		isActivity &&
		ribbon?.entityLogicalName !== "activitypointer"
	)
		return (
			<section className={styles.root} aria-label="Simulate">
				<Text className={styles.empty}>
					Unified Interface shows {entityLabel || "this activity"}&apos;s list with the
					Activity entity&apos;s command bar, the same for every activity. To simulate it,
					open the Activity entity (activitypointer). Its form and sub-grids are its own.
				</Text>
			</section>
		);

	const entityName = entityLabel || ribbon?.entityLogicalName || "";
	const textOf = (e: SimulatedEntry) =>
		e.kind === "system"
			? e.label
			: e.kind === "modern"
				? e.command.label || e.command.uniqueName
				: e.replacedBy
					? e.replacedBy.label || e.replacedBy.uniqueName
					: // Unified Interface's own text for a platform label, where it was recorded and the
						// label isn't edited.
						(unchangedLabel(e.button) &&
							uciLabel(e.button.source?.labelToken, entityName)) ||
						// A label naming the entity ("New ‹entity name›") names this one.
						captionOf(
							e.button.label,
							locLabels,
							undefined,
							e.button.source?.labelToken,
						).replace(/‹entity name›/g, entityName) ||
						e.button.id;
	const unchangedLabel = (b: RibbonButton) =>
		!!b.source?.labelToken && resolveDisplayLabel(b.source.labelToken, locLabels) === b.label;
	const isSelected = (e: SimulatedEntry) =>
		e.kind === "classic"
			? e.id === selectedButtonId
			: e.kind === "modern" && !selectedButtonId && e.command.id === selectedModernId;
	const listed = entries.filter((e) => e.verdict.outcome !== false || simulation.showHidden);
	const barCommands: BarCommandProps[] = listed.map((e) => ({
		entry: e,
		text: textOf(e),
		reason: entryReason(e),
		selected: isSelected(e),
		mine:
			(e.kind === "classic" && e.button.origin === "unmanaged") ||
			(e.kind === "modern" && !e.command.managed),
		onChoose: () => {
			if (e.kind === "classic")
				selectButtonInContext(location, e.tabId, e.groupId, e.button.id);
			else if (e.kind === "modern") selectCommand(e.command.id);
		},
	}));
	const counted = entries.filter((e) => e.kind !== "system");
	const count = (o: boolean | "unknown") => counted.filter((e) => e.verdict.outcome === o).length;
	const appName = appFilter === "all" ? undefined : apps.find((a) => a.id === appFilter)?.name;

	return (
		<section className={styles.root} aria-label="Simulate">
			<div className={styles.strip} role="group" aria-label="Simulation">
				<Text weight="semibold" size={200}>
					Simulate
				</Text>
				{location === "SubGrid" && (
					<Segmented
						label="Page"
						value={simulation.subGridPage}
						options={[
							{ value: "SubGridStandard", label: "Sub-grid on a form" },
							{ value: "SubGridAssociated", label: "Associated view" },
						]}
						onChange={(v) => setSimulation({ subGridPage: v })}
					/>
				)}
				{location === "Form" ? (
					<Segmented
						label="Form state"
						value={simulation.formState}
						options={[
							{ value: "Create", label: "New" },
							{ value: "Existing", label: "Existing" },
							{ value: "Disabled", label: "Inactive" },
						]}
						onChange={(v) => setSimulation({ formState: v })}
					/>
				) : (
					<Segmented
						label="Selected records"
						value={simulation.selection}
						options={[
							{ value: 0 as const, label: "None" },
							{ value: 1 as const, label: "1" },
							{ value: 2 as const, label: "2+" },
						]}
						onChange={(v) => setSimulation({ selection: v })}
					/>
				)}
				{location === "HomepageGrid" && (
					<Segmented
						label="First item"
						value={simulation.viewSwitch}
						options={[
							{ value: "none" as const, label: "None" },
							{ value: "focusedView" as const, label: "Focused view" },
							{ value: "showAs" as const, label: "Show As" },
						]}
						onChange={(v) => setSimulation({ viewSwitch: v })}
					/>
				)}
				<Segmented
					label="Width"
					value={simulation.width}
					options={[
						{ value: "desktop" as const, label: "Desktop", icon: <DesktopRegular /> },
						{ value: "tablet" as const, label: "Tablet", icon: <TabletRegular /> },
						{ value: "phone" as const, label: "Phone", icon: <PhoneRegular /> },
					]}
					onChange={(v) => setSimulation({ width: v })}
				/>
				<Switch
					label="Show hidden commands"
					checked={simulation.showHidden}
					onChange={(_, d) => setSimulation({ showHidden: d.checked })}
				/>
				<span className={styles.spacer} />
				<span>
					{count(true)} shown · {count("unknown")} can&apos;t tell · {count(false)} hidden
				</span>
				<span className={styles.legend}>
					<span className={styles.dot} />
					Yours
				</span>
				<InfoLabel
					size="small"
					info="The command bar as a System Administrator gets it in Unified Interface on the web. Rules CBS can't work out from the ribbon (custom JavaScript, the organization's features, the record's data) use the outcomes Command Checker reported on a test org; the ones still unknown are dashed. The page around the bar is illustrative."
					infoButton={{ "aria-label": "About this simulation" }}
				/>
			</div>
			<div className={styles.stage}>
				<D365Page
					page={page}
					width={simulation.width}
					appName={appName}
					entityLabel={entityName}
					selectedCount={simulation.selection}
					formState={simulation.formState}
					commands={barCommands}
				/>
			</div>
		</section>
	);
}
