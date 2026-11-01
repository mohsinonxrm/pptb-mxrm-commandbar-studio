import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	Badge,
	Button,
	DataGridCell,
	DataGridHeaderCell,
	InteractionTag,
	InteractionTagPrimary,
	TableCellLayout,
	Text,
	Tooltip,
	createTableColumn,
	makeStyles,
	mergeClasses,
	tokens,
	type TableColumnDefinition,
	type TableColumnSizingOptions,
	useFocusableGroup,
} from "@fluentui/react-components";
import {
	DataGrid,
	DataGridBody,
	DataGridHeader,
	DataGridRow,
} from "@fluentui-contrib/react-data-grid-react-window";
import { distinguishingSegment } from "@/utils/idSegment";
import type { CommandDefinition, DisplayRule, EnableRule, RibbonAction } from "@/types/ribbon";

/**
 * The bottom panel's Commands and rules grids (#185): virtualized, so
 * hundreds of rows stay quick, with a header that stays put (the rows scroll,
 * not the panel), ids truncated with the whole id in a tooltip, and one target
 * per row: the row selects (click or Space), Edit (or Enter, or a double-click)
 * opens the editor. A command's rules are tags that show the part of the id
 * that tells them apart, and open that rule.
 */

const ROW_HEIGHT = 36;

const useStyles = makeStyles({
	row: { cursor: "pointer" },
	selected: {
		backgroundColor: tokens.colorSubtleBackgroundSelected,
		":hover": { backgroundColor: tokens.colorSubtleBackgroundSelected },
	},
	mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
	tags: {
		display: "flex",
		gap: tokens.spacingHorizontalXXS,
		minWidth: 0,
		overflow: "hidden",
		whiteSpace: "nowrap",
	},
	chip: {
		display: "inline-flex",
		padding: "0 6px",
		borderRadius: tokens.borderRadiusMedium,
		fontSize: tokens.fontSizeBase100,
		border: `1px solid ${tokens.colorNeutralStroke2}`,
		backgroundColor: tokens.colorNeutralBackground3,
		flexShrink: 0,
	},
	muted: { color: tokens.colorNeutralForeground3 },
	empty: { padding: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3 },
	// Fills what the panel leaves; the rows scroll inside it. When the panel is
	// too short for the header and a row, the box scrolls, so no row is out of
	// reach (review).
	box: { flex: 1, minHeight: 0, minWidth: 0, overflowX: "hidden", overflowY: "auto" },
});

const ACTION_SHORT: Record<RibbonAction["kind"], string> = {
	javascript: "JS",
	url: "URL",
	powerFx: "Fx",
	customApi: "API",
	outlookCommand: "Outlook",
	raw: "XML",
};

const header = (text: string) => (
	<Text size={200} weight="semibold">
		{text}
	</Text>
);

const used = (n: number | undefined, noun: string) => (
	<Badge size="small" appearance="tint" color={n ? "brand" : "informative"}>
		{n ?? 0} {noun}
		{n === 1 ? "" : "s"}
	</Badge>
);

/** An id cut to its width, the whole id in a tooltip. */
function IdCell({ id }: { id: string }) {
	const styles = useStyles();
	return (
		<Tooltip content={id} relationship="description">
			<TableCellLayout truncate className={styles.mono}>
				{id}
			</TableCellLayout>
		</Tooltip>
	);
}

interface GridProps<T> {
	items: T[];
	columns: TableColumnDefinition<T>[];
	sizing: TableColumnSizingOptions;
	idOf: (item: T) => string;
	label: string;
	/** Used until the grid's box is measured (and where it can't be, e.g. in tests). */
	height: number;
	onOpen: (item: T) => void;
	emptyText: string;
}

/** What a row needs from its grid, read from context so the row renderer never changes. */
interface RowState {
	selected: string | null;
	select: (id: string) => void;
	open: (item: unknown) => void;
	idOf: (item: unknown) => string;
}
const RowContext = React.createContext<RowState | null>(null);

const isControl = (e: React.SyntheticEvent) => !!(e.target as HTMLElement).closest("button");

/**
 * One row. Its renderer is stable: the virtualized body renders it as a
 * component type, so a new renderer each render would remount every row and
 * drop the focus on Space or a click (review).
 */
