import { useDraftStore } from "@/store/draftStore";
import { hasPendingChanges, useRibbonStore } from "@/store/ribbonStore";
import { usePublishPlan } from "@/hooks/usePublishPlan";

export interface PublishState {
	/** The changes Publish writes, as the publish dialog lists them (#188). */
	count: number;
	/** Whether the loaded table has anything to publish. */
	canPublish: boolean;
}

/**
 * What the Publish button says and whether it works (#179, #195). The count is
 * the publish dialog's list of changes (#188), not the number of edits: five
 * edits of one label are one change. The dialog also opens for edits it can't
 * publish yet, to say why. The edit counter alone can't tell after a partial
 * publish (#16 review), so with no edits counted the workspace is compared
 * with its baseline; that comparison only runs while the counter is 0.
 */
export function usePublishState(): PublishState {
	const loaded = useDraftStore((s) => s.target !== null);
	const { changes, unsupported } = usePublishPlan();
	const edited = useRibbonStore((s) => s.mutationsSincePublish > 0);
	const pending = useRibbonStore((s) => s.mutationsSincePublish === 0 && hasPendingChanges(s));
	return {
		count: changes.length,
		canPublish: loaded && (changes.length > 0 || unsupported.length > 0 || edited || pending),
	};
}
