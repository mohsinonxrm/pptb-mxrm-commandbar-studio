import { InfoLabel, Switch, Text, Button, makeStyles, tokens } from "@fluentui/react-components";
import { DesktopRegular, PhoneRegular, TabletRegular } from "@fluentui/react-icons";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useSessionStore } from "@/store/sessionStore";
import { useUIStore } from "@/store/uiStore";
import { useDisplayText } from "@/hooks/useDisplayText";
import { useSimulatedPage } from "@/hooks/useSimulatedPage";
import type { SimulatedEntry } from "@/services/uciPreview/bar";
import { entryReason, moveGap, placementGoal } from "@/utils/simulation";
import { planPlacement } from "@/services/uciPreview/bar";
import { isMenuKind } from "@/utils/ribbonMenu";
import { uciLabel } from "@/services/uciPreview/labels";
import { D365Page } from "./simulate/D365Page";
import { radioGroupKeys, radioTabIndex } from "@/components/shared/radioGroupKeys";
import type { BarCommandProps } from "./simulate/D365CommandBar";
import { BarEditingContext, type BarEditing } from "./simulate/barEditing";
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
			{/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- the ARIA radio group pattern: the checked radio is the tab stop, the group handles the arrow keys */}
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
	const { simulation, page, entries, input } = useSimulatedPage(location);
	const setSimulation = useUIStore((s) => s.setSimulation);
	const ribbon = useRibbonStore((s) => s.ribbons[location]);
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
	const placeButton = useRibbonStore((s) => s.placeButton);
	const openNewButton = useUIStore((s) => s.openNewButton);
	const announce = useUIStore((s) => s.announce);

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
	// Adding and moving on the bar (#191 C5). A gap asks for a place between two entries
	// (`placementGoal`); `planPlacement` finds the group and Sequence the platform's merge draws
	// there, checked against the bar itself; the store puts the button there (your copy of a
	// button that isn't yours, the original hidden). Where no Sequence can, it says so.
	const tabOf = (groupId: string) =>
		ribbon?.tabs.find((t) => t.groups.some((g) => g.id === groupId))?.id;
	const between = (gap: number, moving?: string) => {
		const at = (offset: number) => listed[gap + offset];
		const named = (e: SimulatedEntry | undefined) => (e ? textOf(e) : undefined);
		return { left: named(at(-1)), right: named(at(0)), moving };
	};
	const cantPlace = (what: string, gap: number) => {
		const { left, right } = between(gap);
		announce(
			`Can't ${what} ${left && right ? `between ${left} and ${right}` : right ? `before ${right}` : `after ${left}`}: no Sequence puts it there, as the group's controls aren't in Sequence order in the ribbon.`,
		);
	};
	const moveTo = (id: string, gap: number) => {
		const at = listed.findIndex((e) => e.id === id);
		const entry = listed[at];
		if (entry?.kind !== "classic" || gap === at || gap === at + 1) return;
		const plan = planPlacement(input, placementGoal(listed, gap, tabOf, id));
		if (!plan) {
			cantPlace(`move ${textOf(entry)}`, gap);
			return;
		}
		const movedId = placeButton(
			{ location, tabId: entry.tabId, groupId: entry.groupId, buttonId: entry.button.id },
			{ location, ...plan },
		);
		if (!movedId) return;
		selectButtonInContext(location, plan.tabId, plan.groupId, movedId);
		const { left, right } = between(gap);
		announce(
			`Moved ${textOf(entry)} ${right && listed[gap]?.id !== id ? `before ${right}` : `after ${left}`}${movedId === entry.button.id ? "" : ", as your copy"}.`,
		);
		// Keep the keyboard on it: a copy is a new button on the bar.
		requestAnimationFrame(() =>
			[...document.querySelectorAll<HTMLElement>("[data-simulated]")]
				.find((el) => el.dataset.simulated === movedId)
				?.focus(),
		);
	};
	const editing: BarEditing = {
		insertAt(gap) {
			const plan = planPlacement(input, placementGoal(listed, gap, tabOf));
			if (!plan) {
				cantPlace("add a button", gap);
				return;
			}
			const { left, right } = between(gap);
			openNewButton(plan.groupId, {
				sequence: plan.sequence,
				where: right ? `before “${right}”` : `after “${left}”`,
			});
		},
		moveTo,
		moveBy(id, direction) {
			const gap = moveGap(listed, id, direction);
			if (gap !== null) moveTo(id, gap);
		},
		canMove: (e) =>
			e.kind === "classic" &&
			// A button that isn't yours moves as your copy; one with a menu can't (publish doesn't
			// move Microsoft's menus), nor one a migrated modern command stands in for (the copy
			// wouldn't be it).
			(e.button.origin === "unmanaged" ||
				(!e.button.menu && !isMenuKind(e.button.kind) && !e.replacedBy)),
		canMoveBy: (id, direction) => moveGap(listed, id, direction) !== null,
	};
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
				<BarEditingContext.Provider value={editing}>
					<D365Page
						page={page}
						width={simulation.width}
						appName={appName}
						entityLabel={entityName}
						selectedCount={simulation.selection}
						formState={simulation.formState}
						commands={barCommands}
					/>
				</BarEditingContext.Provider>
			</div>
		</section>
	);
}
