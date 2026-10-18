import { Badge } from "@fluentui/react-components";
import { describeOverride } from "@/services/modernCommands";
import type { ClassicModernOverride } from "@/types/modernCommand";

/**
 * Flags a classic button that a migrated modern command hides or renders in
 * its place. The full explanation (command and app) is in the title.
 */
export function ClassicModernOverrideBadge({
	overrides,
	appNames,
}: {
	overrides: ClassicModernOverride[] | undefined;
	appNames: ReadonlyMap<string, string>;
}) {
	if (!overrides?.length) return null;
	const hidden = overrides.some((o) => o.effect === "hidden");
	const text = overrides.map((o) => describeOverride(o, appNames)).join("\n");
	return (
		<Badge
			size="extra-small"
			appearance="tint"
			color={hidden ? "warning" : "important"}
			title={text}
			aria-label={text}
		>
			{hidden ? "Hidden by modern" : "Modern"}
		</Badge>
	);
}
