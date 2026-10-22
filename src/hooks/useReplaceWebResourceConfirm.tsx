import { useCallback, useRef, useState } from "react";
import {
	Button,
	Dialog,
	DialogActions,
	DialogBody,
	DialogContent,
	DialogSurface,
	DialogTitle,
	Text,
	tokens,
} from "@fluentui/react-components";
import { EnvironmentBadge } from "@/components/shell/EnvironmentBadge";
import type { ExistingWebResourceChoice } from "@/services/dataverse/webResourceService";

/**
 * Asks before an upload replaces an existing web resource (#121): pass `onExisting` to
 * saveWebResource and render `dialog`. The answer is Replace, Keep existing (it is still
 * added to the solution) or Cancel; closing the dialog cancels.
 */
export function useReplaceWebResourceConfirm() {
	const [pending, setPending] = useState<string | null>(null);
	const resolver = useRef<((choice: ExistingWebResourceChoice) => void) | null>(null);

	const onExisting = useCallback(
		(existing: { id: string; name: string }) =>
			new Promise<ExistingWebResourceChoice>((resolve) => {
				resolver.current = resolve;
				setPending(existing.name);
			}),
		[],
	);

	const answer = (choice: ExistingWebResourceChoice) => {
		resolver.current?.(choice);
		resolver.current = null;
		setPending(null);
	};

	const dialog = (
		<Dialog open={pending !== null} onOpenChange={(_, data) => !data.open && answer("cancel")}>
			<DialogSurface style={{ maxWidth: 520 }}>
				<DialogBody>
					<DialogTitle>Replace the existing web resource?</DialogTitle>
					<DialogContent
						style={{
							display: "flex",
							flexDirection: "column",
							gap: tokens.spacingVerticalS,
						}}
					>
						<Text>
							A web resource named <strong>{pending}</strong> already exists.
							Replacing it changes its content everywhere it is used (other ribbons,
							forms, apps).
						</Text>
						<EnvironmentBadge prefix="In" />
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={() => answer("cancel")}>
							Cancel
						</Button>
						<Button appearance="secondary" onClick={() => answer("keep")}>
							Keep existing
						</Button>
						<Button appearance="primary" onClick={() => answer("replace")}>
							Replace
						</Button>
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);

	return { onExisting, dialog };
}
