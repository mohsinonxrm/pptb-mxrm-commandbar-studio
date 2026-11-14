import { Button, Caption1, Link, makeStyles, tokens } from "@fluentui/react-components";
import { MessageSlot, type SlotMessage } from "@/components/shared/MessageSlot";
import { canCustomiseButton, useRibbonStore } from "@/store/ribbonStore";
import { useSessionStore } from "@/store/sessionStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useModernAppNames } from "@/hooks/useModernCommands";
import { describeOverride } from "@/services/modernCommands";
import { isReadOnlyControlKind } from "@/utils/controlKinds";
import type { ClassicModernOverride } from "@/types/modernCommand";
import type { ConflictEntry, RibbonButton, RibbonLocation } from "@/types/ribbon";

/**
 * The notices above a selected button's properties (#181): one slot instead of
 * up to three stacked bars that said the same thing (#184). Whose button it
 * is, with its actions first; then a modern command that replaces it.
 */

const useStyles = makeStyles({
	slot: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0` },
	list: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS },
});

interface ButtonNoticesProps {
	button: RibbonButton;
	location: RibbonLocation;
	tabId: string;
	groupId: string;
	overrides: ClassicModernOverride[];
}

export function ButtonNotices({ button, location, tabId, groupId, overrides }: ButtonNoticesProps) {
	const styles = useStyles();
	const customizeOobButton = useRibbonStore((s) => s.customizeOobButton);
	const customiseButton = useRibbonStore((s) => s.customiseButton);
	const conflicts = useRibbonStore((s) => s.conflicts);
	const activeSolution = useSessionStore((s) => s.activeSolution);
	const sessionPrefix = useSessionStore((s) => s.publisherPrefix);
	const selectButtonInContext = useSelectionStore((s) => s.selectButtonInContext);
	const appNames = useModernAppNames();
	const selectCommand = useModernCommandStore((s) => s.selectCommand);
	const canCustomise = canCustomiseButton(location, tabId, button);

	const messages: SlotMessage[] = [];

	// Whose button it is. Your own (unmanaged) buttons need no notice. A kind
	// shown read-only (#42) explains itself in its section and can't be
	// customised or overridden, so it only gets a managed solution's layers.
	const readOnly = isReadOnlyControlKind(button.kind);
	if (button.origin === "managed" || (button.origin === "oob" && !readOnly)) {
		const conflict = conflicts.find((c: ConflictEntry) => c.elementId === button.id);
		const solutionName = button.solutionName ?? conflict?.solutions[0]?.solutionName;
		const publisher = button.publisherName ?? conflict?.solutions[0]?.publisher;
		const title =
			button.origin === "oob"
				? "Out-of-the-box button"
				: `From the managed solution${solutionName ? ` ${solutionName}` : ""}${publisher ? ` by ${publisher}` : ""}`;
		const body = readOnly
			? undefined
			: "You can't edit it directly: customise a copy, or create an override, to change it.";
		const actions = (
			<>
				{!readOnly && canCustomise && (
					<Button
						size="small"
						onClick={() => {
							const prefix =
								activeSolution?.publisherPrefix?.trim() ||
								sessionPrefix?.trim() ||
								"new";
							const id = customiseButton(location, tabId, groupId, button.id, prefix);
							if (id) selectButtonInContext(location, tabId, groupId, id);
						}}
					>
						Customise button
					</Button>
				)}
				{!readOnly && (
					<Button
						size="small"
						onClick={() => customizeOobButton(location, tabId, groupId, button.id)}
					>
						Create override
					</Button>
				)}
			</>
		);
		messages.push({
			id: "provenance",
			intent: "info",
			title,
			body,
			dismissible: false,
			actions,
		});
	}

	// A migrated modern command that hides this button or renders in its place.
	if (overrides.length > 0) {
		const hidden = overrides.some((o) => o.effect === "hidden");
		messages.push({
			id: "modern-override",
			intent: hidden ? "warning" : "info",
			title: hidden ? "Hidden by a modern command" : "Shown as a modern command",
			dismissible: false,
			body: (
				<div className={styles.list}>
					{overrides.map((o) => (
						<span key={o.command.id}>
							{describeOverride(o, appNames)}.{" "}
							<Link inline onClick={() => selectCommand(o.command.id)}>
								View
							</Link>
						</span>
					))}
					<Caption1>
						Matched by the migrated command&apos;s unique name. Unified Interface may
						show the modern command instead of this button.
					</Caption1>
				</div>
			),
		});
	}

	if (messages.length === 0) return null;
	return <MessageSlot scope="properties" messages={messages} className={styles.slot} />;
}
