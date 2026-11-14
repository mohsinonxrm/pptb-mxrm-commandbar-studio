import { create } from "zustand";
import type { Solution } from "@/types/solution";
import type { EntityMetadata } from "@/types/entity";
import { setWorkspaceConnection } from "@/services/hostConnection";

/** Shown after the tool's connection changed in Power Platform ToolBox (#120). */
export interface ConnectionNotice {
	from: { name: string; url: string; environment: SessionStore["environment"] };
	to: { name: string; url: string; environment: SessionStore["environment"] };
	/** The unpublished changes on `from` were kept as a draft (false: there were none, or saving failed). */
	draftKept: boolean;
	/** There were unpublished changes, but saving them as a draft failed. */
	draftLost: boolean;
}

export interface SessionStore {
	connectionId: string;
	connectionUrl: string;
	connectionName: string;
	environment: "Dev" | "Test" | "UAT" | "Production";
	publisherPrefix: string;

	solutions: Solution[];
	activeSolution: Solution | null;
	entities: EntityMetadata[];
	activeEntity: EntityMetadata | null;
	/**
	 * MetadataId set of entities that are components of `activeSolution`.
	 * - `null` = not yet loaded (waiting for solution selection or fetch).
	 * - empty array = solution loaded but has no entity components.
	 */
	solutionEntityIds: string[] | null;

	/**
	 * GUIDs of `ribboncustomization` records that are components of the
	 * active solution (`componenttype = 50`). Non-empty when the user has
	 * explicitly added "Application Ribbons" to their solution in maker.
	 * Drives whether the Publish dialog's "Include Application ribbon"
	 * checkbox is enabled, and provides the GUIDs we declare as
	 * RootComponents in solution.xml at publish time.
	 *
	 * - `null` = not yet resolved
	 * - empty array = solution doesn't include application ribbon
	 */
	solutionRibbonComponentIds: string[] | null;

	currentUserId: string;
	currentUserName: string;

	/** Incremented when the tool's connection changes, so everything loaded per connection loads again (#120). */
	connectionVersion: number;
	/** The last connection change, for the banner; null once dismissed. */
	connectionNotice: ConnectionNotice | null;

	setConnection(
		url: string,
		name: string,
		environment: SessionStore["environment"],
		id?: string,
	): void;
	/**
	 * The tool now works against another connection (#120): everything loaded
	 * from the previous one is cleared and `connectionVersion` moves on. The
	 * caller has kept the unpublished changes as a draft first.
	 */
	switchConnection(
		connection: ToolBoxAPI.Connection,
		notice: Omit<ConnectionNotice, "from" | "to">,
	): void;
	dismissConnectionNotice(): void;
	setSolutions(solutions: Solution[]): void;
	setActiveSolution(solution: Solution): void;
	setEntities(entities: EntityMetadata[]): void;
	setActiveEntity(entity: EntityMetadata): void;
	setSolutionEntityIds(ids: string[] | null): void;
	setSolutionRibbonComponentIds(ids: string[] | null): void;
	setCurrentUser(id: string, name: string): void;
	setPublisherPrefix(prefix: string): void;
}

/**
 * Called when setActiveSolution switches to another solution, after the
 * session's table selection is cleared. Stores holding the previous table's
 * state (the ribbon workspace) reset there (#22); they register here because
 * this store can't import them without an import cycle.
 */
const solutionSwitchListeners = new Set<() => void>();

/** Runs `listener` on every switch to another solution. Returns an unsubscribe function. */
export function onSolutionSwitch(listener: () => void): () => void {
	solutionSwitchListeners.add(listener);
	return () => solutionSwitchListeners.delete(listener);
}

