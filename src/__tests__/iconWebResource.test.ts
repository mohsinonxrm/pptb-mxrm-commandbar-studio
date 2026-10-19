import { describe, expect, it, vi } from "vitest";
import { ensureFluentIconWebResource } from "@/services/iconWebResource";
import { fluentIconWebResourceName, toBase64Utf8, toSnakeCase } from "@/utils/iconWebResourceName";

const decode = (b64: string) =>
	new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

describe("fluentIconWebResourceName", () => {
	it("names the icon under <prefix>_/icons/cbs/", () => {
		expect(fluentIconWebResourceName("cbstest", "Add")).toBe("cbstest_/icons/cbs/add.svg");
		expect(fluentIconWebResourceName("cbstest", "CreditCard")).toBe(
			"cbstest_/icons/cbs/credit_card.svg",
		);
	});

	it("keeps filled icons apart from regular ones", () => {
		expect(fluentIconWebResourceName("cbstest", "Add", "filled")).toBe(
			"cbstest_/icons/cbs/add.filled.svg",
		);
	});

	it("keeps the names already created in the org for regular icons", () => {
		expect(fluentIconWebResourceName("cbstest", "Add")).toBe("cbstest_/icons/cbs/add.svg");
		expect(fluentIconWebResourceName("cbstest", "Shield")).toBe("cbstest_/icons/cbs/shield.svg");
		expect(fluentIconWebResourceName("cbstest", "StarFilled")).toBe("cbstest_/icons/cbs/star_filled.svg");
	});

	it("never maps the filled variant of one icon onto another icon's regular name", () => {
		// `StarFilled` (regular) and `Star` (filled) used to both be star_filled.svg,
		// and keepExisting would silently reuse whichever was uploaded first.
		expect(fluentIconWebResourceName("cbstest", "Star", "filled")).toBe(
			"cbstest_/icons/cbs/star.filled.svg",
		);
		expect(fluentIconWebResourceName("cbstest", "Star", "filled")).not.toBe(
			fluentIconWebResourceName("cbstest", "StarFilled"),
		);
		expect(fluentIconWebResourceName("cbstest", "StarFilled", "filled")).toBe(
			"cbstest_/icons/cbs/star_filled.filled.svg",
		);
	});

	it("tolerates a trailing underscore and rejects an empty prefix", () => {
		expect(fluentIconWebResourceName("cbstest_", "Add")).toBe("cbstest_/icons/cbs/add.svg");
		expect(() => fluentIconWebResourceName("  ", "Add")).toThrow(/publisher prefix/);
	});

	it("snake-cases PascalCase names", () => {
		expect(toSnakeCase("ArrowDownload")).toBe("arrow_download");
	});

	it("base64-encodes UTF-8", () => {
		expect(decode(toBase64Utf8("<svg>é</svg>"))).toBe("<svg>é</svg>");
	});
});

