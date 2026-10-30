import { useState } from "react";
import {
	Badge,
	Button,
	Field,
	Input,
	Tab,
	TabList,
	Tooltip,
	makeStyles,
	tokens,
	type BadgeProps,
} from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";
import { IdField } from "@/components/shared/IdField";
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
	rename: {
		display: "flex",
		alignItems: "flex-start",
		gap: tokens.spacingHorizontalS,
		marginTop: tokens.spacingVerticalXS,
	},
	renameField: { flex: 1, minWidth: 0 },
	renameInput: { fontFamily: tokens.fontFamilyMonospace },
	renameButtons: {
		display: "flex",
		gap: tokens.spacingHorizontalXS,
		// Level with the input, under the field's label.
		marginTop: "22px",
	},
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

function idError(draft: string, current: string, ids: string[]): string | undefined {
	if (!draft.trim()) return "Enter an ID.";
	if (/\s/.test(draft)) return "An ID can't contain spaces.";
	if (draft !== current && ids.some((id) => id.toLowerCase() === draft.toLowerCase()))
		return "Another command already has this ID.";
	return undefined;
}

/** Renames your own command; Enter renames, Esc cancels. */
function RenameCommand({ commandId, onDone }: { commandId: string; onDone: () => void }) {
	const styles = useStyles();
	const commands = useRibbonStore((s) => s.commands);
	const renameCommandId = useRibbonStore((s) => s.renameCommandId);
	const openCommandEditor = useUIStore((s) => s.openCommandEditor);
	const [draft, setDraft] = useState(commandId);
	const error = idError(
		draft,
		commandId,
		commands.map((c) => c.id),
	);
	const apply = () => {
		const next = draft.trim();
		if (error || next === commandId) return onDone();
		if (renameCommandId(commandId, next)) openCommandEditor(next);
		onDone();
	};
	return (
		<div className={styles.rename}>
			<Field
				className={styles.renameField}
				label="Command ID"
				validationState={error ? "error" : "none"}
				validationMessage={error}
				hint={
					error
						? undefined
						: "Usually publisher.Table.Button.Command. Its buttons follow the new ID."
				}
			>
				<Input
					className={styles.renameInput}
					value={draft}
					autoFocus
					onChange={(_, d) => setDraft(d.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") apply();
						if (e.key === "Escape") {
							// Cancels the rename, not the drawer.
							e.stopPropagation();
							onDone();
						}
					}}
				/>
			</Field>
			<div className={styles.renameButtons}>
				<Button
					appearance="primary"
					disabled={!!error || draft.trim() === commandId}
					onClick={apply}
				>
					Rename
				</Button>
				<Button onClick={onDone}>Cancel</Button>
			</div>
		</div>
	);
}

export function CommandHeader({ commandId }: { commandId: string }) {
	const styles = useStyles();
	const provenance = useCommandProvenance(commandId)?.provenance;
	const command = useRibbonStore((s) => s.commands.find((c) => c.id === commandId));
	const uses = useRibbonStore((s) => buttonsUsing(s.ribbons, commandId).length);
	const tab = useUIStore((s) => s.commandEditorTab);
	const setTab = useUIStore((s) => s.setCommandEditorTab);
	const [renaming, setRenaming] = useState(false);
	const badge = provenance && PROVENANCE_BADGE[provenance];

	return (
		<>
			{renaming ? (
				<RenameCommand commandId={commandId} onDone={() => setRenaming(false)} />
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
							size="small"
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