export const useSessionStore = create<SessionStore>()((set, get) => ({
	connectionId: "",
	connectionUrl: "",
	connectionName: "",
	environment: "Dev",
	publisherPrefix: "new",

	solutions: [],
	activeSolution: null,
	entities: [],
	activeEntity: null,
	solutionEntityIds: null,
	solutionRibbonComponentIds: null,

	currentUserId: "",
	currentUserName: "",

	connectionVersion: 0,
	connectionNotice: null,

	setConnection: (url, name, environment, id = get().connectionId) => {
		setWorkspaceConnection({ id, url });
		set({ connectionId: id, connectionUrl: url, connectionName: name, environment });
	},
	switchConnection: (connection, notice) => {
		const prev = get();
		setWorkspaceConnection(connection);
		set({
			connectionId: connection.id,
			connectionUrl: connection.url,
			connectionName: connection.name,
			environment: connection.environment,
			publisherPrefix: "new",
			solutions: [],
			activeSolution: null,
			entities: [],
			activeEntity: null,
			solutionEntityIds: null,
			solutionRibbonComponentIds: null,
			currentUserId: "",
			currentUserName: "",
			connectionVersion: prev.connectionVersion + 1,
			connectionNotice: {
				...notice,
				from: {
					name: prev.connectionName,
					url: prev.connectionUrl,
					environment: prev.environment,
				},
				to: {
					name: connection.name,
					url: connection.url,
					environment: connection.environment,
				},
			},
		});
	},
	dismissConnectionNotice: () => set({ connectionNotice: null }),
	setSolutions: (solutions) => set({ solutions }),
	setActiveSolution: (solution) => {
		// Surface the picked solution's publisher info so the user (and the
		// runtime log) can immediately see which publisher will own anything
		// that gets imported through this solution. If the prefix is "new"
		// (the org's default publisher), the user almost certainly didn't
		// mean to import under it and should recreate the solution under a
		// custom publisher.
		import("@/store/runtimeLogStore").then(({ useRuntimeLogStore }) => {
			useRuntimeLogStore
				.getState()
				.logInfo(
					"dataverse",
					`Active solution: "${solution.friendlyName || solution.uniqueName}" — ` +
						`publisher="${solution.publisherUniqueName || "(empty)"}", ` +
						`prefix="${solution.publisherPrefix || "(empty)"}"`,
				);
			if (
				!solution.publisherPrefix ||
				solution.publisherPrefix === "new" ||
				/^defaultpublisher/i.test(solution.publisherUniqueName ?? "")
			) {
				useRuntimeLogStore
					.getState()
					.logWarn(
						"dataverse",
						`Solution "${solution.friendlyName || solution.uniqueName}" uses the org's ` +
							`default publisher (prefix="${solution.publisherPrefix || "new"}"). All IDs and ` +
							`imports from CBS will land under that publisher. To use your own (e.g. ` +
							`"mxrm"), create a new solution in maker.powerapps.com bound to your custom ` +
							`publisher and pick that one here.`,
					);
			}
		});
		// Picking the solution that is already active keeps the table and its edits.
		const switching = get().activeSolution?.id !== solution.id;
		set({
			activeSolution: solution,
			publisherPrefix: solution.publisherPrefix || "new",
			// Reset the entity selection + components when switching solutions —
			// the previous entity may not be a component of the new solution.
			// The table list too: it would list the previous solution's tables
			// until App.tsx loads the new solution's (#22).
			...(switching
				? {
						activeEntity: null,
						entities: [],
						solutionEntityIds: null,
						solutionRibbonComponentIds: null,
					}
				: {}),
		});
		if (switching) for (const listener of solutionSwitchListeners) listener();
	},
	setEntities: (entities) => set({ entities }),
	setActiveEntity: (entity) => set({ activeEntity: entity }),
	setSolutionEntityIds: (ids) => set({ solutionEntityIds: ids }),
	setSolutionRibbonComponentIds: (ids) => set({ solutionRibbonComponentIds: ids }),
	setCurrentUser: (id, name) => set({ currentUserId: id, currentUserName: name }),
	setPublisherPrefix: (prefix) => set({ publisherPrefix: prefix }),
}));
