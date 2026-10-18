import {
	Button,
	Caption1,
	makeStyles,
	mergeClasses,
	Subtitle2,
	Text,
	tokens,
	Tooltip,
} from "@fluentui/react-components";
import { LinkDismissRegular } from "@fluentui/react-icons";
import { useRibbonStore, type LayerScope } from "@/store/ribbonStore";

const useStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalXS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		textAlign: "left",
		width: "100%",
		boxSizing: "border-box",
	},
	row: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
	},
	icon: {
		flexShrink: 0,
		marginTop: "2px",
		color: tokens.colorPaletteMarigoldForeground1,
	},
	text: {
		display: "flex",
		flexDirection: "column",
		flex: 1,
		minWidth: 0,
	},
	mono: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
	},
	why: {
		color: tokens.colorNeutralForeground3,
	},
	pending: {
		textDecoration: "line-through",
		color: tokens.colorNeutralForeground3,
	},
});

/**
 * What the table's unmanaged layer adds that the ribbon doesn't return
 * anywhere (#64): e.g. a button added to the Charts tab, or to a group that
 * no longer exists. It isn't on the canvas, and every publish keeps it, so
 * this list is the only way to see and delete it. The delete is written on the
 * next publish (with the command and labels nothing else uses) and can be
 * undone until then.
 */
export function OrphanedCustomizationsSection() {
	const styles = useStyles();
	const orphans = useRibbonStore((s) => s.orphans);
	const pendingOrphanDeletes = useRibbonStore((s) => s.pendingOrphanDeletes);
	const setOrphanDeleted = useRibbonStore((s) => s.setOrphanDeleted);

	const rows = (["entity", "application"] as LayerScope[]).flatMap((scope) =>
		orphans[scope].map((o) => ({ scope, ...o })),
	);
	if (rows.length === 0) return null;

	return (
		<section className={styles.root} aria-label="Orphaned customizations">
			<Subtitle2>Orphaned customizations</Subtitle2>
			<Caption1>
				In your unmanaged customizations, but the ribbon doesn&apos;t return them, so they aren&apos;t on the canvas
				(and, except for tabs, Unified Interface doesn&apos;t show them either). Publishing keeps them unless you
				delete them. If you published one moments ago, reload before deleting it.
			</Caption1>
			{rows.map((r) => {
				const pending = pendingOrphanDeletes[r.scope].includes(r.id);
				const name = r.label && r.label !== r.id ? `“${r.label}” ` : "";
				return (
					<div key={`${r.scope}:${r.id}`} className={styles.row}>
						<LinkDismissRegular className={styles.icon} />
						<div className={styles.text}>
							<Tooltip
								content={`${r.element} ${r.id} — CustomAction ${r.customActionId} at ${r.location}`}
								relationship="description"
							>
								<Text className={mergeClasses(styles.mono, pending && styles.pending)}>
									{name}
									{r.id}
								</Text>
							</Tooltip>
							<Caption1 className={mergeClasses(styles.mono, styles.why)}>{r.location}</Caption1>
							<Caption1 className={styles.why}>{r.why}</Caption1>
						</div>
						<Button
							size="small"
							appearance={pending ? "subtle" : "secondary"}
							aria-label={pending ? `Keep ${r.id}` : `Delete ${r.id}`}
							onClick={() => setOrphanDeleted(r.scope, r.id, !pending)}
						>
							{pending ? "Keep" : "Delete"}
						</Button>
					</div>
				);
			})}
		</section>
	);
}
