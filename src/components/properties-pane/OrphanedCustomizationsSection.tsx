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
import { useState } from "react";
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
	// The row whose Delete waits for a confirmation (published recently).
	const [confirming, setConfirming] = useState<string | null>(null);

	const rows = (["entity", "application"] as LayerScope[]).flatMap((scope) =>
		orphans[scope].map((o) => ({ scope, ...o })),
	);
	if (rows.length === 0) return null;

	return (
		<section className={styles.root} aria-label="Orphaned customizations">
			<Subtitle2>Orphaned customizations</Subtitle2>
			<Caption1>
				In your unmanaged customizations, but the ribbon doesn&apos;t return them, so they
				aren&apos;t on the canvas (and, except for tabs, Unified Interface doesn&apos;t show
				them either). Publishing keeps them unless you delete them. For a while after a
				publish the ribbon can still be the one from before it (10 minutes or more), so what
				you just published can show up here: don&apos;t delete it, reload later.
			</Caption1>
			{rows.map((r) => {
				const pending = pendingOrphanDeletes[r.scope].includes(r.id);
				const name = r.label && r.label !== r.id ? `“${r.label}” ` : "";
				const key = `${r.scope}:${r.id}`;
				// Just published from here: not offered (#64 review). Published
				// recently: confirm first.
				const justPublished = !!r.recentPublish?.published;
				const action = pending ? (
					<Button
						size="small"
						appearance="subtle"
						aria-label={`Keep ${r.id}`}
						onClick={() => setOrphanDeleted(r.scope, r.id, false)}
					>
						Keep
					</Button>
				) : justPublished ? (
					<Tooltip
						content="Published from here moments ago: reload later — it most likely isn't loaded yet"
						relationship="description"
					>
						<Button size="small" disabledFocusable aria-label={`Delete ${r.id}`}>
							Delete
						</Button>
					</Tooltip>
				) : r.recentPublish && confirming !== key ? (
					<Button
						size="small"
						appearance="secondary"
						aria-label={`Delete ${r.id}`}
						onClick={() => setConfirming(key)}
					>
						Delete…
					</Button>
				) : r.recentPublish ? (
					<Button
						size="small"
						appearance="primary"
						aria-label={`Delete ${r.id} anyway`}
						onClick={() => {
							setConfirming(null);
							setOrphanDeleted(r.scope, r.id, true);
						}}
					>
						Delete anyway
					</Button>
				) : (
					<Button
						size="small"
						appearance="secondary"
						aria-label={`Delete ${r.id}`}
						onClick={() => setOrphanDeleted(r.scope, r.id, true)}
					>
						Delete
					</Button>
				);
				return (
					<div key={key} className={styles.row}>
						<LinkDismissRegular className={styles.icon} />
						<div className={styles.text}>
							<Tooltip
								content={`${r.element} ${r.id} — CustomAction ${r.customActionId} at ${r.location}`}
								relationship="description"
							>
								<Text
									className={mergeClasses(styles.mono, pending && styles.pending)}
								>
									{name}
									{r.id}
								</Text>
							</Tooltip>
							<Caption1 className={mergeClasses(styles.mono, styles.why)}>
								{r.location}
							</Caption1>
							<Caption1 className={styles.why}>{r.why}</Caption1>
						</div>
						{action}
					</div>
				);
			})}
		</section>
	);
}
