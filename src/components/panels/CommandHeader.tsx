import { useState } from "react";
import {
	Badge,
	Button,
	Tab,
	TabList,
	Tooltip,
	makeStyles,
	tokens,
	type BadgeProps,
} from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";
import { IdField } from "@/components/shared/IdField";
import { RenameId } from "@/components/panels/RenameId";
import { useCommandProvenance } from "@/hooks/useCommandProvenance";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore, type CommandEditorTab } from "@/store/uiStore";
import type { CommandProvenance } from "@/utils/commandProvenance";
import { buttonsUsing } from "@/utils/ribbonMenu";

/**
 * The command editor's part of the drawer header (#186): its id with copy,
 * Rename for your own command, whose it is, and the tabs, which stay put
 * while the body scrolls.
 */

const useStyles = makeStyles({
	idRow: {
		display: "flex",
		alignItems: "center",
		gap: tokens.spacingHorizontalS,
		minWidth: 0,
		marginTop: tokens.spacingVerticalXS,
	},
	id: { flex: 1, minWidth: 0 },
	badge: { flexShrink: 0 },
	tabs: {
		marginTop: tokens.spacingVerticalS,
		marginLeft: `calc(-1 * ${tokens.spacingHorizontalM})`,
	},
});

const PROVENANCE_BADGE: Record<CommandProvenance, { text: string; color: BadgeProps["color"] }> = {
	custom: { text: "Yours", color: "success" },
	customising: { text: "Your copy", color: "brand" },
	customised: { text: "Your copy", color: "brand" },
	oob: { text: "Read-only", color: "informative" },
	uncustomising: { text: "Read-only", color: "informative" },
	reloadRequired: { text: "Read-only", color: "informative" },
};

export function CommandHeader({ commandId }: { commandId: string }) {
	const styles = useStyles();
	const provenance = useCommandProvenance(commandId)?.provenance;
	const command = useRibbonStore((s) => s.commands.find((c) => c.id === commandId));
	const uses = useRibbonStore((s) => buttonsUsing(s.ribbons, commandId).length);
	const tab = useUIStore((s) => s.commandEditorTab);
	const setTab = useUIStore((s) => s.setCommandEditorTab);
	const commandIds = useRibbonStore((s) => s.commands).map((c) => c.id);
	const renameCommandId = useRibbonStore((s) => s.renameCommandId);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const [renaming, setRenaming] = useState(false);
	const badge = provenance && PROVENANCE_BADGE[provenance];

	return (
		<>
			{renaming ? (
				<RenameId
					label="Command ID"
					current={commandId}
					ids={commandIds}
					what="command"
					hint="Usually publisher.Table.Button.Command. Its buttons follow the new ID."
					onRename={(next) => renameCommandId(commandId, next) && openCommandEditor(next)}
					onDone={() => setRenaming(false)}
				/>
			) : (
				<div className={styles.idRow}>
					<div className={styles.id}>
						<IdField
							label="Command ID"
							value={commandId}
							hideLabel
							action={
								// Renaming a copy would stop it replacing the original.
								provenance === "custom" && (
									<Tooltip content="Rename command ID" relationship="label">
										<Button
											appearance="subtle"
											icon={<EditRegular />}
											onClick={() => setRenaming(true)}
										/>
									</Tooltip>
								)
							}
						/>
					</div>
					{badge && (
						<Badge
							appearance="tint"
							color={badge.color}
							size="medium"
							className={styles.badge}
						>
							{badge.text}
						</Badge>
					)}
				</div>
			)}
			<TabList
				className={styles.tabs}
				selectedValue={tab}
				onTabSelect={(_, d) => setTab(d.value as CommandEditorTab)}
			>
				<Tab value="actions">Actions</Tab>
				<Tab value="enable">Enable rules ({command?.enableRules.length ?? 0})</Tab>
				<Tab value="display">Display rules ({command?.displayRules.length ?? 0})</Tab>
				<Tab value="usedBy">Used by ({uses})</Tab>
			</TabList>
		</>
	);
}

export default CommandHeader;
