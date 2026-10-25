import { create } from "zustand";
import type { LocLabel } from "@/types/ribbon";

/**
 * Texts the canvas shows for labels the workspace can't resolve (#6): the
 * LocLabels managed solutions define, read with each table. Display only:
 * nothing here is published or compared with what was loaded.
 */
interface LabelTextStore {
	/** Managed solutions' LocLabels, by id. */
	managed: Record<string, LocLabel>;
	setManaged(labels: LocLabel[]): void;
}

export const useLabelTextStore = create<LabelTextStore>()((set) => ({
	managed: {},
	setManaged: (labels) => set({ managed: Object.fromEntries(labels.map((l) => [l.id, l])) }),
}));
