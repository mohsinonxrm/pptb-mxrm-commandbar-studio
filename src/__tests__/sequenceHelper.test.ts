import { describe, it, expect } from "vitest";
import {
	nextSequence,
	validateSequenceRanges,
	findDuplicateSequences,
	renumberSequences,
} from "@/utils/sequenceHelper";

describe("nextSequence", () => {
	it("returns step (10) when no existing sequences", () => {
		expect(nextSequence([])).toBe(10);
	});

	it("returns the next multiple of 10 after the max", () => {
		expect(nextSequence([10, 20, 30])).toBe(40);
	});

	it("rounds up when sequences are not multiples of 10", () => {
		expect(nextSequence([5, 15])).toBe(30);
	});

	it("respects custom step size", () => {
		expect(nextSequence([100, 200], 100)).toBe(300);
	});

	it("handles a single element", () => {
		expect(nextSequence([50])).toBe(60);
	});
});

describe("validateSequenceRanges", () => {
	it("returns valid when both lists are empty", () => {
		const result = validateSequenceRanges([], []);
		expect(result.valid).toBe(true);
	});

	it("returns valid when maxSize sequences are all above scale sequences", () => {
		const result = validateSequenceRanges([100, 110], [10, 20, 30]);
		expect(result.valid).toBe(true);
	});

	it("returns invalid and message when maxSize overlaps with scale sequences", () => {
		const result = validateSequenceRanges([10, 20], [15, 25]);
		expect(result.valid).toBe(false);
		expect(result.message).toBeTruthy();
	});

	it("returns invalid when maxSize minimum equals scale maximum", () => {
		// maxSize min (20) must be > scaleMax (20) — equal means overlap
		const result = validateSequenceRanges([20, 30], [10, 20]);
		expect(result.valid).toBe(false);
	});

	it("returns valid when only maxSize list provided", () => {
		const result = validateSequenceRanges([10, 20], []);
		expect(result.valid).toBe(true);
	});
});

describe("findDuplicateSequences", () => {
	it("returns empty array when no duplicates", () => {
		expect(findDuplicateSequences([10, 20, 30])).toEqual([]);
	});

	it("detects a single duplicate value", () => {
		const dups = findDuplicateSequences([10, 20, 20, 30]);
		expect(dups).toContain(20);
	});

	it("detects multiple duplicate values", () => {
		const dups = findDuplicateSequences([10, 10, 20, 20, 30]);
		expect(dups).toContain(10);
		expect(dups).toContain(20);
	});

	it("returns empty array for empty input", () => {
		expect(findDuplicateSequences([])).toEqual([]);
	});

	it("returns empty for a single-element array", () => {
		expect(findDuplicateSequences([5])).toEqual([]);
	});
});

describe("renumberSequences", () => {
	it("assigns clean multiples of 10 in sorted order", () => {
		const items = [
			{ id: "a", sequence: 5 },
			{ id: "b", sequence: 15 },
			{ id: "c", sequence: 3 },
		];
		const result = renumberSequences(items);
		// sorted: c(3), a(5), b(15) → sequences 10, 20, 30
		expect(result.map((r) => r.sequence)).toEqual([10, 20, 30]);
	});

	it("preserves relative order of items", () => {
		const items = [
			{ id: "first", sequence: 100 },
			{ id: "second", sequence: 200 },
		];
		const result = renumberSequences(items);
		expect(result[0].id).toBe("first");
		expect(result[1].id).toBe("second");
	});

	it("returns empty array for empty input", () => {
		expect(renumberSequences([])).toEqual([]);
	});

	it("does not mutate the original array", () => {
		const items = [{ id: "x", sequence: 10 }];
		renumberSequences(items);
		expect(items[0].sequence).toBe(10);
	});
});
