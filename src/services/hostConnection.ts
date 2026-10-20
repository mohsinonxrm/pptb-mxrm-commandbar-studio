/**
 * Which Dataverse connection the tool works against (#120).
 *
 * Since PPTB 1.2.7 a running tool's connection can change in place, in the
 * desktop app and in the VS Code extension: the host re-sends the tool context
 * and raises `connection:updated`, and every later `dataverseAPI` call goes to
 * the new environment. The same event is also broadcast when any connection is
 * edited or has its token refreshed (the VS Code extension sends it with no
 * data), so it isn't a "my connection changed" signal on its own: the tool's
 * connection is read again and compared by identity (id + URL). Same approach
 * as FetchXML Studio #66.
 */

export type HostConnection = ToolBoxAPI.Connection;

/** The parts of a connection that identify it. */
export interface ConnectionLike {
	id?: string | null;
	url?: string | null;
}

/** A stable key for a connection: its id and URL (lower case, no trailing slash). "" for none. */
export function connectionKey(connection: ConnectionLike | null | undefined): string {
	if (!connection || (!connection.id && !connection.url)) return "";
	const url = (connection.url ?? "").trim().replace(/\/+$/, "").toLowerCase();
	return `${connection.id ?? ""}|${url}`;
}

function connectionsApi(): Partial<ToolBoxAPI.ConnectionsAPI> | undefined {
	return (window as Window & typeof globalThis).toolboxAPI?.connections;
}

/** The tool's primary connection (slot 0 on PPTB 1.2.7+, the active connection on older hosts). */
export async function getPrimaryConnection(): Promise<HostConnection | null> {
	const connections = connectionsApi();
	if (!connections) return null;
	if (typeof connections.getConnection === "function")
		return (await connections.getConnection(0)) ?? null;
	if (typeof connections.getActiveConnection === "function")
		return (await connections.getActiveConnection()) ?? null;
	return null;
}

/** A write was refused because the tool's connection is no longer the one the workspace was loaded from. */
export class ConnectionChangedError extends Error {
	constructor(action: string) {
		super(
			`${action} was stopped: the tool's connection changed in Power Platform ToolBox, so it would have ` +
				`written to a different environment than the one this workspace was loaded from. Nothing was written.`,
		);
		this.name = "ConnectionChangedError";
	}
}

/** The key of the connection the workspace belongs to; set by the session store. */
let workspaceKey: string | undefined;
/** Moves on with every switch to another connection: an operation started before it must not write after it. */
let epoch = 0;

/** Records which connection the loaded workspace belongs to (start-up, and after a switch). */
export function setWorkspaceConnection(connection: ConnectionLike | null | undefined): void {
	const key = connectionKey(connection);
	if (workspaceKey !== undefined && key !== workspaceKey) epoch++;
	workspaceKey = key;
}

/**
 * Throws ConnectionChangedError unless the host's connection is still the one
 * the workspace was loaded from. Called right before every write, so a switch
 * during a long publish (between its two imports, say) stops it too. No check
 * before the workspace's connection is known or without a connections API; a
 * host that can't answer counts as changed.
 */
export async function assertWorkspaceConnection(action: string): Promise<void> {
	// Nothing to compare with: before start-up, or a host without a connections API.
	const connections = connectionsApi();
	if (
		workspaceKey === undefined ||
		(!connections?.getConnection && !connections?.getActiveConnection)
	)
		return;
	let current: string;
	try {
		current = connectionKey(await getPrimaryConnection());
	} catch {
		throw new ConnectionChangedError(action);
	}
	if (current !== workspaceKey) throw new ConnectionChangedError(action);
}

type HostEventPayload = { event?: string; data?: unknown };

/**
 * Re-reads the tool's connection on every connection event and calls
 * `onChange` with it. The caller compares it with the one it has. Only the
 * latest read is reported, so a slow earlier answer can't win. Returns the
 * unsubscribe (when the host supports `off`).
 */
export function watchHostConnection(
	onChange: (connection: HostConnection | null) => void,
): () => void {
	const events = (window as Window & typeof globalThis).toolboxAPI?.events;
	if (typeof events?.on !== "function") return () => {};
	let request = 0;
	const handler = (_event: unknown, payload: HostEventPayload) => {
		const name = payload?.event;
		if (
			name !== "connection:updated" &&
			name !== "connection:created" &&
			name !== "connection:deleted"
		)
			return;
		const mine = ++request;
		void getPrimaryConnection()
			.then((connection) => {
				if (mine === request) onChange(connection);
			})
			.catch(() => {
				// Not reported: the write guard refuses anyway while the host can't answer.
			});
	};
	events.on(handler as Parameters<ToolBoxAPI.EventsAPI["on"]>[0]);
	return () => events.off?.(handler as Parameters<ToolBoxAPI.EventsAPI["on"]>[0]);
}

/** A check run before each write of one operation. */
export type WriteGuard = (action: string) => Promise<void>;

/**
 * The guard for an operation of several writes (a publish: import, import,
 * publish). Bound to the connection the operation started on: once the tool
 * switches connection, every later write of it is refused, even though the
 * new connection is the workspace's by then.
 */
export function writeGuard(): WriteGuard {
	const since = epoch;
	return async (action) => {
		if (epoch !== since) throw new ConnectionChangedError(action);
		await assertWorkspaceConnection(action);
	};
}
