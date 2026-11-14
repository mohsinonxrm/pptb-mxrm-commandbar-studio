import { useMemo, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";

let lastKey = 0;
const mint = (scope: string, count: number) =>
	Array.from({ length: count }, () => `${scope}#${++lastKey}`);

export interface StableKeys {
	/** One key per item, in list order. */
	keys: string[];
	/** Call when an item is appended. */
	add(): void;
	/** Call when the item at `index` is removed. */
	remove(index: number): void;
	/** Call when the item at `from` moves to `to`. */
	move(from: number, to: number): void;
	/** Call when an item is edited in place (the list gets a new identity, the keys stay). */
	update(): void;
}

/**
 * Keys made for `items`. While `pending`, `items` is the list one of our own
 * changes was made to, and the list of the next render is the one it produced
 * (the change and the store update it causes render together). Pending lasts
 * that one render only: when the store ignored the change (the same list
 * comes back), a later list from elsewhere must not pass for ours (#22 review).
 */
interface Tracked<T> {
	scope: string;
	items: readonly T[];
	pending: boolean;
	keys: string[];
}

/**
 * React keys for a list whose items have no id of their own (rule steps, #22).
 * An index key hands an item's DOM and local state to its neighbour when an
 * item is removed or moved; these keys stay with their item across the
 * changes reported through the returned functions. A list changed any other
 * way — another `scope` (e.g. another rule), or a new array from elsewhere
 * such as an undo / redo, even of the same length — gets new keys for every
 * item, so no key is left on the wrong item (#22 review).
 */
export function useStableKeys<T>(scope: string, items: readonly T[]): StableKeys {
	const [tracked, setTracked] = useState<Tracked<T> | null>(null);
	const fresh = useMemo(() => mint(scope, items.length), [scope, items]);
	const ours =
		!!tracked &&
		tracked.scope === scope &&
		tracked.keys.length === items.length &&
		(tracked.items === items || tracked.pending);
	// The render after our own change: remember the list it produced (or keep
	// the old one when the change didn't take), so a later list from elsewhere
	// is recognised — adjusting state while rendering, as React documents.
	if (tracked?.pending)
		setTracked({ ...tracked, items: ours ? items : tracked.items, pending: false });
	const keys = ours ? tracked.keys : fresh;
	const next = (k: string[]) => setTracked({ scope, items, pending: true, keys: k });
	return {
		keys,
		add: () => next([...keys, ...mint(scope, 1)]),
		remove: (index) => next(keys.filter((_, i) => i !== index)),
		move: (from, to) => next(arrayMove(keys, from, to)),
		update: () => next(keys),
	};
}
