import { Select, Spinner, Text, Tooltip, tokens } from "@fluentui/react-components";
import { useModernCommandStore } from "@/store/modernCommandStore";

/**
 * "App" filter for modern commands (#32), shown next to "View as". Modern
 * commands are scoped to a model-driven app (or to every app); "All apps"
 * shows them all, each badged with its app.
 */
export function ModernAppFilter() {
	const status = useModernCommandStore((s) => s.status);
	const apps = useModernCommandStore((s) => s.apps);
	const appFilter = useModernCommandStore((s) => s.appFilter);
	const setAppFilter = useModernCommandStore((s) => s.setAppFilter);
	const count = useModernCommandStore((s) => s.commands.length);
	const error = useModernCommandStore((s) => s.error);

	if (status === "idle") return null;
	if (status === "loading")
		return <Spinner size="extra-tiny" aria-label="Loading modern commands" />;
	if (status === "unavailable") {
		return (
			<Tooltip
				content={`Modern commands couldn't be read: ${error ?? "unknown error"}`}
				relationship="label"
			>
				<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
					Modern: n/a
				</Text>
			</Tooltip>
		);
	}

	return (
		<div style={{ display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS }}>
			<Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
				App:
			</Text>
			<Tooltip
				content={`${count} modern command${count === 1 ? "" : "s"} for this table (read-only). Pick an app to see its command bar.`}
				relationship="description"
			>
				<Select
					value={appFilter}
					onChange={(_, d) => setAppFilter(d.value)}
					size="small"
					aria-label="App for modern commands"
					style={{ height: "26px", width: "170px" }}
				>
					<option value="all">All apps</option>
					{apps.map((a) => (
						<option key={a.id} value={a.id}>
							{a.name}
						</option>
					))}
				</Select>
			</Tooltip>
		</div>
	);
}
