import {
	Button,
	InfoLabel,
	Menu,
	MenuItemRadio,
	MenuList,
	MenuPopover,
	MenuTrigger,
	Spinner,
	Tooltip,
	makeStyles,
	tokens,
} from "@fluentui/react-components";
import { ChevronDownRegular } from "@fluentui/react-icons";
import { useModernCommandStore } from "@/store/modernCommandStore";

const useStyles = makeStyles({
	popover: { overflowY: "auto" },
	trigger: { maxWidth: "200px", minWidth: 0 },
	label: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
	value: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
});

/**
 * "App" filter for modern commands (#32), in the location row. Modern commands
 * are scoped to a model-driven app (or to every app); "All apps" shows them
 * all, each badged with its app. A menu instead of a 170 px Select (#180).
 */
export function ModernAppFilter() {
	const styles = useStyles();
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
			<InfoLabel
				size="small"
				info={`Modern commands couldn't be read: ${error ?? "unknown error"}`}
			>
				Modern commands unavailable
			</InfoLabel>
		);
	}

	const current =
		appFilter === "all"
			? "All apps"
			: (apps.find((a) => a.id === appFilter)?.name ?? "All apps");
	return (
		<Menu
			// An org with many apps scrolls inside the window (#180 review).
			positioning={{ autoSize: "height" }}
			checkedValues={{ app: [appFilter] }}
			onCheckedValueChange={(_, d) => setAppFilter(d.checkedItems[0] ?? "all")}
		>
			<MenuTrigger disableButtonEnhancement>
				<Tooltip
					content={`${count} modern command${count === 1 ? "" : "s"} for this table (read-only). Pick an app to see its command bar.`}
					relationship="description"
				>
					<Button
						appearance="subtle"
						size="small"
						className={styles.trigger}
						aria-label={`App for modern commands: ${current}`}
						icon={<ChevronDownRegular />}
						iconPosition="after"
					>
						<span className={styles.label}>App:&nbsp;</span>
						<span className={styles.value}>{current}</span>
					</Button>
				</Tooltip>
			</MenuTrigger>
			<MenuPopover className={styles.popover}>
				<MenuList>
					<MenuItemRadio name="app" value="all">
						All apps
					</MenuItemRadio>
					{apps.map((a) => (
						<MenuItemRadio key={a.id} name="app" value={a.id}>
							{a.name}
						</MenuItemRadio>
					))}
				</MenuList>
			</MenuPopover>
		</Menu>
	);
}