function ElementRow({
	item,
	rowId,
	style,
}: {
	item: unknown;
	rowId: string | number;
	style: React.CSSProperties;
}) {
	const styles = useStyles();
	const ctx = React.useContext(RowContext)!;
	const id = ctx.idOf(item);
	const isSelected = ctx.selected === id;
	return (
		<DataGridRow
			key={rowId}
			style={style}
			// The virtualized grid's rows set aria-selected themselves.
			aria-current={isSelected || undefined}
			data-element-row={id}
			className={mergeClasses(styles.row, isSelected && styles.selected)}
			onClick={(e: React.MouseEvent) => {
				if (!isControl(e)) ctx.select(id);
			}}
			onDoubleClick={(e: React.MouseEvent) => {
				if (!isControl(e)) ctx.open(item);
			}}
			onKeyDown={(e: React.KeyboardEvent) => {
				if (isControl(e)) return;
				if (e.key === " ") {
					e.preventDefault();
					ctx.select(id);
				} else if (e.key === "Enter") {
					e.preventDefault();
					ctx.open(item);
				}
			}}
		>
			{({ renderCell }: { renderCell: (item: unknown) => React.ReactNode }) => (
				<DataGridCell>{renderCell(item)}</DataGridCell>
			)}
		</DataGridRow>
	);
}

const renderRow = (
	{ item, rowId }: { item: unknown; rowId: string | number },
	style: React.CSSProperties,
) => <ElementRow item={item} rowId={rowId} style={style} />;

/** The grid's header row is about this tall; the rows get the rest of the box. */
const HEADER_HEIGHT = 34;

function ElementGrid<T>({
	items,
	columns,
	sizing,
	idOf,
	label,
	height,
	onOpen,
	emptyText,
}: GridProps<T>) {
	const styles = useStyles();
	const [selected, setSelected] = useState<string | null>(null);
	// The rows fill the grid's box, measured: the panel can be dragged to any height (review).
	const boxRef = useRef<HTMLDivElement>(null);
	const [boxHeight, setBoxHeight] = useState(0);
	// Read whenever the panel's height (`height`, its estimate) changes, and on
	// window resizes: a resize observer alone doesn't report while the window
	// is hidden. The box's height comes from the panel, not from its content.
	useLayoutEffect(() => {
		const h = Math.floor(boxRef.current?.getBoundingClientRect().height ?? 0);
		if (h !== boxHeight) setBoxHeight(h);
	}, [height, boxHeight]);
	useEffect(() => {
		const box = boxRef.current;
		if (!box || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) =>
			setBoxHeight(Math.floor(entry.contentRect.height)),
		);
		observer.observe(box);
		return () => observer.disconnect();
	}, []);
	// Enter opens a row: the grid's focus manager would otherwise take it to
	// move into the row's first cell (review, as in the List view).
	const passEnter = useFocusableGroup({
		tabBehavior: "unlimited",
		ignoreDefaultKeydown: { Enter: true },
	});
	const rowState = useMemo<RowState>(
		() => ({
			selected,
			select: setSelected,
			open: onOpen as (item: unknown) => void,
			idOf: idOf as (item: unknown) => string,
		}),
		[selected, onOpen, idOf],
	);
	const bodyHeight = Math.max(ROW_HEIGHT, (boxHeight || height + HEADER_HEIGHT) - HEADER_HEIGHT);
	return (
		<div ref={boxRef} className={styles.box} {...passEnter}>
			{items.length === 0 ? (
				<Text as="p" size={200} className={styles.empty}>
					{emptyText}
				</Text>
			) : (
				<RowContext.Provider value={rowState}>
					<DataGrid
						items={items}
						columns={columns}
						columnSizingOptions={sizing}
						resizableColumns
						getRowId={idOf}
						focusMode="composite"
						size="small"
						aria-label={label}
					>
						<DataGridHeader>
							<DataGridRow>
								{({ renderHeaderCell }) => (
									<DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
								)}
							</DataGridRow>
						</DataGridHeader>
						<DataGridBody<T>
							itemSize={ROW_HEIGHT}
							height={Math.min(bodyHeight, items.length * ROW_HEIGHT)}
							listProps={{ width: "100%" }}
						>
							{renderRow as never}
						</DataGridBody>
					</DataGrid>
				</RowContext.Provider>
			)}
		</div>
	);
}

/** A rule a command lists, as a tag naming the part of its id that tells it apart. */
function RuleTag({ id, onOpen }: { id: string; onOpen: () => void }) {
	return (
		<Tooltip content={id} relationship="description">
			<InteractionTag size="extra-small" appearance="outline" shape="rounded">
				<InteractionTagPrimary onClick={onOpen}>
					{distinguishingSegment(id)}
				</InteractionTagPrimary>
			</InteractionTag>
		</Tooltip>
	);
}

