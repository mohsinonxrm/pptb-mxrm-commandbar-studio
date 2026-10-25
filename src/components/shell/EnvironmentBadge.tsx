import { Badge, Text, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { useSessionStore } from "@/store/sessionStore";
import { isProductionEnvironment } from "@/components/shared/targetScopeRules";

const useStyles = makeStyles({
	root: {
		display: "inline-flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalXS,
		minWidth: 0,
		borderRadius: tokens.borderRadiusMedium,
		":focus-visible": {
			outline: `2px solid ${tokens.colorStrokeFocus2}`,
			outlineOffset: "2px",
		},
	},
	prefix: { color: tokens.colorNeutralForeground3 },
	name: { maxWidth: "180px" },
	/** The name gives way to the type badge in a narrow top bar (#179). */
	nameBelow1200: {
		display: "inline-flex",
		minWidth: 0,
		"@media (max-width: 1200px)": { display: "none" },
	},
});

/**
 * The environment the tool works against (#121): the connection's name and type, Production
 * highlighted. Follows connection changes (#120). `prefix` labels where it is shown, e.g. "Saves to".
 * The full URL is in a tooltip on a focusable element, so keyboard users can read it too.
 */
export function EnvironmentBadge({
	prefix,
	compactBelow,
}: {
	prefix?: string;
	/** Hide the name (keep the type) below this window width; only 1200 is supported. */
	compactBelow?: 1200;
}) {
	const styles = useStyles();
	const name = useSessionStore((s) => s.connectionName);
	const url = useSessionStore((s) => s.connectionUrl);
	const environment = useSessionStore((s) => s.environment);
	if (!name && !url) return null;
	const production = isProductionEnvironment(environment);
	return (
		<Tooltip content={url || name} relationship="description">
			<span data-testid="environment-badge" className={styles.root} tabIndex={0}>
				{prefix && (
					<Text size={200} wrap={false} className={styles.prefix}>
						{prefix}
					</Text>
				)}
				{/* A wrapper span: a media-query class on Text loses to Text's own display. */}
				<span className={compactBelow ? styles.nameBelow1200 : undefined}>
					<Text
						size={200}
						weight="semibold"
						truncate
						wrap={false}
						className={styles.name}
					>
						{name || url}
					</Text>
				</span>
				{environment && (
					<Badge
						size="small"
						appearance={production ? "filled" : "tint"}
						color={production ? "warning" : "informative"}
					>
						{environment}
					</Badge>
				)}
			</span>
		</Tooltip>
	);
}
