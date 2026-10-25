import { useCallback, useEffect, useRef, useState } from "react";
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
import { useSessionStore } from "@/store/sessionStore";
import type { ExistingWebResourceChoice } from "@/services/dataverse/webResourceService";

interface Pending {
	name: string;
	managed: boolean;
}

/**
 * Asks before an upload replaces an existing web resource (#121): pass `onExisting` to
 * saveWebResource and render `dialog`. The answer is Replace, Keep existing (it is still
 * added to the solution) or Cancel; a managed one can only be kept. Closing the dialog, a
 * newer upload's question and a connection change (#120) cancel.
 */
export function useReplaceWebResourceConfirm() {
	const [pending, setPending] = useState<Pending | null>(null);
	const resolver = useRef<((choice: ExistingWebResourceChoice) => void) | null>(null);
	const connectionVersion = useSessionStore((s) => s.connectionVersion);

	const answer = useCallback((choice: ExistingWebResourceChoice) => {
		resolver.current?.(choice);
		resolver.current = null;
		setPending(null);
	}, []);

	const onExisting = useCallback(
		(existing: { id: string; name: string; managed: boolean }) =>
			new Promise<ExistingWebResourceChoice>((resolve) => {
				// One question at a time: an earlier one still open is cancelled.
				resolver.current?.("cancel");
				resolver.current = resolve;
				setPending({ name: existing.name, managed: existing.managed });
			}),
		[],
	);

	// The question was about the environment the upload started on.
	useEffect(() => () => answer("cancel"), [connectionVersion, answer]);

	const dialog = (
		<Dialog open={pending !== null} onOpenChange={(_, data) => !data.open && answer("cancel")}>
			<DialogSurface style={{ maxWidth: 520 }}>
				<DialogBody>
					<DialogTitle>
						{pending?.managed
							? "Use the existing web resource?"
							: "Replace the existing web resource?"}
					</DialogTitle>
					<DialogContent
						style={{
							display: "flex",
							flexDirection: "column",
							gap: tokens.spacingVerticalS,
						}}
					>
						{pending?.managed ? (
							<Text>
								A managed web resource named <strong>{pending.name}</strong> already
								exists. It can't be replaced: keep it as it is, or rename the file
								and upload it again.
							</Text>
						) : (
							<Text>
								A web resource named <strong>{pending?.name}</strong> already
								exists. Replacing it changes its content everywhere it is used
								(other ribbons, forms, apps).
							</Text>
						)}
						<EnvironmentBadge prefix="In" />
					</DialogContent>
					<DialogActions>
						<Button appearance="secondary" onClick={() => answer("cancel")}>
							Cancel
						</Button>
						<Button
							appearance={pending?.managed ? "primary" : "secondary"}
							onClick={() => answer("keep")}
						>
							Keep existing
						</Button>
						{!pending?.managed && (
							<Button appearance="primary" onClick={() => answer("replace")}>
								Replace
							</Button>
						)}
					</DialogActions>
				</DialogBody>
			</DialogSurface>
		</Dialog>
	);

	return { onExisting, dialog };
}
