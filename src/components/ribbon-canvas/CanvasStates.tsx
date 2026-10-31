import { useState } from "react";
import {
	Accordion,
	AccordionHeader,
	AccordionItem,
	AccordionPanel,
	Button,
	MessageBar,
	MessageBarActions,
	MessageBarBody,
	MessageBarTitle,
	ProgressBar,
	Skeleton,
	SkeletonItem,
	Text,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { DatabaseRegular, TableRegular } from "@fluentui/react-icons";
import { useUIStore } from "@/store/uiStore";
import { copyText } from "@/utils/hostIO";

/**
 * What the canvas shows before a table is open, while it loads, and when it
 * couldn't be loaded (#195): where you are and the one next step, never an
 * action that can't work yet ("Add first group" with no table).
 */

const useStyles = makeStyles({
	empty: {
		flex: 1,
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: tokens.spacingVerticalM,
		padding: tokens.spacingHorizontalXXL,
		textAlign: "center",
		color: tokens.colorNeutralForeground3,
	},
	icon: { fontSize: "40px", color: tokens.colorNeutralForeground4 },
	body: { maxWidth: "420px" },
	loading: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalM,
		padding: tokens.spacingHorizontalM,
	},
	skeletonRow: { display: "flex", gap: tokens.spacingHorizontalS },
	skeletonCards: { display: "flex", gap: tokens.spacingHorizontalM, flexWrap: "wrap" },
	card: { flex: "1 1 200px", height: "140px" },
	status: { color: tokens.colorNeutralForeground2 },
	error: {
		display: "flex",
		flexDirection: "column",
		gap: tokens.spacingVerticalS,
		padding: tokens.spacingHorizontalM,
		maxWidth: "720px",
	},
	details: {
		margin: 0,
		fontFamily: tokens.fontFamilyMonospace,
		fontSize: tokens.fontSizeBase200,
		whiteSpace: "pre-wrap",
		overflowWrap: "anywhere",
		color: tokens.colorNeutralForeground2,
	},
});

export type CanvasEmptyKind = "noSolution" | "noTable";

export function CanvasEmptyState({ kind }: { kind: CanvasEmptyKind }) {
	const styles = useStyles();
	const openSolutionPicker = useUIStore((s) => s.setSolutionPickerOpen);
	const openTablePicker = useUIStore((s) => s.setTablePickerOpen);
	if (kind === "noSolution") {
		return (
			<div className={styles.empty}>
				<DatabaseRegular className={styles.icon} aria-hidden="true" />
				<Text size={500} weight="semibold">
					Choose a solution to start
				</Text>
				<Text className={styles.body}>
					Your changes are saved to the solution you pick. Only unmanaged solutions are
					listed.
				</Text>
				<Button appearance="primary" onClick={() => openSolutionPicker(true)}>
					Choose solution
				</Button>
			</div>
		);
	}
	return (
		<div className={styles.empty}>
			<TableRegular className={styles.icon} aria-hidden="true" />
			<Text size={500} weight="semibold">
				Pick a table
			</Text>
			<Text className={styles.body}>
				Choose a table from this solution to see and change its command bars.
			</Text>
			<Button appearance="primary" onClick={() => openTablePicker(true)}>
				Choose table
			</Button>
		</div>
	);
}

export function CanvasLoading({ table, step }: { table?: string; step?: string | null }) {
	const styles = useStyles();
	return (
		<div className={styles.loading}>
			<ProgressBar thickness="medium" aria-label="Loading" />
			<Text role="status" aria-live="polite" className={styles.status}>
				{table ? `Loading ${table}` : "Loading the ribbon"}
				{step ? ` · ${step}` : ""}
			</Text>
			{/* In the shape of what's coming: a bar of buttons, then groups. */}
			<Skeleton aria-hidden="true" className={styles.loading}>
				<div className={styles.skeletonRow}>
					{[70, 80, 90, 60, 75].map((w) => (
						<SkeletonItem key={w} style={{ width: w, height: 32 }} />
					))}
				</div>
				<div className={styles.skeletonCards}>
					{[0, 1, 2].map((i) => (
						<SkeletonItem key={i} className={styles.card} />
					))}
				</div>
			</Skeleton>
		</div>
	);
}

/** A plain-language cause for a load error, from its HTTP status when it has one. */
function causeOf(error: string): string {
	if (/\b401\b|unauthori[sz]ed/i.test(error)) return "Your connection may have expired.";
	if (/\b403\b|forbidden|privilege/i.test(error))
		return "Your account may not have permission to read this table's ribbon.";
	if (/\b(429|503|504)\b|timeout|timed out/i.test(error))
		return "Dataverse was busy or didn't answer in time. Try again in a moment.";
	if (/\b5\d\d\b/.test(error)) return "Dataverse returned an error.";
	if (/failed to fetch|network/i.test(error)) return "The connection to Dataverse failed.";
	return "Something went wrong while reading it.";
}

export function CanvasLoadError({
	table,
	error,
	onRetry,
}: {
	table?: string;
	error: string;
	onRetry?: () => void;
}) {
	const styles = useStyles();
	const [copied, setCopied] = useState<"" | "yes" | "no">("");
	return (
		<div className={styles.error}>
			<MessageBar intent="error" layout="multiline">
				<MessageBarBody>
					<MessageBarTitle>
						Couldn&apos;t load {table ? `${table}'s` : "the"} ribbon
					</MessageBarTitle>
					{causeOf(error)}
				</MessageBarBody>
				{onRetry && (
					<MessageBarActions>
						<Button size="small" appearance="primary" onClick={onRetry}>
							Retry
						</Button>
					</MessageBarActions>
				)}
			</MessageBar>
			<Accordion collapsible>
				<AccordionItem value="details">
					<AccordionHeader size="small">Details</AccordionHeader>
					<AccordionPanel>
						<pre className={styles.details}>{error}</pre>
						<Button
							size="small"
							onClick={async () =>
								setCopied((await copyText(error)).ok ? "yes" : "no")
							}
						>
							{copied === "yes"
								? "Copied"
								: copied === "no"
									? "Couldn't copy"
									: "Copy details"}
						</Button>
					</AccordionPanel>
				</AccordionItem>
			</Accordion>
		</div>
	);
}