describe("ensureFluentIconWebResource", () => {
	const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
	const BUSY = "0x80071151: Cannot start another [Publish] because there is a previous [Import] running at this moment.";
	const setup = (created: boolean) => {
		let clock = 0;
		return {
			toSvg: vi.fn(async (): Promise<string | null> => SVG),
			deps: {
				save: vi.fn(async () => ({
					id: "wr-1",
					created,
					updated: false,
					solutionUniqueName: "CBSLiveTest",
				})),
				publish: vi.fn(async (_id: string) => undefined),
				published: new Set<string>(),
				busy: {
					now: () => clock,
					sleep: vi.fn(async (ms: number) => {
						clock += ms;
					}),
				},
			},
		};
	};

	it("uploads the SVG without overwriting an existing web resource, then publishes a new one", async () => {
		const { toSvg, deps } = setup(true);
		const res = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(res).toEqual({ name: "cbstest_/icons/cbs/add.svg", id: "wr-1", created: true });
		expect(toSvg).toHaveBeenCalledWith("Add", 20, "regular");
		expect(deps.save).toHaveBeenCalledWith(
			"cbstest_/icons/cbs/add.svg",
			toBase64Utf8(SVG),
			11,
			expect.objectContaining({ keepExisting: true }),
		);
		expect(deps.publish).toHaveBeenCalledWith("wr-1");
	});

	it("publishes a reused web resource that was not published in this session", async () => {
		// An earlier pick created it but failed before/while publishing
		// (AddSolutionComponent or a busy publish): reuse must still publish it.
		const { toSvg, deps } = setup(false);
		const res = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(res.created).toBe(false);
		expect(res.publishError).toBeUndefined();
		expect(deps.publish).toHaveBeenCalledWith("wr-1");
	});

	it("does not republish a web resource already published in this session", async () => {
		const { toSvg, deps } = setup(true);
		await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		deps.save.mockResolvedValueOnce({ id: "wr-1", created: false, updated: false, solutionUniqueName: "CBSLiveTest" });
		await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(deps.save).toHaveBeenCalledTimes(2); // still re-added to the solution
		expect(deps.publish).toHaveBeenCalledTimes(1);
	});

	it("retries the publish while another solution operation runs", async () => {
		const { toSvg, deps } = setup(true);
		deps.publish.mockRejectedValueOnce(new Error(BUSY)).mockRejectedValueOnce(new Error(BUSY));
		const res = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(res.publishError).toBeUndefined();
		expect(deps.publish).toHaveBeenCalledTimes(3);
		expect(deps.busy.sleep.mock.calls.map(([ms]) => ms)).toEqual([15_000, 30_000]);
		expect(deps.published.has("wr-1")).toBe(true);
	});

	it("gives up on a busy environment after a bounded wait and publishes on the next pick", async () => {
		const { toSvg, deps } = setup(true);
		deps.publish.mockRejectedValue(new Error(BUSY));
		const first = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(first.publishError).toMatch(/another solution operation is running/);
		const waited = deps.busy.sleep.mock.calls.reduce((sum, [ms]) => sum + ms, 0);
		expect(waited).toBeLessThanOrEqual(2 * 60_000);
		expect(deps.published.has("wr-1")).toBe(false);

		// Next pick: the row exists (created=false) but was never published.
		deps.publish.mockReset();
		deps.publish.mockResolvedValue(undefined);
		deps.save.mockResolvedValueOnce({ id: "wr-1", created: false, updated: false, solutionUniqueName: "CBSLiveTest" });
		const second = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(second.created).toBe(false);
		expect(second.publishError).toBeUndefined();
		expect(deps.publish).toHaveBeenCalledWith("wr-1");
	});

	it("publishes on the next pick when adding the new web resource to the solution failed", async () => {
		const { toSvg, deps } = setup(true);
		deps.save.mockRejectedValueOnce(
			new Error("Web resource x was saved but could not be added to solution CBSLiveTest: 0x80040216"),
		);
		await expect(ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps)).rejects.toThrow(
			/could not be added to solution/,
		);
		expect(deps.publish).not.toHaveBeenCalled();

		deps.save.mockResolvedValueOnce({ id: "wr-1", created: false, updated: false, solutionUniqueName: "CBSLiveTest" });
		const res = await ensureFluentIconWebResource("Add", "regular", "cbstest", toSvg, deps);
		expect(res.created).toBe(false);
		expect(deps.publish).toHaveBeenCalledWith("wr-1");
	});

	it("serializes the chosen variant and treats a publish failure as non-fatal", async () => {
		const { toSvg, deps } = setup(true);
		deps.publish.mockRejectedValueOnce(new Error("0x80040220: no privilege"));
		const res = await ensureFluentIconWebResource("Add", "filled", "cbstest", toSvg, deps);
		expect(toSvg).toHaveBeenCalledWith("Add", 20, "filled");
		expect(res.name).toBe("cbstest_/icons/cbs/add.filled.svg");
		expect(res.publishError).toBe("0x80040220: no privilege");
		expect(deps.publish).toHaveBeenCalledTimes(1); // not a busy error: no retry
	});

	it("fails before uploading when the icon cannot be serialized", async () => {
		const { toSvg, deps } = setup(true);
		toSvg.mockResolvedValueOnce(null);
		await expect(
			ensureFluentIconWebResource("Nope", "regular", "cbstest", toSvg, deps),
		).rejects.toThrow(/Nope/);
		expect(deps.save).not.toHaveBeenCalled();
	});
});
