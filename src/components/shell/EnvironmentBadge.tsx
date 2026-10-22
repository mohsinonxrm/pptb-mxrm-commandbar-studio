import { Badge, Text, Tooltip, tokens } from "@fluentui/react-components";
import { useSessionStore } from "@/store/sessionStore";
import { isProductionEnvironment } from "@/components/shared/targetScopeRules";

/**
 * The environment the tool works against (#121): the connection's name and type, Production
 * highlighted. Follows connection changes (#120). `prefix` labels where it is shown, e.g. "Saves to".
 */
export function EnvironmentBadge({ prefix }: { prefix?: string }) {
	const name = useSessionStore((s) => s.connectionName);
	const url = useSessionStore((s) => s.connectionUrl);
	const environment = useSessionStore((s) => s.environment);
	if (!name && !url) return null;
	const production = isProductionEnvironment(environment);
	return (
		<Tooltip content={url || name} relationship="description">
			<span
				data-testid="environment-badge"
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: tokens.spacingHorizontalXS,
					minWidth: 0,
				}}
			>
				{prefix && (
					<Text size={200} wrap={false} style={{ color: tokens.colorNeutralForeground3 }}>
						{prefix}
					</Text>
				)}
				<Text size={200} weight="semibold" truncate wrap={false} style={{ maxWidth: 180 }}>
					{name || url}
				</Text>
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
