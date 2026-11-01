/**
 * What the tool does when its connection changes in Power Platform ToolBox (#120).
 *
 * The host has already switched: every later Dataverse call goes to the new
 * environment. So the workspace loaded from the previous one must go before
 * anything can be published there. Its unpublished changes are kept as a draft
 * under the previous org (offered again when the tool is back on that
 * connection and the table is opened), then every store is reset, and
 * `connectionVersion` makes the solution list and the current user load again.
 */
import { connectionKey, type HostConnection } from "@/services/hostConnection";
import { resetPublishedIcons } from "@/services/iconWebResource";
import { resetModernCommandLog } from "@/hooks/useModernCommands";
import { useSessionStore } from "@/store/sessionStore";
import { useDraftStore } from "@/store/draftStore";
import { useRibbonStore } from "@/store/ribbonStore";
import { useSelectionStore } from "@/store/selectionStore";
import { useModernCommandStore } from "@/store/modernCommandStore";
import { useUIStore, type UIStore } from "@/store/uiStore";
import { webResourceBrowserCallbackRegistry } from "@/utils/webResourceBrowserCallback";
import { useRuntimeLogStore } from "@/store/runtimeLogStore";

/**
 * Panels that show something of the loaded workspace or the previous
 * environment. The publish dialog stays: a running publish reports there.
 */
const WORKSPACE_PANELS = [
	"commandEditorOpen",
	"ruleEditorOpen",
	"iconPickerOpen",
	"newGroupOpen",
	"importXmlOpen",
	"webResourceBrowserOpen",
	"newTabOpen",
] as const satisfies readonly (keyof UIStore)[];

export type ConnectionChange = "none" | "details" | "switched";

/**
 * Applies the host's current connection. "switched" when it is another
 * connection than the workspace's (reset as above), "details" when only its
 * name or environment type changed, "none" otherwise. No connection (the host
 * blocks deleting one a tool uses) changes nothing: writes are refused by the
 * connection guard anyway.
 */
export function applyHostConnection(connection: HostConnection | null): ConnectionChange {
	if (!connection) return "none";
	const session = useSessionStore.getState();
	const log = useRuntimeLogStore.getState();
	const sameConnection =
		connectionKey(connection) ===
		connectionKey({ id: session.connectionId, url: session.connectionUrl });

	if (sameConnection) {
		if (
			connection.name === session.connectionName &&
			connection.environment === session.environment
		)
			return "none";
		session.setConnection(
			connection.url,
			connection.name,
			connection.environment,
			connection.id,
		);
		log.logInfo(
			"startup",
			`Connection details updated: ${connection.name} (${connection.environment}).`,
		);
		return "details";
	}

	const from = `${session.connectionName || session.connectionUrl} (${session.environment})`;
	const to = `${connection.name} (${connection.environment})`;
	const { hadChanges, kept } = useDraftStore.getState().releaseForConnectionChange();

	useRibbonStore.getState().resetWorkspace();
	useSelectionStore.getState().clearSelection();
	useModernCommandStore.getState().reset();
	resetPublishedIcons();
	resetModernCommandLog();
	// A web resource picked in the browser must not land on the reset workspace.
	webResourceBrowserCallbackRegistry.clear();

	session.switchConnection(connection, {
		draftKept: hadChanges && kept,
		draftLost: hadChanges && !kept,
	});

	// Last, and best effort: the UI store is persisted, and a full browser
	// storage makes its write throw. The switch above must not depend on it.
	try {
		useUIStore.setState({
			...(Object.fromEntries(
				WORKSPACE_PANELS.map((key) => [key, false]),
			) as Partial<UIStore>),
			// The editor drawer's views (#186): the open flags are derived from them.
			editorStack: [],
		});
	} catch (error) {
		log.logWarn(
			"startup",
			`Couldn't close the open panels after the connection change: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	log.logWarn(
		"startup",
		`The tool's connection changed from ${from} to ${to}. The loaded solution and table were closed.`,
	);
	if (hadChanges && kept)
		log.logInfo("startup", `The unpublished changes were kept as a draft for ${from}.`);
	if (hadChanges && !kept)
		log.logError(
			"startup",
			`The unpublished changes on ${from} couldn't be saved as a draft (browser storage full) and are lost.`,
		);
	return "switched";
}
