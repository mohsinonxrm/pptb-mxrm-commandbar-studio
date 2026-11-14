/**
 * Assigns the next available sequence number in a group of existing sequences.
 * Uses steps of 10 (standard Dataverse convention).
 */
export function nextSequence(existingSequences: number[], step = 10): number {
	if (existingSequences.length === 0) return step;
	const max = Math.max(...existingSequences);
	return Math.ceil(max / step) * step + step;
}

/**
 * Detects duplicate sequence values within a flat list.
 * Returns the duplicate values (if any).
 */
export function findDuplicateSequences(sequences: number[]): number[] {
	const seen = new Set<number>();
	const dups = new Set<number>();
	for (const s of sequences) {
		if (seen.has(s)) dups.add(s);
		seen.add(s);
	}
	return [...dups];
}

/**
 * Renumbers a list of items by their current sequence, assigning clean multiples of 10.
 * Preserves relative order.
 */
export function renumberSequences<T extends { sequence: number }>(items: T[]): T[] {
	const sorted = [...items].sort((a, b) => a.sequence - b.sequence);
	return sorted.map((item, i) => ({ ...item, sequence: (i + 1) * 10 }));
}
