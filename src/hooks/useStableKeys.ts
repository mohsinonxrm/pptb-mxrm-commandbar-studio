import { useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

let lastKey = 0;
const mint = (scope: string, count: number) => Array.from({ length: count }, () => `${scope}#${++lastKey}`);

export interface StableKeys {
	/** One key per item, in list order. */
	keys: string[];
	/** Call when an item is appended. */
	add(): void;
	/** Call when the item at `index` is removed. */
	remove(index: number): void;
	/** Call when the item at `from` moves to `to`. */
	move(from: number, to: number): void;
}

/**
 * React keys for a list whose items have no id of their own (rule steps, #22).
 * An index key hands an item's DOM and local state to its neighbour when an
 * item is removed or moved; these keys stay with their item across the edits,
 * removals and moves reported through the returned functions. When the list
 * changes any other way — another `scope` (e.g. another rule), or a length
 * change from elsewhere such as undo — every item gets a new key.
 */
export function useStableKeys(scope: string, count: number): StableKeys {
	const [tracked, setTracked] = useState<{ scope: string; keys: string[] } | null>(null);
	const fresh = useMemo(() => mint(scope, count), [scope, count]);
	const keys = tracked && tracked.scope === scope && tracked.keys.length === count ? tracked.keys : fresh;
	return {
		keys,
		add: () => setTracked({ scope, keys: [...keys, ...mint(scope, 1)] }),
		remove: (index) => setTracked({ scope, keys: keys.filter((_, i) => i !== index) }),
		move: (from, to) => setTracked({ scope, keys: arrayMove(keys, from, to) }),
	};
}
