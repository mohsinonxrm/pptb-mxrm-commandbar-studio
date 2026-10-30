import { useDraftStore } from "@/store/draftStore";
import { hasPendingChanges, useRibbonStore } from "@/store/ribbonStore";

export interface PublishState {
	/** Edits since the last publish (the old "n changes since publish" badge). */
	count: number;
	/** Whether the loaded table has anything to publish. */
	canPublish: boolean;
}

/**
 * What the Publish button says and whether it works (#179, #195). The edit
 * counter alone can't tell after a partial publish (#16 review), so with no
 * edits counted the workspace is compared with its baseline; that comparison
 * only runs while the counter is 0.
 */
export function usePublishState(): PublishState {
	const loaded = useDraftStore((s) => s.target !== null);
	const count = useRibbonStore((s) => s.mutationsSincePublish);
	const pending = useRibbonStore((s) => s.mutationsSincePublish === 0 && hasPendingChanges(s));
	return { count, canPublish: loaded && (count > 0 || pending) };
}
