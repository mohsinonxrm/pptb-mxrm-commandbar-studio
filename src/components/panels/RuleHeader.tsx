import { useState } from "react";
import { Button, Caption1, Tooltip, makeStyles, tokens } from "@fluentui/react-components";
import { EditRegular } from "@fluentui/react-icons";
import { IdField } from "@/components/shared/IdField";
import { RenameId } from "@/components/panels/RenameId";
import { useRibbonStore } from "@/store/ribbonStore";
import { useUIStore } from "@/store/uiStore";
import { isSystemRibbonId } from "@/utils/ribbonProvenance";

/**
 * The rule view's part of the drawer header (#186): its id with copy, Rename
 * for a rule that isn't Microsoft's, and how many commands use it.
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
	usedBy: { color: tokens.colorNeutralForeground3 },
});

export function RuleHeader({ ruleId, kind }: { ruleId: string; kind: "enable" | "display" }) {
	const styles = useStyles();
	const rules = useRibbonStore((s) => (kind === "enable" ? s.enableRules : s.displayRules));
	const usedBy = useRibbonStore(
		(s) =>
			s.commands.filter((c) =>
				(kind === "enable" ? c.enableRules : c.displayRules).includes(ruleId),
			).length,
	);
	const renameEnableRuleId = useRibbonStore((s) => s.renameEnableRuleId);
	const renameDisplayRuleId = useRibbonStore((s) => s.renameDisplayRuleId);
	const openRuleEditor = useUIStore((s) => s.openRuleEditor);
	const [renaming, setRenaming] = useState(false);

	const rename = (next: string) => {
		const renamed =
			kind === "enable"
				? renameEnableRuleId(ruleId, next)
				: renameDisplayRuleId(ruleId, next);
		if (renamed) openRuleEditor(next, kind);
	};

	return (
		<>
			{renaming ? (
				<RenameId
					label="Rule ID"
					current={ruleId}
					ids={rules.map((r) => r.id)}
					what="rule"
					hint="The commands that use it follow the new ID."
					onRename={rename}
					onDone={() => setRenaming(false)}
				/>
			) : (
				<div className={styles.idRow}>
					<div className={styles.id}>
						<IdField
							label="Rule ID"
							value={ruleId}
							hideLabel
							action={
								// Microsoft's rules keep their ids: commands everywhere use them.
								!isSystemRibbonId(ruleId) && (
									<Tooltip content="Rename rule ID" relationship="label">
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
				</div>
			)}
			<Caption1 className={styles.usedBy}>
				Used by {usedBy} command{usedBy === 1 ? "" : "s"}
			</Caption1>
		</>
	);
}

export default RuleHeader;
