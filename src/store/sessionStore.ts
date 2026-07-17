import { create } from "zustand";
import type { Solution } from "@/types/solution";
import type { EntityMetadata } from "@/types/entity";

export type FormRibbonScope = "entity" | "form";

export interface EntityFormInfo {
	formId: string;
	name: string;
}

export interface SessionStore {
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
	formRibbonScope: FormRibbonScope;
	entityForms: EntityFormInfo[];
	selectedFormId: string;

	setConnection(url: string, name: string, environment: SessionStore["environment"]): void;
	setSolutions(solutions: Solution[]): void;
	setActiveSolution(solution: Solution): void;
	setEntities(entities: EntityMetadata[]): void;
	setActiveEntity(entity: EntityMetadata): void;
	setSolutionEntityIds(ids: string[] | null): void;
	setSolutionRibbonComponentIds(ids: string[] | null): void;
	setCurrentUser(id: string, name: string): void;
	setPublisherPrefix(prefix: string): void;
	setFormRibbonScope(scope: FormRibbonScope): void;
	setEntityForms(forms: EntityFormInfo[]): void;
	setSelectedFormId(formId: string): void;
}

export const useSessionStore = create<SessionStore>()((set) => ({
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
	formRibbonScope: "entity",
	entityForms: [],
	selectedFormId: "",

	setConnection: (url, name, environment) =>
		set({ connectionUrl: url, connectionName: name, environment }),
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
		set({
			activeSolution: solution,
			publisherPrefix: solution.publisherPrefix || "new",
			// Reset the entity selection + components when switching solutions —
			// the previous entity may not be a component of the new solution.
			activeEntity: null,
			solutionEntityIds: null,
			solutionRibbonComponentIds: null,
		});
	},
	setEntities: (entities) => set({ entities }),
	setActiveEntity: (entity) => set({ activeEntity: entity }),
	setSolutionEntityIds: (ids) => set({ solutionEntityIds: ids }),
	setSolutionRibbonComponentIds: (ids) => set({ solutionRibbonComponentIds: ids }),
	setCurrentUser: (id, name) => set({ currentUserId: id, currentUserName: name }),
	setPublisherPrefix: (prefix) => set({ publisherPrefix: prefix }),
	setFormRibbonScope: (scope) => set({ formRibbonScope: scope }),
	setEntityForms: (forms) =>
		set((state) => {
			const nextSelected = forms.some((form) => form.formId === state.selectedFormId)
				? state.selectedFormId
				: (forms[0]?.formId ?? "");
			return { entityForms: forms, selectedFormId: nextSelected };
		}),
	setSelectedFormId: (formId) => set({ selectedFormId: formId }),
}));
