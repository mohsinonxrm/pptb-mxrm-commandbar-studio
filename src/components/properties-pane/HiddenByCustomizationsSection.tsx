import { Button, Caption1, makeStyles, Text, tokens, Tooltip } from "@fluentui/react-components";
import { EyeOffRegular } from "@fluentui/react-icons";
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
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
	},
	id: {
		flex: 1,
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
	},
	pending: {
		textDecoration: "line-through",
		color: tokens.colorNeutralForeground3,
	},
});

/**
 * Controls hidden by a HideCustomAction in the unmanaged layer (#47).
 * RetrieveEntityRibbon returns the ribbon with hides applied, so these never
 * reach the canvas; this list is the only way to un-hide them. The un-hide is
 * written on the next publish; the control appears after a reload.
 */
export function HiddenByCustomizationsSection() {
	const styles = useStyles();
	const layers = useRibbonStore((s) => s.layers);
	const pendingUnhides = useRibbonStore((s) => s.pendingUnhides);
	const setLayerHideUnhidden = useRibbonStore((s) => s.setLayerHideUnhidden);

	const rows = (["entity", "application"] as LayerScope[]).flatMap((scope) =>
		(layers[scope]?.hides ?? []).map((h) => ({ scope, ...h })),
	);
	if (rows.length === 0) return null;

	return (
		<section className={styles.root} aria-label="Hidden by customizations">
			<Text as="h3" size={300} weight="semibold">
				Hidden by customizations
			</Text>
			<Caption1>
				Hidden by a HideCustomAction in your unmanaged customizations, so they aren&apos;t
				on the canvas. Un-hiding takes effect when you publish; reload afterwards to see
				them.
			</Caption1>
			{rows.map((r) => {
				const pending = pendingUnhides[r.scope].includes(r.location);
				return (
					<div key={`${r.scope}:${r.location}`} className={styles.row}>
						<EyeOffRegular />
						<Tooltip
							content={`${r.location} (${r.scope === "entity" ? "this table" : "application ribbon"})`}
							relationship="description"
						>
							<Text className={`${styles.id} ${pending ? styles.pending : ""}`}>
								{r.location}
							</Text>
						</Tooltip>
						<Button
							size="small"
							appearance={pending ? "subtle" : "secondary"}
							onClick={() => setLayerHideUnhidden(r.scope, r.location, !pending)}
						>
							{pending ? "Keep hidden" : "Unhide"}
						</Button>
					</div>
				);
			})}
		</section>
	);
}