export function CommandsGrid({
	commands,
	usage,
	height,
	onOpen,
	onOpenRule,
	emptyText,
}: {
	commands: CommandDefinition[];
	usage: Map<string, number>;
	height: number;
	onOpen: (id: string) => void;
	onOpenRule: (id: string, kind: "enable" | "display") => void;
	emptyText: string;
}) {
	const styles = useStyles();
	const columns: TableColumnDefinition<CommandDefinition>[] = [
		createTableColumn({
			columnId: "id",
			renderHeaderCell: () => header("Command"),
			renderCell: (c) => <IdCell id={c.id} />,
		}),
		createTableColumn({
			columnId: "actions",
			renderHeaderCell: () => header("Actions"),
			renderCell: (c) => (
				<span className={styles.tags}>
					{c.actions.length === 0 ? (
						<span className={styles.muted}>—</span>
					) : (
						c.actions.map((a, i) => (
							<span key={i} className={styles.chip}>
								{ACTION_SHORT[a.kind] ?? "XML"}
							</span>
						))
					)}
				</span>
			),
		}),
		createTableColumn({
			columnId: "enable",
			renderHeaderCell: () => header("Enable rules"),
			renderCell: (c) => (
				<span className={styles.tags}>
					{c.enableRules.map((r) => (
						<RuleTag key={r} id={r} onOpen={() => onOpenRule(r, "enable")} />
					))}
				</span>
			),
		}),
		createTableColumn({
			columnId: "display",
			renderHeaderCell: () => header("Display rules"),
			renderCell: (c) => (
				<span className={styles.tags}>
					{c.displayRules.map((r) => (
						<RuleTag key={r} id={r} onOpen={() => onOpenRule(r, "display")} />
					))}
				</span>
			),
		}),
		createTableColumn({
			columnId: "used",
			renderHeaderCell: () => header("Used by"),
			renderCell: (c) => used(usage.get(c.id), "control"),
		}),
		createTableColumn({
			columnId: "edit",
			renderHeaderCell: () => null,
			renderCell: (c) => (
				<Button
					appearance="subtle"
					size="small"
					aria-label={`Edit ${c.id}`}
					onClick={() => onOpen(c.id)}
				>
					Edit
				</Button>
			),
		}),
	];
	return (
		<ElementGrid
			items={commands}
			columns={columns}
			sizing={{
				id: { defaultWidth: 280, minWidth: 120 },
				actions: { defaultWidth: 90, minWidth: 48 },
				enable: { defaultWidth: 200, minWidth: 80 },
				display: { defaultWidth: 200, minWidth: 80 },
				used: { defaultWidth: 100, minWidth: 72 },
				edit: { defaultWidth: 60, minWidth: 52 },
			}}
			idOf={(c) => c.id}
			label="Commands"
			height={height}
			onOpen={(c) => onOpen(c.id)}
			emptyText={emptyText}
		/>
	);
}

export function RulesGrid({
	rules,
	kind,
	usage,
	height,
	onOpen,
	emptyText,
}: {
	rules: (EnableRule | DisplayRule)[];
	kind: "enable" | "display";
	usage: Map<string, number>;
	height: number;
	onOpen: (id: string) => void;
	emptyText: string;
}) {
	const styles = useStyles();
	const columns: TableColumnDefinition<EnableRule | DisplayRule>[] = [
		createTableColumn({
			columnId: "id",
			renderHeaderCell: () => header("Rule"),
			renderCell: (r) => <IdCell id={r.id} />,
		}),
		createTableColumn({
			columnId: "steps",
			renderHeaderCell: () => header("Steps"),
			renderCell: (r) => (
				<span className={styles.tags}>
					{r.steps.length === 0 ? (
						<span className={styles.muted}>—</span>
					) : (
						<>
							{r.steps.slice(0, 3).map((s, i) => (
								<span key={i} className={styles.chip}>
									{s.kind.replace(/Rule$/, "")}
								</span>
							))}
							{r.steps.length > 3 && (
								<span className={mergeClasses(styles.chip, styles.muted)}>
									+{r.steps.length - 3}
								</span>
							)}
						</>
					)}
				</span>
			),
		}),
		createTableColumn({
			columnId: "used",
			renderHeaderCell: () => header("Used by"),
			renderCell: (r) => used(usage.get(r.id), "command"),
		}),
		createTableColumn({
			columnId: "edit",
			renderHeaderCell: () => null,
			renderCell: (r) => (
				<Button
					appearance="subtle"
					size="small"
					aria-label={`Edit ${r.id}`}
					onClick={() => onOpen(r.id)}
				>
					Edit
				</Button>
			),
		}),
	];
	return (
		<ElementGrid
			items={rules}
			columns={columns}
			sizing={{
				id: { defaultWidth: 360, minWidth: 140 },
				steps: { defaultWidth: 260, minWidth: 100 },
				used: { defaultWidth: 110, minWidth: 80 },
				edit: { defaultWidth: 60, minWidth: 52 },
			}}
			idOf={(r) => r.id}
			label={kind === "enable" ? "Enable rules" : "Display rules"}
			height={height}
			onOpen={(r) => onOpen(r.id)}
			emptyText={emptyText}
		/>
	);
}
