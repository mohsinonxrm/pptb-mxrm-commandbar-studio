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
 * Checks whether MaxSize and Scale sequence ranges overlap.
 * Returns true if they are non-overlapping (valid).
 */
export function validateSequenceRanges(
	maxSizeSequences: number[],
	scaleSequences: number[],
): { valid: boolean; message?: string } {
	if (maxSizeSequences.length === 0 || scaleSequences.length === 0) {
		return { valid: true };
	}

	const maxSizeMin = Math.min(...maxSizeSequences);
	const maxSizeMax = Math.max(...maxSizeSequences);
	const scaleMin = Math.min(...scaleSequences);
	const scaleMax = Math.max(...scaleSequences);

	// MaxSize must be above Scale range (higher sequence numbers)
	if (maxSizeMin <= scaleMax) {
		return {
			valid: false,
			message: `MaxSize sequence range [${maxSizeMin}–${maxSizeMax}] overlaps with Scale range [${scaleMin}–${scaleMax}]. MaxSize sequences must be higher than all Scale sequences.`,
		};
	}

	return { valid: true };
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
