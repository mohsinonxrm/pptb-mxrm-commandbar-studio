import type { KeyboardEvent } from "react";

/**
 * A radio group's keys (ARIA radio group pattern): the arrow keys move to the next or previous
 * option and choose it, Home and End to the first and last. Pair with `tabIndex` from
 * `radioTabIndex`, so the group is one tab stop.
 */
export function radioGroupKeys<T>(
	values: readonly T[],
	value: T,
	onChange: (value: T) => void,
): (e: KeyboardEvent<HTMLElement>) => void {
	return (e) => {
		const i = Math.max(0, values.indexOf(value));
		const next =
			e.key === "ArrowRight" || e.key === "ArrowDown"
				? (i + 1) % values.length
				: e.key === "ArrowLeft" || e.key === "ArrowUp"
					? (i - 1 + values.length) % values.length
					: e.key === "Home"
						? 0
						: e.key === "End"
							? values.length - 1
							: -1;
		if (next < 0) return;
		e.preventDefault();
		onChange(values[next]);
		e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
	};
}

/** The checked option is the group's tab stop. */
export const radioTabIndex = (checked: boolean) => (checked ? 0 : -1);
